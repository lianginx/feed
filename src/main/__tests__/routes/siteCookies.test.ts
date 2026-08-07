import { describe, it, expect, vi, beforeEach } from 'vitest'

// siteCookies 依赖 electron-store（node 测试环境无法实例化），mock config 模块
vi.mock('../../config', () => ({
  getSettings: vi.fn()
}))

import { getSettings } from '../../config'
import { getCookiesForAdapter, parseCookieString } from '../../services/siteCookies'
import type { FeedAdapter } from '../../services/routes/core/types'
import { bilibiliUserVideo } from '../../services/routes/adapters/bilibili'
import type { AppSettings } from '../../config'

const FULL_COOKIE =
  'buvid3=abc; SESSDATA=token123; bili_jct=csrf456; DedeUserID=928915; buvid_fp=fp789; b_nut=100'

beforeEach(() => {
  vi.mocked(getSettings).mockReturnValue({
    siteCookies: { 'bilibili.com': FULL_COOKIE }
  } as unknown as AppSettings)
})

describe('parseCookieString', () => {
  it('把整段 cookie 解析为 name→value', () => {
    expect(parseCookieString(FULL_COOKIE)).toEqual({
      buvid3: 'abc',
      SESSDATA: 'token123',
      bili_jct: 'csrf456',
      DedeUserID: '928915',
      buvid_fp: 'fp789',
      b_nut: '100'
    })
  })
})

describe('getCookiesForAdapter（cookie 白名单注入）', () => {
  it('声明 injectCookieNames 的适配器只注入白名单内 cookie（过滤指纹 cookie）', () => {
    const cookies = getCookiesForAdapter(bilibiliUserVideo)
    expect(cookies).toEqual({ SESSDATA: 'token123', bili_jct: 'csrf456', DedeUserID: '928915' })
  })

  it('未声明 injectCookieNames 的适配器注入全部 cookie', () => {
    const adapter: FeedAdapter = {
      id: 'plain',
      name: '普通站',
      domains: ['example.com'],
      params: [],
      cookieDomain: '.example.com',
      buildUrl: () => 'https://example.com/',
      async parse() {
        return { title: 't', items: [] }
      }
    }
    vi.mocked(getSettings).mockReturnValue({
      siteCookies: { 'example.com': FULL_COOKIE }
    } as unknown as AppSettings)
    expect(getCookiesForAdapter(adapter)).toMatchObject({ buvid3: 'abc', SESSDATA: 'token123' })
  })

  it('无 cookie 配置时返回空对象', () => {
    vi.mocked(getSettings).mockReturnValue({ siteCookies: {} } as ReturnType<typeof getSettings>)
    expect(getCookiesForAdapter(bilibiliUserVideo)).toEqual({})
  })
})
