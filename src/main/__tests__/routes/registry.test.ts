import { describe, it, expect } from 'vitest'
import { getAdapter, listAdapters, findAdaptersByDomain } from '../../services/routes/index'

describe('适配器注册表', () => {
  it('内置注册了 v2ex-hot', () => {
    expect(getAdapter('v2ex-hot')).toBeDefined()
    expect(listAdapters().map((a) => a.id)).toContain('v2ex-hot')
  })

  it('按域名查找（忽略 www 前缀）', () => {
    expect(findAdaptersByDomain('www.v2ex.com').some((a) => a.id === 'v2ex-hot')).toBe(true)
    expect(findAdaptersByDomain('example.com')).toHaveLength(0)
  })
})
