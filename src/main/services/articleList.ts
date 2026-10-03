import type { AppDatabase } from '@main/database/connection'
import type {
  Article,
  ArticleListCursor,
  ArticleListParams,
  ArticleListResult
} from '@shared/types/articles'

/**
 * 文章列表查询（从 IPC handler 抽出为纯逻辑，便于单测）。
 * - 开启「列表显示译文」时联查 article_translations，带出译文标题与摘要；
 * - 搜索同时命中原文（FTS）与译文（LIKE），两路取并集后统一排序分页。
 */

/** 译文查询选项；null 表示不查询译文（设置关闭或未配置翻译服务） */
export interface ArticleListTranslateOptions {
  provider: string
  targetLang: string
}

export interface ArticleListQuery {
  sql: string
  bind: Record<string, number | string>
}

const MIN_FTS_TERM_LENGTH = 3
const DEFAULT_LIMIT = 60
const MAX_LIMIT = 200

const LIST_COLUMNS = `a.id, a.feed_id, a.title, a.author, a.summary, a.published_at, a.is_read, a.is_starred, a.url, a.cover_image,
          f.title as feed_title, f.favicon_url`

const TRANSLATION_LEFT_JOIN = `LEFT JOIN article_translations t
          ON t.article_id = a.id AND t.provider = @tp AND t.target_lang = @tl`

/** 列表列：开启译文时额外带出译文标题与摘要（不取 translated_content，避免 IPC 负载膨胀） */
function listColumns(translate: boolean): string {
  return translate ? `${LIST_COLUMNS}, t.translated_title, t.translated_summary` : LIST_COLUMNS
}

function resolveLimit(limit?: number): number {
  return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
}

/** 公共过滤条件（订阅源/分类/未读/星标/今日 + 游标），两个搜索分支共用同一套参数 */
function buildBaseFilters(
  params: ArticleListParams,
  bind: Record<string, number | string>
): string[] {
  const conditions: string[] = []

  if (params.feedId !== undefined) {
    conditions.push('a.feed_id = @feedId')
    bind.feedId = params.feedId
  } else if (params.categoryId === null) {
    conditions.push('f.category_id IS NULL')
  } else if (params.categoryId !== undefined) {
    conditions.push('f.category_id = @categoryId')
    bind.categoryId = params.categoryId
  }

  if (params.isUnread) {
    conditions.push('a.is_read = 0')
  }
  if (params.isStar) {
    conditions.push('a.is_starred = 1')
  }
  if (params.isToday) {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000
    conditions.push('a.published_at >= @todayStart')
    bind.todayStart = todayStart
  }

  const cursor = params.cursor
  if (cursor) {
    if (cursor.publishedAt === null) {
      conditions.push('a.published_at IS NULL AND a.id < @cursorId')
      bind.cursorId = cursor.id
    } else {
      conditions.push(
        '(a.published_at < @cursorPub OR (a.published_at = @cursorPub AND a.id < @cursorId) OR a.published_at IS NULL)'
      )
      bind.cursorPub = cursor.publishedAt
      bind.cursorId = cursor.id
    }
  }

  return conditions
}

/** 原文搜索：长词走 FTS5 MATCH（任一词命中），短词退化为 LIKE（全部词命中） */
function buildOriginSearch(query: string, bind: Record<string, number | string>): string[] {
  const terms = query.split(/\s+/).filter(Boolean)
  if (terms.every((term) => term.length >= MIN_FTS_TERM_LENGTH)) {
    bind.match = terms.map((term) => `"${term.replace(/"/g, '""')}"`).join(' OR ')
    return ['articles_fts MATCH @match']
  }
  return terms.map((term, i) => {
    bind[`like${i}`] = `%${term}%`
    return `(fts.title LIKE @like${i} OR fts.content LIKE @like${i} OR fts.author LIKE @like${i})`
  })
}

/** 译文搜索：匹配语义与原文分支保持一致（长词任一命中，短词全部命中） */
function buildTranslationSearch(query: string, bind: Record<string, number | string>): string[] {
  const terms = query.split(/\s+/).filter(Boolean)
  const likes = terms.map((term, i) => {
    bind[`tlike${i}`] = `%${term}%`
    return `(t.translated_title LIKE @tlike${i} OR t.translated_summary LIKE @tlike${i} OR t.translated_content LIKE @tlike${i})`
  })
  if (likes.length === 0) return []
  return terms.every((term) => term.length >= MIN_FTS_TERM_LENGTH)
    ? [`(${likes.join(' OR ')})`]
    : likes
}

export function buildArticleListQuery(
  params: ArticleListParams,
  translate: ArticleListTranslateOptions | null
): ArticleListQuery {
  const bind: Record<string, number | string> = {}
  const filters = buildBaseFilters(params, bind)
  bind.limit = resolveLimit(params.limit) + 1

  if (translate) {
    bind.tp = translate.provider
    bind.tl = translate.targetLang
  }

  const query = params.query?.trim() ?? ''

  if (!query) {
    const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : ''
    const sql = `
        SELECT ${listColumns(Boolean(translate))}
        FROM articles a
        JOIN feeds f ON a.feed_id = f.id
        ${translate ? TRANSLATION_LEFT_JOIN : ''}
        ${whereClause}
        ORDER BY a.published_at DESC, a.id DESC
        LIMIT @limit
      `
    return { sql, bind }
  }

  const originConditions = [...filters, ...buildOriginSearch(query, bind)]
  const originFrom = `FROM articles_fts fts
        JOIN articles a ON a.id = fts.rowid
        JOIN feeds f ON a.feed_id = f.id`

  if (!translate) {
    const sql = `
        SELECT ${listColumns(false)}
        ${originFrom}
        WHERE ${originConditions.join(' AND ')}
        ORDER BY a.published_at DESC, a.id DESC
        LIMIT @limit
      `
    return { sql, bind }
  }

  const translationConditions = [...filters, ...buildTranslationSearch(query, bind)]
  const sql = `
        SELECT * FROM (
          SELECT ${listColumns(true)}
          ${originFrom}
          ${TRANSLATION_LEFT_JOIN}
          WHERE ${originConditions.join(' AND ')}
          UNION
          SELECT ${listColumns(true)}
          FROM articles a
          JOIN feeds f ON a.feed_id = f.id
          JOIN article_translations t ON t.article_id = a.id AND t.provider = @tp AND t.target_lang = @tl
          WHERE ${translationConditions.join(' AND ')}
        )
        ORDER BY published_at DESC, id DESC
        LIMIT @limit
      `
  return { sql, bind }
}

export function queryArticleList(
  db: AppDatabase,
  params: ArticleListParams,
  translate: ArticleListTranslateOptions | null
): ArticleListResult {
  const { sql, bind } = buildArticleListQuery(params, translate)
  const limit = resolveLimit(params.limit)
  const rows = db.prepare(sql).all(bind) as unknown as Article[]

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page[page.length - 1]
  const nextCursor: ArticleListCursor | null = last
    ? { publishedAt: last.published_at, id: last.id }
    : null

  return { articles: page, hasMore, nextCursor }
}
