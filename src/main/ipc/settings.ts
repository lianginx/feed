import { ipcMain, nativeTheme } from 'electron'
import { getSettings, updateSettings, type AppSettings } from '@main/config'
import { cancelDestroyTimer, getMainWindow } from '@main/app/window'
import { startScheduler } from '@main/services/timer'
import { refreshAutoCheckTimer } from '@main/services/updater'
import { applyAutoLaunch } from '@main/services/autoLaunch'
import { loginToSite } from '@main/services/siteLogin'
import { getCacheStats, clearCache } from '@main/services/cache'
import { applyProxySettings } from '@main/services/proxy'
import { success, error } from './util'

export function registerSettingsHandlers(): void {
  ipcMain.handle('cache:stats', async () => {
    try {
      return success(getCacheStats())
    } catch (e) {
      return error((e as Error).message)
    }
  })

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
      if (settings.lowMemoryMode === false) {
        cancelDestroyTimer()
      }
      getMainWindow()?.webContents.send('config:changed')
      return success(updated)
    } catch (e) {
      return error((e as Error).message)
    }
  })
}
