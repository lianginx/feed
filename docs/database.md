# 数据库设计

> 数据库使用 `node:sqlite`（`DatabaseSync`），文件位于 `app.getPath('userData')/feed.db`。
> 同时支持 RSS 和 Atom 格式（feedparser 原生支持两者）。

## feeds 表（订阅源）

| 列名           | 类型                                   | 说明                                     |
| -------------- | -------------------------------------- | ---------------------------------------- |
| id             | INTEGER PRIMARY KEY AUTOINCREMENT      | 主键                                     |
| url            | TEXT NOT NULL UNIQUE                   | RSS/Atom 地址                            |
| title          | TEXT NOT NULL                          | 订阅源标题                               |
| description    | TEXT                                   | 描述                                     |
| site_url       | TEXT                                   | 网站地址                                 |
| category_id    | INTEGER                                | 分类 ID（外键 → categories.id）          |
| sort_order     | INTEGER DEFAULT 0                      | 排序权重                                 |
| favicon_url    | TEXT                                   | 网站图标 URL（多层降级获取，见实现文档） |
| custom_title   | INTEGER NOT NULL DEFAULT 0             | 标题是否用户自定义（1 = 刷新时不回写标题） |
| adapter_id     | TEXT                                   | 内置路由适配器 ID（普通 RSS 为 NULL）    |
| adapter_params | TEXT                                   | 适配器参数（JSON 字符串）                |
| last_error     | TEXT                                   | 上次刷新错误信息（用于容错展示）         |
| error_count    | INTEGER DEFAULT 0                      | 连续错误次数（仅记录与 UI 展示，不自动暂停） |
| last_updated   | INTEGER                                | 上次更新时间戳                           |
| created_at     | INTEGER DEFAULT (strftime('%s','now')) | 创建时间                                 |

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
| cover_image  | TEXT                                   | 封面图 URL                             |
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
  tokenize='trigram',
  content='articles',
  content_rowid='id'
);
```

- 使用 `trigram` 分词（支持中文子串匹配）
- 通过触发器与 articles 表同步（INSERT / UPDATE / DELETE 时自动同步 FTS 索引）

## 其他表

### article_translations（翻译缓存，version 7）

主键 `(article_id, provider, target_lang)`；`source_hash` 变化时译文失效。

```sql
CREATE TABLE article_translations (
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  target_lang TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  translated_title TEXT,
  translated_content TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  PRIMARY KEY (article_id, provider, target_lang)
);
```

### _app_state（应用状态键值表，version 9）

`key TEXT PRIMARY KEY, value TEXT NOT NULL`，存放非配置类应用状态。

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

采用 DIY 零依赖方案：版本跟踪表 + `migrations.ts` 内联迁移数组（无 `.sql` 文件）。

### 目录结构

```
src/main/database/
├── index.ts          # 数据库初始化入口
├── connection.ts     # 单例数据库连接
├── migrations.ts     # 迁移数组（version + name + up）
├── seed.ts           # 默认订阅源播种
└── defaultFeeds.ts   # 默认订阅源列表数据
```

### 迁移定义

`migrations.ts` 中每个迁移是 `{ version, name, up }` 对象，`up` 为 SQL 字符串或接收 db 的函数：

```typescript
export const migrations: Migration[] = [
  { version: 1, name: 'create-initial-tables', up: `CREATE TABLE ...` },
  { version: 5, name: 'seed-default-feeds', up: () => {} }, // 逻辑迁移用函数
  // ...
]
```

### 版本跟踪表

```sql
CREATE TABLE IF NOT EXISTS _migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 迁移运行原理

1. 启动时查询 `_migrations` 表获取当前最大版本号
2. 取 `migrations` 数组中版本号大于当前版本的迁移
3. 按 version 升序依次在每个事务中执行 `up`
4. 执行成功后向 `_migrations` 表插入记录

### 设计原则

| 决策     | 选择                     | 理由                                 |
| -------- | ------------------------ | ------------------------------------ |
| 迁移载体 | TS 内联（字符串 / 函数） | 与代码同仓库同审查，支持逻辑迁移     |
| 版本号   | 整数序号                 | 简单明确                             |
| 执行方式 | 单事务包装               | 原子性，失败不会留下半成品状态       |
| 回滚     | 不支持                   | 桌面应用场景下，出错应通过新迁移修复 |
| 依赖     | 零外部依赖               | 仅 `node:sqlite`                     |

> 注意：version 只增不减、不复用。变更一律新增 version，禁止修改已发布迁移。
