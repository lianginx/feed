import { ipcMain, nativeTheme, BrowserWindow } from 'electron'
import { getSettings, updateSettings, type AppSettings } from '../config'
import { getMainWindow } from '../app/window'
import { startScheduler } from '../services/timer'
import { refreshAutoCheckTimer } from '../services/updater'
import { applyAutoLaunch } from '../services/autoLaunch'
import { loginToSite } from '../services/siteLogin'
import { getCacheStats, clearCache } from '../services/cache'
import { applyProxySettings } from '../services/proxy'
import { success, error } from './util'

export function registerSettingsHandlers(): void {
  ipcMain.handle('cache:stats', async () => {
    try {
      return success(getCacheStats())
    } catch (e) {
      return error((e as Error).message)
    }
  })

  // 清理本地缓存（全部命名空间；favicon 内容寻址，缺失时会按源自动重建）
  ipcMain.handle('cache:clear', async () => {
    try {
      return success({ clearedBytes: clearCache() })
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle('config:get', async () => {
    try {
      return success(getSettings())
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle(
    'settings:loginSite',
    async (_event, input: { domain: string; loginUrl: string; loginCookieNames?: string[] }) => {
      try {
        const cookieMap = await loginToSite(
          input.loginUrl,
          input.domain,
          input.loginCookieNames ?? []
        )
        if (!cookieMap) {
          return success({ cancelled: true })
        }
        const cookieStr = Object.entries(cookieMap)
          .map(([k, v]) => `${k}=${v}`)
          .join('; ')
        const key = input.domain.replace(/^\./, '')
        const settings = getSettings()
        updateSettings({ siteCookies: { ...(settings.siteCookies ?? {}), [key]: cookieStr } })
        return success({ domain: key, cookie: cookieStr })
      } catch (e) {
        return error((e as Error).message)
      }
    }
  )

  ipcMain.handle('config:update', async (_event, settings: Partial<AppSettings>) => {
    try {
      const updated = updateSettings(settings)
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
      if (settings.updateInterval !== undefined) {
        startScheduler()
      }
      if (settings.autoCheckUpdate !== undefined || settings.updateCheckInterval !== undefined) {
        refreshAutoCheckTimer()
      }
      if (settings.autoLaunch !== undefined || settings.launchHidden !== undefined) {
        const { autoLaunch, launchHidden } = getSettings()
        void applyAutoLaunch(autoLaunch, launchHidden)
      }
      if (settings.proxy !== undefined) {
        void applyProxySettings(getSettings())
      }
      // 通知主窗口重新加载配置（如主题变化即时生效）
      getMainWindow()?.webContents.send('config:changed')
      return success(updated)
    } catch (e) {
      return error((e as Error).message)
    }
  })
}
