import { app, ipcMain } from 'electron'
import { is } from '@electron-toolkit/utils'

/**
 * 开发环境下注册 IPC 通信日志，方便调试。
 * 监听所有 invoke/handle 调用，在控制台打印请求参数和返回结果。
 *
 * 必须在 `registerAllHandlers()` 之前调用，否则会漏掉已注册的处理器日志。
 */
export function setupIpcLogger(): void {
  if (!is.dev) return

  app.on('web-contents-created', (_event, contents) => {
    contents.on('ipc-message', (_event, channel, ...args) => {
      console.log(`[IPC] >> ${channel}`, args.length > 0 ? args : '')
    })
    contents.on('ipc-message-sync', (_event, channel, ...args) => {
      console.log(`[IPC] >> ${channel} (sync)`, args.length > 0 ? args : '')
    })
  })

  const origHandle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = ((channel, listener) => {
    console.log(`[IPC] registered handler: ${channel}`)
    return origHandle(channel, async (event, ...args) => {
      console.log(`[IPC] >> ${channel}`, args.length > 0 ? args : '')
      try {
        const result = await listener(event, ...args)
        console.log(`[IPC] << ${channel}`, result)
        return result
      } catch (err) {
        console.error(`[IPC] !! ${channel}`, err)
        throw err
      }
    })
  }) as typeof ipcMain.handle
}
