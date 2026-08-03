import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'

export function success<T>(data: T): { success: true; data: T } {
  return { success: true as const, data }
}

export function error(msg: string): { success: false; error: string } {
  return { success: false as const, error: msg }
}

/**
 * 校验 IPC 调用来源是否为本应用受信的渲染窗口（安全规则 #17）。
 * 打包后页面通过 file:// 加载；开发模式加载 Vite dev server。
 */
export function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const frameUrl = event.senderFrame?.url ?? ''
  if (frameUrl.startsWith('file://')) return true
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  return Boolean(devUrl && frameUrl.startsWith(devUrl))
}

/**
 * 包装 ipcMain.handle，对每个调用统一校验来源，拒绝不受信渲染器的请求。
 * 须在 registerAllHandlers / registerUpdaterHandlers 之前调用。
 */
export function guardIpcHandlers(): void {
  const origHandle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = ((channel, listener) =>
    origHandle(channel, (event, ...args) => {
      if (!isTrustedSender(event)) {
        console.warn(`[IPC] 已拒绝不受信来源的调用: ${channel}`)
        return { success: false, error: 'forbidden' }
      }
      return listener(event, ...args)
    })) as typeof ipcMain.handle
}
