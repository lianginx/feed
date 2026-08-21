# 数据库设计

> 数据库使用 `node:sqlite`（`DatabaseSync`），文件位于 `app.getPath('userData')/feed.db`。
> 同时支持 RSS 和 Atom 格式（rss-parser 原生支持两者）。

## feeds 表（订阅源）

| 列名         | 类型                                   | 说明                                     |
| ------------ | -------------------------------------- | ---------------------------------------- |
| id           | INTEGER PRIMARY KEY AUTOINCREMENT      | 主键                                     |
| url          | TEXT NOT NULL UNIQUE                   | RSS/Atom 地址                            |
| title        | TEXT NOT NULL                          | 订阅源标题                               |
| description  | TEXT                                   | 描述                                     |
| site_url     | TEXT                                   | 网站地址                                 |
| category_id  | INTEGER                                | 分类 ID（外键 → categories.id）          |
| sort_order   | INTEGER DEFAULT 0                      | 排序权重                                 |
| favicon_url  | TEXT                                   | 网站图标 URL（多层降级获取，见实现文档） |
| last_error   | TEXT                                   | 上次刷新错误信息（用于容错展示）         |
| error_count  | INTEGER DEFAULT 0                      | 连续错误次数（≥5 时自动暂停刷新）        |
| last_updated | INTEGER                                | 上次更新时间戳                           |
| created_at   | INTEGER DEFAULT (strftime('%s','now')) | 创建时间                                 |

## categories 表（分类）

| 列名       | 类型                              | 说明     |
| ---------- | --------------------------------- | -------- |
| id         | INTEGER PRIMARY KEY AUTOINCREMENT | 主键     |
| name       | TEXT NOT NULL UNIQUE              | 分类名称 |
| sort_order | INTEGER DEFAULT 0                 | 排序权重 |

## articles 表（文章）

| 列名         | 类型                                   | 说明                                   |
| ------------ | -------------------------------------- | -------------------------------------- |
| id           | INTEGER PRIMARY KEY AUTOINCREMENT      | 主键                                   |
| feed_id      | INTEGER NOT NULL                       | 来源订阅源（外键 → feeds.id）          |
| guid         | TEXT NOT NULL                          | 文章唯一标识（RSS guid / Atom id）     |
| title        | TEXT NOT NULL                          | 标题                                   |
| url          | TEXT                                   | 原文链接                               |
| author       | TEXT                                   | 作者                                   |
| content      | TEXT                                   | 完整 HTML 内容（裸存，渲染前必须 `sanitizeHtml` 净化） |
| summary      | TEXT                                   | 摘要（RSS description / Atom summary） |
| published_at | INTEGER                                | 发布时间戳                             |
| is_read      | INTEGER DEFAULT 0                      | 已读标记                               |
| is_starred   | INTEGER DEFAULT 0                      | 星标标记                               |
| created_at   | INTEGER DEFAULT (strftime('%s','now')) | 入库时间                               |

> UNIQUE(feed_id, guid) — 同一订阅源内文章唯一，用于去重和更新覆盖。

## 默认订阅源（首次启动播种）

- 全新安装（`feeds` 表为空）时，通过迁移 `version 5`（`seed-default-feeds`）自动导入一批精选订阅源和 3 个分类（科技资讯 / 开发技术 / 新闻媒体）
- 默认列表维护在 `src/main/database/defaultFeeds.ts`，方便增删
- 迁移**只执行一次**：已有订阅源的老用户完全不受影响；即使之后删光所有订阅源也不会再自动补回
- 首次启动播种后，定时刷新调度器会立即拉取一次文章，打开即有内容

## FTS5 全文搜索表

```sql
CREATE VIRTUAL TABLE articles_fts USING fts5(
  title, content, author,
  content='articles',
  content_rowid='id'
);
```

通过触发器与 articles 表同步（INSERT / UPDATE / DELETE 时自动同步 FTS 索引）。

## 关系说明

```
categories  1 ──∞  feeds  1 ──∞  articles  1 ──∞  articles_fts
```

- 一个分类下有多个订阅源
- 一个订阅源下有多篇文章
- 文章内容通过 FTS5 触发器自动同步到全文搜索表

## 索引（查询性能）

```sql
-- 常用筛选
CREATE INDEX idx_articles_feed_id ON articles(feed_id);
CREATE INDEX idx_articles_is_read ON articles(is_read);
CREATE INDEX idx_articles_is_starred ON articles(is_starred);
CREATE INDEX idx_articles_published_at ON articles(published_at);

-- 复合索引：按订阅源 + 筛选状态 + 时间排序（最常用查询路径）
CREATE INDEX idx_articles_feed_read_pub ON articles(feed_id, is_read, published_at DESC);

-- 全局跨订阅源查询（如"全部未读"）
CREATE INDEX idx_articles_read_pub ON articles(is_read, published_at DESC);
```

## 分页策略

采用 **Keyset Pagination（游标分页）**，基于 `(published_at, id)` 双字段游标：

```typescript
// IPC 接口定义
articles.list(params: {
  feedId?: number
  filter?: 'all' | 'unread' | 'starred'
  cursor?: { publishedAt: number; id: number }  // 上一页最后一条
  limit?: number                                  // 默认 50
})

// SQL 查询逻辑
const result = db.prepare(`
  SELECT id, feed_id, title, author, summary, published_at, is_read, is_starred
  FROM articles
  WHERE feed_id = @feedId
    AND is_read = @isRead
    AND (published_at < @cursorPub OR (published_at = @cursorPub AND id < @cursorId))
  ORDER BY published_at DESC, id DESC
  LIMIT @limit
`).all(params)
```

- 默认每页 50 条
- 前端结合 @tanstack/vue-virtual 的 `overscan` 预加载
- 滚到底部时自动请求下一页

## 数据库迁移

采用 DIY 零依赖方案，使用版本跟踪表 + 顺序 SQL 文件。

### 目录结构

```
src/main/database/
├── index.ts              # 数据库初始化 + 迁移运行器
├── connection.ts         # 单例数据库连接
└── migrations/
    ├── 001_initial.sql   # 建表 + 索引 + FTS5 + 触发器
    └── ...
```

### 版本跟踪表

```sql
CREATE TABLE IF NOT EXISTS _migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 迁移文件命名规则

`{序号}_{名称}.sql`，按文件名升序执行。例如：

```
001_initial.sql
002_add_indexes.sql
003_add_favicon_fields.sql
```

### 迁移运行原理

1. 启动时查询 `_migrations` 表获取当前最大版本号
2. 扫描 `migrations/` 目录，找出版本号大于当前版本的文件
3. 按序号依次在每个事务中执行 SQL
4. 执行成功后向 `_migrations` 表插入记录

### 迁移文件示例

```sql
-- 001_initial.sql
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  site_url TEXT,
  category_id INTEGER REFERENCES categories(id),
  sort_order INTEGER DEFAULT 0,
  favicon_url TEXT,
  last_error TEXT,
  error_count INTEGER DEFAULT 0,
  last_updated INTEGER,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_id INTEGER NOT NULL REFERENCES feeds(id),
  guid TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  author TEXT,
  content TEXT,
  summary TEXT,
  published_at INTEGER,
  is_read INTEGER DEFAULT 0,
  is_starred INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  UNIQUE(feed_id, guid)
);

CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
  title, content, author,
  content='articles',
  content_rowid='id'
);

-- FTS5 同步触发器
CREATE TRIGGER IF NOT EXISTS articles_ai AFTER INSERT ON articles BEGIN
  INSERT INTO articles_fts(rowid, title, content, author)
  VALUES (new.id, new.title, new.content, new.author);
END;

CREATE TRIGGER IF NOT EXISTS articles_ad AFTER DELETE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title, content, author)
  VALUES ('delete', old.id, old.title, old.content, old.author);
END;

CREATE TRIGGER IF NOT EXISTS articles_au AFTER UPDATE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title, content, author)
  VALUES ('delete', old.id, old.title, old.content, old.author);
  INSERT INTO articles_fts(rowid, title, content, author)
  VALUES (new.id, new.title, new.content, new.author);
END;

-- 索引
CREATE INDEX IF NOT EXISTS idx_articles_feed_id ON articles(feed_id);
CREATE INDEX IF NOT EXISTS idx_articles_is_read ON articles(is_read);
CREATE INDEX IF NOT EXISTS idx_articles_is_starred ON articles(is_starred);
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at);
CREATE INDEX IF NOT EXISTS idx_articles_feed_read_pub ON articles(feed_id, is_read, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_read_pub ON articles(is_read, published_at DESC);
```

### 设计原则

| 决策         | 选择          | 理由                                 |
| ------------ | ------------- | ------------------------------------ |
| 迁移文件格式 | `.sql` 纯文本 | 易于审查和版本控制                   |
| 版本号       | 整数序号      | 简单明确                             |
| 执行方式     | 单事务包装    | 原子性，失败不回留下半成品状态       |
| 回滚         | 不支持        | 桌面应用场景下，出错应通过新迁移修复 |
| 依赖         | 零外部依赖    | 仅 `node:sqlite`                     |
