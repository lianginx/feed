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
