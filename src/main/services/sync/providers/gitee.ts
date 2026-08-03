import type { SyncConfig } from '../../../config'
import { SYNC_FILENAME, fetchWithTimeout, readGistId, writeGistId } from './common'
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
