import { protocol, net, session } from 'electron'
import { join } from 'path'
import { getFaviconDir } from '../services/favicon'

/**
 * 注册自定义协议和会话级别的 hook。
 * - `favicon://` 协议：从本地缓存目录加载 favicon
 * - 拦截图片请求，删除 Referer 头以避免防盗链 403
 */
export function registerAppProtocols(): void {
  // 图片请求不发送 Referer，避免防盗链 403
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    if (details.resourceType === 'image') {
      delete details.requestHeaders['Referer']
    }
    callback({ requestHeaders: details.requestHeaders })
  })

  // 注册 favicon:// 协议，用于从本地缓存加载 favicon
  protocol.handle('favicon', (request) => {
    const filePath = join(getFaviconDir(), request.url.slice('favicon://'.length))
    return net.fetch(`file://${filePath}`)
  })
}
