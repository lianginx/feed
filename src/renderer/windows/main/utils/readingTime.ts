/** 中文阅读速度：字/分钟（常速阅读区间 250~400，取中间值） */
const CHINESE_WPM = 300
/** 英文阅读速度：词/分钟 */
const ENGLISH_WPM = 200

/** 中日韩统一表意文字及常用中文标点 */
const CJK_REGEX = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g
/** 英文单词（含连字符与撇号，如 state-of-the-art、don't） */
const WORD_REGEX = /[a-zA-Z0-9]+(?:['’-][a-zA-Z0-9]+)*/g

const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'"
}

/**
 * 去除 HTML 标签与常用实体，提取纯文本。
 * 内容已由 DOMPurify 净化，只需剥标签即可。
 */
function stripHtml(html: string): string {
  let text = html.replace(/<[^>]*>/g, ' ')
  for (const [entity, value] of Object.entries(HTML_ENTITIES)) {
    text = text.split(entity).join(value)
  }
  return text
}

/**
 * 估算文章阅读时长（分钟，至少 1 分钟）。
 * 中文按字符数计、英文按单词数计，分开换算后相加。
 */
export function estimateReadingTime(content: string | null): number {
  if (!content) return 0
  const text = stripHtml(content)
  const cjkCount = (text.match(CJK_REGEX) ?? []).length
  const wordCount = (text.match(WORD_REGEX) ?? []).length
  const minutes = Math.ceil(cjkCount / CHINESE_WPM + wordCount / ENGLISH_WPM)
  return Math.max(1, minutes)
}
