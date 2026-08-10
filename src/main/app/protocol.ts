import { protocol, net, session } from 'electron'
import { pathToFileURL } from 'url'
import { getCacheFile } from '../services/cache'
import {
  ensureCachedFaviconBySource,
  fileNameForSource,
  parseFaviconName,
  resolveAndCacheAdapterFavicon
} from '../services/favicon'
import { getAdapter } from '../services/routes'

/**
 * 注册自定义协议和会话级别的 hook。
 * - `favicon://` 协议：从统一缓存 favicon 命名空间加载 favicon
 * - `media://` 协议：从统一缓存 media 命名空间加载媒体（Telegram 等，二期写入）
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

  // 注册 favicon:// 协议：从统一缓存 favicon 命名空间加载
  // 防路径穿越（安全规则 #20）：统一缓存模块 resolveCachePath 已校验，逃逸即 404
  protocol.handle('favicon', async (request) => {
    try {
      const name = decodeURIComponent(request.url.slice('favicon://'.length))

      // 内置路由图标：favicon://routes/{adapterId}[.{ext}]
      if (name.startsWith('routes/')) {
        const routeName = name.slice('routes/'.length)
        const match = routeName.match(/^([\w-]+)(?:\.(png|jpg|jpeg|gif|svg|webp|ico))?$/)
        // 仅允许合法适配器 id 和图片扩展名，阻断路径穿越
        if (!match) {
          return new Response('Not Found', { status: 404 })
        }
        const adapterId = match[1]
        const adapter = getAdapter(adapterId)
        if (!adapter) {
          return new Response('Not Found', { status: 404 })
        }
        // 无缓存则现场抓取并缓存到本地（favicon://routes/{id}.ext）
        const localUrl = await resolveAndCacheAdapterFavicon(adapter.id, adapter.domains)
        if (!localUrl) {
          return new Response('Not Found', { status: 404 })
        }
        const fileName = localUrl.slice('favicon://routes/'.length)
        const filePath = getCacheFile('favicon', `routes/${fileName}`)
        if (!filePath) {
          return new Response('Not Found', { status: 404 })
        }
        return net.fetch(pathToFileURL(filePath).toString())
      }

      // 兼容旧版本 favicon://{feedId}.{ext} 记录：旧文件已迁移到统一缓存目录，
      // 在订阅源下次刷新升级数据库记录前，仍直接从旧文件提供服务。
      if (/^\d+\.(png|jpg|jpeg|gif|svg|webp|ico)$/.test(name)) {
        const legacyFilePath = getCacheFile('favicon', name)
        if (legacyFilePath) {
          return net.fetch(pathToFileURL(legacyFilePath).toString())
        }
      }

      // 订阅源图标：favicon://{base64url(源URL)}.{ext}（源 URL 内嵌可逆；磁盘文件为定长 hash）
      // 缓存文件缺失（如清理过本地缓存）时按源重新下载（自愈），忠实重建频道头像等原始图标
      const parsedName = parseFaviconName(name)
      let filePath: string | undefined
      if (parsedName) {
        const fileKey = `${fileNameForSource(parsedName.sourceUrl)}.${parsedName.ext}`
        filePath = getCacheFile('favicon', fileKey)
        if (!filePath && (await ensureCachedFaviconBySource(parsedName.sourceUrl, fileKey))) {
          filePath = getCacheFile('favicon', fileKey)
        }
      }
      if (!filePath) {
        return new Response('Not Found', { status: 404 })
      }
      return net.fetch(pathToFileURL(filePath).toString())
    } catch {
      return new Response('Not Found', { status: 404 })
    }
  })

  // 注册 media:// 协议：从统一缓存 media 命名空间加载媒体文件
  // name 为缓存内相对路径（如 telegram/{chatId}/{msgId}/{idx}.ext），穿越防护在缓存模块内
  protocol.handle('media', async (request) => {
    try {
      const name = decodeURIComponent(request.url.slice('media://'.length))
      const filePath = getCacheFile('media', name)
      if (!filePath) {
        return new Response('Not Found', { status: 404 })
      }
      return net.fetch(pathToFileURL(filePath).toString())
    } catch {
      return new Response('Not Found', { status: 404 })
    }
  })
}
