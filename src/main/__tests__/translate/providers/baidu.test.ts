import { describe, it, expect } from 'vitest'
import {
  buildBaiduSign,
  baiduErrorText,
  buildBaiduQuery,
  BaiduTranslator
} from '@main/services/translate/providers/baidu'
import type { Fetcher } from 'anylang/esm/utils/fetcher/types.js'

describe('buildBaiduSign', () => {
  it('与已知 MD5 向量一致（MD5("hello world")）', () => {
    expect(buildBaiduSign('', 'hello world', '', '')).toBe('5eb63bbbe01eeed093cb22bb8f5acdc3')
  })

  it('签名随参数变化（含 appid/salt/密钥）', () => {
    const s1 = buildBaiduSign('appid', 'q', '1', 'secret')
    const s2 = buildBaiduSign('appid', 'q', '2', 'secret')
    expect(s1).not.toBe(s2)
  })
})

describe('buildBaiduQuery', () => {
  it('多段文本用换行符分隔（而非 JSON 数组）', () => {
    expect(buildBaiduQuery(['hello', 'world'])).toBe('hello\nworld')
    expect(buildBaiduQuery(['single'])).toBe('single')
  })

  it('段内换行折叠为空格，避免响应分段错位', () => {
    expect(buildBaiduQuery(['first\nline', 'second'])).toBe('first line\nsecond')
    expect(buildBaiduQuery(['a\n\nb'])).toBe('a b')
  })

  it('不含 JSON 数组标记', () => {
    expect(buildBaiduQuery(['a', 'b'])).not.toContain('[')
    expect(buildBaiduQuery(['a', 'b'])).not.toContain('"')
  })
})

describe('baiduErrorText', () => {
  it('错误码 → 中文说明', () => {
    expect(baiduErrorText('54001')).toContain('签名')
    expect(baiduErrorText('54004')).toContain('余额')
    expect(baiduErrorText('52001')).toContain('超时')
  })

  it('未知错误码回退为通用文案', () => {
    expect(baiduErrorText('99999')).toContain('99999')
  })
})

/** 构造一个返回固定 data 的伪 fetcher，用于覆盖 BaiduTranslator 的 API 集成逻辑 */
function makeFetcher(data: unknown, captured?: { url?: string }): Fetcher {
  const fake = async (url: string): Promise<unknown> => {
    if (captured) captured.url = url
    return {
      headers: new Map<string, string>(),
      ok: true,
      status: 200,
      statusText: 'OK',
      data
    }
  }
  return fake as unknown as Fetcher
}

describe('BaiduTranslator.translateBatch（注入伪 fetcher 覆盖 API 集成）', () => {
  function makeTranslator(data: unknown, captured?: { url?: string }): BaiduTranslator {
    return new BaiduTranslator({
      appid: 'test-appid',
      secretKey: 'test-secret',
      headers: {},
      fetcher: makeFetcher(data, captured)
    })
  }

  it('成功响应按输入顺序映射译文', async () => {
    const t = makeTranslator({
      trans_result: [
        { src: 'hello', dst: '你好' },
        { src: 'world', dst: '世界' }
      ]
    })
    await expect(t.translateBatch(['hello', 'world'], 'auto', 'zh')).resolves.toEqual([
      '你好',
      '世界'
    ])
  })

  it('请求 URL 含 appid/salt/签名，目标语言经 toBaiduCode 映射（zh-Hant→cht、ja→jp）', async () => {
    const captured: { url?: string } = {}
    const t = makeTranslator({ trans_result: [{ src: 'x', dst: 'y' }] }, captured)
    await t.translateBatch(['x'], 'auto', 'zh-Hant')
    expect(captured.url).toContain('to=cht')
    expect(captured.url).toContain('appid=test-appid')
    expect(captured.url).toContain('from=auto')
    expect(captured.url).toMatch(/salt=\d+/)
    expect(captured.url).toMatch(/sign=[0-9a-f]{32}/)

    await t.translateBatch(['x'], 'auto', 'ja')
    expect(captured.url).toContain('to=jp')
  })

  it('确定性错误码（54001 签名错误）→ 抛出且 retryable=false', async () => {
    const t = makeTranslator({ error_code: '54001', error_msg: '签名错误' })
    await expect(t.translateBatch(['x'], 'auto', 'zh')).rejects.toMatchObject({
      code: '54001',
      retryable: false
    })
  })

  it('可重试错误码（52001 超时）→ 抛出且 retryable=true', async () => {
    const t = makeTranslator({ error_code: '52001', error_msg: '请求超时' })
    await expect(t.translateBatch(['x'], 'auto', 'zh')).rejects.toMatchObject({
      code: '52001',
      retryable: true
    })
  })

  it('trans_result 少于输入时缺失项返回 null（触发调用方降级）', async () => {
    const t = makeTranslator({ trans_result: [{ src: 'a', dst: '甲' }] })
    await expect(t.translateBatch(['a', 'b'], 'auto', 'zh')).resolves.toEqual(['甲', null])
  })
})
