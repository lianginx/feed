import { fetchWithTimeout, BROWSER_USER_AGENT } from '@main/services/http'

export interface FetchPageOptions {
  /** 附加请求头（如 Referer / Cookie / Content-Type），合并进默认 UA */
  headers?: Record<string, string>
  /** 请求方法，缺省 GET；POST 用于以 JSON body 传参的站点接口（如掘金） */
  method?: 'GET' | 'POST'
  /** POST 请求体（JSON 文本），仅在 method 为 POST 时使用 */
  body?: string
}

/**
 * 纯 HTTP 抓取（fetcher 层默认路径，便宜快）。
 * 复用项目带超时的 fetch 封装；超时 / 网络错误自然抛出，由调用方处理。
 */
export async function fetchPage(url: string, options: FetchPageOptions = {}): Promise<string> {
  const res = await fetchWithTimeout(url, {
    method: options.method,
    body: options.body,
    headers: { 'User-Agent': BROWSER_USER_AGENT, ...options.headers }
  })
  if (!res.ok) {
    throw new Error('Status code ' + res.status)
  }
  return res.text()
}
