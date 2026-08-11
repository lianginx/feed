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
