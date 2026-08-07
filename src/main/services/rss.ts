import FeedParser from 'feedparser'
import * as cheerio from 'cheerio'
import { fetchWithTimeout, BROWSER_USER_AGENT } from './http'

/**
 * feedparser 解析结果的部分命名空间字段（@types/feedparser 未覆盖，按需扩展）。
 * - atom:content / content:encoded 结构为 { '@': 属性, '#': 文本 }
 */
type FeedparserItem = FeedParser.Item & {
  'atom:content'?: { '#': string; '@'?: Record<string, string> }
  'content:encoded'?: { '#': string }
}

type FeedparserMeta = FeedParser.Meta & {
  '#type'?: 'rss' | 'rdf' | 'atom'
}

export interface ParsedFeed {
  title: string
  description?: string
  link?: string
  image?: { url?: string; title?: string }
  items: ParsedArticle[]
}

export interface ParsedArticle {
  guid: string
  title: string
  link?: string
  content?: string
  contentSnippet?: string
  summary?: string
  pubDate?: string
  author?: string
  coverImage?: string
}

/**
 * 将 HTTP 状态码映射为语义准确的友好提示。
 * 按常见状态码分类，避免 403/404 等语义不同但共用同一条文案误导用户。
 */
export function friendlyStatusText(status: number): string {
  // 4xx 客户端错误
  if (status === 401) {
    return '401 网站要求登录或授权，请确认订阅源是否需要登录'
  }
  if (status === 403) {
    return '403 网站拒绝了访问请求，可能触发了反爬或需要登录'
  }
  if (status === 404) {
    return '404 订阅源地址可能已失效，请检查地址是否正确'
  }
  if (status === 410) {
    return '410 订阅源已被移除，请检查地址是否正确'
  }
  if (status === 429) {
    return '429 请求过于频繁被限流，请稍后重试'
  }
  if (status === 405 || status === 406) {
    return status + ' 请求被服务器拒绝，可能不支持当前访问方式'
  }
  if (status >= 400 && status < 500) {
    return status + ' 订阅源请求无效，请检查地址是否正确'
  }
  // 5xx 服务端错误
  if (status >= 500) {
    return status + ' 服务器暂时不可用，请稍后重试'
  }
  return status + ' 订阅源请求异常，请稍后重试'
}

/**
 * 将订阅源拉取/解析错误转换为友好提示文本。
 * 原始技术细节（错误 code/message）会记录到日志，供排查使用。
 */
export function toFriendlyFeedError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const code =
    error instanceof Error && 'code' in error ? (error as NodeJS.ErrnoException).code : undefined

  // 适配器主动抛出的中文友好错误（如 B 站风控/限流）直接透传，不加前缀
  if (/[\u4e00-\u9fa5]/.test(message)) {
    return message
  }

  // 域名解析失败
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return '域名解析失败，请检查订阅源地址是否正确'
  }
  // 连接被拒绝
  if (code === 'ECONNREFUSED') {
    return '连接被拒绝，网站可能已下线或屏蔽了访问'
  }
  // 连接被重置/中断
  if (code === 'ECONNRESET' || /socket hang up/i.test(message)) {
    return '网络连接被中断，请检查网络后重试'
  }
  // 网络不可达/离线
  if (code === 'ENETUNREACH' || code === 'EHOSTUNREACH' || code === 'ENETDOWN') {
    return '网络不可达，请检查网络连接'
  }
  // TLS/证书错误
  if (
    code === 'CERT_HAS_EXPIRED' ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    /certificate|TLS|SSL/i.test(message)
  ) {
    return '网站证书校验失败，可能存在安全风险'
  }
  // 超时
  if (code === 'ETIMEDOUT' || /timed out|timeout|timeout of/i.test(message)) {
    return '请求超时，请检查网络或稍后重试'
  }
  // HTTP 状态码错误
  const statusMatch = message.match(/Status code (\d+)/)
  if (statusMatch) {
    const status = Number(statusMatch[1])
    return friendlyStatusText(status)
  }
  // XML/解析错误
  if (/Failed to parse|Unable to parse|Feed not recognized|Not a feed|XML/i.test(message)) {
    return '内容解析失败，可能不是有效的 RSS 订阅源'
  }
  // JSON 解析错误（适配器接口被反爬/风控拦截时返回 HTML 或空内容）
  if (/Unexpected token|Unexpected end of JSON|JSON\.parse/i.test(message)) {
    return '接口返回异常，可能被风控'
  }

  // 兜底：保留原始信息（含 code）以便定位问题
  return '刷新失败：' + message
}

/**
 * 单次解析 HTML，同时提取纯文本摘要与第一张图。
 * cheerio.load 有解析开销，摘要与封面常同时需要，故合并为一次解析。
 */
function parseHtml(html: string): { text: string; firstImage: string | undefined } {
  const $ = cheerio.load(html || '')
  return {
    text: $.text().replace(/\s+/g, ' ').trim(),
    firstImage: $('img').first().attr('src')
  }
}

/**
 * 提取条目正文（HTML 全文）：
 * 优先 Atom <content> / RSS <content:encoded>（feedparser 保留为 {@,#} 结构），
 * 其次回退到 description。
 */
function extractContent(item: FeedparserItem): string {
  return item['atom:content']?.['#'] || item['content:encoded']?.['#'] || item.description || ''
}

/**
 * 过滤外部 URL，仅放行 http/https 协议（封面图/主页等外部内容入库前校验）。
 * 非法协议（如 javascript:/data:）或无效 URL 返回 undefined。
 */
function sanitizeHttpUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:' ? url : undefined
  } catch {
    return undefined
  }
}

/**
 * 提取条目摘要（纯文本）：
 * feedparser 对 RSS 给出纯文本 description；对 Atom 可能为 null 或含 HTML，
 * 此时回退为正文纯文本。用标签结构检测而非单个 "<"（纯文本比较符如 "a < b" 不误判）。
 */
function extractSummary(item: FeedparserItem, fallbackText: string): string {
  return item.summary && !/<[a-z][a-z0-9]*(\s|\/?>)/i.test(item.summary)
    ? item.summary
    : fallbackText
}

/**
 * 提取条目封面图，优先级：
 * 1. feedparser 已合并的 item.image（media:thumbnail / itunes:image / media:group 等）
 * 2. image/ 类型的 enclosure
 * 3. 正文 HTML 中的第一张图
 * 结果仅放行 http/https 协议。
 */
function extractCoverImage(
  item: FeedparserItem,
  fallbackImage: string | undefined
): string | undefined {
  return sanitizeHttpUrl(
    item.image?.url ||
      item.enclosures?.find((e) => e.type?.startsWith('image/'))?.url ||
      fallbackImage
  )
}

/** 将 feedparser 的 item 映射为项目统一结构 ParsedArticle。 */
function mapArticle(item: FeedparserItem): ParsedArticle {
  const content = extractContent(item)
  const { text, firstImage } = parseHtml(content)
  const summary = extractSummary(item, text)
  const coverImage = extractCoverImage(item, firstImage)

  return {
    guid: item.guid || item.link || item.title || '',
    title: item.title || '(无标题)',
    link: item.link || undefined,
    content: content || undefined,
    contentSnippet: summary,
    summary,
    pubDate: item.date ? item.date.toISOString() : undefined,
    author: item.author || undefined,
    coverImage
  }
}

/** 将 feedparser 的 meta 映射为项目统一结构 ParsedFeed。 */
function mapFeed(meta: FeedparserMeta, items: ParsedArticle[]): ParsedFeed {
  const imageUrl = sanitizeHttpUrl(meta.image?.url)
  return {
    title: meta.title || '',
    description: meta.description || undefined,
    link: meta.link || undefined,
    image: imageUrl ? { url: imageUrl, title: meta.image.title } : undefined,
    items
  }
}

/**
 * 将订阅源 XML 字符串解析为结构化数据（feedparser 事件流封装为 Promise）。
 * 解析结束但未识别出 feed 元信息（如纯文本/其他 XML）时抛错。
 */
export function parseFeedXml(xml: string): Promise<ParsedFeed> {
  return new Promise((resolve, reject) => {
    const parser = new FeedParser()
    const items: ParsedArticle[] = []
    let meta: FeedparserMeta | undefined

    parser.on('meta', (m) => {
      meta = m as FeedparserMeta
    })
    parser.on('readable', function () {
      let item: FeedParser.Item | null
      while ((item = this.read()) !== null) {
        items.push(mapArticle(item as FeedparserItem))
      }
    })
    parser.on('error', reject)
    parser.on('end', () => {
      if (!meta || !meta['#type']) {
        reject(new Error('Feed not recognized as RSS or Atom'))
        return
      }
      resolve(mapFeed(meta, items))
    })
    parser.end(xml)
  })
}

/**
 * 解析 RSS/Atom 订阅源。
 */
export async function parseFeed(url: string): Promise<ParsedFeed> {
  let res: Response
  try {
    res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': BROWSER_USER_AGENT }
    })
  } catch (error) {
    // fetchWithTimeout 超时通过 AbortController 中止，抛 AbortError；
    // 转成带超时语义的错误，让 toFriendlyFeedError 能识别为「请求超时」
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out')
    }
    throw error
  }
  if (!res.ok) {
    throw new Error('Status code ' + res.status)
  }
  const feed = await parseFeedXml(await res.text())
  // 无标题时回退为订阅源地址（不可变，不修改 feed 对象）
  return { ...feed, title: feed.title || url }
}

/**
 * 验证 URL 是否为有效的 RSS/Atom 订阅源。
 */
export async function validateFeed(
  url: string
): Promise<{ valid: boolean; title?: string; error?: string }> {
  try {
    const feed = await parseFeed(url)
    return { valid: true, title: feed.title }
  } catch (error) {
    return { valid: false, error: toFriendlyFeedError(error) }
  }
}
