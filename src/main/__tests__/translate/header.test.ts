import { describe, it, expect } from 'vitest'
import { planHeaderBackfill, mapHeaderResults } from '@main/services/translate/header'
import { SUMMARY_CHAR_LIMIT } from '@main/services/translate/summary'

const empty = { translated_title: null, translated_summary: null }

describe('头部补翻计划', () => {
  it('标题与摘要都缺失时按顺序一起补', () => {
    const plan = planHeaderBackfill(empty, 'Hello World', 'summary')
    expect(plan).toEqual({ needTitle: true, needSummary: true, texts: ['Hello World', 'summary'] })
  })

  it('只缺摘要（历史缓存）时只翻摘要', () => {
    const plan = planHeaderBackfill(
      { translated_title: '你好世界', translated_summary: null },
      'Hello World',
      'summary'
    )
    expect(plan).toEqual({ needTitle: false, needSummary: true, texts: ['summary'] })
  })

  it('只缺标题（标题请求失败过）时只翻标题', () => {
    const plan = planHeaderBackfill(
      { translated_title: null, translated_summary: '摘要' },
      'Hello World',
      'summary'
    )
    expect(plan).toEqual({ needTitle: true, needSummary: false, texts: ['Hello World'] })
  })

  it('都不缺时不发请求', () => {
    const plan = planHeaderBackfill(
      { translated_title: '标题', translated_summary: '摘要' },
      'Hello World',
      'summary'
    )
    expect(plan.texts).toHaveLength(0)
  })

  it('空标题 / 空摘要不参与补翻', () => {
    expect(planHeaderBackfill(empty, '   ', 'summary').needTitle).toBe(false)
    expect(planHeaderBackfill(empty, 'Hello', '').needSummary).toBe(false)
    expect(planHeaderBackfill(empty, 'Hello', '   ').needSummary).toBe(false)
    expect(planHeaderBackfill(empty, 'Hello', null).needSummary).toBe(false)
  })

  it('超长摘要按 300 字符上限截断后再送翻', () => {
    const plan = planHeaderBackfill(empty, 'Hello', 'a'.repeat(SUMMARY_CHAR_LIMIT + 100))
    expect(plan.texts[1]).toHaveLength(300)
  })
})

describe('头部补翻结果映射', () => {
  it('两个都补时按位映射', () => {
    expect(mapHeaderResults({ needTitle: true, needSummary: true }, ['译标题', '译摘要'])).toEqual({
      title: '译标题',
      summary: '译摘要'
    })
  })

  it('只补一个时不会串位', () => {
    expect(mapHeaderResults({ needTitle: true, needSummary: false }, ['译标题'])).toEqual({
      title: '译标题',
      summary: null
    })
    expect(mapHeaderResults({ needTitle: false, needSummary: true }, ['译摘要'])).toEqual({
      title: null,
      summary: '译摘要'
    })
  })

  it('失败项（null）保留 null，由调用方决定是否回退', () => {
    expect(mapHeaderResults({ needTitle: true, needSummary: true }, [null, '译摘要'])).toEqual({
      title: null,
      summary: '译摘要'
    })
  })

  it('结果数组缺项时按空处理', () => {
    expect(mapHeaderResults({ needTitle: true, needSummary: true }, [])).toEqual({
      title: null,
      summary: null
    })
  })

  it('无需求时返回 null', () => {
    expect(mapHeaderResults({ needTitle: false, needSummary: false }, [])).toEqual({
      title: null,
      summary: null
    })
  })

  it('空串/纯空白与 null 同等视为没翻出来', () => {
    expect(mapHeaderResults({ needTitle: true, needSummary: true }, ['', '   '])).toEqual({
      title: null,
      summary: null
    })
    expect(mapHeaderResults({ needTitle: true, needSummary: false }, ['  '])).toEqual({
      title: null,
      summary: null
    })
  })
})
