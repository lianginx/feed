import { envBool, isEnvConfigured } from '@main/env'
import { getSettings } from '@main/config'
import { refreshAllFeeds } from './refresher'
import { runSync } from './sync'

let timer: ReturnType<typeof setInterval> | null = null

export function startScheduler(): void {
  stopScheduler()

  if (!envBool(import.meta.env.MAIN_VITE_ENABLE_SCHEDULER)) {
    if (!isEnvConfigured(import.meta.env.MAIN_VITE_ENABLE_SCHEDULER)) {
      console.warn(
        '[timer] 未配置 MAIN_VITE_ENABLE_SCHEDULER，定时刷新已禁用；若为生产构建请确认 .env.production 存在'
      )
    }
    return
  }

  const settings = getSettings()
  const intervalMs = settings.updateInterval * 60 * 1000

  refreshAllFeeds()

  void runSync()

  if (intervalMs <= 0) return

  timer = setInterval(() => {
    refreshAllFeeds()
    void runSync()
  }, intervalMs)
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
