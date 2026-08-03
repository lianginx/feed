import { getSettings } from '../config'
import { refreshAllFeeds } from './refresher'

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

  // 间隔为 0 表示关闭自动刷新，仅手动触发
  if (intervalMs <= 0) return

  timer = setInterval(() => {
    refreshAllFeeds()
  }, intervalMs)
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
