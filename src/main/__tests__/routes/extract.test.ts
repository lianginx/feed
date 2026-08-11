import { describe, it, expect } from 'vitest'
import { htmlToText, firstImage } from '@main/services/routes/core/extract'

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
})
