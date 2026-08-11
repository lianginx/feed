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

export interface ArticleListResult {
  articles: Article[]
}
