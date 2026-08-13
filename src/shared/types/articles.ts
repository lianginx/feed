/**
 * 文章领域类型（preload 与渲染进程的公共契约）。
 * 统一在 src/shared/types 定义，避免多处重复定义造成类型漂移。
 * 注意：本文件是纯类型声明，不包含任何运行时逻辑。
 */
export interface Article {
  id: number
  feed_id: number
  title: string
  url: string | null
  author: string | null
  summary: string | null
  published_at: number | null
  is_read: number
  is_starred: number
  feed_title: string
  favicon_url?: string | null
  cover_image?: string | null
}

export interface ArticleDetail extends Article {
  content: string | null
  guid: string
  site_url: string | null
  created_at: number
}

export interface ArticleListCursor {
  /** 上一页最后一篇文章的发布时间（可能为空） */
  publishedAt: number | null
  /** 上一页最后一篇文章的 ID */
  id: number
}

export interface ArticleListParams {
  feedId?: number
  categoryId?: number | null
  isUnread?: boolean
  isStar?: boolean
  isToday?: boolean
  query?: string
  /** 每页大小，默认 60，最大 200 */
  limit?: number
  /** 上一页游标；不传表示第一页 */
  cursor?: ArticleListCursor | null
}

export interface ArticleListResult {
  articles: Article[]
  /** 是否还有下一页 */
  hasMore: boolean
  /** 下一页游标；没有更多时为 null */
  nextCursor: ArticleListCursor | null
}
