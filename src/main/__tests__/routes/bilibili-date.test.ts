import { describe, it, expect } from 'vitest'
import { parseBiliDate } from '@main/services/routes/adapters/bilibili/video'

describe('parseBiliDate（B 站空间页日期文本 → ISO，实测格式规律）', () => {
  const now = new Date('2026-08-07T10:00:00+08:00')

  it('相对时间：刚刚', () => {
    expect(parseBiliDate('刚刚', now)).toBe(now.toISOString())
  })

  it('相对时间：x分钟前', () => {
    expect(parseBiliDate('43分钟前', now)).toBe(new Date(now.getTime() - 43 * 60_000).toISOString())
  })

  it('相对时间：x小时前', () => {
    expect(parseBiliDate('21小时前', now)).toBe(
      new Date(now.getTime() - 21 * 3_600_000).toISOString()
    )
  })

  it('相对时间：昨天', () => {
    expect(parseBiliDate('昨天', now)).toBe(new Date(now.getTime() - 86_400_000).toISOString())
  })

  it('当年 MM-DD', () => {
    expect(parseBiliDate('08-05', now)).toBe(new Date('2026-08-05T00:00:00+08:00').toISOString())
  })

  it('跨年 MM-DD：1 月看到 12-30 属去年', () => {
    const jan = new Date('2026-01-15T10:00:00+08:00')
    expect(parseBiliDate('12-30', jan)).toBe(new Date('2025-12-30T00:00:00+08:00').toISOString())
  })

  it('当年 M月D日（改版后格式）', () => {
    expect(parseBiliDate('8月5日', now)).toBe(new Date('2026-08-05T00:00:00+08:00').toISOString())
    expect(parseBiliDate('7月26日', now)).toBe(new Date('2026-07-26T00:00:00+08:00').toISOString())
  })

  it('跨年 M月D日：1 月看到 12月30日 属去年', () => {
    const jan = new Date('2026-01-15T10:00:00+08:00')
    expect(parseBiliDate('12月30日', jan)).toBe(new Date('2025-12-30T00:00:00+08:00').toISOString())
  })

  it('往年 YYYY年M月D日（改版后格式）', () => {
    expect(parseBiliDate('2021年9月23日', now)).toBe(
      new Date('2021-09-23T00:00:00+08:00').toISOString()
    )
    expect(parseBiliDate('2020年9月25日', now)).toBe(
      new Date('2020-09-25T00:00:00+08:00').toISOString()
    )
  })

  it('往年 YYYY-MM-DD', () => {
    expect(parseBiliDate('2024-09-02', now)).toBe(
      new Date('2024-09-02T00:00:00+08:00').toISOString()
    )
  })

  it('未知格式 / 空字符串 → undefined', () => {
    expect(parseBiliDate('随便写', now)).toBeUndefined()
    expect(parseBiliDate('', now)).toBeUndefined()
    expect(parseBiliDate('2026/08/07', now)).toBeUndefined()
  })
})
