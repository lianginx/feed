import { computed, ref } from 'vue'
import { dayjs } from '@renderer/windows/main/utils/dayjs'
import type { Article } from '@shared/types/articles'

export interface ArticleGroup {
  dateKey: string
  label: string
  articles: Article[]
}

function formatDateLabel(date: string): string {
  const today = dayjs().format('YYYY-MM-DD')
  if (date === today) return '今天'
  if (date === dayjs().subtract(1, 'day').format('YYYY-MM-DD')) return '昨天'
  const d = dayjs(date)
  return `${d.month() + 1}月${d.date()}日`
}

export function useArticleGroups(getArticles: () => Article[]) {
  const collapsedDates = ref<Set<string>>(new Set())

  const groups = computed<ArticleGroup[]>(() => {
    const result: ArticleGroup[] = []
    let last: ArticleGroup | null = null
    for (const article of getArticles()) {
      const date = article.published_at
        ? dayjs(article.published_at * 1000).format('YYYY-MM-DD')
        : ''
      const dateKey = date || 'unknown'
      if (!last || last.dateKey !== dateKey) {
        last = { dateKey, label: date ? formatDateLabel(date) : '未知时间', articles: [] }
        result.push(last)
      }
      last.articles.push(article)
    }
    return result
  })

  function isDateCollapsed(dateKey: string): boolean {
    return collapsedDates.value.has(dateKey)
  }

  function toggleDateCollapse(dateKey: string) {
    const next = new Set(collapsedDates.value)
    if (next.has(dateKey)) next.delete(dateKey)
    else next.add(dateKey)
    collapsedDates.value = next
  }

  function resetCollapsed() {
    collapsedDates.value = new Set()
  }

  return { groups, collapsedDates, isDateCollapsed, toggleDateCollapse, resetCollapsed }
}
