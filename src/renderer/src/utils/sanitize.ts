import DOMPurify from 'dompurify'

/**
 * 净化 HTML 字符串，防止 XSS 攻击。
 * Electron 中使用 v-html 必须经过净化。
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
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
    ],
    ALLOWED_ATTR: [
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
    ],
    ALLOW_DATA_ATTR: false
  })
}
