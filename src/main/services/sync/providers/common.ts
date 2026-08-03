import store from '../../../config'

/** 同步文件在远端存储的文件名 */
export const SYNC_FILENAME = 'feed-subscriptions.json'

/** WebDAV 载体在远端固定使用的子目录名（多设备共用；放在用户填写的父目录下，避免与网盘内其他内容冲突） */
export const SYNC_DIR_NAME = 'feed-sync'

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

export function readGistId(kind: SyncProviderKind): string | null {
  return (store.get(GIST_ID_KEY[kind]) as string) ?? null
}

export function writeGistId(kind: SyncProviderKind, id: string): void {
  store.set(GIST_ID_KEY[kind], id)
}

export function authHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

/** 远端请求超时（毫秒），避免网络挂起时同步一直卡在「同步中」 */
const FETCH_TIMEOUT_MS = 20000

export async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}
