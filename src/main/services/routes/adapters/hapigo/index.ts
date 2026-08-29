import { fetchWithTimeout } from '@main/services/http'
import { normalizeUrl } from '@main/services/routes/core/extract'
import type { ParsedArticle, ParsedFeed } from '@main/services/rss'
import type { FeedAdapter } from '@main/services/routes/core/types'

/**
 * HapiGo 更新日志适配器。
 * 来源：https://updates-cn.hapigo.com/llms.txt（llms.txt 标准索引，无需登录、纯 HTTP）。
 *
 * 设计：
 * - 抓 llms.txt，解析「- [版本标题](详情页 .md): 发布于：日期」陈列条目；
 * - 只取前 10 条（最新版本），并发抓详情 .md 转 HTML 作为文章正文（RSSHub 同方案）。
 * 实现全部自写。
 */

const LLMS_TXT = 'https://updates-cn.hapigo.com/llms.txt'
/** 最多收录前 10 条更新日志 */
const DETAIL_LIMIT = 10
/** 详情页抓取并发数：避免 10 条串行最坏阻塞刷新 200s，又不至于并发过高被源站限流 */
const FETCH_CONCURRENCY = 4

/** llms.txt 中的一条更新陈列（- [v2.22.1 增加去除背景工具](https://.../2221.md): 发布于：2026/7/27） */
interface ChangelogEntry {
  title: string
  url: string
  /** 发布日期文本（如 2026/7/27），缺省时 undefined */
  dateText?: string
}

/** 解析 llms.txt 中陈列的更新条目（跳过非列表/非 http 链接的行） */
function parseEntries(raw: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = []
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*-\s*\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)(?:\s*:?\s*(.*))?$/)
    if (!m) continue
    entries.push({ title: m[1].trim(), url: m[2].trim(), dateText: m[3]?.trim() })
  }
  return entries
}

/** 提取发布日期文本（发布于：2026/7/27）为 ISO（+08:00） */
function parsePublishDate(text: string | undefined): string | undefined {
  const m = text?.match(/发布于[：:]\s*(\d{4})\/(\d{1,2})\/(\d{1,2})/)
  if (!m) return undefined
  const [, y, mo, d] = m
  return new Date(`${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00+08:00`).toISOString()
}

/** 相对地址（如 /files/xxx）补全为绝对 https 地址（复用公共 normalizeUrl 统一协议头） */
function absoluteUrl(href: string, base: string): string {
  try {
    return normalizeUrl(new URL(href, base).href)
  } catch {
    return href
  }
}

/**
 * 提取 <figure><img src="/files/..."> 中的 figcaption 文字（可被 <div align> 包裹）。
 * GitBook 导出里的 /files/<id> 是文件页路由而非图片：请求 307 重定向小写后返回 404 HTML，
 * 无法作为 <img> 源，补全地址也渲染不出。故剥离 img 只留说明文字（多为空，偶有意义说明）。
 */
function extractFigureCaption(line: string): string | null {
  const caption = line.match(/<figcaption>(.*?)<\/figcaption>/)?.[1]?.trim()
  if (!caption) return null
  // caption 常自带 <p> 段落，不重复包裹
  return /^<p>/i.test(caption) ? caption : `<p>${caption}</p>`
}

/** 内联级 markdown 标记：加粗 / 链接 / 行内代码 / 转义字符 */
function inlineMarkup(text: string, base: string): string {
  return (
    text
      .replace(
        /\[([^\]]+)\]\(([^)\s]+)\)/g,
        (_, label: string, href: string) => `<a href="${absoluteUrl(href, base)}">${label}</a>`
      )
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // 取消 markdown 转义（WPS\&Excel、2^2\*2 等）还原为原字符
      .replace(/\\([&*_#~])/g, '$1')
  )
}

/**
 * 详情页 markdown → HTML。只覆盖更新日志实际用到的语法子集：
 * 剔除页首引导块（> For the complete ...）与一级标题（与文章标题重复），
 * ###/## 标题、连续 * 列表项合并 <ul>、内联 HTML（<figure><img>）原样保留。
 */
function markdownToHtml(markdown: string, base: string): string {
  const parts: string[] = []
  let listOpen = false
  const closeList = (): void => {
    if (listOpen) {
      parts.push('</ul>')
      listOpen = false
    }
  }

  for (const raw of markdown.split('\n')) {
    const trimmed = raw.trim()
    // 页首引导块 / 空行跳过
    if (!trimmed || trimmed.startsWith('>')) continue
    // 一级标题（版本号）剔除：正文从标题下方内容开始
    if (trimmed.startsWith('# ')) continue
    if (trimmed.startsWith('### ')) {
      closeList()
      parts.push(`<h3>${inlineMarkup(trimmed.slice(4), base)}</h3>`)
      continue
    }
    if (trimmed.startsWith('## ')) {
      closeList()
      parts.push(`<h2>${inlineMarkup(trimmed.slice(3), base)}</h2>`)
      continue
    }
    // 列表项：连续 * 行合并为一个 <ul>
    if (trimmed.startsWith('* ')) {
      if (!listOpen) {
        parts.push('<ul>')
        listOpen = true
      }
      parts.push(`<li>${inlineMarkup(trimmed.replace(/^\*\s*/, ''), base)}</li>`)
      continue
    }
    closeList()
    // 内联 HTML 块：GitBook 的 <figure><img src="/files/..."> 图片不可用（307→404），
    // 剥离 img 仅保留 figcaption 文字；其余内联 HTML（如 <div align>）原样保留
    if (trimmed.startsWith('<')) {
      const kept = trimmed.includes('<figure>') ? extractFigureCaption(trimmed) : trimmed
      if (kept) parts.push(kept)
      continue
    }
    parts.push(`<p>${inlineMarkup(trimmed, base)}</p>`)
  }
  closeList()
  return parts.join('\n')
}

/** 提取详情页一级标题（# v2.22.1 ...） */
function extractTitle(markdown: string): string | undefined {
  return markdown.match(/^\s*#\s+(.+)$/m)?.[1]?.trim()
}

/** 提取纯文本摘要：取正文前 3 个列表项（标题/图表行剔除） */
function extractSummary(markdown: string): string {
  const parts: string[] = []
  for (const line of markdown.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('>') || trimmed.startsWith('#') || trimmed.startsWith('<')) {
      continue
    }
    parts.push(trimmed.replace(/^\*\s*/, ''))
    if (parts.length >= 3) break
  }
  return parts.join(' · ').slice(0, 120)
}

/** 抓单个详情 .md 页并转换（失败返回空，不阻断整条订阅；留日志便于排查） */
async function fetchDetail(
  url: string
): Promise<{ title?: string; content?: string; summary?: string }> {
  try {
    const res = await fetchWithTimeout(url)
    if (!res.ok) {
      console.warn(`[hapigo] 详情页抓取失败（HTTP ${res.status}）: ${url}`)
      return {}
    }
    const markdown = await res.text()
    // 相对链接/图片以详情页自身 URL 为基准解析（而非站点根，避免 ../ 相对链错位）
    return {
      title: extractTitle(markdown),
      content: markdownToHtml(markdown, url),
      summary: extractSummary(markdown)
    }
  } catch (error) {
    console.warn(`[hapigo] 详情页抓取异常: ${url}`, error)
    return {}
  }
}

/** 受限并发映射：最多同时并发 limit 个异步任务，结果按输入顺序返回 */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

/**
 * HapiGo 更新日志适配器。
 * 纯 HTTP（needsBrowser: false）、无参数、无需登录。
 */
export const hapigoChangelogAdapter: FeedAdapter = {
  id: 'hapigo-changelog',
  name: 'HapiGo 更新日志',
  description: 'HapiGo 官方更新日志（llms.txt 来源，最新 10 条）',
  domains: ['hapigo.com', 'updates-cn.hapigo.com'],
  params: [],
  needsBrowser: false,
  siteUrl: 'https://updates-cn.hapigo.com/',
  buildUrl: () => LLMS_TXT,
  async parse(raw: string): Promise<ParsedFeed> {
    const entries = parseEntries(raw)
    // 被反爬/限流拦截或地址变更时 llms.txt 常返回非陈列内容，解析不到条目
    if (entries.length === 0) {
      throw new Error('HapiGo 更新日志来源返回异常，可能被风控或已改版')
    }

    // 并发抓详情页补正文/摘要（受 FETCH_CONCURRENCY 限制，避免串行阻塞刷新）；只取前 10 条
    const entriesToFetch = entries.slice(0, DETAIL_LIMIT)
    const details = await mapLimit(entriesToFetch, FETCH_CONCURRENCY, (entry) =>
      fetchDetail(entry.url)
    )
    const items: ParsedArticle[] = entriesToFetch.map((entry, i) => {
      const detail = details[i]
      return {
        guid: entry.url,
        title: detail.title ?? entry.title,
        link: entry.url,
        // 正文来自详情 .md；抓取失败不拿标题兜底（不产空壳正文）
        content: detail.content,
        contentComplete: Boolean(detail.content),
        // 摘要缺省时回退为版本标题，保证搜索/列表有文本
        summary: detail.summary ?? entry.title,
        contentSnippet: detail.summary ?? entry.title,
        pubDate: parsePublishDate(entry.dateText),
        author: 'HapiGo'
      }
    })

    return {
      title: 'HapiGo 更新日志',
      description: 'HapiGo 官方更新日志',
      link: 'https://updates-cn.hapigo.com/',
      items
    }
  }
}
