import DOMPurify from 'dompurify'

/** 默认允许的 HTML 标签 */
const BASE_ALLOWED_TAGS = [
  'p',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'a',
  'strong',
  'em',
  'b',
  'i',
  'u',
  's',
  'img',
  'figure',
  'figcaption',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'div',
  'span',
  'video',
  'audio',
  'source'
  // 注意：刻意不放开 iframe——RSS 内容来自不可信站点，
  // 允许 iframe 会引入同源 XSS 面（开发模式）与钓鱼/挖矿等滥用风险
]

/** 默认允许的属性 */
const BASE_ALLOWED_ATTR = [
  'href',
  'target',
  'rel',
  'src',
  'alt',
  'title',
  'width',
  'height',
  'class',
  'id',
  'data-highlighted',
  'controls',
  'loop',
  // style 保留：RSS 内容普遍使用内联样式，DOMPurify 会清洗其中的危险 CSS
  'style'
  // 不放开 autoplay：恶意条目可借此自动播放音视频骚扰
]

/** 净化选项：按内容源的可信度收紧白名单 */
export interface SanitizeOptions {
  /** 是否允许音视频媒体（video/audio/source），默认 true */
  media?: boolean
  /** 是否允许图片（img/figure/figcaption），默认 true */
  images?: boolean
  /** 是否允许内联 style 属性，默认 true */
  style?: boolean
}

/**
 * 净化 HTML 字符串，防止 XSS 攻击。
 * Electron 中使用 v-html 必须经过净化。
 * 对可信度更高的内容源（如官方更新日志）可传 options 收紧白名单。
 */
export function sanitizeHtml(html: string, options?: SanitizeOptions): string {
  const disallowedTags = new Set<string>()
  if (options?.media === false) {
    disallowedTags.add('video').add('audio').add('source')
  }
  if (options?.images === false) {
    disallowedTags.add('img').add('figure').add('figcaption')
  }
  const allowedTags =
    disallowedTags.size > 0
      ? BASE_ALLOWED_TAGS.filter((t) => !disallowedTags.has(t))
      : BASE_ALLOWED_TAGS
  const allowedAttrs =
    options?.style === false ? BASE_ALLOWED_ATTR.filter((a) => a !== 'style') : BASE_ALLOWED_ATTR
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: allowedAttrs,
    ALLOW_DATA_ATTR: false
  })
}
