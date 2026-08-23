import { app } from 'electron'
import { getMainWindow, isQuitting } from './window'

function isMainWindowVisible(): boolean {
  const win = getMainWindow()
  return !!win && !win.isDestroyed() && win.isVisible()
}

export async function ensureDockVisible(): Promise<void> {
  if (process.platform !== 'darwin') return
  const dock = app.dock
  if (!dock || dock.isVisible()) return
  try {
    await dock.show()
  } catch {
    void 0
  }
}

export function syncDockVisibility(): void {
  if (process.platform !== 'darwin') return
  const dock = app.dock
  if (!dock || isQuitting()) return

  if (isMainWindowVisible()) {
    if (!dock.isVisible()) dock.show().catch(() => {})
    return
  }

  if (dock.isVisible()) dock.hide()
}
