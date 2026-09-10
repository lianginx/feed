export interface FeedbackCategoryOption {
  value: string
  label: string
}

export interface FeedbackStatus {
  enabled: boolean
  categories: FeedbackCategoryOption[]
}

export interface FeedbackSubmitInput {
  category: string
  content: string
  contact?: string
}

export interface FeedbackSubmitResult {
  /** 后端返回的 12 位提交凭证 id */
  id: string
}

export type FeedbackStatusValue = 'new' | 'processing' | 'resolved' | 'rejected'

export interface MyFeedbackItem {
  id: string
  category: string
  content: string
  status: FeedbackStatusValue
  reply: string | null
  fixed_version: string | null
  reject_reason: string | null
  created_at: string
  updated_at: string
}
