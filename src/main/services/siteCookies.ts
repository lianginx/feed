import { getSettings } from '../config'
import type { FeedAdapter } from './routes/core/types'

/**
 * 站点登录 Cookie 解析与读取。
 * 用户从浏览器复制的整段 cookie（'SESSDATA=xxx; bili_jct=yyy'）解析为 name→value，
 * 供 runner 的浏览器 fetcher 注入（session.cookies.set 需要结构化 name/value）。
 */
export function parseCookieString(cookie: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const part of cookie.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const name = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (name) result[name] = value
  }
  return result
}

/** 按域名取配置的整段 cookie（key 不含前导点，如 'bilibili.com'） */
export function getSiteCookieString(domain: string): string | undefined {
  const key = domain.replace(/^\./, '')
  return getSettings().siteCookies?.[key]
}

/** 取适配器需要的登录 cookie（name→value）；无配置返回空对象（未登录也能抓公开内容） */
export function getCookiesForAdapter(adapter: FeedAdapter): Record<string, string> {
  if (!adapter.cookieDomain) return {}
  const raw = getSiteCookieString(adapter.cookieDomain)
  return raw ? parseCookieString(raw) : {}
}
