import { protocol, net, session } from 'electron'
import { join } from 'path'
import { getFaviconDir } from '../services/favicon'

/**
 * 注册自定义协议和会话级别的 hook。
 * - `favicon://` 协议：从本地缓存目录加载 favicon
 * - 拦截图片请求，将 Referer/Origin 替换为图片自身域名以绕过防盗链
 */
export function registerAppProtocols(): void {
  // 图片请求将 Referer/Origin 替换为图片自身域名，绕过防盗链
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    if (details.resourceType === 'image') {
      try {
        const url = new URL(details.url)
        const origin = `${url.protocol}//${url.host}`
        details.requestHeaders['Referer'] = `${origin}/`
        details.requestHeaders['Origin'] = origin
      } catch {
        delete details.requestHeaders['Referer']
        delete details.requestHeaders['Origin']
      }
    }
    callback({ requestHeaders: details.requestHeaders })
  })

  // 注册 favicon:// 协议，用于从本地缓存加载 favicon
  protocol.handle('favicon', (request) => {
    const filePath = join(getFaviconDir(), request.url.slice('favicon://'.length))
    return net.fetch(`file://${filePath}`)
  })
}
