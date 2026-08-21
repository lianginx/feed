import type { AppDatabase } from './connection'

export interface Migration {
  version: number
  name: string
  up: string | ((db: AppDatabase) => void)
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'create-initial-tables',
    up: `
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
  },
  {
    version: 2,
    name: 'add-article-cover-image',
    up: `
ALTER TABLE articles ADD COLUMN cover_image TEXT;
`
  },
  {
    version: 3,
    name: 'add-feed-custom-title',
    up: `
ALTER TABLE feeds ADD COLUMN custom_title INTEGER NOT NULL DEFAULT 0;
`
  },
  {
    version: 4,
    name: 'rebuild-fts-with-trigram',
    up: `
DROP TRIGGER IF EXISTS articles_ai;
DROP TRIGGER IF EXISTS articles_ad;
DROP TRIGGER IF EXISTS articles_au;
DROP TABLE IF EXISTS articles_fts;

CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
  title, content, author,
  tokenize='trigram',
  detail='none',
  content='articles',
  content_rowid='id'
);

INSERT INTO articles_fts(rowid, title, content, author)
  SELECT id, title, content, author FROM articles;

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
`
  },
  {
    version: 5,
    name: 'seed-default-feeds',
    up: () => {}
  },
  {
    version: 6,
    name: 'rebuild-fts-with-detail-full',
    up: `
-- v4 建的 FTS 表用了 detail='none'，该模式不支持短语/多 token 的 MATCH 查询
-- （trigram 把词拆成多个 token 后被当作短语直接报错），搜索只能退化为 LIKE 全表扫描。
-- 重建为默认 detail=full，使 FTS5 MATCH 可正常利用索引。
DROP TRIGGER IF EXISTS articles_ai;
DROP TRIGGER IF EXISTS articles_ad;
DROP TRIGGER IF EXISTS articles_au;
DROP TABLE IF EXISTS articles_fts;

CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
  title, content, author,
  tokenize='trigram',
  content='articles',
  content_rowid='id'
);

INSERT INTO articles_fts(rowid, title, content, author)
  SELECT id, title, content, author FROM articles;

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
`
  },
  {
    version: 7,
    name: 'create-article-translations',
    up: `
CREATE TABLE IF NOT EXISTS article_translations (
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
`
  },
  {
    version: 8,
    name: 'add-feed-adapter-fields',
    up: `
ALTER TABLE feeds ADD COLUMN adapter_id TEXT;
ALTER TABLE feeds ADD COLUMN adapter_params TEXT;
`
  },
  {
    version: 9,
    name: 'create-app-state-table',
    up: `
CREATE TABLE IF NOT EXISTS _app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`
  }
]
