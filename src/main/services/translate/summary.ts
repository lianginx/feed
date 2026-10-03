/**
 * 列表摘要的翻译文本准备。
 * 列表摘要只展示两行，且 Atom 无 description 时 summary 会回退成正文纯文本
 * （实测最长可达数万字符），因此送翻前必须按显示需要截断，避免正文被翻两遍。
 */
export const SUMMARY_CHAR_LIMIT = 300

export function toTranslatableSummary(summary: string | null | undefined): string {
  return (summary ?? '').replace(/\s+/g, ' ').trim().slice(0, SUMMARY_CHAR_LIMIT)
}
