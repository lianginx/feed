import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  computeSourceHash,
  getTranslation,
  saveTranslation,
  cleanupTranslations
} from '@main/services/translate/cache'

/** 用 :memory: 手动建表（与 migration v7 同构） */
function createDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE article_translations (
      article_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      target_lang TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      translated_title TEXT,
      translated_content TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      PRIMARY KEY (article_id, provider, target_lang)
    )
  `)
  return db
}

const base = {
  provider: 'baidu',
  target_lang: 'zh',
  translated_title: '标题',
  translated_content: '<p>内容</p>',
  created_at: Math.floor(Date.now() / 1000),
  updated_at: Math.floor(Date.now() / 1000)
}

describe('cache', () => {
  let db: Database.Database
  beforeEach(() => {
    db = createDb()
  })

  it('未命中返回 null', () => {
    expect(getTranslation(db, 1, 'baidu', 'zh', 'hash')).toBeNull()
  })

  it('保存后可命中', () => {
    const hash = computeSourceHash('Title', 'Content')
    saveTranslation(db, { article_id: 1, source_hash: hash, ...base })
    const rec = getTranslation(db, 1, 'baidu', 'zh', hash)
    expect(rec?.translated_title).toBe('标题')
    expect(rec?.translated_content).toBe('<p>内容</p>')
  })

  it('source_hash 变化（内容更新）后失效', () => {
    const hash1 = computeSourceHash('Title', 'Content')
    const hash2 = computeSourceHash('Title', 'Content changed')
    saveTranslation(db, { article_id: 1, source_hash: hash1, ...base })
    expect(getTranslation(db, 1, 'baidu', 'zh', hash2)).toBeNull()
  })

  it('换提供商 / 换目标语言不命中', () => {
    const hash = computeSourceHash('Title', 'Content')
    saveTranslation(db, { article_id: 1, source_hash: hash, ...base })
    expect(getTranslation(db, 1, 'google', 'zh', hash)).toBeNull()
    expect(getTranslation(db, 1, 'baidu', 'en', hash)).toBeNull()
  })

  it('cleanup 清理超期记录，保留近期记录', () => {
    const now = Math.floor(Date.now() / 1000)
    const hash = computeSourceHash('Title', 'Content')
    saveTranslation(db, {
      article_id: 1,
      source_hash: hash,
      ...base,
      updated_at: now - 31 * 24 * 3600 // 31 天前
    })
    saveTranslation(db, {
      article_id: 2,
      source_hash: hash,
      ...base,
      updated_at: now
    })
    cleanupTranslations(db)
    expect(getTranslation(db, 1, 'baidu', 'zh', hash)).toBeNull()
    expect(getTranslation(db, 2, 'baidu', 'zh', hash)).not.toBeNull()
  })

  it('computeSourceHash 确定性：同输入同值、不同输入不同值', () => {
    expect(computeSourceHash('T', 'C')).toBe(computeSourceHash('T', 'C'))
    expect(computeSourceHash('T', 'C')).not.toBe(computeSourceHash('T', 'C2'))
  })

  it('同键重复保存走 UPSERT：译文更新、created_at 保留、updated_at 递增', () => {
    const t1 = Math.floor(Date.now() / 1000) - 100
    saveTranslation(db, {
      article_id: 1,
      source_hash: 'h1',
      ...base,
      translated_content: '<p>旧译文</p>',
      created_at: t1,
      updated_at: t1
    })
    saveTranslation(db, {
      article_id: 1,
      source_hash: 'h2',
      ...base,
      translated_content: '<p>新译文</p>',
      created_at: t1,
      updated_at: t1 + 50
    })
    const rec = getTranslation(db, 1, 'baidu', 'zh', 'h2')
    expect(rec?.translated_content).toBe('<p>新译文</p>')
    expect(rec?.source_hash).toBe('h2')
    expect(rec?.created_at).toBe(t1)
    expect(rec?.updated_at).toBe(t1 + 50)
    // 旧 hash 记录已被覆盖，不再命中
    expect(getTranslation(db, 1, 'baidu', 'zh', 'h1')).toBeNull()
  })

  it('cleanup 保留最近 500 条，超出部分按 updated_at 清理', () => {
    const now = Math.floor(Date.now() / 1000)
    for (let i = 0; i < 510; i++) {
      saveTranslation(db, {
        article_id: i + 1,
        source_hash: `h${i}`,
        ...base,
        updated_at: now - (510 - i)
      })
    }
    cleanupTranslations(db)
    const { c } = db.prepare('SELECT COUNT(*) AS c FROM article_translations').get() as {
      c: number
    }
    expect(c).toBe(500)
    // 最旧的 10 条被清理，最新的保留
    expect(getTranslation(db, 1, 'baidu', 'zh', 'h0')).toBeNull()
    expect(getTranslation(db, 510, 'baidu', 'zh', 'h509')).not.toBeNull()
  })
})
