/** 远端请求超时（毫秒），避免网络挂起时一直卡住（同步/翻译等共用） */
const FETCH_TIMEOUT_MS = 20000

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
