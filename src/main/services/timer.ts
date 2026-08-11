import { envBool, isEnvConfigured } from '@main/env'
import { getSettings } from '@main/config'
import { refreshAllFeeds } from './refresher'
import { runSync } from './sync'

let timer: ReturnType<typeof setInterval> | null = null

/**
 * 启动定时刷新——立即执行一次，然后按间隔重复。
 * 是否启用完全由 FEED_ENABLE_SCHEDULER 决定（.env 中 MAIN_VITE_ENABLE_SCHEDULER）：
 * 开发默认 0 关闭（避免频繁重启对源站产生压力，刷新走手动/菜单触发），
 * 生产默认 1 开启；命令行环境变量可覆盖。
 */
export function startScheduler(): void {
  stopScheduler()

  if (!envBool('FEED_ENABLE_SCHEDULER', import.meta.env.MAIN_VITE_ENABLE_SCHEDULER)) {
    if (!isEnvConfigured('FEED_ENABLE_SCHEDULER', import.meta.env.MAIN_VITE_ENABLE_SCHEDULER)) {
      console.warn(
        '[timer] 未配置 MAIN_VITE_ENABLE_SCHEDULER，定时刷新已禁用；若为生产构建请确认 .env.production 存在'
      )
    }
    return
  }

  const settings = getSettings()
  const intervalMs = settings.updateInterval * 60 * 1000

  // 立即刷新一次，避免首次启动后要等一个间隔
  refreshAllFeeds()

  void runSync()

  // 间隔为 0 表示关闭自动刷新，仅手动触发
  if (intervalMs <= 0) return

  timer = setInterval(() => {
    refreshAllFeeds()
    void runSync()
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
