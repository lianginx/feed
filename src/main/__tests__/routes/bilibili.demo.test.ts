import { describe, it, expect } from 'vitest'
import { runAdapter } from '../../services/routes/core/runner'
import { bilibiliUserArticle } from '../../services/routes/adapters/bilibili'

/**
 * B 站专栏适配器联网 Demo（需网络）。
 * 验证基础层全链路：runner → http fetcher（含 Referer headers）→ parse。
 */
describe('B 站专栏适配器联网 demo', () => {
  it('runAdapter 抓取 UP 主专栏', async () => {
    const { adapterId, url, feed } = await runAdapter(bilibiliUserArticle, { uid: '928915' })

    expect(adapterId).toBe('bilibili-user-article')
    expect(url).toContain('host_mid=928915')
    expect(feed.items.length).toBeGreaterThan(0)

    console.log(`\n=== ${feed.title}（共 ${feed.items.length} 条） ===`)
    for (const item of feed.items.slice(0, 5)) {
      console.log(`- ${item.title}`)
      console.log(`  ${item.link}`)
    }
  }, 30_000)
})
