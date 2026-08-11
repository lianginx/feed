import { describe, it, expect } from 'vitest'
import { toBaiduCode, TARGET_LANGUAGES } from '@main/services/translate/languages'

describe('toBaiduCode', () => {
  it('百度特殊编码映射', () => {
    expect(toBaiduCode('zh-Hant')).toBe('cht')
    expect(toBaiduCode('ko')).toBe('kor')
    expect(toBaiduCode('fr')).toBe('fra')
    expect(toBaiduCode('es')).toBe('spa')
  })

  it('同码透传', () => {
    expect(toBaiduCode('zh')).toBe('zh')
    expect(toBaiduCode('en')).toBe('en')
    expect(toBaiduCode('de')).toBe('de')
    expect(toBaiduCode('ru')).toBe('ru')
  })

  it('百度特殊编码：日语 ja → jp', () => {
    expect(toBaiduCode('ja')).toBe('jp')
  })

  it('所有设置界面目标语言都有百度编码（防漏映射回归）', () => {
    const expected = ['zh', 'cht', 'en', 'jp', 'kor', 'fra', 'de', 'ru', 'spa']
    expect(TARGET_LANGUAGES.map((l) => toBaiduCode(l.code))).toEqual(expected)
  })

  it('未知码原样透传', () => {
    expect(toBaiduCode('xx')).toBe('xx')
  })
})

describe('TARGET_LANGUAGES', () => {
  it('默认目标语言为简体中文', () => {
    expect(TARGET_LANGUAGES[0]).toEqual({ code: 'zh', label: '简体中文' })
  })

  it('包含简繁两种中文', () => {
    const codes = TARGET_LANGUAGES.map((l) => l.code)
    expect(codes).toContain('zh')
    expect(codes).toContain('zh-Hant')
  })
})
