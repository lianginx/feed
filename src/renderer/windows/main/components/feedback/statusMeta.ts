import type { FeedbackStatusValue } from '@shared/types/feedback'

export const feedbackStatusMeta: Record<
  FeedbackStatusValue,
  { label: string; dot: string; text: string }
> = {
  new: { label: '已提交', dot: 'bg-amber-500', text: 'text-amber-600' },
  processing: { label: '处理中', dot: 'bg-blue-500', text: 'text-blue-600' },
  resolved: { label: '已解决', dot: 'bg-green-600', text: 'text-green-600' },
  rejected: { label: '已驳回', dot: 'bg-muted-foreground', text: 'text-muted-foreground' }
}
