import { describe, it, expect } from 'vitest'
import { SUMMARY_CHAR_LIMIT, toTranslatableSummary } from '@main/services/translate/summary'

describe('摘要翻译文本准备', () => {
  it('空值返回空串', () => {
    expect(toTranslatableSummary(null)).toBe('')
    expect(toTranslatableSummary(undefined)).toBe('')
    expect(toTranslatableSummary('   ')).toBe('')
  })

  it('折叠空白并裁剪首尾', () => {
    expect(toTranslatableSummary('  hello\n\nworld  ')).toBe('hello world')
  })

  it('超长摘要（Atom 无 description 时回退成全文）按 300 字符上限截断', () => {
    const long = 'a'.repeat(SUMMARY_CHAR_LIMIT + 500)
    expect(toTranslatableSummary(long)).toHaveLength(300)
  })

  it('短摘要原样保留', () => {
    expect(toTranslatableSummary('short summary')).toBe('short summary')
    expect(toTranslatableSummary('这是一个中文摘要')).toBe('这是一个中文摘要')
  })
})
