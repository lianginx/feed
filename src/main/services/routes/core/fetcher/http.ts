import { fetchWithTimeout, BROWSER_USER_AGENT } from '@main/services/http'

export interface FetchPageOptions {
  /** 附加请求头（如 Referer），合并进默认 UA */
  headers?: Record<string, string>
}

/**
 * 纯 HTTP 抓取（fetcher 层默认路径，便宜快）。
 * 复用项目带超时的 fetch 封装；超时 / 网络错误自然抛出，由调用方处理。
 */
export async function fetchPage(url: string, options: FetchPageOptions = {}): Promise<string> {
  const res = await fetchWithTimeout(url, {
    headers: { 'User-Agent': BROWSER_USER_AGENT, ...options.headers }
  })
  if (!res.ok) {
    throw new Error('Status code ' + res.status)
  }
  return res.text()
}
