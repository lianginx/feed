import type Database from 'better-sqlite3'
import { createHash } from 'crypto'

/**
 * SQLite 译文缓存。
 * 只依赖 better-sqlite3，不 import electron，保证可在 node 环境（vitest）运行。
 * 表结构由 migration v7 创建；测试用 :memory: 手动建表。
 */

export interface TranslationRecord {
  article_id: number
  provider: string
  target_lang: string
  source_hash: string
  translated_title: string | null
  translated_content: string | null
  created_at: number
  updated_at: number
}

/** 保留策略：超过 30 天 或 超出最近 500 篇 的记录被清理 */
const RETENTION_DAYS = 30
const RETENTION_COUNT = 500

/** 清理节流：写入后最多每 CLEANUP_INTERVAL_MS 执行一次，避免每次保存都触发 DELETE（评审建议 5） */
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000
let lastCleanupAt = 0

/**
 * 计算源内容哈希：source_hash = sha256(title + '\n' + content)。
 * 内容变化 / 换提供商 / 换语言都会导致 key 变化，自动重译。
 */
export function computeSourceHash(title: string, content: string): string {
  return createHash('sha256').update(`${title}\n${content}`).digest('hex')
}

export function getTranslation(
  db: Database.Database,
  articleId: number,
  provider: string,
  targetLang: string,
  sourceHash: string
): TranslationRecord | null {
  const row = db
    .prepare(
      `SELECT * FROM article_translations
       WHERE article_id = ? AND provider = ? AND target_lang = ? AND source_hash = ?`
    )
    .get(articleId, provider, targetLang, sourceHash) as TranslationRecord | undefined
  return row ?? null
}

export function saveTranslation(db: Database.Database, rec: TranslationRecord): void {
  db.prepare(
    `INSERT INTO article_translations
      (article_id, provider, target_lang, source_hash, translated_title, translated_content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(article_id, provider, target_lang) DO UPDATE SET
       source_hash = excluded.source_hash,
       translated_title = excluded.translated_title,
       translated_content = excluded.translated_content,
       created_at = article_translations.created_at,
       updated_at = excluded.updated_at`
  ).run(
    rec.article_id,
    rec.provider,
    rec.target_lang,
    rec.source_hash,
    rec.translated_title,
    rec.translated_content,
    rec.created_at,
    rec.updated_at
  )
  // 节流清理：不与每次写入强耦合；应用启动时另有 cleanupTranslations 兜底
  const now = Date.now()
  if (now - lastCleanupAt <= CLEANUP_INTERVAL_MS) return
  lastCleanupAt = now
  cleanupTranslations(db)
}

/** 保留策略清理：写入时顺带删除超期 / 超出数量的记录 */
export function cleanupTranslations(db: Database.Database): void {
  db.prepare(
    `DELETE FROM article_translations
     WHERE updated_at < ?
        OR article_id NOT IN (
          SELECT article_id FROM article_translations ORDER BY updated_at DESC LIMIT ?
        )`
  ).run(Math.floor(Date.now() / 1000) - RETENTION_DAYS * 24 * 3600, RETENTION_COUNT)
}
