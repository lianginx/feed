import { app } from 'electron'
import { join, relative, dirname } from 'path'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
  unlinkSync,
  renameSync,
  type Dirent
} from 'fs'

/**
 * 统一本地缓存模块。
 *
 * 管理 userData/cache/ 下按命名空间分目录的本地文件缓存，提供统一能力：
 * - 读写/删除（含路径穿越防护，安全规则 #20）
 * - 按命名空间容量上限做 LRU 淘汰（以文件 mtime 近似最后访问时间）
 * - 占用统计 + 一键清理（供设置页「数据管理」使用）
 *
 * 命名空间：
 * - favicon：订阅源 / 内置路由图标，URL 保持 favicon://（DB 记录零迁移）
 * - media：Telegram 等媒体文件（二期接入），URL 为 media://
 */
export type CacheNamespace = 'favicon' | 'media'

/** 各命名空间容量上限（LRU 淘汰阈值；favicon 内容寻址、缺失可重建，按常规缓存管理） */
export const CACHE_LIMITS: Record<CacheNamespace, number> = {
  favicon: 20 * 1024 * 1024,
  media: 500 * 1024 * 1024
}

let cacheRoot: string | null = null

function getCacheRoot(): string {
  if (!cacheRoot) cacheRoot = join(app.getPath('userData'), 'cache')
  return cacheRoot
}

/**
 * 一次性迁移旧 favicon 缓存目录（userData/favicons → userData/cache/favicon）。
 * DB 中已存的 favicon:// 记录 URL 不变，仅文件物理搬移，保证零数据迁移。
 * 每次调用都检查（开销为一次 existsSync）：迁移成功（旧目录消失）后自然变为 no-op。
 */
function migrateLegacyFavicons(): void {
  const legacy = join(app.getPath('userData'), 'favicons')
  const target = join(getCacheRoot(), 'favicon')
  if (!existsSync(legacy) || existsSync(target)) return
  try {
    mkdirSync(getCacheRoot(), { recursive: true })
    renameSync(legacy, target)
  } catch {
    // 搬移失败不影响功能（favicon 会按需重新下载）
  }
}

/** 获取命名空间缓存目录（按需创建 + 触发一次旧目录迁移） */
export function getCacheDir(namespace: CacheNamespace): string {
  migrateLegacyFavicons()
  const dir = join(getCacheRoot(), namespace)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * 安全拼接缓存文件路径：name 逃逸出命名空间目录时返回 undefined。
 * name 可含子目录（如 'routes/telegram-channel.svg'）。
 * 额外拒绝含 '..' 段的名字，避免归一化逃出预期子目录结构（如 'routes/../evil.png'）。
 */
export function resolveCachePath(namespace: CacheNamespace, name: string): string | undefined {
  const base = getCacheDir(namespace)
  const filePath = join(base, name)
  const rel = relative(base, filePath)
  if (rel === '..' || rel.startsWith('../') || rel.includes('\0')) return undefined
  if (name.split(/[\\/]/).includes('..')) return undefined
  return filePath
}

/** 读取缓存文件：存在且为文件时返回绝对路径，否则 undefined */
export function getCacheFile(namespace: CacheNamespace, name: string): string | undefined {
  const filePath = resolveCachePath(namespace, name)
  if (filePath && existsSync(filePath) && statSync(filePath).isFile()) return filePath
  return undefined
}

/** 写入缓存文件（自动创建父目录）；写入后对该命名空间执行 LRU 淘汰 */
export function writeCacheFile(namespace: CacheNamespace, name: string, data: Buffer): void {
  const filePath = resolveCachePath(namespace, name)
  if (!filePath) return
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, data)
  enforceCacheLimit(namespace)
}

/** 删除缓存文件 */
export function removeCacheFile(namespace: CacheNamespace, name: string): void {
  const filePath = resolveCachePath(namespace, name)
  if (filePath && existsSync(filePath)) unlinkSync(filePath)
}

/** 缓存文件条目（name 为相对命名空间目录的路径） */
export interface CacheFileEntry {
  name: string
  path: string
  sizeBytes: number
  /** 最后修改时间（近似最后访问时间，LRU 依据） */
  mtimeMs: number
}

function listCacheEntries(
  namespace: CacheNamespace,
  dir = getCacheDir(namespace),
  prefix = ''
): CacheFileEntry[] {
  const entries: CacheFileEntry[] = []
  let items: Dirent<string>[]
  try {
    items = readdirSync(dir, { withFileTypes: true })
  } catch {
    return entries
  }
  for (const entry of items) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) {
      entries.push(...listCacheEntries(namespace, abs, rel))
    } else if (entry.isFile()) {
      try {
        const st = statSync(abs)
        entries.push({ name: rel, path: abs, sizeBytes: st.size, mtimeMs: st.mtimeMs })
      } catch {
        // 忽略单个文件统计失败
      }
    }
  }
  return entries
}

/** 列出命名空间下的全部缓存文件（递归，含子目录） */
export function listCacheFiles(namespace: CacheNamespace): CacheFileEntry[] {
  return listCacheEntries(namespace)
}

/** 缓存占用统计（按命名空间） */
export function getCacheStats(): {
  namespace: CacheNamespace
  sizeBytes: number
  fileCount: number
}[] {
  const namespaces: CacheNamespace[] = ['favicon', 'media']
  return namespaces.map((namespace) => {
    const entries = listCacheFiles(namespace)
    return {
      namespace,
      sizeBytes: entries.reduce((sum, e) => sum + e.sizeBytes, 0),
      fileCount: entries.length
    }
  })
}

/**
 * 清理缓存：指定命名空间或全部。返回释放的字节数。
 */
export function clearCache(namespace?: CacheNamespace): number {
  const namespaces: CacheNamespace[] = namespace ? [namespace] : ['favicon', 'media']
  let freed = 0
  for (const ns of namespaces) {
    for (const entry of listCacheFiles(ns)) {
      try {
        unlinkSync(entry.path)
        freed += entry.sizeBytes
      } catch {
        // 忽略单个文件删除失败
      }
    }
  }
  return freed
}

/** LRU 淘汰：超出容量上限时按最久未访问（mtime 最早）删除，直到低于上限 */
export function enforceCacheLimit(namespace: CacheNamespace): void {
  const limit = CACHE_LIMITS[namespace]
  const entries = listCacheFiles(namespace).sort((a, b) => b.mtimeMs - a.mtimeMs)
  let total = entries.reduce((sum, e) => sum + e.sizeBytes, 0)
  for (const entry of entries) {
    if (total <= limit) break
    try {
      unlinkSync(entry.path)
      total -= entry.sizeBytes
    } catch {
      // 忽略
    }
  }
}
