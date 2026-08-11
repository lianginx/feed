import { Agent, ProxyAgent, setGlobalDispatcher, type Dispatcher } from 'undici'
import { session } from 'electron'
import type { AppSettings, ProxyConfig } from '@main/config'

/**
 * 全局网络代理管理。
 *
 * 覆盖三条路径：
 * - Node fetch（undici 全局 dispatcher，经 setGlobalDispatcher 对全进程生效）
 * - 浏览器抓取（Chromium session.setProxy）
 * - Telegram MTProto（二期接入，见 docs/refactor-telegram-mtproto.md）
 *
 * 模式：
 * - auto（默认）：自动跟随系统代理。Node fetch 用 session.resolveProxy 解析一次；
 *   浏览器路径 Chromium 原生跟随系统代理。
 * - none：直连。
 * - manual：手动指定 HTTP(S) / SOCKS5 代理。
 */

/** auto 模式解析系统代理用的样例 URL（resolveProxy 只关心返回的代理规则，与具体 URL 无关紧要） */
const PROBE_URL = 'https://example.com'

/** 构建手动代理 URL（http / socks5） */
export function buildManualProxyUrl(proxy: ProxyConfig): string | null {
  const { protocol, host, port, username, password } = proxy
  if (!host || !port) return null
  const scheme = protocol === 'socks5' ? 'socks5' : 'http'
  const user = username
    ? `${encodeURIComponent(username)}${password ? `:${encodeURIComponent(password)}` : ''}@`
    : ''
  return `${scheme}://${user}${host}:${port}`
}

/** 把 resolveProxy 返回的规则（如 "DIRECT" / "PROXY 127.0.0.1:7890" / "SOCKS5 ..."）转为 ProxyAgent */
export function proxyAgentFromRule(rule: string): ProxyAgent | undefined {
  const first = rule.split(';')[0].trim()
  if (!first || first.toUpperCase() === 'DIRECT') return undefined
  const m = first.match(/^(PROXY|SOCKS4|SOCKS5|HTTPS)\s+(\S+)$/i)
  if (!m) return undefined
  const type = m[1].toUpperCase()
  const scheme =
    type === 'SOCKS5'
      ? 'socks5'
      : type === 'SOCKS4'
        ? 'socks4'
        : type === 'HTTPS'
          ? 'https'
          : 'http'
  return new ProxyAgent(`${scheme}://${m[2]}`)
}

/** 构建 Node fetch（undici）全局 dispatcher */
async function buildNodeDispatcher(settings: AppSettings): Promise<Dispatcher> {
  const proxy = settings.proxy
  if (proxy.mode === 'none') return new Agent()
  if (proxy.mode === 'manual') {
    const url = buildManualProxyUrl(proxy)
    return url ? new ProxyAgent(url) : new Agent()
  }
  // auto：解析系统代理（仅在 Electron 主进程可用；测试环境降级为直连）
  try {
    const rule = await session.defaultSession.resolveProxy(PROBE_URL)
    return proxyAgentFromRule(rule) ?? new Agent()
  } catch {
    return new Agent()
  }
}

/** 构建浏览器路径（Chromium session）的代理规则 */
function buildChromiumProxy(settings: AppSettings): Electron.ProxyConfig {
  const proxy = settings.proxy
  if (proxy.mode === 'none') return { mode: 'direct' }
  if (proxy.mode === 'manual' && proxy.host && proxy.port) {
    const rules =
      proxy.protocol === 'socks5'
        ? `socks5://${proxy.host}:${proxy.port}`
        : `http=${proxy.host}:${proxy.port};https=${proxy.host}:${proxy.port}`
    return { mode: 'fixed_servers', proxyRules: rules }
  }
  // auto / 配置不完整：跟随系统代理（Chromium 默认行为）
  return { mode: 'system' }
}

/**
 * 应用代理设置。启动时与代理设置变更时调用。
 * - Node fetch：setGlobalDispatcher（对全进程全局 fetch 生效，含 favicon/同步/翻译/路由抓取）
 * - 浏览器抓取：session.setProxy（Chromium 网络栈）
 */
export async function applyProxySettings(settings: AppSettings): Promise<void> {
  const dispatcher = await buildNodeDispatcher(settings)
  setGlobalDispatcher(dispatcher)
  try {
    await session.defaultSession.setProxy(buildChromiumProxy(settings))
  } catch {
    // 测试 / 无 electron session 环境忽略
  }
}

/** 启动时初始化代理（幂等，可重复调用） */
export function initProxy(settings: AppSettings): void {
  void applyProxySettings(settings)
}
