const FEED_SCHEME = 'feed:'

function toHttpUrl(value: string): string | undefined {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
    return parsed.toString()
  } catch {
    return undefined
  }
}

export function parseFeedUrl(value: string): string | undefined {
  const input = value.trim()
  if (!input.toLowerCase().startsWith(FEED_SCHEME)) return undefined

  const target = input.slice(FEED_SCHEME.length)
  if (!target) return undefined

  if (target.startsWith('//http://') || target.startsWith('//https://')) {
    return toHttpUrl(target.slice(2))
  }

  if (target.startsWith('//')) {
    return toHttpUrl(`http:${target}`)
  }

  return toHttpUrl(target)
}

export function findFeedUrl(values: readonly string[]): string | undefined {
  for (const value of values) {
    const feedUrl = parseFeedUrl(value)
    if (feedUrl) return feedUrl
  }
  return undefined
}
