import store from '../../config'
import type { SyncConfig } from '../../config'

/** 同步文件在远端存储的文件名 */
export const SYNC_FILENAME = 'feed-subscriptions.json'

/** 各载体在 electron-store 中保存 gist id 的 key */
const GIST_ID_KEY: Record<string, string> = {
  gist: 'syncGistId',
  gitee: 'syncGiteeId'
}

export type SyncProviderKind = 'gist' | 'gitee' | 'webdav'

/**
 * 同步载体抽象接口。
 * 不同载体（GitHub Gist / Gitee / WebDAV）只负责「把一段 JSON 内容存到远端 / 从远端取回」，
 * 冲突检测、序列化等同步逻辑在 SyncService 中统一处理。
 */
export interface SyncProvider {
  readonly kind: SyncProviderKind
  /** 拉取远端内容；远端不存在时返回 null */
  pull(): Promise<string | null>
  /** 推送内容到远端（不存在则创建，已存在则更新） */
  push(content: string): Promise<void>
}

function readGistId(kind: SyncProviderKind): string | null {
  return (store.get(GIST_ID_KEY[kind]) as string) ?? null
}

function writeGistId(kind: SyncProviderKind, id: string): void {
  store.set(GIST_ID_KEY[kind], id)
}

function authHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

/** 远端请求超时（毫秒），避免网络挂起时同步一直卡在「同步中」 */
const FETCH_TIMEOUT_MS = 20000

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** GitHub Gist 载体 */
class GistProvider implements SyncProvider {
  readonly kind = 'gist'
  private readonly token: string

  constructor(config: SyncConfig) {
    this.token = config.token ?? ''
  }

  private get gistId(): string | null {
    return readGistId('gist')
  }

  async pull(): Promise<string | null> {
    const id = this.gistId
    if (!id) return null

    const res = await fetchWithTimeout(`https://api.github.com/gists/${id}`, {
      headers: { Authorization: `Bearer ${this.token}`, 'User-Agent': 'Feed' }
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`GitHub API ${res.status}`)
    const data = (await res.json()) as { files?: Record<string, { content?: string }> }
    return data.files?.[SYNC_FILENAME]?.content ?? null
  }

  async push(content: string): Promise<void> {
    const id = this.gistId
    const headers = {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Feed'
    }

    let res: Response
    if (id) {
      res = await fetchWithTimeout(`https://api.github.com/gists/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ files: { [SYNC_FILENAME]: { content } } })
      })
    } else {
      res = await fetchWithTimeout('https://api.github.com/gists', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          description: 'Feed 订阅源同步',
          public: false,
          files: { [SYNC_FILENAME]: { content } }
        })
      })
    }

    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`)
    const data = (await res.json()) as { id?: string }
    if (data.id) writeGistId('gist', data.id)
  }
}

/** Gitee（码云）代码片段载体 */
class GiteeProvider implements SyncProvider {
  readonly kind = 'gitee'
  private readonly token: string

  constructor(config: SyncConfig) {
    this.token = config.token ?? ''
  }

  private get gistId(): string | null {
    return readGistId('gitee')
  }

  private async giteeFetch(path: string, init?: RequestInit): Promise<Response> {
    const url = new URL(`https://gitee.com/api/v5${path}`)
    url.searchParams.set('access_token', this.token)
    return fetchWithTimeout(url.toString(), init)
  }

  async pull(): Promise<string | null> {
    const id = this.gistId
    if (!id) return null

    const res = await this.giteeFetch(`/gists/${id}`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Gitee API ${res.status}`)
    const data = (await res.json()) as { files?: Record<string, { content?: string }> }
    return data.files?.[SYNC_FILENAME]?.content ?? null
  }

  async push(content: string): Promise<void> {
    const id = this.gistId
    const headers = { 'Content-Type': 'application/json' }

    let res: Response
    if (id) {
      res = await this.giteeFetch(`/gists/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ files: { [SYNC_FILENAME]: { content } } })
      })
    } else {
      res = await this.giteeFetch('/gists', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          description: 'Feed 订阅源同步',
          public: false,
          files: { [SYNC_FILENAME]: { content } }
        })
      })
    }

    if (!res.ok) throw new Error(`Gitee API ${res.status}: ${await res.text()}`)
    const data = (await res.json()) as { id?: string }
    if (data.id) writeGistId('gitee', data.id)
  }
}

/** WebDAV 载体（坚果云 / Nextcloud 等） */
class WebDAVProvider implements SyncProvider {
  readonly kind = 'webdav'
  private readonly baseUrl: string
  private readonly username: string
  private readonly password: string

  constructor(config: SyncConfig) {
    this.baseUrl = (config.webdavUrl ?? '').replace(/\/+$/, '')
    this.username = config.webdavUsername ?? ''
    this.password = config.webdavPassword ?? ''
  }

  private get fileUrl(): string {
    return `${this.baseUrl}/${SYNC_FILENAME}`
  }

  async pull(): Promise<string | null> {
    const res = await fetchWithTimeout(this.fileUrl, {
      headers: { Authorization: authHeader(this.username, this.password) }
    })
    if (res.status === 404 || res.status === 405) return null
    if (!res.ok) throw new Error(`WebDAV ${res.status}`)
    return res.text()
  }

  async push(content: string): Promise<void> {
    const res = await fetchWithTimeout(this.fileUrl, {
      method: 'PUT',
      headers: {
        Authorization: authHeader(this.username, this.password),
        'Content-Type': 'application/json'
      },
      body: content
    })
    if (!res.ok) throw new Error(`WebDAV ${res.status}: ${await res.text()}`)
  }
}

/**
 * 根据配置创建对应载体实例。
 * 配置不完整（如缺少 token / 地址）时返回 null。
 */
export function createSyncProvider(config: SyncConfig): SyncProvider | null {
  switch (config.provider) {
    case 'gist':
      return config.token ? new GistProvider(config) : null
    case 'gitee':
      return config.token ? new GiteeProvider(config) : null
    case 'webdav':
      return config.webdavUrl ? new WebDAVProvider(config) : null
    default:
      return null
  }
}
