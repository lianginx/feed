import { BrowserWindow } from 'electron'

export interface BrowserFetchOptions {
  /** 注入的登录态 Cookie（name → value） */
  cookies?: Record<string, string>
  /** Cookie 作用域；必须显式覆盖所有子域，如 '.bilibili.com'（否则数据接口收不到） */
  cookieDomain?: string
  /** 等该选择器出现后再提取（可选，SPA 异步渲染用） */
  waitForSelector?: string
  /** 渲染等待上限（毫秒） */
  timeoutMs?: number
}

export interface BrowserFetchResult {
  html: string
  title: string
}

const DEFAULT_TIMEOUT_MS = 25_000

/**
 * 用隐藏 webContents（Chromium 渲染）抓取页面，返回渲染后的 HTML。
 *
 * 价值：真实执行页面 JS，自动生成 wbi 签名 / 鼠标轨迹等反爬参数，
 *       解决纯 HTTP 被签名 / 风控拦截的站点（如 B 站视频列表）。
 *
 * 安全篇约束：sandbox / contextIsolation=true、nodeIntegration=false、webSecurity=true；
 *           抓取内容只当纯数据返回，调用方负责解析，绝不渲染进主窗口、绝不 eval。
 * 性能篇约束：函数本身不持有窗口（用后即毁）；并发控制 / 限频由调用方（runner 上层）负责。
 */
export async function fetchBrowserPage(
  url: string,
  options: BrowserFetchOptions = {}
): Promise<BrowserFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  try {
    // 注入登录态 Cookie（domain 显式覆盖所有子域，否则 api.* 收不到）
    if (options.cookies && options.cookieDomain) {
      const host = options.cookieDomain.replace(/^\./, '')
      for (const [name, value] of Object.entries(options.cookies)) {
        await win.webContents.session.cookies.set({
          url: `https://${host}`,
          name,
          value,
          domain: options.cookieDomain,
          httpOnly: true
        })
      }
    }

    win.loadURL(url).catch(() => {
      // 加载错误在轮询兜底中体现（不阻塞）
    })

    // 轮询等待渲染完成（不依赖 loadURL resolve，避免 SPA 持续加载挂起）
    const waitFor = options.waitForSelector
      ? `!!document.querySelector(${JSON.stringify(options.waitForSelector)})`
      : 'true'
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const r = await win.webContents
        .executeJavaScript(
          `(() => {
            const el = document.documentElement
            return { title: document.title, readyState: document.readyState, html: el ? el.outerHTML : '' }
          })()`
        )
        .catch(() => null)
      const found = r ? await win.webContents.executeJavaScript(waitFor).catch(() => false) : false
      if (r && r.readyState === 'complete' && r.html && found) {
        return { html: r.html, title: r.title }
      }
      await new Promise((res) => setTimeout(res, 400))
    }

    // 超时兜底：返回当前已渲染内容（可能不完整）
    const r = await win.webContents
      .executeJavaScript(
        `(() => {
          const el = document.documentElement
          return { title: document.title, html: el ? el.outerHTML : '' }
        })()`
      )
      .catch(() => null)
    if (r && r.html) {
      return { html: r.html, title: r.title }
    }
    throw new Error('浏览器渲染超时')
  } finally {
    win.destroy()
  }
}
