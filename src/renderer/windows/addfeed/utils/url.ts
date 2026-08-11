/** 轻量校验 RSS 地址格式：可解析且为 http/https，零网络零阻塞 */
export function isValidRssUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
