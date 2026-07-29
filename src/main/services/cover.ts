import * as cheerio from 'cheerio'

export interface CoverImageCandidate {
  url: string
  source: 'enclosure' | 'media-thumbnail' | 'media-content' | 'content-html'
}

/**
 * 从解析后的 RSS/Atom 条目中多层级提取封面图。
 *
 * 优先级：
 *  1. enclosure（type 以 image/ 开头）
 *  2. media:thumbnail
 *  3. media:content（medium="image"）
 *  4. 文章 HTML 内容中的第一张 <img>
 *
 * 返回第一个匹配的 URL，均不匹配则返回 undefined。
 */
export function extractCoverImage(item: {
  enclosure?: { url?: string; type?: string }
  'media:thumbnail'?: { $?: { url?: string } }
  'media:content'?: { $?: { url?: string; medium?: string; type?: string } }
  content?: string
}): string | undefined {
  // 1. enclosure
  if (item.enclosure?.url && item.enclosure.type?.startsWith('image/')) {
    return item.enclosure.url
  }

  // 2. media:thumbnail
  const mediaThumbnail = item['media:thumbnail']?.$?.url
  if (mediaThumbnail) {
    return mediaThumbnail
  }

  // 3. media:content（medium="image" 或无 medium 但 typ 为图片）
  const mediaContent = item['media:content']?.$
  if (mediaContent?.url) {
    if (
      mediaContent.medium === 'image' ||
      (!mediaContent.medium && mediaContent.type?.startsWith('image/'))
    ) {
      return mediaContent.url
    }
  }

  // 4. 从 HTML 内容中提取第一张图片
  if (item.content) {
    return extractFirstImageFromHtml(item.content)
  }

  return undefined
}

/**
 * 从 HTML 字符串中提取第一张图片的 src。
 * 使用 cheerio 解析，比正则更健壮。
 */
export function extractFirstImageFromHtml(html: string): string | undefined {
  const $ = cheerio.load(html)
  const firstImg = $('img').first()
  const src = firstImg.attr('src')
  if (src) return src

  // 兜底：有些源用 <figure><img> 或图片在 <a> 里，但 cheerio 的 img 选择器已覆盖
  return undefined
}
