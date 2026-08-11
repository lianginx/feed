import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { parseFeedXml, toFriendlyFeedError } from '@main/services/rss'

/** 读取本地 fixture 文件（真实源样本，不联网） */
function loadFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/real/${name}`, import.meta.url), 'utf-8')
}

/**
 * feedparser 迁移回归测试。
 *
 * 用本地 XML fixture 验证字段映射，不依赖网络：
 * - Atom 源 rel=self 在前、主页无 rel 时，link 必须正确解析为主页（jvns.ca 场景）
 * - RSS 2.0 的 content:encoded 提取为正文、description 作为摘要
 * - Atom summary 缺失/含 HTML 时兜底为正文纯文本
 */

const ATOM_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test Blog</title>
  <link href="https://test.example/atom.xml" rel="self"/>
  <link href="https://test.example"/>
  <id>tag:test.example,2026:/blog</id>
  <updated>2026-01-01T00:00:00Z</updated>
  <author><name>Alice</name></author>
  <entry>
    <title>Hello World</title>
    <link href="https://test.example/hello"/>
    <id>https://test.example/hello</id>
    <published>2026-01-01T00:00:00Z</published>
    <author><name>Alice</name></author>
    <content type="html">&lt;p&gt;Hello &lt;b&gt;world&lt;/b&gt;&lt;/p&gt;</content>
    <summary>Short summary</summary>
  </entry>
  <entry>
    <title>With Image</title>
    <link href="https://test.example/image-post"/>
    <id>https://test.example/image-post</id>
    <updated>2026-01-02T00:00:00Z</updated>
    <content type="html">&lt;p&gt;Hello &lt;b&gt;world&lt;/b&gt;&lt;/p&gt;&lt;img src="https://test.example/img.jpg"/&gt;</content>
  </entry>
</feed>`

const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>RSS Blog</title>
    <link>https://rss.example/</link>
    <description>RSS desc</description>
    <item>
      <title>Post One</title>
      <link>https://rss.example/one</link>
      <guid>https://rss.example/one</guid>
      <pubDate>Wed, 01 Jan 2026 00:00:00 GMT</pubDate>
      <description>Short text</description>
      <content:encoded xmlns:content="http://purl.org/rss/1.0/modules/content/"><![CDATA[<p>Full <em>HTML</em> content</p>]]></content:encoded>
    </item>
  </channel>
</rss>`

describe('parseFeedXml - Atom', () => {
  it('rel=self 在前、主页无 rel 时，link 正确解析为主页（jvns.ca 场景）', async () => {
    const feed = await parseFeedXml(ATOM_FIXTURE)
    expect(feed.title).toBe('Test Blog')
    // feedparser 会用 WHATWG URL 规范化，无 rel 的主页 link 带尾斜杠
    expect(feed.link).toBe('https://test.example/')
    expect(feed.items).toHaveLength(2)
  })

  it('正文从 atom:content 提取，summary 用显式摘要', async () => {
    const feed = await parseFeedXml(ATOM_FIXTURE)
    const first = feed.items[0]
    expect(first.title).toBe('Hello World')
    expect(first.link).toBe('https://test.example/hello')
    expect(first.guid).toBe('https://test.example/hello')
    expect(first.content).toBe('<p>Hello <b>world</b></p>')
    expect(first.summary).toBe('Short summary')
    expect(first.author).toBe('Alice')
    expect(first.pubDate).toBe('2026-01-01T00:00:00.000Z')
  })

  it('无 summary 的条目兜底为正文纯文本，封面从正文首图提取', async () => {
    const feed = await parseFeedXml(ATOM_FIXTURE)
    const second = feed.items[1]
    expect(second.content).toBe(
      '<p>Hello <b>world</b></p><img src="https://test.example/img.jpg"/>'
    )
    expect(second.summary).toBe('Hello world')
    expect(second.coverImage).toBe('https://test.example/img.jpg')
  })
})

describe('parseFeedXml - RSS 2.0', () => {
  it('主页 link 正确，正文从 content:encoded 提取，摘要用 description', async () => {
    const feed = await parseFeedXml(RSS_FIXTURE)
    expect(feed.title).toBe('RSS Blog')
    expect(feed.link).toBe('https://rss.example/')
    expect(feed.items).toHaveLength(1)

    const item = feed.items[0]
    expect(item.content).toBe('<p>Full <em>HTML</em> content</p>')
    expect(item.summary).toBe('Short text')
    expect(item.pubDate).toBe('2026-01-01T00:00:00.000Z')
  })
})

describe('parseFeedXml - 非法输入', () => {
  it('非 feed 内容抛错', async () => {
    // feedparser 对非 feed 内容抛 'Not a feed'；纯文本/非 XML 也走 error 分支
    await expect(parseFeedXml('This is not a feed at all')).rejects.toThrow(/Not a feed/)
  })
})

/**
 * 实际订阅源样本测试：fixture 是从用户数据库中的订阅源抓取的【完整原始 XML】
 * （不截断、不加工），条目数与主页解析均按快照断言。
 * 覆盖各种形态：跨域托管、第三方代理、API 型、标准 RSS、Atom。
 */
describe('parseFeedXml - 实际订阅源样本（完整原始 XML）', () => {
  const cases = [
    {
      name: 'Julia Evans（Atom self-first，主页无 rel）',
      file: '58-jvns-ca.atom.xml',
      titlePart: 'Julia',
      link: 'https://jvns.ca/',
      items: 20
    },
    {
      name: '阮一峰（FeedBurner 跨域托管，主页与订阅源不同域名）',
      file: '55-feeds-feedburner-com.rss.xml',
      titlePart: '阮一峰',
      link: 'http://www.ruanyifeng.com/blog/',
      items: 6
    },
    {
      name: 'V2EX（自建代理第三方托管）',
      file: '50-47-119-138-188.rss.xml',
      titlePart: 'V2EX',
      link: 'https://www.v2ex.com/',
      items: 8
    },
    {
      name: '小盖（API 型，非标准 feed 路径）',
      file: '44-xiaogai-fun.rss.xml',
      titlePart: '小盖',
      link: 'https://xiaogai.fun/',
      items: 20
    },
    {
      name: '小众软件（标准 RSS 2.0）',
      file: '51-www-appinn-com.rss.xml',
      titlePart: '小众软件',
      link: 'https://www.appinn.com/',
      items: 10
    },
    {
      name: 'Anthony Fu（开发者博客 RSS）',
      file: '36-antfu-me.rss.xml',
      titlePart: 'Anthony',
      link: 'https://antfu.me/',
      items: 72
    }
  ]

  it.each(cases)('$name', async ({ file, link, titlePart, items }) => {
    const feed = await parseFeedXml(loadFixture(file))
    expect(feed.link).toBe(link)
    expect(feed.title).toContain(titlePart)
    // 完整原始 XML：条目数应与抓取快照一致（非截断）
    expect(feed.items).toHaveLength(items)

    const first = feed.items[0]
    expect(first.content?.length).toBeGreaterThan(0)
    // 摘要是从正文 HTML 转的纯文本（正文代码里的字面量 < 如 <br>/<script> 示例允许）
    expect(first.summary?.length).toBeGreaterThan(0)
  })
})

/** 边界用例：修复 review 指出的两个边界问题 */
const EDGE_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Edge Blog</title>
  <link href="https://edge.example/"/>
  <id>edge</id>
  <updated>2026-01-01T00:00:00Z</updated>
  <entry>
    <title>Edge Case</title>
    <id>edge-1</id>
    <updated>2026-01-01T00:00:00Z</updated>
    <content type="html">&lt;p&gt;Use &amp;lt;strong&amp;gt; carefully&lt;/p&gt;&lt;img src="javascript:alert(1)"/&gt;</content>
    <summary>a &lt; b</summary>
  </entry>
</feed>`

describe('parseFeedXml - 边界（review 修复）', () => {
  it('摘要中的字面量 < 不误判为 HTML，封面过滤非法协议', async () => {
    const feed = await parseFeedXml(EDGE_FIXTURE)
    const item = feed.items[0]
    // 纯文本摘要含字面量 <（比较符）→ 保留原文，不退化成长全文
    expect(item.summary).toBe('a < b')
    // content 首图为 javascript: 协议 → 封面过滤为 undefined
    expect(item.coverImage).toBeUndefined()
  })
})

describe('toFriendlyFeedError - HTTP 状态码文案', () => {
  it('401/403/404/410/429 有各自语义准确的提示', () => {
    expect(toFriendlyFeedError(new Error('Status code 401'))).toContain('登录')
    expect(toFriendlyFeedError(new Error('Status code 403'))).toContain('拒绝')
    expect(toFriendlyFeedError(new Error('Status code 404'))).toContain('失效')
    expect(toFriendlyFeedError(new Error('Status code 410'))).toContain('移除')
    expect(toFriendlyFeedError(new Error('Status code 429'))).toContain('限流')
  })

  it('5xx 提示服务器不可用，其他 4xx 提示请求无效', () => {
    expect(toFriendlyFeedError(new Error('Status code 500'))).toContain('服务器')
    expect(toFriendlyFeedError(new Error('Status code 400'))).toContain('无效')
  })

  it('JSON 解析错误提示可能被风控', () => {
    expect(
      toFriendlyFeedError(new Error('Unexpected token \'<\', "..." is not valid JSON'))
    ).toContain('风控')
  })

  it('适配器抛出的中文错误直接透传，不加前缀', () => {
    const msg = 'B 站接口异常：请求被拦截（风控），请稍后重试'
    expect(toFriendlyFeedError(new Error(msg))).toBe(msg)
  })
})
