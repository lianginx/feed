import { app } from 'electron'
import { mkdir, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { getSettings } from '@main/config'

/**
 * Linux 下通过 XDG Autostart 实现开机自启的 .desktop 文件名
 * （与产品名一致，位于 ~/.config/autostart/）。
 */
const AUTOSTART_FILE = 'feed.desktop'

/** 支持开机自启的平台 */
const SUPPORTED_PLATFORMS = new Set(['darwin', 'win32', 'linux'])

/**
 * 判断本次启动是否应隐藏主窗口（仅登录自动启动时生效）。
 * - macOS：由系统登录项启动（getLoginItemSettings().wasOpenedAtLogin）才隐藏
 * - Windows/Linux：登录项注册时携带 --hidden 参数，手动启动不会带该参数
 */
export function shouldLaunchHidden(): boolean {
  if (!getSettings().launchHidden) return false
  if (process.platform === 'darwin') {
    return app.getLoginItemSettings().wasOpenedAtLogin
  }
  return process.argv.includes('--hidden')
}

/**
 * 写入/删除 Linux XDG Autostart 配置文件。
 * AppImage 下 process.execPath 是挂载的临时路径（/tmp/.mount_xxx），
 * 必须用 APPIMAGE 环境变量；deb 等其他包直接用 execPath。
 */
async function writeLinuxAutostart(hidden: boolean): Promise<void> {
  const execPath = process.env.APPIMAGE || process.execPath
  const args = hidden ? ' --hidden' : ''
  const content = [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${app.getName()}`,
    `Exec="${execPath}"${args}`,
    'X-GNOME-Autostart-enabled=true'
  ].join('\n')

  const autostartDir = join(app.getPath('appData'), 'autostart')
  await mkdir(autostartDir, { recursive: true })
  await writeFile(join(autostartDir, AUTOSTART_FILE), content, 'utf8')
}

async function removeLinuxAutostart(): Promise<void> {
  await unlink(join(app.getPath('appData'), 'autostart', AUTOSTART_FILE)).catch(() => {
    // 文件不存在时忽略
  })
}

/**
 * 应用开机自动启动设置。
 * - darwin/win32：app.setLoginItemSettings（win32 注册时携带 --hidden 标记，
 *   供 shouldLaunchHidden 判断；不传已废弃的 openAsHidden）
 * - linux：写/删 ~/.config/autostart/feed.desktop
 * - 非打包环境或非支持平台：跳过，避免污染开发环境
 */
export async function applyAutoLaunch(enabled: boolean, hidden: boolean): Promise<void> {
  if (!app.isPackaged || !SUPPORTED_PLATFORMS.has(process.platform)) return

  if (process.platform === 'linux') {
    if (enabled) {
      await writeLinuxAutostart(hidden)
    } else {
      await removeLinuxAutostart()
    }
    return
  }

  app.setLoginItemSettings({
    openAtLogin: enabled,
    args: hidden ? ['--hidden'] : []
  })
}

/**
 * 启动时按配置注册登录项（幂等）。
 * 仅当 autoLaunch 为 true 时注册；不主动移除，
 * 避免覆盖用户在系统设置中的手动操作（方案 A）。
 */
export function initAutoLaunch(): void {
  if (!app.isPackaged || !SUPPORTED_PLATFORMS.has(process.platform)) return
  const { autoLaunch, launchHidden } = getSettings()
  if (!autoLaunch) return
  void applyAutoLaunch(true, launchHidden)
}
