import { BrowserWindow } from 'electron'

const POLL_INTERVAL_MS = 1500
const LOGIN_TIMEOUT_MS = 5 * 60_000

/**
 * 打开真实登录窗口，等待用户完成登录，返回登录后该域名的 cookie（name→value）。
 * 当 loginCookieNames 全部出现（如 B 站 SESSDATA）即视为登录成功；
 * 用户关闭窗口或超时则返回 null（取消）。
 * 安全篇约束：登录窗口同样 sandbox / contextIsolation，抓取内容只当数据存配置。
 */
export async function loginToSite(
  loginUrl: string,
  domain: string,
  loginCookieNames: string[]
): Promise<Record<string, string> | null> {
  const win = new BrowserWindow({
    show: true,
    width: 980,
    height: 680,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  let closed = false
  win.on('closed', () => {
    closed = true
  })
  // 登录页可能 target=_blank 弹新窗：一律拒绝新窗口（保留登录页内部跳转，不能拦 will-navigate）
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  await win.loadURL(loginUrl).catch(() => {
    /* 加载错误时窗口仍显示（可能跳转），轮询会兜底 */
  })

  const host = domain.replace(/^\./, '')
  const deadline = Date.now() + LOGIN_TIMEOUT_MS
  while (!closed && Date.now() < deadline) {
    const cookies = await win.webContents.session.cookies.get({ domain: host }).catch(() => [])
    if (loginCookieNames.every((name) => cookies.some((c) => c.name === name))) {
      const map: Record<string, string> = {}
      for (const c of cookies) {
        if (c.name && c.value) map[c.name] = c.value
      }
      if (!win.isDestroyed()) win.close()
      return map
    }
    await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS))
  }

  if (!win.isDestroyed()) win.close()
  return null
}
