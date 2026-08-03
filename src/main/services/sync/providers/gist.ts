import type { SyncConfig } from '../../../config'
import { SYNC_FILENAME, fetchWithTimeout, readGistId, writeGistId } from './common'
import type { SyncProvider } from './common'

/** GitHub Gist 载体 */
export class GistProvider implements SyncProvider {
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
