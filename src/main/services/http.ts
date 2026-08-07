/** 远端请求超时（毫秒），避免网络挂起时一直卡住（同步/翻译等共用） */
const FETCH_TIMEOUT_MS = 20000

/**
 * 对外抓取的浏览器 UA。用真实浏览器 UA 而非自定义 UA（如 Feed/1.0），
 * 降低被站点按 UA 过滤 / 风控识别的概率。与 favicon 抓取保持一致。
 */
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * 带超时的 fetch 封装。
 * 超时后 abort 请求；供同步载体与翻译提供商等主进程网络模块复用。
 */
export async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}
