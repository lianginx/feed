import { ipcMain, nativeTheme, BrowserWindow } from 'electron'
import { getSettings, updateSettings, type AppSettings } from '../config'
import { getMainWindow } from '../app/window'
import { startScheduler } from '../services/timer'
import { refreshAutoCheckTimer } from '../services/updater'
import { success, error } from './util'

export function registerSettingsHandlers(): void {
  ipcMain.handle('config:get', async () => {
    try {
      return success(getSettings())
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle('config:update', async (_event, settings: Partial<AppSettings>) => {
    try {
      const updated = updateSettings(settings)
      // 主题变更：同步到原生窗口
      if (settings.theme !== undefined) {
        nativeTheme.themeSource = settings.theme
        const wins = BrowserWindow.getAllWindows()
        if (wins.length > 0) {
          const isDark =
            settings.theme === 'dark' ||
            (settings.theme === 'system' && nativeTheme.shouldUseDarkColors)
          wins[0].setBackgroundColor(isDark ? '#0a0a0a' : '#fafafa')
        }
      }
      // 如果更新了刷新间隔，重启调度器
      if (settings.updateInterval !== undefined) {
        startScheduler()
      }
      // 如果更新了自动检查更新相关设置，重建定时器
      if (settings.autoCheckUpdate !== undefined || settings.updateCheckInterval !== undefined) {
        refreshAutoCheckTimer()
      }
      // 通知主窗口重新加载配置（如主题变化即时生效）
      getMainWindow()?.webContents.send('config:changed')
      return success(updated)
    } catch (e) {
      return error((e as Error).message)
    }
  })
}
