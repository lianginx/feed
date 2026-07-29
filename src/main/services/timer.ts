import { getSettings } from '../config'
import { getConnection } from '../database/connection'
import { refreshSingleFeed } from './refresher'

let timer: ReturnType<typeof setInterval> | null = null

/**
 * 启动定时刷新——立即执行一次，然后按间隔重复。
 */
export function startScheduler(): void {
  stopScheduler()

  const settings = getSettings()
  const intervalMs = settings.updateInterval * 60 * 1000

  // 立即刷新一次，避免首次启动后要等一个间隔
  refreshAllFeeds()

  timer = setInterval(refreshAllFeeds, intervalMs)
}

/**
 * 停止定时刷新。
 */
export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

/**
 * 刷新所有订阅源（并发执行，通知逻辑在 refreshSingleFeed 内部）。
 */
async function refreshAllFeeds(): Promise<void> {
  const db = getConnection()
  const feeds = db.prepare('SELECT id FROM feeds').all() as { id: number }[]

  await Promise.allSettled(feeds.map((feed) => refreshSingleFeed(feed.id)))
}
