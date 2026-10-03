import { describe, it, expect, beforeEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import {
  buildArticleListQuery,
  queryArticleList,
  type ArticleListTranslateOptions
} from '@main/services/articleList'
import type { Article } from '@shared/types/articles'

function createDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE feeds (id INTEGER PRIMARY KEY, title TEXT, favicon_url TEXT, category_id INTEGER);
    CREATE TABLE articles (
      id INTEGER PRIMARY KEY,
      feed_id INTEGER NOT NULL,
      guid TEXT,
      title TEXT NOT NULL,
      url TEXT,
      author TEXT,
      content TEXT,
      summary TEXT,
      published_at INTEGER,
      is_read INTEGER NOT NULL DEFAULT 0,
      is_starred INTEGER NOT NULL DEFAULT 0,
      cover_image TEXT
    );
    CREATE VIRTUAL TABLE articles_fts USING fts5(
      title, content, author,
      tokenize='trigram',
      content='articles',
      content_rowid='id'
    );
    CREATE TRIGGER articles_ai AFTER INSERT ON articles BEGIN
      INSERT INTO articles_fts(rowid, title, content, author)
      VALUES (new.id, new.title, new.content, new.author);
    END;
    CREATE TABLE article_translations (
      article_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      target_lang TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      translated_title TEXT,
      translated_summary TEXT,
      translated_content TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      PRIMARY KEY (article_id, provider, target_lang)
    );
  `)
  return db
}

function seedArticles(db: DatabaseSync): void {
  db.prepare('INSERT INTO feeds (id, title) VALUES (1, ?)').run('英文博客')
  const insert = db.prepare(`
    INSERT INTO articles (id, feed_id, guid, title, author, content, summary, published_at, is_read, is_starred, url)
    VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  insert.run(1, 'g1', 'Hello World', 'ann', '<p>content one</p>', 'summary one', 300, 0, 0, 'u1')
  insert.run(2, 'g2', 'Second Post', 'bob', '<p>content two</p>', 'summary two', 200, 0, 1, 'u2')
  insert.run(
    3,
    'g3',
    'Third Post',
    'carl',
    '<p>content three</p>',
    'summary three',
    100,
    1,
    0,
    'u3'
  )
}

function addTranslation(
  db: DatabaseSync,
  articleId: number,
  fields: {
    provider?: string
    targetLang?: string
    title?: string
    summary?: string
    content?: string
  } = {}
): void {
  db.prepare(
    `
    INSERT INTO article_translations (article_id, provider, target_lang, source_hash, translated_title, translated_summary, translated_content)
    VALUES (?, ?, ?, 'hash', ?, ?, ?)
  `
  ).run(
    articleId,
    fields.provider ?? 'edge',
    fields.targetLang ?? 'zh',
    fields.title ?? null,
    fields.summary ?? null,
    fields.content ?? null
  )
}

function ids(articles: Article[]): number[] {
  return articles.map((a) => a.id)
}

const edgeZh: ArticleListTranslateOptions = { provider: 'edge', targetLang: 'zh' }

describe('articleList 查询', () => {
  let db: DatabaseSync

  beforeEach(() => {
    db = createDb()
    seedArticles(db)
  })

  it('未开启译文时不联查译文，返回字段与旧行为一致', () => {
    addTranslation(db, 1, { title: '你好世界' })

    const result = queryArticleList(db, { limit: 10 }, null)

    expect(ids(result.articles)).toEqual([1, 2, 3])
    expect(result.articles[0].title).toBe('Hello World')
    expect(result.articles[0].feed_title).toBe('英文博客')
    expect('translated_title' in result.articles[0]).toBe(false)
    expect(result.hasMore).toBe(false)
    expect(result.nextCursor).toEqual({ publishedAt: 100, id: 3 })
  })

  it('开启译文时只带出当前服务与目标语言的译文标题与摘要', () => {
    addTranslation(db, 1, { title: '你好世界', summary: '第一段中文摘要' })
    addTranslation(db, 2, { provider: 'baidu', title: '百度译文', summary: '百度摘要' })
    addTranslation(db, 3, { targetLang: 'ja', title: '日本語訳', summary: '日本語の要約' })

    const result = queryArticleList(db, { limit: 10 }, edgeZh)
    const map = new Map(result.articles.map((a) => [a.id, a]))

    expect(map.get(1)?.translated_title).toBe('你好世界')
    expect(map.get(1)?.translated_summary).toBe('第一段中文摘要')
    expect(map.get(2)?.translated_title).toBeNull()
    expect(map.get(2)?.translated_summary).toBeNull()
    expect(map.get(3)?.translated_title).toBeNull()
    expect(map.get(3)?.translated_summary).toBeNull()
  })

  it('译文查询同样受订阅源/星标等过滤条件约束', () => {
    addTranslation(db, 1, { title: '第一篇文章' })
    addTranslation(db, 2, { title: '第二篇文章' })

    const result = queryArticleList(db, { query: '文章', isStar: true, limit: 10 }, edgeZh)

    expect(ids(result.articles)).toEqual([2])
  })

  it('搜索命中原文（FTS）', () => {
    const result = queryArticleList(db, { query: 'Hello', limit: 10 }, null)

    expect(ids(result.articles)).toEqual([1])
  })

  it('搜索命中译文标题，关闭译文时同一关键词搜不到', () => {
    addTranslation(db, 2, { title: '第二篇文章', content: '<p>正文内容</p>' })

    const withTranslate = queryArticleList(db, { query: '第二篇', limit: 10 }, edgeZh)
    expect(ids(withTranslate.articles)).toEqual([2])

    const withoutTranslate = queryArticleList(db, { query: '第二篇', limit: 10 }, null)
    expect(withoutTranslate.articles).toHaveLength(0)
  })

  it('搜索命中译文正文', () => {
    addTranslation(db, 3, { title: '第三篇', content: '<p>这里是正文里的独特词</p>' })

    const result = queryArticleList(db, { query: '独特词', limit: 10 }, edgeZh)

    expect(ids(result.articles)).toEqual([3])
  })

  it('搜索命中译文摘要', () => {
    addTranslation(db, 2, { title: '第二篇', summary: '摘要里的专有名词', content: '<p>正文</p>' })

    const result = queryArticleList(db, { query: '专有名词', limit: 10 }, edgeZh)

    expect(ids(result.articles)).toEqual([2])
  })

  it('原文与译文同时命中时只返回一条（UNION 去重）', () => {
    addTranslation(db, 1, { title: 'Hello 世界', content: '<p>Hello</p>' })

    const result = queryArticleList(db, { query: 'Hello', limit: 10 }, edgeZh)

    expect(ids(result.articles)).toEqual([1])
  })

  it('短词（<3 字符）走 LIKE 分支，可分页翻出译文命中的后续文章', () => {
    addTranslation(db, 1, { title: '第一篇 文章' })
    addTranslation(db, 3, { title: '第三篇 文章' })

    const first = queryArticleList(db, { query: '文章', limit: 1 }, edgeZh)
    expect(ids(first.articles)).toEqual([1])
    expect(first.hasMore).toBe(true)
    expect(first.nextCursor).toEqual({ publishedAt: 300, id: 1 })

    const second = queryArticleList(
      db,
      { query: '文章', limit: 1, cursor: first.nextCursor },
      edgeZh
    )
    expect(ids(second.articles)).toEqual([3])
    expect(second.hasMore).toBe(false)
  })

  it('长词搜索同样支持游标翻页', () => {
    addTranslation(db, 1, { title: '第一篇长词内容' })
    addTranslation(db, 3, { title: '第三篇长词内容' })

    const first = queryArticleList(db, { query: '长词内容', limit: 1 }, edgeZh)
    expect(ids(first.articles)).toEqual([1])
    expect(first.hasMore).toBe(true)

    const second = queryArticleList(
      db,
      { query: '长词内容', limit: 1, cursor: first.nextCursor },
      edgeZh
    )
    expect(ids(second.articles)).toEqual([3])
    expect(second.hasMore).toBe(false)
  })

  it('未匹配到任何文章时返回空列表', () => {
    const result = queryArticleList(db, { query: '不存在的关键词', limit: 10 }, edgeZh)

    expect(result.articles).toHaveLength(0)
    expect(result.hasMore).toBe(false)
    expect(result.nextCursor).toBeNull()
  })

  it('published_at 为 NULL 的文章走独立游标分支，可分页翻过去', () => {
    db.prepare(
      `INSERT INTO articles (id, feed_id, guid, title, author, content, summary, published_at)
       VALUES (4, 1, 'g4', 'No Date Post', 'dave', '<p>content four</p>', 'summary four', NULL)`
    ).run()
    addTranslation(db, 1, { title: '第一篇 文章' })
    addTranslation(db, 4, { title: '第四篇 文章' })

    const first = queryArticleList(db, { query: '文章', limit: 1 }, edgeZh)
    expect(ids(first.articles)).toEqual([1])
    expect(first.nextCursor).toEqual({ publishedAt: 300, id: 1 })

    const second = queryArticleList(
      db,
      { query: '文章', limit: 1, cursor: first.nextCursor },
      edgeZh
    )
    expect(ids(second.articles)).toEqual([4])
    expect(second.nextCursor).toEqual({ publishedAt: null, id: 4 })
    expect(second.hasMore).toBe(false)

    const third = queryArticleList(
      db,
      { query: '文章', limit: 1, cursor: second.nextCursor },
      edgeZh
    )
    expect(third.articles).toHaveLength(0)
  })

  it('不查译文时 SQL 不涉及 article_translations（防默认路径回归）', () => {
    const plain = buildArticleListQuery({ query: 'Hello', limit: 10 }, null)
    expect(plain.sql).not.toContain('article_translations')

    const withTranslate = buildArticleListQuery({ query: 'Hello', limit: 10 }, edgeZh)
    expect(withTranslate.sql).toContain('article_translations')

    const listOnly = buildArticleListQuery({ limit: 10 }, null)
    expect(listOnly.sql).not.toContain('article_translations')
    expect(listOnly.sql).not.toContain('translated_')
  })
})
