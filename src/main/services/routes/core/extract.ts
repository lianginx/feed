import * as cheerio from 'cheerio'

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
