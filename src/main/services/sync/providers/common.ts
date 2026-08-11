import store from '@main/config'

/** 同步文件在远端存储的文件名 */
export const SYNC_FILENAME = 'feed-subscriptions.json'

/** 同步 gist/代码片段创建时写入的描述（查找时用于确认身份，避免误匹配同名无关 gist） */
export const SYNC_GIST_DESCRIPTION = 'Feed 订阅源同步'

/** WebDAV 载体在远端固定使用的子目录名（多设备共用；放在用户填写的父目录下，避免与网盘内其他内容冲突） */
export const SYNC_DIR_NAME = 'feed-sync'

/** 各载体在 electron-store 中保存 gist id 的 key */
const GIST_ID_KEY = {
  gist: 'syncGistId',
  gitee: 'syncGiteeId'
} as const

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

/** 清除本地保存的 gist id（远端 gist 已被删除时使用，下次同步会重新查找/创建） */
export function clearGistId(kind: SyncProviderKind): void {
  store.delete(GIST_ID_KEY[kind])
}

/** 判断 gist/代码片段是否为同步载体：文件名 + 固定描述双重校验 */
export function isSyncGist(gist: { description?: string | null; files?: unknown }): boolean {
  return gistHasFile(gist.files) && (gist.description ?? '').includes(SYNC_GIST_DESCRIPTION)
}

/** 判断 Gist API 返回的 files 字段是否包含同步文件（兼容 GitHub 的对象映射与 Gitee 的数组结构） */
export function gistHasFile(files: unknown): boolean {
  if (!files || typeof files !== 'object') return false
  if (Array.isArray(files)) {
    return files.some(
      (f) => f && typeof f === 'object' && (f as { name?: string }).name === SYNC_FILENAME
    )
  }
  return SYNC_FILENAME in (files as Record<string, unknown>)
}

/** 从 Gist API 响应中提取同步文件内容（兼容 GitHub 的对象映射与 Gitee 的数组结构） */
export function extractGistFileContent(files: unknown): string | null {
  if (!files || typeof files !== 'object') return null
  if (Array.isArray(files)) {
    const file = (files as { name?: string; content?: string }[]).find(
      (f) => f.name === SYNC_FILENAME
    )
    return file?.content ?? null
  }
  const record = files as Record<string, { content?: string }>
  return record[SYNC_FILENAME]?.content ?? null
}

export function authHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

// fetchWithTimeout 提取到共享 http 模块（同步载体与翻译提供商复用）
export { fetchWithTimeout } from '@main/services/http'
