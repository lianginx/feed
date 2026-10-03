import type { AppDatabase } from '@main/database/connection'
import { createHash } from 'crypto'

export interface TranslationRecord {
  article_id: number
  provider: string
  target_lang: string
  source_hash: string
  translated_title: string | null
  translated_summary: string | null
  translated_content: string | null
  created_at: number
  updated_at: number
}

const RETENTION_DAYS = 30
const RETENTION_COUNT = 500

const CLEANUP_INTERVAL_MS = 10 * 60 * 1000
let lastCleanupAt = 0

export function computeSourceHash(title: string, content: string): string {
  return createHash('sha256').update(`${title}\n${content}`).digest('hex')
}

export function getTranslation(
  db: AppDatabase,
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
    .get(articleId, provider, targetLang, sourceHash) as unknown as TranslationRecord | undefined
  return row ?? null
}

/**
 * 写入/更新译文缓存。
 * 头部字段（标题/摘要）用 COALESCE：正文变化触发重译时若头部批次失败，
 * 不会被 NULL 覆盖掉上一次已成功的译文（缺失部分由 backfillHeader 在下次命中缓存时补翻）。
 */
export function saveTranslation(db: AppDatabase, rec: TranslationRecord): void {
  db.prepare(
    `INSERT INTO article_translations
      (article_id, provider, target_lang, source_hash, translated_title, translated_summary, translated_content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(article_id, provider, target_lang) DO UPDATE SET
       source_hash = excluded.source_hash,
       translated_title = COALESCE(excluded.translated_title, article_translations.translated_title),
       translated_summary = COALESCE(excluded.translated_summary, article_translations.translated_summary),
       translated_content = excluded.translated_content,
       created_at = article_translations.created_at,
       updated_at = excluded.updated_at`
  ).run(
    rec.article_id,
    rec.provider,
    rec.target_lang,
    rec.source_hash,
    rec.translated_title,
    rec.translated_summary,
    rec.translated_content,
    rec.created_at,
    rec.updated_at
  )
  const now = Date.now()
  if (now - lastCleanupAt <= CLEANUP_INTERVAL_MS) return
  lastCleanupAt = now
  cleanupTranslations(db)
}

/**
 * 补写译文头部（标题/摘要）：命中缓存时按需补翻后回填。
 * COALESCE 保证只覆盖本次真正补翻成功的字段；同时抬高 updated_at，
 * 避免刚补翻的缓存行被保留策略立刻清掉。
 */
export function updateTranslationHeader(
  db: AppDatabase,
  articleId: number,
  provider: string,
  targetLang: string,
  translatedTitle: string | null,
  translatedSummary: string | null
): void {
  db.prepare(
    `UPDATE article_translations
     SET translated_title = COALESCE(?, translated_title),
         translated_summary = COALESCE(?, translated_summary),
         updated_at = ?
     WHERE article_id = ? AND provider = ? AND target_lang = ?`
  ).run(
    translatedTitle,
    translatedSummary,
    Math.floor(Date.now() / 1000),
    articleId,
    provider,
    targetLang
  )
}

export function cleanupTranslations(db: AppDatabase): void {
  db.prepare(
    `DELETE FROM article_translations
     WHERE updated_at < ?
        OR article_id NOT IN (
          SELECT article_id FROM article_translations ORDER BY updated_at DESC LIMIT ?
        )`
  ).run(Math.floor(Date.now() / 1000) - RETENTION_DAYS * 24 * 3600, RETENTION_COUNT)
}
