import { describe, it, expect } from 'vitest'
import { normalizeContentImages } from '../../services/contentImages'

describe('normalizeContentImages', () => {
  it('补全协议相对图片地址（// → https://）', () => {
    const html = '<p>图</p><img src="//i0.hdslb.com/a.jpg" alt="x"><img src="https://b.com/c.jpg">'
    const out = normalizeContentImages(html)
    expect(out).toContain('src="https://i0.hdslb.com/a.jpg"')
    expect(out).toContain('src="https://b.com/c.jpg"')
  })

  it('无图片时原样返回', () => {
    expect(normalizeContentImages('<p>纯文本</p>')).toBe('<p>纯文本</p>')
  })
})
