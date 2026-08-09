import { describe, it, expect, vi } from 'vitest'
import { hapigoChangelogAdapter } from '../../services/routes/adapters/hapigo'
import { fetchWithTimeout } from '../../services/http'

// 适配器 parse 会联网抓详情 .md 页（转正文），单测 mock 网络
// 注意：详情页为并发抓取，mock 需按 URL 区分返回，不能用只生效一次的 mockImplementationOnce
vi.mock('../../services/http', () => ({
  fetchWithTimeout: vi.fn(async () => ({
    ok: true,
    text: async () => DETAIL_MD
  })),
  BROWSER_USER_AGENT: 'Mozilla/5.0 (Mock)'
}))

/** 模拟一个详情页 markdown（真实结构：引导块 + h1 + figure + h3 + 列表） */
const DETAIL_MD = [
  '> For the complete documentation index, see [llms.txt](https://updates-cn.hapigo.com/llms.txt).',
  '',
  '# v2.22.1 增加去除背景工具',
  '',
  '<figure><img src="/files/90eiKUe3vPZ78fRAFYFv" alt=""><figcaption></figcaption></figure>',
  '',
  '### 🔥 新增功能',
  '',
  '* 新增截图去除背景',
  '* 钉图至桌面增加边框设置',
  '* 优化 WPS\\&Excel 拷贝卡顿',
  '',
  '### 🛠 修复与优化',
  '',
  '* 增加闪退自动启动'
].join('\n')

/** 模拟 llms.txt：前 3 条带日期 + 若干条不带日期 */
const LLMS_TXT = [
  '# HapiGo 更新',
  '',
  '## HapiGo 更新',
  '',
  '- [v2.22.1 增加去除背景工具](https://updates-cn.hapigo.com/2221.md): 发布于：2026/7/27',
  '- [v2.22.0 增加录屏与 GIF 录制](https://updates-cn.hapigo.com/history/2220.md): 发布于：2026/6/23',
  '- [v2.21.0 增加 Finder 右键菜单扩展](https://updates-cn.hapigo.com/history/2210.md): 发布于：2026/4/23',
  '- [v2.20.0 增加荧光笔](https://updates-cn.hapigo.com/history/2200.md)'
].join('\n')

describe('hapigo 更新日志适配器', () => {
  it('buildUrl 指向 llms.txt 来源，纯 HTTP 无需登录', () => {
    expect(hapigoChangelogAdapter.buildUrl({})).toBe('https://updates-cn.hapigo.com/llms.txt')
    expect(hapigoChangelogAdapter.needsBrowser).toBe(false)
    expect(hapigoChangelogAdapter.domains).toContain('hapigo.com')
  })

  it('parse 解析 llms.txt 并逐篇转详情 markdown 为 HTML', async () => {
    const feed = await hapigoChangelogAdapter.parse(LLMS_TXT, {
      params: {},
      url: 'https://updates-cn.hapigo.com/llms.txt'
    })

    expect(feed.title).toBe('HapiGo 更新日志')
    expect(feed.items).toHaveLength(4)

    const first = feed.items[0]
    expect(first.guid).toBe('https://updates-cn.hapigo.com/2221.md')
    expect(first.title).toBe('v2.22.1 增加去除背景工具')
    expect(first.link).toBe('https://updates-cn.hapigo.com/2221.md')
    expect(first.author).toBe('HapiGo')
    // 发布日期 2026/7/27 解析为 ISO（+08:00）
    expect(first.pubDate).toBe(new Date('2026-07-27T00:00:00+08:00').toISOString())
    // 正文：引导块与一级标题剔除，h3/列表/内联 HTML 保留
    expect(first.contentComplete).toBe(true)
    expect(first.content).not.toContain('For the complete documentation index')
    expect(first.content).not.toContain('<h1>')
    expect(first.content).toContain('<h3>🔥 新增功能</h3>')
    expect(first.content).toContain('<li>新增截图去除背景</li>')
    expect(first.content).toContain('<li>钉图至桌面增加边框设置</li>')
    // /files/... 图片不可用（GitBook 文件页 307→404），空 figcaption 的 figure 整体剥离
    expect(first.content).not.toContain('<figure>')
    expect(first.content).not.toContain('<img')
    expect(first.content).not.toContain('files/90eiKUe3vPZ78fRAFYFv')
    // 转义字符还原（WPS\&Excel → WPS&Excel）
    expect(first.content).toContain('WPS&Excel')
    // 摘要取前 3 个列表项
    expect(first.summary).toContain('新增截图去除背景')

    // 日期缺省的条目（2026/4/23 那条不带日期文本）pubDate 缺省
    expect(feed.items[3].pubDate).toBeUndefined()
  })

  it('只收录前 10 条，超出部分不抓详情', async () => {
    const many = Array.from(
      { length: 12 },
      (_, i) =>
        `- [v2.0.${i} 更新](https://updates-cn.hapigo.com/history/v20${i}.md): 发布于：2026/1/${i + 1}`
    ).join('\n')
    const feed = await hapigoChangelogAdapter.parse(many, {
      params: {},
      url: 'https://updates-cn.hapigo.com/llms.txt'
    })
    expect(feed.items).toHaveLength(10)
    expect(feed.items[0].guid).toContain('v200')
    expect(feed.items[9].guid).toContain('v209')
  })

  it('带 figcaption 文字的 figure 剥离 img 后保留说明文字', async () => {
    // 并发抓取下按 URL 区分返回（2221.md 用带说明文字的详情页，其余用默认）
    vi.mocked(fetchWithTimeout).mockImplementation(
      async (url: string) =>
        ({
          ok: true,
          text: async () =>
            String(url).includes('2221.md')
              ? '# v2.17.0 新增列表转成顺序粘贴\n\n' +
                '<figure><img src="/files/lpN5h6d3lOdwYoFe6szr" alt="">' +
                '<figcaption><p>将数据列表转成顺序粘贴</p></figcaption></figure>\n\n' +
                '* 新增功能'
              : DETAIL_MD
        }) as Response
    )
    const feed = await hapigoChangelogAdapter.parse(LLMS_TXT, {
      params: {},
      url: 'https://updates-cn.hapigo.com/llms.txt'
    })
    const content = feed.items[0].content ?? ''
    expect(content).not.toContain('<figure>')
    expect(content).not.toContain('<img')
    expect(content).toContain('<p>将数据列表转成顺序粘贴</p>')
  })

  it('详情页抓取失败时正文不落兜底，摘要回退为版本标题', async () => {
    // 并发抓取下按 URL 区分返回：2221.md（首条）返回失败，其余走默认
    vi.mocked(fetchWithTimeout).mockImplementation(
      async (url: string) =>
        (String(url).includes('2221.md')
          ? { ok: false }
          : { ok: true, text: async () => DETAIL_MD }) as Response
    )
    const feed = await hapigoChangelogAdapter.parse(LLMS_TXT, {
      params: {},
      url: 'https://updates-cn.hapigo.com/llms.txt'
    })
    expect(feed.items[0].content).toBeUndefined()
    expect(feed.items[0].contentComplete).toBe(false)
    expect(feed.items[0].summary).toBe('v2.22.1 增加去除背景工具')
    // 其余条目不受影响
    expect(feed.items[1].contentComplete).toBe(true)
  })

  it('llms.txt 无陈列条目时抛友好错误（不静默入库空订阅）', async () => {
    await expect(
      hapigoChangelogAdapter.parse('<html>验证页面</html>', {
        params: {},
        url: 'https://updates-cn.hapigo.com/llms.txt'
      })
    ).rejects.toThrow('HapiGo 更新日志来源返回异常')
  })
})
