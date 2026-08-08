import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { getAdapterFaviconCached, resolveAndCacheAdapterFavicon } from '../../services/favicon'

// favicon.ts 顶层 import electron 的 app（node 测试环境无 electron），mock 掉
// 注意：mockUserData 在 vi.hoisted 工厂内初始化（不能引用模块级 import），
// 用固定路径避免跨测试进程冲突
const app = vi.hoisted(() => ({
  mockUserData: '/tmp/feed-favicon-test'
}))
vi.mock('electron', () => ({
  app: { getPath: () => app.mockUserData }
}))

let adapterDir: string

describe('内置路由 favicon 缓存', () => {
  beforeEach(() => {
    adapterDir = join(app.mockUserData, 'favicons', 'routes')
    mkdirSync(adapterDir, { recursive: true })
    // 清空缓存目录（模拟首次运行）
    for (const f of ['telegram-channel.svg', 'v2ex-hot.png', 'unused.tmp']) {
      const p = join(adapterDir, f)
      if (existsSync(p)) unlinkSync(p)
    }
  })

  it('getAdapterFaviconCached 命中已有缓存', () => {
    writeFileSync(join(adapterDir, 'telegram-channel.svg'), '<svg/>')
    expect(getAdapterFaviconCached('telegram-channel')).toBe(
      'favicon://routes/telegram-channel.svg'
    )
  })

  it('getAdapterFaviconCached 未命中返回 null', () => {
    expect(getAdapterFaviconCached('no-such-adapter')).toBeNull()
  })

  it('getAdapterFaviconCached 忽略非法扩展名（防残留杂物）', () => {
    writeFileSync(join(adapterDir, 'v2ex-hot.tmp'), 'junk')
    expect(getAdapterFaviconCached('v2ex-hot')).toBeNull()
  })

  it('resolveAndCacheAdapterFavicon 命中缓存时不联网（返回缓存 URL）', async () => {
    writeFileSync(join(adapterDir, 'v2ex-hot.png'), 'png')
    const url = await resolveAndCacheAdapterFavicon('v2ex-hot', ['v2ex.com'])
    expect(url).toBe('favicon://routes/v2ex-hot.png')
  })

  it('resolveAndCacheAdapterFavicon 无缓存时尝试下载（联网失败返回 null 不抛错）', async () => {
    // 真实联网会命中远程；这里注入不可达域名验证失败路径不抛错、不产生缓存
    const url = await resolveAndCacheAdapterFavicon('nonexistent-adapter-xyz', [
      'nonexistent-invalid-domain-xyz.invalid'
    ])
    expect(url).toBeNull()
  }, 30_000)
})
