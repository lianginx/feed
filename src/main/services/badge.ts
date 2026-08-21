import { app, Tray } from 'electron'
import { getConnection } from '@main/database/connection'

let trayRef: Tray | null = null
let badgeTimer: ReturnType<typeof setTimeout> | null = null

export function setTrayRef(tray: Tray | null): void {
  trayRef = tray
}

export function scheduleBadgeUpdate(): void {
  if (badgeTimer) clearTimeout(badgeTimer)
  badgeTimer = setTimeout(() => {
    badgeTimer = null
    try {
      const db = getConnection()
      const row = db
        .prepare('SELECT COUNT(*) AS count FROM articles WHERE is_read = 0')
        .get() as unknown as { count: number }
      updateBadge(row.count)
    } catch {
      void 0
    }
  }, 300)
}

function updateBadge(count: number): void {
  if (process.platform === 'darwin') {
    app.dock?.setBadge(count > 0 ? String(count) : '')
  }

  if (trayRef && process.platform === 'darwin') {
    trayRef.setTitle(count > 0 ? String(count) : '')
    trayRef.setToolTip(count > 0 ? `Feed - ${count} 条未读` : 'Feed')
  }
}
