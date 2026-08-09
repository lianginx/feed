import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs'
import { join } from 'path'
import {
  getCacheFile,
  writeCacheFile,
  resolveCachePath,
  clearCache,
  getCacheStats
} from '../../services/cache'

// cache 模块内 app.getPath 在使用时调用（懒加载），node 测试环境 mock 掉 electron
const app = vi.hoisted(() => ({
  mockUserData: '/tmp/feed-cache-test'
}))
vi.mock('electron', () => ({
  app: { getPath: () => app.mockUserData }
}))

function rmrf(dir: string): void {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
}

describe('统一缓存模块', () => {
  beforeEach(() => {
    rmrf(app.mockUserData)
    mkdirSync(join(app.mockUserData), { recursive: true })
  })

  it('写入后按命名空间可读回', () => {
    writeCacheFile('favicon', '1.png', Buffer.from('png-data'))
    const p = getCacheFile('favicon', '1.png')
    expect(p).toBe(join(app.mockUserData, 'cache', 'favicon', '1.png'))
    expect(getCacheFile('media', '1.png')).toBeUndefined()
  })

  it('路径穿越防护：逃逸命名空间的 name 拒绝读写', () => {
    writeCacheFile('media', '../escape.png', Buffer.from('x'))
    expect(getCacheFile('media', '../escape.png')).toBeUndefined()
    expect(existsSync(join(app.mockUserData, 'escape.png'))).toBe(false)
  })

  it('子目录写入（如 routes/xxx）可读回', () => {
    writeCacheFile('favicon', 'routes/telegram-channel.svg', Buffer.from('<svg/>'))
    expect(getCacheFile('favicon', 'routes/telegram-channel.svg')).toBeTruthy()
    expect(resolveCachePath('favicon', 'routes/../evil.png')).toBeUndefined()
  })

  it('getCacheStats 统计各命名空间占用', () => {
    writeCacheFile('favicon', '1.png', Buffer.from('a'))
    writeCacheFile('media', 'm/1.bin', Buffer.from('bb'))
    const stats = getCacheStats()
    expect(stats.find((s) => s.namespace === 'favicon')?.sizeBytes).toBe(1)
    expect(stats.find((s) => s.namespace === 'media')?.sizeBytes).toBe(2)
  })

  it('clearCache 清空并返回释放字节数', () => {
    writeCacheFile('favicon', '1.png', Buffer.from('aaaa'))
    writeCacheFile('media', 'm/1.bin', Buffer.from('bb'))
    const freed = clearCache()
    expect(freed).toBe(6)
    expect(getCacheFile('favicon', '1.png')).toBeUndefined()
    expect(getCacheFile('media', 'm/1.bin')).toBeUndefined()
  })

  it('旧目录一次性迁移：userData/favicons → userData/cache/favicon（favicon:// 记录零迁移）', () => {
    const legacy = join(app.mockUserData, 'favicons')
    mkdirSync(legacy, { recursive: true })
    writeFileSync(join(legacy, '42.png'), 'old-favicon')

    // 首次访问 favicon 命名空间触发迁移
    const p = getCacheFile('favicon', '42.png')
    expect(p).toBe(join(app.mockUserData, 'cache', 'favicon', '42.png'))
    // 迁移后旧目录不再被引用
    expect(getCacheFile('favicon', '42.png')).toBeTruthy()
  })
})
