import { ipcMain, nativeTheme, BrowserWindow } from 'electron'
import { getSettings, updateSettings, type AppSettings } from '../config'
import { getMainWindow } from '../app/window'
import { startScheduler } from '../services/timer'
import { refreshAutoCheckTimer } from '../services/updater'
import { applyAutoLaunch } from '../services/autoLaunch'
import { loginToSite } from '../services/siteLogin'
import { success, error } from './util'

export function registerSettingsHandlers(): void {
  ipcMain.handle('config:get', async () => {
    try {
      return success(getSettings())
    } catch (e) {
      return error((e as Error).message)
    }
  })

  // 用内置浏览器登录站点：弹真实登录窗口，登录成功后自动保存该域 cookie
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
      // 如果更新了开机自动启动相关设置，立即应用登录项注册
      if (settings.autoLaunch !== undefined || settings.launchHidden !== undefined) {
        const { autoLaunch, launchHidden } = getSettings()
        void applyAutoLaunch(autoLaunch, launchHidden)
      }
      // 通知主窗口重新加载配置（如主题变化即时生效）
      getMainWindow()?.webContents.send('config:changed')
      return success(updated)
    } catch (e) {
      return error((e as Error).message)
    }
  })
}
