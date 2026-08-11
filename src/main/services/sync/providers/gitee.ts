import type { SyncConfig } from '@main/config'
import {
  SYNC_FILENAME,
  SYNC_GIST_DESCRIPTION,
  clearGistId,
  extractGistFileContent,
  fetchWithTimeout,
  isSyncGist,
  readGistId,
  writeGistId
} from './common'
import type { SyncProvider } from './common'

/** Gitee（码云）代码片段载体 */
export class GiteeProvider implements SyncProvider {
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

  /**
   * 在账号已有的代码片段中查找承载同步文件的 gist id。
   * 多设备共用同一账号时，若本地没有记录就盲目新建，会导致每台设备各建一个互不相通的片段；
   * 这里先查再建，保证所有设备指向同一个片段。
   * 以「文件名 + 固定描述」双重校验，避免误匹配同名无关片段；遍历最多 5 页兜底。
   */
  private async findGistId(): Promise<string | null> {
    const MAX_PAGES = 5
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await this.giteeFetch(`/gists?per_page=100&page=${page}`)
      if (!res.ok) throw new Error(`Gitee API ${res.status}`)
      const list = (await res.json()) as {
        id: string
        description?: string | null
        files?: unknown
      }[]
      for (const gist of list) {
        if (isSyncGist(gist)) return gist.id
      }
      if (list.length < 100) break // 已是最后一页
    }
    return null
  }

  /** 解析当前要同步的 gist id：本地已记录优先，否则在账号已有片段中查找 */
  private async resolveGistId(): Promise<string | null> {
    return this.gistId ?? (await this.findGistId())
  }

  async pull(): Promise<string | null> {
    const id = await this.resolveGistId()
    if (!id) return null

    const res = await this.giteeFetch(`/gists/${id}`)
    if (res.status === 404) {
      // 本地记录的片段已被删除 → 清除记录，下次同步重新查找/创建
      clearGistId('gitee')
      return null
    }
    if (!res.ok) throw new Error(`Gitee API ${res.status}`)
    const data = (await res.json()) as { files?: unknown }
    return extractGistFileContent(data.files)
  }

  async push(content: string): Promise<void> {
    const id = await this.resolveGistId()
    const headers = { 'Content-Type': 'application/json' }

    let res: Response
    if (id) {
      res = await this.giteeFetch(`/gists/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ files: { [SYNC_FILENAME]: { content } } })
      })
      if (res.status === 404) {
        // 片段已被删除 → 清除本地记录，降级为新建
        clearGistId('gitee')
        res = await this.giteeFetch('/gists', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            description: SYNC_GIST_DESCRIPTION,
            public: false,
            files: { [SYNC_FILENAME]: { content } }
          })
        })
      }
    } else {
      res = await this.giteeFetch('/gists', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          description: SYNC_GIST_DESCRIPTION,
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
