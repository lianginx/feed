import { describe, it, expect } from 'vitest'
import { githubRepoReleases, githubTrending } from '@main/services/routes/adapters/github'
import { resolveAdapterSiteUrl } from '@main/services/routes/core/runner'

/** 模拟 GitHub Releases 接口返回（真实结构子集） */
const RELEASES_FIXTURE = JSON.stringify([
  {
    id: 501,
    tag_name: 'v0.24.0',
    name: '内置路由扩容',
    body: '## 新增\n- 知乎热榜\n- **GitHub Releases**',
    html_url: 'https://github.com/lianginx/feed/releases/tag/v0.24.0',
    published_at: '2026-08-20T10:00:00Z',
    draft: false,
    prerelease: false
  },
  {
    id: 502,
    tag_name: 'v0.24.1-rc.1',
    name: null,
    body: 'rc body',
    html_url: 'https://github.com/lianginx/feed/releases/tag/v0.24.1-rc.1',
    published_at: '2026-08-25T10:00:00Z',
    draft: false,
    prerelease: true
  },
  {
    id: 503,
    tag_name: 'v0.25.0',
    name: '草稿',
    body: 'draft body',
    html_url: 'https://github.com/lianginx/feed/releases/tag/v0.25.0',
    published_at: null,
    draft: true,
    prerelease: false
  }
])

describe('github-repo-releases 适配器', () => {
  it('buildUrl 支持 owner/repo 与粘贴的仓库地址', () => {
    expect(githubRepoReleases.buildUrl({ repo: 'lianginx/feed' })).toBe(
      'https://api.github.com/repos/lianginx/feed/releases?per_page=20'
    )
    expect(githubRepoReleases.buildUrl({ repo: 'https://github.com/lianginx/feed' })).toContain(
      'repos/lianginx/feed/releases'
    )
  })

  it('parse 解析 releases：正文 HTML 转义 + 换行保留，draft 跳过，预发布标注', async () => {
    const feed = await githubRepoReleases.parse(RELEASES_FIXTURE, {
      params: { repo: 'lianginx/feed' },
      url: 'https://api.github.com/repos/lianginx/feed/releases'
    })

    // 草稿被过滤
    expect(feed.items).toHaveLength(2)
    expect(feed.title).toBe('lianginx/feed 的 GitHub Releases')

    const first = feed.items[0]
    expect(first.guid).toBe('github-release-501')
    expect(first.title).toBe('v0.24.0 内置路由扩容')
    expect(first.link).toBe('https://github.com/lianginx/feed/releases/tag/v0.24.0')
    expect(first.pubDate).toBe('2026-08-20T10:00:00Z')
    // 正文 HTML 转义（防注入）且 \n 转 <br>
    expect(first.content).toContain('- **GitHub Releases**')
    expect(first.content).not.toContain('<p>')
    expect(first.content).toContain('<br>')
    expect(first.contentComplete).toBe(true)

    // 预发布标题带标注
    expect(feed.items[1].title).toBe('v0.24.1-rc.1（预发布）')
  })

  it('parse 接口返回错误对象（限流/404 message）时抛友好错误', async () => {
    await expect(
      githubRepoReleases.parse(
        JSON.stringify({ message: 'API rate limit exceeded', documentation_url: 'x' }),
        { params: { repo: 'a/b' }, url: 'https://api.github.com/repos/a/b/releases' }
      )
    ).rejects.toThrow('API rate limit exceeded')
  })

  it('parse 非 JSON 返回时抛友好错误', async () => {
    await expect(
      githubRepoReleases.parse('<html>blocked</html>', {
        params: { repo: 'a/b' },
        url: 'https://api.github.com/repos/a/b/releases'
      })
    ).rejects.toThrow('GitHub 接口返回异常')
  })
})

/** 模拟 trending 页渲染后的 HTML（article.Box-row 结构） */
const TRENDING_FIXTURE = `<html><body>
  <article class="Box-row">
    <h2 class="h3"><a href="/owner/repo-one">owner / repo-one</a></h2>
    <p class="col-9">A cool project</p>
    <a class="Link--muted" href="/owner/repo-one/stargazers"><svg class="octicon-star"></svg> 1,234</a>
    <span class="float-sm-right"><svg class="octicon-star"></svg> 56 stars today</span>
  </article>
  <article class="Box-row">
    <h2 class="h3"><a href="/owner/repo-two">owner / repo-two</a></h2>
    <p class="col-9">Another project</p>
  </article>
  <article class="Box-row">
    <h2 class="h3"><a href="/owner/repo-one">owner / repo-one</a></h2>
    <p class="col-9">重复项</p>
  </article>
</body></html>`

describe('github-trending 适配器', () => {
  it('buildUrl 按语言与周期构建', () => {
    expect(githubTrending.buildUrl({ language: 'rust', since: 'weekly' })).toBe(
      'https://github.com/trending/rust?since=weekly'
    )
    // 缺省周期为 daily，语言为全部
    expect(githubTrending.buildUrl({})).toBe('https://github.com/trending/?since=daily')
    // trending 页是人看的 HTML 页面，站点首页与抓取地址同源（按参数）
    expect(resolveAdapterSiteUrl(githubTrending, { language: 'rust', since: 'weekly' })).toBe(
      githubTrending.buildUrl({ language: 'rust', since: 'weekly' })
    )
  })

  it('parse 解析 trending 卡片：去重、star 数与周期新增进摘要', async () => {
    const feed = await githubTrending.parse(TRENDING_FIXTURE, {
      params: { language: 'JavaScript', since: 'daily' },
      url: 'https://github.com/trending/JavaScript?since=daily'
    })

    // 语言、周期在名称前，平台名收尾
    expect(feed.title).toBe('JavaScript · 今日 · GitHub Trending')
    expect(feed.items).toHaveLength(2)

    const first = feed.items[0]
    expect(first.guid).toBe('github-trending-owner/repo-one')
    expect(first.title).toBe('owner/repo-one')
    expect(first.link).toBe('https://github.com/owner/repo-one')
    // star 数去千分位逗号，描述与新增 star 拼接摘要
    expect(first.summary).toContain('A cool project')
    expect(first.summary).toContain('★ 1234')
    expect(first.summary).toContain('56 stars today')
    expect(first.contentComplete).toBe(true)

    // 无 star/新增信息的卡片摘要只有描述
    expect(feed.items[1].summary).toBe('Another project')
  })

  it('parse 无语言时名称不带语言前缀', async () => {
    const feed = await githubTrending.parse('<html><body></body></html>', {
      params: { language: '', since: 'weekly' },
      url: 'https://github.com/trending/?since=weekly'
    })
    expect(feed.title).toBe('本周 · GitHub Trending')
  })

  it('parse 无 trending 卡片时返回空列表（不抛错，页面可访问即视为成功）', async () => {
    const feed = await githubTrending.parse('<html><body></body></html>', {
      params: {},
      url: 'https://github.com/trending'
    })
    expect(feed.items).toHaveLength(0)
  })
})
