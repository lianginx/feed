import { ipcMain } from 'electron'
import { runSync, resolveConflict, getLastSyncedAt } from '@main/services/sync'
import { success, error } from './util'

export function registerSyncHandlers(): void {
  ipcMain.handle('sync:run', async () => {
    try {
      const result = await runSync()
      return success(result)
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle('sync:resolve', async (_event, choice: 'local' | 'remote') => {
    try {
      const result = await resolveConflict(choice)
      return success(result)
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle('sync:status', async () => {
    try {
      return success({ lastSyncedAt: getLastSyncedAt() })
    } catch (e) {
      return error((e as Error).message)
    }
  })
}
