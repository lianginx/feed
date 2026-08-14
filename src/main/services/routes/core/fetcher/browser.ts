import { BrowserWindow } from 'electron'

export interface BrowserFetchOptions {
  cookies?: Record<string, string>
  cookieDomain?: string
  waitForSelector?: string
  extract?: string
  timeoutMs?: number
}

export interface BrowserFetchResult {
  html: string
  title: string
  data?: string
}

const DEFAULT_TIMEOUT_MS = 25_000

const SHOW_FETCH_WINDOW = import.meta.env.MAIN_VITE_DEBUG_FETCH_WINDOW === '1'
const LOG_FETCH_PROGRESS = import.meta.env.MAIN_VITE_DEBUG_FETCH_LOG === '1'

function debugFetchLog(...args: unknown[]): void {
  if (LOG_FETCH_PROGRESS) {
    console.log('[fetchBrowserPage]', ...args)
  }
}

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

    win.loadURL(url).catch(() => {})

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

async function runExtract(win: BrowserWindow, extract?: string): Promise<string | undefined> {
  if (!extract) return undefined
  const value = await win.webContents.executeJavaScript(extract).catch(() => undefined)
  if (value === undefined || value === null) return undefined
  return JSON.stringify(value)
}
