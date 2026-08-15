import { clipboard, ipcMain } from 'electron'
import { success, error } from './util'

export function registerClipboardHandlers(): void {
  ipcMain.handle('clipboard:writeText', (_event, text: string) => {
    try {
      if (typeof text !== 'string') return error('invalid text')
      clipboard.writeText(text)
      return success(undefined)
    } catch (e) {
      return error((e as Error).message)
    }
  })
}
