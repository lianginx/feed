/**
 * 文章内容 <img> 归一化：补全协议相对地址。
 * B 站等站点的图片 src 常为 '//host/xxx'，在 Electron 的 file:// 应用页下会被解析成
 * file://host 而加载失败，统一补成 https://（file:// 页面加载 https 图片本就不发 Referer，
 * 图床通常放行，无需额外 referrerpolicy）。
 */
export function normalizeContentImages(html: string): string {
  return html.replace(/(<img[^>]*\ssrc=")\/\//g, '$1https://')
}
