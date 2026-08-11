import { describe, it, expect } from 'vitest'
import { extractPieces, packPieces, rebuildHtml } from '@main/services/translate/html'

describe('extractPieces', () => {
  it('纯文本段落提取为单个可翻译单元', () => {
    const { units } = extractPieces('<p>Hello world content</p>')
    expect(units.length).toBe(1)
    expect(units[0].text).toBe('Hello world content')
  })

  it('跳过 pre/code 及其后代文本', () => {
    const { units } = extractPieces('<p>Hello</p><pre><code>const a = 1</code></pre>')
    expect(units.map((u) => u.text)).toEqual(['Hello'])
  })

  it('空文本 / 纯符号文本跳过', () => {
    const { units } = extractPieces('<p>   </p><p>!!!</p><p>Real text</p>')
    expect(units.map((u) => u.text)).toEqual(['Real text'])
  })

  it('行内标签间的文本节点聚合为同一 piece（孤立标点节点跳过）', () => {
    const { pieces } = extractPieces('<p>Hello <strong>world</strong>!</p>')
    expect(pieces.length).toBe(1)
    // “Hello ”与“world”参与翻译；孤立标点“!”为纯符号节点被跳过
    expect(pieces[0].units.length).toBe(2)
  })

  it('块级边界断开 piece', () => {
    const { pieces } = extractPieces('<p>A</p><p>B</p>')
    expect(pieces.length).toBe(2)
  })

  it('<br> 断开 piece', () => {
    const { pieces } = extractPieces('<p>A<br/>B</p>')
    expect(pieces.length).toBe(2)
  })

  it('无块级标签（div 包裹 / 纯文本）也能提取文本节点', () => {
    const div = extractPieces('<div><div>Hello world</div></div>')
    expect(div.units.map((u) => u.text)).toEqual(['Hello world'])

    const plain = extractPieces('Just plain text')
    expect(plain.units.map((u) => u.text)).toEqual(['Just plain text'])
  })

  it('完整文档（含 head/style）标记 isFullDocument，fragment 不标记', () => {
    const full = extractPieces(
      '<html><head><style>p{color:red}</style></head><body><p>Hello</p></body></html>'
    )
    expect(full.isFullDocument).toBe(true)

    const frag = extractPieces('<p>Hello</p>')
    expect(frag.isFullDocument).toBe(false)
  })

  it('跳过 style/script/svg 整棵子树及其内容', () => {
    const { units } = extractPieces(
      '<p>Hello</p><style>p{color:red}</style><script>alert(1)</script><svg><text>svg text</text></svg>'
    )
    expect(units.map((u) => u.text)).toEqual(['Hello'])
  })

  it('注释节点忽略', () => {
    const { units } = extractPieces('<p>Hello</p><!-- comment --><p>World</p>')
    expect(units.map((u) => u.text)).toEqual(['Hello', 'World'])
  })

  it('行内 <a> 锚文本参与翻译且与相邻文本同 piece', () => {
    const { pieces } = extractPieces('<p>阅读 <a href="/x">原文</a> 了解更多</p>')
    expect(pieces.length).toBe(1)
    expect(pieces[0].units.map((u) => u.text)).toEqual(['阅读', '原文', '了解更多'])
  })
})

describe('packPieces', () => {
  it('连续文本按字节上限贪心打包', () => {
    const { pieces } = extractPieces(
      '<p>' + 'a'.repeat(100) + '</p><p>' + 'b'.repeat(100) + '</p><p>' + 'c'.repeat(100) + '</p>'
    )
    const batches = packPieces(pieces, 250)
    for (const batch of batches) {
      const bytes = batch.reduce((n, u) => n + Buffer.byteLength(u.text, 'utf8'), 0)
      expect(bytes).toBeLessThanOrEqual(250)
    }
    // 3 × 100 字节，250 上限 → 2 批（100+100 / 100）
    expect(batches.length).toBe(2)
    expect(batches[0].length).toBe(2)
    expect(batches[1].length).toBe(1)
  })

  it('index 与 units 数组顺序一致', () => {
    const { units, pieces } = extractPieces('<p>First</p><p>Second</p>')
    const all = packPieces(pieces, 6000).flat()
    expect(all.map((u) => u.index)).toEqual(units.map((u) => u.index))
  })

  it('超长单个文本节点按字节切分（同一 index，part 递增，每段 ≤ 上限）', () => {
    const { pieces } = extractPieces(`<p>${'长'.repeat(100)}</p>`) // 300 字节
    const allUnits = packPieces(pieces, 100)
    const flat = allUnits.flat()
    // 300 字节 / 100 上限 → 33+33+33+1 共 4 段
    expect(flat.length).toBe(4)
    expect(flat.map((u) => u.part)).toEqual([0, 1, 2, 3])
    expect(flat.every((u) => u.index === 0)).toBe(true)
    for (const batch of allUnits) {
      const bytes = batch.reduce((n, u) => n + Buffer.byteLength(u.text, 'utf8'), 0)
      expect(bytes).toBeLessThanOrEqual(100)
    }
  })

  it('无文本时返回空批次', () => {
    expect(packPieces([], 6000)).toEqual([])
  })
})

describe('rebuildHtml', () => {
  it('译文写回文本节点，标签结构保留', () => {
    const html = '<p>Hello <strong>world</strong>!</p>'
    const { $, pieces, units } = extractPieces(html)
    const allUnits = packPieces(pieces, 6000).flat()
    const translations = allUnits.map((u) => `【译】${u.text}`)
    const rebuilt = rebuildHtml({ $, units, allUnits, translations })
    expect(rebuilt.degraded).toBe(false)
    expect(rebuilt.html).toContain('【译】Hello')
    expect(rebuilt.html).toContain('<strong>【译】world</strong>')
    // 孤立标点“!”不参与翻译，原样保留
    expect(rebuilt.html).toContain('!')
    expect(rebuilt.html).not.toContain('【译】!')
  })

  it('某段失败（null）→ 该文本节点保留原文，其余照常', () => {
    const html = '<p>Alpha</p><p>Beta</p>'
    const { $, pieces, units } = extractPieces(html)
    const allUnits = packPieces(pieces, 6000).flat()
    const translations = [null, 'Beta 译文']
    const rebuilt = rebuildHtml({ $, units, allUnits, translations })
    expect(rebuilt.degraded).toBe(true)
    expect(rebuilt.html).toContain('Alpha')
    expect(rebuilt.html).toContain('Beta 译文')
  })

  it('译文与原文相同（如纯数字段被原样返回）不误判为失败', () => {
    const html = '<p>2024</p>'
    const { $, pieces, units } = extractPieces(html)
    const allUnits = packPieces(pieces, 6000).flat()
    const translations = ['2024']
    const rebuilt = rebuildHtml({ $, units, allUnits, translations })
    expect(rebuilt.degraded).toBe(false)
    expect(rebuilt.html).toContain('2024')
  })

  it('完整文档翻译后保留 head/style（排版不丢）', () => {
    const html = '<html><head><style>p{color:red}</style></head><body><p>Hello</p></body></html>'
    const { $, pieces, units, isFullDocument } = extractPieces(html)
    const allUnits = packPieces(pieces, 6000).flat()
    const translations = allUnits.map((u) => `【译】${u.text}`)
    const rebuilt = rebuildHtml({ $, units, allUnits, translations, isFullDocument })
    expect(rebuilt.html).toContain('<style>')
    expect(rebuilt.html).toContain('【译】Hello')
  })

  it('超长节点切分后译文按 part 顺序拼接写回', () => {
    const html = `<p>${'长'.repeat(100)}</p>`
    const { $, pieces, units } = extractPieces(html)
    const flat = packPieces(pieces, 100).flat()
    const translations = flat.map((u) => `【译${u.part}】`)
    const rebuilt = rebuildHtml({ $, units, allUnits: flat, translations })
    expect(rebuilt.degraded).toBe(false)
    expect(rebuilt.html).toContain('【译0】【译1】【译2】【译3】')
  })

  it('超长节点某段失败 → 整节点保留原文并标记降级', () => {
    const long = '长'.repeat(70) // 210 字节
    const html = `<p>${long}</p>`
    const { $, pieces, units } = extractPieces(html)
    const flat = packPieces(pieces, 100).flat()
    const translations = flat.map((u) => (u.part === 1 ? null : `【译${u.part}】`))
    const rebuilt = rebuildHtml({ $, units, allUnits: flat, translations })
    expect(rebuilt.degraded).toBe(true)
    expect(rebuilt.html).toContain(long)
  })
})
