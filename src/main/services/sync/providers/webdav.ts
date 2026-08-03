import type { SyncConfig } from '../../../config'
import { SYNC_FILENAME, SYNC_DIR_NAME, authHeader, fetchWithTimeout } from './common'
import type { SyncProvider } from './common'

/** WebDAV 载体（坚果云 / Nextcloud 等） */
export class WebDAVProvider implements SyncProvider {
  readonly kind = 'webdav'
  private readonly baseUrl: string
  private readonly username: string
  private readonly password: string

  constructor(config: SyncConfig) {
    this.baseUrl = (config.webdavUrl ?? '').replace(/\/+$/, '')
    this.username = config.webdavUsername ?? ''
    this.password = config.webdavPassword ?? ''
  }

  /** 同步目录 URL（在用户填写的父目录下固定使用 feed-sync 子目录） */
  private get dirUrl(): string {
    return `${this.baseUrl}/${SYNC_DIR_NAME}`
  }

  private get fileUrl(): string {
    return `${this.dirUrl}/${SYNC_FILENAME}`
  }

  private get authHeaders(): Record<string, string> {
    return { Authorization: authHeader(this.username, this.password) }
  }

  /** 检查集合（目录）是否存在：PROPFIND Depth: 0 */
  private async dirExists(url: string): Promise<boolean> {
    const res = await fetchWithTimeout(url, {
      method: 'PROPFIND',
      headers: { ...this.authHeaders, Depth: '0' }
    })
    if (res.status === 207 || res.status === 200) return true
    if (res.status === 404 || res.status === 405 || res.status === 409) return false
    throw new Error(`WebDAV ${res.status}`)
  }

  /** 创建集合（目录）：MKCOL；已存在（405/409）时静默忽略 */
  private async mkcol(url: string): Promise<void> {
    const res = await fetchWithTimeout(url, {
      method: 'MKCOL',
      headers: this.authHeaders
    })
    if (!res.ok && res.status !== 405 && res.status !== 409) {
      throw new Error(`WebDAV ${res.status}`)
    }
  }

  /**
   * 确保同步目录链存在：从服务器根逐级 PROPFIND 检查，缺失的层级用 MKCOL 创建。
   * （MKCOL 只能一次创建一级，故需要逐级处理嵌套路径）
   */
  private async ensureSyncDir(): Promise<void> {
    const u = new URL(this.dirUrl)
    const parts = u.pathname.split('/').filter(Boolean)
    let current = u.origin
    for (const part of parts) {
      current += `/${part}`
      if (await this.dirExists(current)) continue
      await this.mkcol(current)
    }
  }

  async pull(): Promise<string | null> {
    const res = await fetchWithTimeout(this.fileUrl, {
      headers: this.authHeaders
    })
    // 404 / 405 / 409 均视为「远端尚无该文件」：
    // 坚果云在父目录（feed-sync）尚未创建时，对文件 GET 会返回 409 而非 404
    if (res.status === 404 || res.status === 405 || res.status === 409) return null
    if (!res.ok) throw new Error(`WebDAV ${res.status}`)
    return res.text()
  }

  async push(content: string): Promise<void> {
    await this.ensureSyncDir()
    const res = await fetchWithTimeout(this.fileUrl, {
      method: 'PUT',
      headers: { ...this.authHeaders, 'Content-Type': 'application/json' },
      body: content
    })
    if (!res.ok) throw new Error(`WebDAV ${res.status}: ${await res.text()}`)
  }
}
