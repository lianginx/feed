import type { SyncConfig } from '@main/config'
import type { SyncProvider } from './common'
import { GistProvider } from './gist'
import { GiteeProvider } from './gitee'
import { WebDAVProvider } from './webdav'

export type { SyncProvider } from './common'
export { SYNC_FILENAME, SYNC_DIR_NAME } from './common'

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
