import type { AppDatabase } from '@main/database/connection'
import { createHash } from 'crypto'

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
    .get(articleId, provider, targetLang, sourceHash) as TranslationRecord | undefined
  return row ?? null
}

export function saveTranslation(db: AppDatabase, rec: TranslationRecord): void {
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
  const now = Date.now()
  if (now - lastCleanupAt <= CLEANUP_INTERVAL_MS) return
  lastCleanupAt = now
  cleanupTranslations(db)
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
