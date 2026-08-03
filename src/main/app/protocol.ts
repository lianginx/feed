import { protocol, net, session } from 'electron'
import { join, isAbsolute, relative } from 'path'
import { pathToFileURL } from 'url'
import { getFaviconDir } from '../services/favicon'

/**
 * 注册自定义协议和会话级别的 hook。
 * - `favicon://` 协议：从本地缓存目录加载 favicon
 * - 拦截图片请求，将 Referer/Origin 替换为图片自身域名以绕过防盗链
 */
export function registerAppProtocols(): void {
  // 权限请求默认拒绝（安全规则 #5）：应用不加载远程网页内容，无需任何网页权限
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    console.warn(`[Permission] 已拒绝权限请求: ${permission}`)
    callback(false)
  })

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
    // 防路径穿越（安全规则 #20：不信任渲染进程输入）：
    // 仅允许 favicon 缓存目录内的文件，解析后路径跳出目录一律返回 404
    try {
      const name = decodeURIComponent(request.url.slice('favicon://'.length))
      const filePath = join(getFaviconDir(), name)
      const rel = relative(getFaviconDir(), filePath)
      if (rel.startsWith('..') || isAbsolute(rel)) {
        return new Response('Not Found', { status: 404 })
      }
      return net.fetch(pathToFileURL(filePath).toString())
    } catch {
      return new Response('Not Found', { status: 404 })
    }
  })
}
