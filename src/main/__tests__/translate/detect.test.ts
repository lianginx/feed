import { describe, it, expect } from 'vitest'
import { detectLanguage, isSameLanguage } from '../../services/translate/detect'

describe('detectLanguage', () => {
  it('简体中文 → zh', () => {
    expect(detectLanguage('这是一篇中文文章，介绍最新的技术进展。')).toBe('zh')
  })

  it('繁体中文 → zh-Hant', () => {
    expect(detectLanguage('這是一篇繁體中文文章，介紹最新的技術進展。')).toBe('zh-Hant')
  })

  it('英文 → en', () => {
    expect(
      detectLanguage('This is an English article about the latest technology and its impact.')
    ).toBe('en')
  })

  it('日文（含假名）→ ja', () => {
    expect(detectLanguage('こんにちは世界。これは日本語の文章です。')).toBe('ja')
  })

  it('韩文 → ko', () => {
    expect(detectLanguage('이것은 한국어 기사입니다. 최신 기술에 대해 설명합니다.')).toBe('ko')
  })

  it('空文本 / 纯数字 → unknown', () => {
    expect(detectLanguage('')).toBe('unknown')
    expect(detectLanguage('12345 6789')).toBe('unknown')
  })

  it('汉字主导但简繁均未命中的中性字 → zh（兜底）', () => {
    expect(detectLanguage('中文文章内容介绍')).toBe('zh')
  })

  it('中英混杂且任一语言均未占优 → unknown（不误判）', () => {
    expect(detectLanguage('abc 123 你好')).toBe('unknown')
  })
})

describe('isSameLanguage', () => {
  it('相同语言才跳过', () => {
    expect(isSameLanguage('zh', 'zh')).toBe(true)
    expect(isSameLanguage('en', 'en')).toBe(true)
  })

  it('zh 与 zh-Hant 视为不同语言，不跳过', () => {
    expect(isSameLanguage('zh', 'zh-Hant')).toBe(false)
    expect(isSameLanguage('zh-Hant', 'zh')).toBe(false)
  })

  it('unknown 不跳过', () => {
    expect(isSameLanguage('unknown', 'zh')).toBe(false)
  })
})
