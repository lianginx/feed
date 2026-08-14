import { app, ipcMain } from 'electron'

export function setupIpcLogger(): void {
  const level = parseLevel(import.meta.env.MAIN_VITE_IPC_LOG)
  if (level === null) return

  const detailChannels = new Set(
    (import.meta.env.MAIN_VITE_IPC_LOG_DETAIL ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )

  const debugChannels = new Set([
    'articles:list',
    'articles:get',
    'articles:toggleRead',
    'articles:toggleStar',
    'articles:getUnreadCounts',
    'feeds:list',
    'feeds:refreshFavicon',
    'categories:list',
    'config:get',
    'cache:stats'
  ])

  app.on('web-contents-created', (_event, contents) => {
    contents.on('ipc-message', (_event, channel, ...args) => {
      if (shouldLog(channel, level, debugChannels)) {
        console.log(`[IPC] > ${channel}`, summarizeList(args))
      }
    })
    contents.on('ipc-message-sync', (_event, channel, ...args) => {
      if (shouldLog(channel, level, debugChannels)) {
        console.log(`[IPC] > ${channel} (sync)`, summarizeList(args))
      }
    })
  })

  const origHandle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = ((channel, listener) => {
    log('debug', level, `[IPC] registered handler: ${channel}`)
    return origHandle(channel, async (event, ...args) => {
      try {
        const result = await listener(event, ...args)
        const isDetail = detailChannels.has(channel)
        if (isDetail || shouldLog(channel, level, debugChannels)) {
          if (isDetail) {
            console.log(`[IPC] >> ${channel}`, ...args)
            console.log(`[IPC] << ${channel}`, result)
          } else {
            console.log(`[IPC] ~ ${channel}`, summarizeList(args), '=>', summarize(result))
          }
        }
        return result
      } catch (err) {
        console.error(`[IPC] !! ${channel}`, err)
        if (args.length > 0) console.error('    args:', ...args)
        throw err
      }
    })
  }) as typeof ipcMain.handle
}

type LogLevel = 'error' | 'info' | 'debug'

function parseLevel(value: string | undefined): number | null {
  switch (value?.trim().toLowerCase()) {
    case 'error':
      return 0
    case 'debug':
      return 2
    case 'info':
      return 1
    default:
      return null
  }
}

function shouldLog(channel: string, level: number, debugChannels: Set<string>): boolean {
  const channelLevel = debugChannels.has(channel) ? 2 : 1
  return level >= channelLevel
}

function log(channelLevel: LogLevel, level: number, message: string): void {
  const target = parseLevel(channelLevel)
  if (target !== null && level >= target) console.log(message)
}

const MAX_STRING = 200
const MAX_KEYS = 5

function summarizeList(args: unknown[]): unknown[] {
  return args.map((arg) => summarize(arg))
}

function summarize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    if (value.length <= MAX_STRING) return value
    return `${value.slice(0, MAX_STRING)}…(${value.length} 字符)`
  }
  if (typeof value !== 'object') return value
  if (value instanceof Uint8Array) return `${value.constructor.name}(${value.byteLength})`
  if (Array.isArray(value)) return `Array(${value.length})`
  if (value instanceof Date) return value.toISOString()
  if (depth >= 1) return '{…}'
  const keys = Object.keys(value)
  const parts = keys
    .slice(0, MAX_KEYS)
    .map((key) => `${key}: ${summarize((value as Record<string, unknown>)[key], depth + 1)}`)
  if (keys.length > MAX_KEYS) parts.push(`…(${keys.length - MAX_KEYS})`)
  return `{ ${parts.join(', ')} }`
}
