/**
 * 首次使用时的默认订阅源。
 *
 * 仅在数据库中的订阅源为空时自动导入一次（见 migrations.ts version 5），
 * 不会打扰已有数据的用户。这里保持精简，方便后续增删。
 */

export interface DefaultFeed {
  title: string
  url: string
  category: string
}

/** 默认分类（按展示顺序排列） */
export const DEFAULT_CATEGORIES: string[] = ['科技资讯', '新闻媒体', '博客', '开发技术']

/** 默认订阅源列表 */
export const DEFAULT_FEEDS: DefaultFeed[] = [
  // 科技资讯
  { title: '36氪', url: 'https://36kr.com/feed', category: '科技资讯' },
  { title: 'IT之家', url: 'https://www.ithome.com/rss/', category: '科技资讯' },
  { title: '少数派', url: 'https://sspai.com/feed', category: '科技资讯' },
  { title: '小众软件', url: 'https://feed.appinn.com/', category: '科技资讯' },
  // 新闻媒体
  {
    title: '中新网·即时新闻',
    url: 'https://www.chinanews.com.cn/rss/scroll-news.xml',
    category: '新闻媒体'
  },
  {
    title: '新浪·国际新闻',
    url: 'https://rss.sina.com.cn/news/world/focus15.xml',
    category: '新闻媒体'
  },
  { title: '爱范儿', url: 'https://www.ifanr.com/feed', category: '新闻媒体' },
  // 博客
  { title: "Liang's BLog", url: 'https://in-x.cc/rss.xml', category: '博客' },
  { title: '阮一峰的网络日志', url: 'https://www.ruanyifeng.com/blog/atom.xml', category: '博客' },
  { title: 'Adam Hutchinson', url: 'http://adjohu.com/rss.xml', category: '博客' },
  { title: 'Jakub Krehel', url: 'http://jakub.kr/api/rss', category: '博客' },
  // 开发技术
  { title: 'Hacker News', url: 'https://news.ycombinator.com/rss', category: '开发技术' },
  { title: 'HelloGitHub', url: 'https://hellogithub.com/rss', category: '开发技术' }
]
