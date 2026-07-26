import type Database from 'better-sqlite3'

export interface Migration {
  version: number
  name: string
  up: string | ((db: Database.Database) => void)
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
  }
]
