import { ipcMain, nativeTheme, BrowserWindow } from 'electron'
import { getSettings, updateSettings, type AppSettings } from '../config'
import { startScheduler } from '../services/timer'
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
      return success(updated)
    } catch (e) {
      return error((e as Error).message)
    }
  })
}
