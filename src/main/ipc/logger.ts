import { app, ipcMain } from 'electron'

/**
 * 注册 IPC 通信日志，方便调试。
 * 是否启用完全由环境变量决定：级别为 off 或未配置时不注册（生产 .env 默认 off）。
 *
 * 分级打印，避免高频通道刷屏，只保留对定位问题有价值的信息：
 *  - error：handler 抛错必打，附完整入参与堆栈
 *  - info：低频关键操作通道（增删改、配置、翻译、同步等）
 *  - debug：高频或纯只读通道（列表、未读数、翻看时频繁触发的读写等），默认静默；
 *    需要跟踪这些通道时用 FEED_IPC_LOG_DETAIL 深挖
 *
 * 参数与返回值默认摘要化（数组显示长度、对象只取前几个键、长字符串截断）；
 * 命中 FEED_IPC_LOG_DETAIL 的通道打印完整参数与返回值（豁免级别门控，
 * 即使该通道是默认静默的高频通道也会打印；仅对 invoke/handle 通道生效，
 * 渲染进程 send 通道始终摘要化）。
 *
 * 环境变量：
 *  - FEED_IPC_LOG=off|error|info|debug  级别，off/未配置=不启用
 *  - FEED_IPC_LOG_DETAIL=a:b,c:d    指定通道打印完整参数与返回值
 *  - 也可写入 .env 文件持久配置（MAIN_VITE_IPC_LOG / MAIN_VITE_IPC_LOG_DETAIL），
 *    命令行环境变量优先，可覆盖
 *
 * 必须在 registerAllHandlers() 之前调用，否则会漏掉已注册的处理器日志。
 */
export function setupIpcLogger(): void {
  const level = parseLevel(readEnv('FEED_IPC_LOG', import.meta.env.MAIN_VITE_IPC_LOG))
  if (level === null) return

  const detailChannels = new Set(
    (readEnv('FEED_IPC_LOG_DETAIL', import.meta.env.MAIN_VITE_IPC_LOG_DETAIL) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )

  // 高频或纯只读通道归为 debug 级，默认静默，仅在 FEED_IPC_LOG=debug 时打印
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
            // 深挖模式：打印原始对象，控制台可展开查看
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

/** 日志级别数字，数值越大越详细；null 表示不启用 */
type LogLevel = 'error' | 'info' | 'debug'

/** 读取配置：命令行环境变量优先，其次 .env 文件（import.meta.env） */
function readEnv(processKey: string, metaValue: string | undefined): string | undefined {
  return process.env[processKey] ?? metaValue
}

/** 解析级别；off/空/未配置返回 null（不启用），此时不注册任何日志 */
function parseLevel(value: string | undefined): number | null {
  switch (value?.trim().toLowerCase()) {
    case 'error':
      return 0
    case 'debug':
      return 2
    case 'info':
      return 1
    default:
      return null // off 或未配置
  }
}

/** 通道是否能打印：debug 通道需 FEED_IPC_LOG=debug，其余通道需至少 info 级 */
function shouldLog(channel: string, level: number, debugChannels: Set<string>): boolean {
  const channelLevel = debugChannels.has(channel) ? 2 : 1
  return level >= channelLevel
}

/** 受级别控制的普通日志 */
function log(channelLevel: LogLevel, level: number, message: string): void {
  const target = parseLevel(channelLevel)
  if (target !== null && level >= target) console.log(message)
}

const MAX_STRING = 200
const MAX_KEYS = 5

function summarizeList(args: unknown[]): unknown[] {
  return args.map((arg) => summarize(arg))
}

/** 摘要化单个值，避免高频通道打印超长输出刷屏 */
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
