import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import {
  getAdapterFaviconCached,
  resolveAndCacheAdapterFavicon,
  parseFaviconName
} from '@main/services/favicon'

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
    // 统一缓存 favicon 命名空间（userData/cache/favicon/routes）
    adapterDir = join(app.mockUserData, 'cache', 'favicon', 'routes')
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

  it('resolveAndCacheAdapterFavicon 下载成功后返回 favicon://routes/{adapterId}.{ext}（无双重前缀）', async () => {
    const origFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      headers: { get: () => 'image/png' },
      text: async () => '<html></html>',
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer
    })) as unknown as typeof fetch
    try {
      const url = await resolveAndCacheAdapterFavicon('v2ex-hot', ['v2ex.com'])
      expect(url).toBe('favicon://routes/v2ex-hot.png')
    } finally {
      globalThis.fetch = origFetch
    }
  })
})

describe('favicon 内容寻址（parseFaviconName）', () => {
  it('base64url 源可解码回 http(s) URL', () => {
    const src = 'https://t.me/i/userpic/320/NewlearnerChannel.jpg'
    const name = `${Buffer.from(src, 'utf8').toString('base64url')}.jpg`
    expect(parseFaviconName(name)).toEqual({ sourceUrl: src, ext: 'jpg' })
  })

  it('旧格式（数字 feedId）与非法字符不识别', () => {
    expect(parseFaviconName('42.png')).toBeUndefined()
    expect(parseFaviconName('not-base64!@#.png')).toBeUndefined()
  })
})
