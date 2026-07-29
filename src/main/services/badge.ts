import { app, Tray } from 'electron'
import { getConnection } from '../database/connection'

let trayRef: Tray | null = null
let badgeTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 设置托盘引用（由 index.ts 在创建托盘后调用）。
 */
export function setTrayRef(tray: Tray | null): void {
  trayRef = tray
}

/**
 * 带防抖的徽标刷新——多次连续调用只执行一次 DB 查询 + 界面更新。
 * 适用于循环刷新场景（如调度器批量刷新所有订阅源）。
 */
export function scheduleBadgeUpdate(): void {
  if (badgeTimer) clearTimeout(badgeTimer)
  badgeTimer = setTimeout(() => {
    badgeTimer = null
    try {
      const db = getConnection()
      const row = db.prepare('SELECT COUNT(*) AS count FROM articles WHERE is_read = 0').get() as {
        count: number
      }
      updateBadge(row.count)
    } catch {
      // 防抖刷新失败不影响主流程
    }
  }, 300)
}

/**
 * 更新所有系统徽标（Dock + 菜单栏图标）。
 */
function updateBadge(count: number): void {
  // macOS Dock 徽标
  if (process.platform === 'darwin') {
    app.dock?.setBadge(count > 0 ? String(count) : '')
  }

  // macOS 菜单栏图标标题（显示在图标旁边）
  if (trayRef && process.platform === 'darwin') {
    trayRef.setTitle(count > 0 ? String(count) : '')
    trayRef.setToolTip(count > 0 ? `Feed - ${count} 条未读` : 'Feed')
  }
}
