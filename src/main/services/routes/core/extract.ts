import * as cheerio from 'cheerio'

/** 补全协议头：//xxx 与 http:// 都转 https://（项目 CSP 的 img-src 只放行 https） */
export function normalizeUrl(url: string): string {
  if (url.startsWith('//')) return 'https:' + url
  if (url.startsWith('http://')) return 'https://' + url.slice(7)
  return url
}

/**
 * HTML → 纯文本（压缩连续空白）。
 * 供需要从 HTML 提取摘要 / 列表文本的适配器复用。
 */
export function htmlToText(html: string): string {
  const $ = cheerio.load(html || '')
  return $.text().replace(/\s+/g, ' ').trim()
}

/** 取 HTML 中第一张图 src（无则 undefined） */
export function firstImage(html: string): string | undefined {
  const $ = cheerio.load(html || '')
  return $('img').first().attr('src')
}

/** 纯文本插值进 HTML 前做转义，防止内容里的 < > & " ' 被浏览器当标签/属性解析 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
