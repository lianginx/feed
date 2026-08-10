/**
 * 首次使用时的默认订阅源。
 *
 * 仅在数据库中的订阅源为空时自动导入一次（见 database/seed.ts），
 * 不会打扰已有数据的用户。这里保持精简，方便后续增删。
 */

export interface DefaultFeed {
  title: string
  url: string
  category: string
  /** 内置路由适配器 ID（可选）；填写后该订阅源走内置路由抓取 */
  adapterId?: string
  /** 内置路由适配器参数 */
  adapterParams?: Record<string, string>
}

/** 默认分类（按展示顺序排列） */
export const DEFAULT_CATEGORIES: string[] = ['科技资讯', '新闻媒体', '博客', '开发技术', '内置路由']

/** 默认订阅源列表 */
export const DEFAULT_FEEDS: DefaultFeed[] = [
  // 科技资讯
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
  { title: 'HelloGitHub', url: 'https://hellogithub.com/rss', category: '开发技术' },
  // 内置路由（展示内置路由功能，无需 RSS 地址也能订阅）
  {
    title: 'V2EX 热帖',
    url: 'https://www.v2ex.com/api/topics/hot.json',
    category: '内置路由',
    adapterId: 'v2ex-hot',
    adapterParams: {}
  },
  {
    title: 'STN 工作室',
    url: 'https://space.bilibili.com/7349/video',
    category: '内置路由',
    adapterId: 'bilibili-user-video',
    adapterParams: { uid: '7349' }
  },
  {
    title: '盗月社食遇记',
    url: 'https://space.bilibili.com/99157282/video',
    category: '内置路由',
    adapterId: 'bilibili-user-video',
    adapterParams: { uid: '99157282' }
  },
  {
    title: '小约翰可汗',
    url: 'https://space.bilibili.com/23947287/video',
    category: '内置路由',
    adapterId: 'bilibili-user-video',
    adapterParams: { uid: '23947287' }
  },
  {
    title: '智能路障',
    url: 'https://space.bilibili.com/79577853/video',
    category: '内置路由',
    adapterId: 'bilibili-user-video',
    adapterParams: { uid: '79577853' }
  }
]
