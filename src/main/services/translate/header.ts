import { toTranslatableSummary } from './summary'

/**
 * 译文头部（标题/摘要）补翻的纯逻辑。
 * 命中缓存时若头部字段缺失（v10 之前的历史缓存、或头部请求失败过的记录），
 * 只补发一次请求把标题与摘要一起翻回来；这里负责"翻什么"与"结果怎么落位"。
 */

export interface HeaderBackfillPlan {
  needTitle: boolean
  needSummary: boolean
  /** 待翻文本，顺序与 mapHeaderResults 的取值顺序一一对应 */
  texts: string[]
}

export function planHeaderBackfill(
  cached: { translated_title: string | null; translated_summary: string | null },
  title: string,
  summary: string | null
): HeaderBackfillPlan {
  const summaryText = toTranslatableSummary(summary)
  const needTitle = !cached.translated_title && Boolean(title.trim())
  const needSummary = !cached.translated_summary && Boolean(summaryText)
  const texts: string[] = []
  if (needTitle) texts.push(title)
  if (needSummary) texts.push(summaryText)
  return { needTitle, needSummary, texts }
}

/** 把翻译结果按 plan 的顺序映射回字段；未请求或翻译失败的字段为 null */
export function mapHeaderResults(
  plan: Pick<HeaderBackfillPlan, 'needTitle' | 'needSummary'>,
  results: (string | null)[]
): { title: string | null; summary: string | null } {
  let cursor = 0
  const title = plan.needTitle ? (results[cursor++] ?? null) : null
  const summary = plan.needSummary ? (results[cursor] ?? null) : null
  return { title, summary }
}
