import { BrowserWindow } from 'electron'

export interface BrowserFetchOptions {
  /** 注入的登录态 Cookie（name → value） */
  cookies?: Record<string, string>
  /** Cookie 作用域；必须显式覆盖所有子域，如 '.bilibili.com'（否则数据接口收不到） */
  cookieDomain?: string
  /** 等该选择器出现后再提取（可选，SPA 异步渲染用） */
  waitForSelector?: string
  /**
   * 页面内提取脚本（可选）：在渲染进程执行的一段 JS，返回「可 JSON 序列化」的值。
   * 返回渲染后整页 HTML 之前先按需提取结构化数据（如 querySelectorAll 收集的条目数组），
   * 主进程无需再 cheerio 解析整页大 HTML（避免深度递归导致 SIGSEGV），更省内存。
   */
  extract?: string
  /** 渲染等待上限（毫秒） */
  timeoutMs?: number
}

export interface BrowserFetchResult {
  html: string
  title: string
  /** extract 脚本提取结果的 JSON 字符串（无 extract 或提取失败时为 undefined） */
  data?: string
}

const DEFAULT_TIMEOUT_MS = 25_000

/**
 * 调试开关：开发模式（electron-vite dev / preview，未打包）默认显示抓取窗口并打印渲染进度；
 * 生产打包默认隐藏。也可用 FEED_DEBUG_FETCH_WINDOW=1 强制开启。
 * 用 process.defaultApp（Electron 是否以源码运行）而非 @electron-toolkit/utils 的 is.dev，
 * 因为后者顶层访问 electron.app，会在 vitest 的 node 环境（electron 非 app 对象）导入时崩溃。
 */
const SHOW_FETCH_WINDOW =
  (process as NodeJS.Process & { defaultApp?: boolean }).defaultApp === true ||
  process.env.FEED_DEBUG_FETCH_WINDOW === '1'

/** 仅调试模式下输出抓取进度日志 */
function debugFetchLog(...args: unknown[]): void {
  if (SHOW_FETCH_WINDOW) {
    console.log('[fetchBrowserPage]', ...args)
  }
}

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
  debugFetchLog('开始抓取:', url)
  const win = new BrowserWindow({
    show: SHOW_FETCH_WINDOW,
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
      debugFetchLog(
        `readyState=${r?.readyState ?? '?'} htmlLen=${r?.html?.length ?? 0} found=${found}`
      )
      if (r && r.readyState === 'complete' && r.html && found) {
        const data = await runExtract(win, options.extract)
        debugFetchLog('渲染完成, 标题:', r.title, 'htmlLen:', r.html.length)
        return { html: r.html, title: r.title, data }
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
      const data = await runExtract(win, options.extract)
      debugFetchLog('超时兜底返回, 标题:', r.title, 'htmlLen:', r.html.length)
      return { html: r.html, title: r.title, data }
    }
    throw new Error('浏览器渲染超时')
  } finally {
    win.destroy()
  }
}

/** 执行页面内提取脚本：结果序列化为 JSON 字符串；执行失败 / 返回空则 undefined */
async function runExtract(win: BrowserWindow, extract?: string): Promise<string | undefined> {
  if (!extract) return undefined
  const value = await win.webContents.executeJavaScript(extract).catch(() => undefined)
  if (value === undefined || value === null) return undefined
  return JSON.stringify(value)
}
