import { load, type CheerioAPI } from 'cheerio'
import type { AnyNode, Text } from 'domhandler'

/**
 * HTML 文本节点提取 / piece 聚合 / 原位回填 —— 翻译保真核心。
 *
 * 对齐业界成熟方案（沉浸式翻译 / TWP）：**不提取重建、不用占位符 token**，
 * 标签/属性/结构原样保留在 DOM 中，只翻译并回填「文本节点」的文本。
 * - 收集所有可翻译的叶子文本节点（跳过 pre/code/script/style 等及其后代）
 * - 相邻文本节点（中间只有行内标签）聚合为同一 piece，同批发送共享上下文
 * - 块级边界 / <br> / 代码块 → 断开 piece
 * - 译文按序写回对应文本节点（node.data），最后序列化一次，结构零改动
 * - 行内标签内的文本（链接锚文本、加粗等）正常参与翻译，不再被占位符吞掉
 */

/** 整体不翻译的容器（及其后代全部跳过，文本原样保留） */
const SKIP_TAGS = new Set(['pre', 'code', 'script', 'style', 'svg', 'noscript', 'textarea'])

/** 行内标签：两个文本节点之间只有这类标签时属于同一 piece（语义连续，共享上下文） */
const INLINE_TAGS = new Set([
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'cite',
  'data',
  'dfn',
  'em',
  'i',
  'kbd',
  'mark',
  'q',
  'ruby',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'var',
  'wbr'
])

/** 单个文本节点翻译单元 */
export interface TextUnit {
  /** 在全局 units 数组中的下标（回填映射用） */
  index: number
  /** domhandler 文本节点引用（原位回填） */
  node: Text
  /** 发送给翻译器的文本（trim 后） */
  text: string
}

/** 一组语义连续的文本节点（相邻且中间只有行内标签） */
export interface Piece {
  units: TextUnit[]
}

export interface ExtractResult {
  $: CheerioAPI
  pieces: Piece[]
  /** 全部可翻译文本单元（按文档序，与 piece 展平顺序一致） */
  units: TextUnit[]
  /** 原文是否为完整 HTML 文档（含 <html>/<head>），决定序列化方式 */
  isFullDocument: boolean
}

export function extractPieces(html: string): ExtractResult {
  const $ = load(html)
  // 完整文档（含 head/style）翻译后需整体序列化，否则样式丢失
  const isFullDocument = /<(html|head)\b/i.test(html)
  const pieces: Piece[] = []
  const units: TextUnit[] = []
  let current: Piece | null = null

  /** 取当前 piece，不存在则新建 */
  const piece = (): Piece => {
    if (!current || current.units.length === 0) {
      current = { units: [] }
      pieces.push(current)
    }
    return current
  }
  /** 断开当前 piece（下次文本节点开启新 piece） */
  const breakPiece = (): void => {
    current = null
  }

  const collect = (el: AnyNode): void => {
    for (const child of $(el).contents().toArray()) {
      if (child.type === 'text') {
        const text = (child.data ?? '').trim()
        // 空 / 纯符号节点跳过（不翻译，原样保留）
        if (!text || !/[\p{L}\p{N}]/u.test(text)) continue
        const unit: TextUnit = { index: units.length, node: child, text }
        piece().units.push(unit)
        units.push(unit)
      } else if (child.type === 'tag') {
        const tag = (child.tagName ?? '').toLowerCase()
        if (SKIP_TAGS.has(tag)) {
          breakPiece() // 代码块等：断开，子树不翻译
        } else if (tag === 'br') {
          breakPiece() // 强制换行：断开
        } else if (INLINE_TAGS.has(tag)) {
          collect(child) // 行内：不打断 piece，递归
        } else {
          breakPiece() // 块级：断开，递归
          collect(child)
        }
      }
      // script / style / comment 等忽略
    }
  }

  const body = $('body')[0]
  if (body) collect(body)

  return { $, pieces, units, isFullDocument }
}

/** 与 units 一一对应的翻译单元（批次展平后） */
export interface TranslateUnit {
  /** 对应 TextUnit 在 units 数组中的下标 */
  index: number
  text: string
  /** 超长文本节点被切分后的段序号（0-based）；未切分节点无此字段 */
  part?: number
  /** 超长文本节点切分总段数；未切分节点无此字段 */
  parts?: number
}

/**
 * 按 UTF-8 字节上限切分文本（code point 级切割，不切断多字节字符），
 * 保证每段 ≤ limitBytes。
 */
function splitTextByBytes(text: string, limitBytes: number): string[] {
  const chunks: string[] = []
  let current = ''
  let currentBytes = 0
  for (const ch of text) {
    const cb = Buffer.byteLength(ch, 'utf8')
    if (currentBytes + cb > limitBytes && current !== '') {
      chunks.push(current)
      current = ch
      currentBytes = cb
    } else {
      current += ch
      currentBytes += cb
    }
  }
  if (current !== '') chunks.push(current)
  return chunks
}

/**
 * 将 piece 展平并按 UTF-8 字节贪心打包成批次（每批一个请求，≤ limitBytes）。
 * 同一 piece 的文本节点天然相邻，尽量同批共享上下文。
 */
export function packPieces(pieces: Piece[], limitBytes: number): TranslateUnit[][] {
  const batches: TranslateUnit[][] = []
  let currentBatch: TranslateUnit[] = []
  let currentBytes = 0

  const flush = (): void => {
    if (currentBatch.length > 0) {
      batches.push(currentBatch)
      currentBatch = []
      currentBytes = 0
    }
  }

  for (const p of pieces) {
    for (const unit of p.units) {
      const bytes = Buffer.byteLength(unit.text, 'utf8')
      // 单个文本节点超过单次请求上限（百度 6000 字节）：按字节边界切分。
      // 同一节点各段共享 index、part 递增，译文在 rebuildHtml 按 part 顺序拼接后写回，
      // 避免「一个超长段落整段超出上限、每次翻译必然失败」。
      if (bytes > limitBytes) {
        const chunks = splitTextByBytes(unit.text, limitBytes)
        chunks.forEach((chunk, part) => {
          const chunkBytes = Buffer.byteLength(chunk, 'utf8')
          if (currentBatch.length > 0 && currentBytes + chunkBytes > limitBytes) {
            flush()
          }
          currentBatch.push({ index: unit.index, text: chunk, part, parts: chunks.length })
          currentBytes += chunkBytes
        })
        continue
      }
      if (currentBatch.length > 0 && currentBytes + bytes > limitBytes) {
        flush()
      }
      currentBatch.push({ index: unit.index, text: unit.text })
      currentBytes += bytes
    }
  }
  flush()
  return batches
}

export interface RebuildInput {
  $: CheerioAPI
  units: TextUnit[]
  allUnits: TranslateUnit[]
  /** 与 allUnits 一一对应的译文；null/空表示该单元翻译失败 */
  translations: (string | null)[]
  /** 完整文档时整体序列化（保留 head/style）；fragment 用 body 内容 */
  isFullDocument?: boolean
}

export interface RebuildResult {
  html: string
  /** 是否有段落降级（保留原文） */
  degraded: boolean
}

/**
 * 原位回填：把译文写回对应文本节点（node.data），标签/结构零改动。
 * - null/空 → 保留原文并标记 degraded
 * - 译文 === 原文 → 写回同值，不误判为失败（如纯数字/链接段被百度原样返回）
 */
export function rebuildHtml({
  $,
  units,
  allUnits,
  translations,
  isFullDocument = false
}: RebuildInput): RebuildResult {
  // 按 index 分组收集各 part 译文（含切分序）；未切分节点 part 视为 0
  const partsByIndex = new Map<number, Array<{ part: number; t: string | null }>>()
  allUnits.forEach((tu, i) => {
    let arr = partsByIndex.get(tu.index)
    if (!arr) {
      arr = []
      partsByIndex.set(tu.index, arr)
    }
    arr.push({ part: tu.part ?? 0, t: translations[i] })
  })

  let degraded = false
  for (const [index, parts] of partsByIndex) {
    const unit = units[index]
    if (!unit) continue
    parts.sort((a, b) => a.part - b.part)
    // 任一段失败 → 整节点保留原文并标记降级（避免半截译文拼接到一个文本节点）
    if (parts.some((p) => p.t == null || p.t.trim() === '')) {
      degraded = true
      continue
    }
    unit.node.data = parts.map((p) => p.t).join('')
  }
  // 完整文档整体序列化（保留 head/style），fragment 只取 body 内容还原
  const html = isFullDocument ? $.html() : ($('body').html() ?? '')
  return { html, degraded }
}
