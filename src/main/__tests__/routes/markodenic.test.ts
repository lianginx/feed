import { describe, expect, it } from 'vitest'
import { markodenicNewsletterAdapter } from '@main/services/routes/adapters/markodenic'

const PAGE = `
  <html>
    <head><title>Newsletter | Marko Denic</title></head>
    <body>
      <header><a class="nav-logo" href="https://markodenic.tech/"><img src="/logo.webp"></a></header>
      <main class="issues-section">
        <a class="issue-item" href="/first-issue/">
          <div><h3>First issue</h3><span class="issue-item__meta">Aug 15, 2026</span></div>
          <p>One practical tip every Saturday.</p>
          <span class="issue-item__meta">4 min read</span>
        </a>
        <a class="issue-item" href="https://markodenic.tech/second-issue/">
          <div><h3>Second issue</h3><span class="issue-item__meta">Aug 08, 2026</span></div>
          <p>Build faster with less code.</p>
        </a>
      </main>
    </body>
  </html>
`

describe('Marko Denic Newsletter 适配器', () => {
  it('构建固定地址并解析 newsletter issue 列表', async () => {
    expect(markodenicNewsletterAdapter.buildUrl({})).toBe('https://markodenic.tech/newsletter/')
    expect(markodenicNewsletterAdapter.needsBrowser).toBe(false)
    expect(markodenicNewsletterAdapter.domains).toContain('markodenic.tech')

    const feed = await markodenicNewsletterAdapter.parse(PAGE, {
      params: {},
      url: 'https://markodenic.tech/newsletter/'
    })

    expect(feed.title).toBe('Marko Denic Newsletter')
    expect(feed.image?.url).toBe('https://markodenic.tech/logo.webp')
    expect(feed.items).toHaveLength(2)
    expect(feed.items[0]).toMatchObject({
      guid: 'https://markodenic.tech/first-issue/',
      title: 'First issue',
      summary: 'One practical tip every Saturday.',
      author: 'Marko Denic',
      pubDate: '2026-08-15T12:00:00.000Z'
    })
    expect(feed.items[0].content).toBe('<p>One practical tip every Saturday.</p>')
  })

  it('页面没有 issue 时抛出友好错误', async () => {
    await expect(
      markodenicNewsletterAdapter.parse('<html><body>empty</body></html>', {
        params: {},
        url: 'https://markodenic.tech/newsletter/'
      })
    ).rejects.toThrow('Marko Denic Newsletter 页面未找到文章')
  })

  it('日期无效或页面无图片时不生成错误数据', async () => {
    const feed = await markodenicNewsletterAdapter.parse(
      '<header><a class="nav-logo"></a></header>' +
        '<main class="issues-section"><a class="issue-item" href="/issue/">' +
        '<h3>Issue</h3><span class="issue-item__meta">Feb 31, 2026</span></a></main>',
      { params: {}, url: 'https://markodenic.tech/newsletter/' }
    )

    expect(feed.image).toBeUndefined()
    expect(feed.items[0].pubDate).toBeUndefined()
  })
})
