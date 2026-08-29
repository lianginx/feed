import { registerAdapter } from '@main/services/routes/core/registry'
import { v2exAdapter } from './v2ex'
import { bilibiliUserArticle, bilibiliUserVideo } from './bilibili'
import { telegramChannelAdapter } from './telegram'
import { hapigoChangelogAdapter } from './hapigo'
import { markodenicNewsletterAdapter } from './markodenic'
import { githubRepoReleases, githubTrending } from './github'
import { juejinUserPosts, juejinHot } from './juejin'
import { zhihuHotAdapter } from './zhihu'

/**
 * 全部内置适配器。
 * 数组顺序即添加订阅窗口的展示顺序（按知名度/常用度），新增站点插到合适位置。
 */
const adapters = [
  bilibiliUserArticle,
  bilibiliUserVideo,
  zhihuHotAdapter,
  v2exAdapter,
  juejinHot,
  juejinUserPosts,
  githubTrending,
  githubRepoReleases,
  telegramChannelAdapter,
  hapigoChangelogAdapter,
  markodenicNewsletterAdapter
]

for (const adapter of adapters) {
  registerAdapter(adapter)
}

export { adapters }
