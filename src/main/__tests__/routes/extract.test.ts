import { describe, it, expect } from 'vitest'
import { htmlToText, firstImage, escapeHtml } from '@main/services/routes/core/extract'

describe('extract 通用工具', () => {
  it('htmlToText 提取纯文本并压缩空白', () => {
    // 与 rss.ts 的 parseHtml 行为一致：text() 不在块级标签间插空格
    expect(htmlToText('<p>Hello <b>world</b></p><p>line2</p>')).toBe('Hello worldline2')
  })

  it('firstImage 取第一张图 src', () => {
    expect(firstImage('<p>x</p><img src="https://a/b.jpg"/><img src="c.jpg"/>')).toBe(
      'https://a/b.jpg'
    )
    expect(firstImage('<p>no img</p>')).toBeUndefined()
  })

  it('escapeHtml 转义五个 HTML 特殊字符', () => {
    expect(escapeHtml(`<a href="x">&y'z</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;y&#39;z&lt;/a&gt;'
    )
  })

  it('escapeHtml 普通文本原样返回', () => {
    expect(escapeHtml('普通文本 123（兼容）。')).toBe('普通文本 123（兼容）。')
  })
})
