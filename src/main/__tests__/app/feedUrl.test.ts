import { describe, expect, it } from 'vitest'
import { findFeedUrl, parseFeedUrl } from '@main/app/feedUrl'

describe('parseFeedUrl', () => {
  it('parses feed URLs with an absolute HTTP URL', () => {
    expect(parseFeedUrl('feed:https://example.com/feed.xml')).toBe('https://example.com/feed.xml')
  })

  it('parses feed URLs with the host-only form', () => {
    expect(parseFeedUrl('feed://example.com/feed.xml')).toBe('http://example.com/feed.xml')
  })

  it('rejects unsupported target protocols', () => {
    expect(parseFeedUrl('feed:file:///tmp/feed.xml')).toBeUndefined()
  })

  it('finds the first feed URL in command-line arguments', () => {
    expect(findFeedUrl(['--hidden', 'feed://example.com/feed.xml'])).toBe(
      'http://example.com/feed.xml'
    )
  })
})
