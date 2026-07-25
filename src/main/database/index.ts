import { getConnection } from './connection'

/**
 * 关闭数据库连接。
 */
export { closeConnection } from './connection'

// 迁移 SQL 定义（内联方式，避免打包后的路径问题）
const migrations: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: '001_initial.sql',
    sql: `
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

CREATE INDEX IF NOT EXISTS idx_articles_feed_id ON articles(feed_id);
CREATE INDEX IF NOT EXISTS idx_articles_is_read ON articles(is_read);
CREATE INDEX IF NOT EXISTS idx_articles_is_starred ON articles(is_starred);
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at);
CREATE INDEX IF NOT EXISTS idx_articles_feed_read_pub ON articles(feed_id, is_read, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_read_pub ON articles(is_read, published_at DESC);
`
  }
]

/**
 * 初始化数据库：创建迁移跟踪表并执行待处理的迁移。
 */
export function initializeDatabase(): void {
  const db = getConnection()

  // 创建迁移跟踪表
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // 获取当前已应用的最大版本号
  const currentVersion = db
    .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM _migrations')
    .get() as { version: number }

  // 按序号执行待处理的迁移
  for (const migration of migrations) {
    if (migration.version <= currentVersion.version) continue

    db.transaction(() => {
      db.exec(migration.sql)
      db.prepare('INSERT INTO _migrations (version, name) VALUES (?, ?)').run(
        migration.version,
        migration.name
      )
    })()
  }
}
