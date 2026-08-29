import { fetchWithTimeout, BROWSER_USER_AGENT } from '@main/services/http'
import type { ParsedArticle, ParsedFeed } from '@main/services/rss'
import type { AdapterParseContext, FeedAdapter } from '@main/services/routes/core/types'

/** GitHub Releases 接口返回的条目结构（按需声明字段） */
interface GithubRelease {
  id?: number
  tag_name?: string
  name?: string | null
  body?: string | null
  html_url?: string
  published_at?: string | null
  draft?: boolean
  prerelease?: boolean
}

interface GithubApiError {
  message?: string
}

/** 只做 HTML 转义 + 换行转 <br>：完整 Markdown 渲染由后续内容管道处理 */
function markdownToHtml(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return escaped.replace(/\r?\n/g, '<br>')
}

function parseRepo(params: Record<string, string>): string {
  const repo = (params.repo ?? '')
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
  return repo.replace(/^\/+|\/+$/g, '')
}

/**
 * GitHub 仓库 Releases。
 * 官方公开 API，纯 HTTP、无需登录；匿名限额 60 次/小时/IP，超限返回 403。
 */
export const githubRepoReleases: FeedAdapter = {
  id: 'github-repo-releases',
  name: 'GitHub Releases',
  description: '追踪开源仓库的版本发布（官方 API）',
  domains: ['github.com'],
  params: [
    {
      key: 'repo',
      label: '仓库',
      required: true,
      placeholder: '如 lianginx/feed',
      description: 'owner/repo 格式，也支持直接粘贴仓库地址'
    }
  ],
  needsBrowser: false,
  siteUrl: (params) => `https://github.com/${parseRepo(params)}/releases`,
  headers: { Accept: 'application/vnd.github+json' },
  buildUrl: (params) =>
    `https://api.github.com/repos/${parseRepo(params)
      .split('/')
      .map(encodeURIComponent)
      .join('/')}/releases?per_page=20`,
  async fetchMeta(params) {
    const repo = parseRepo(params)
    if (!repo) return {}
    try {
      const res = await fetchWithTimeout(`https://api.github.com/repos/${repo}`, {
        headers: { 'User-Agent': BROWSER_USER_AGENT, Accept: 'application/vnd.github+json' }
      })
      if (!res.ok) return {}
      const json = (await res.json()) as {
        full_name?: string
        description?: string | null
        owner?: { avatar_url?: string }
      }
      return {
        title: json.full_name ? `${json.full_name} 的 GitHub Releases` : undefined,
        description: json.description || undefined,
        imageUrl: json.owner?.avatar_url || undefined
      }
    } catch {
      return {}
    }
  },
  async parse(raw: string, ctx: AdapterParseContext): Promise<ParsedFeed> {
    let json: GithubRelease[] | GithubApiError
    try {
      json = JSON.parse(raw) as GithubRelease[] | GithubApiError
    } catch {
      throw new Error('GitHub 接口返回异常')
    }
    if (!Array.isArray(json)) {
      const message = (json as GithubApiError).message
      throw new Error(
        message
          ? `GitHub 接口异常：${message}（匿名请求限额 60 次/小时，可稍后重试）`
          : 'GitHub 接口返回异常'
      )
    }
    const repo = parseRepo(ctx.params)
    const items: ParsedArticle[] = []
    for (const rel of json) {
      // draft 无 published_at 且未对外发布，跳过
      if (rel.draft) continue
      const tag = (rel.tag_name ?? '').trim()
      const url = rel.html_url
      if (!tag && !url) continue
      // name 与 tag 相同（或缺失）时不重复拼接
      const name = (rel.name ?? '').trim()
      const label = name && name !== tag ? name : ''
      const tagSuffix = rel.prerelease ? '（预发布）' : ''
      const body = (rel.body ?? '').trim()
      items.push({
        guid: `github-release-${rel.id ?? `${repo}-${tag}`}`,
        title: [`${tag}${tagSuffix}`, label].filter(Boolean).join(' '),
        link: url,
        content: body ? markdownToHtml(body) : undefined,
        contentComplete: Boolean(body),
        summary: body ? body.slice(0, 200) : undefined,
        contentSnippet: body ? body.slice(0, 200) : undefined,
        pubDate: rel.published_at ?? undefined
      })
    }
    return {
      title: `${repo} 的 GitHub Releases`,
      description: 'GitHub 仓库版本发布',
      link: `https://github.com/${repo}/releases`,
      items
    }
  }
}
