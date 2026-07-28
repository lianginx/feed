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
      'source',
      'iframe'
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
      'autoplay',
      'loop',
      'frameborder',
      'allowfullscreen',
      'style'
    ],
    ALLOW_DATA_ATTR: false
  })
}
