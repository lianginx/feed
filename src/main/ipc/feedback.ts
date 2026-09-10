import { ipcMain } from 'electron'
import type { FeedbackSubmitInput } from '@shared/types/feedback'
import {
  getFeedbackContext,
  getFeedbackStatus,
  listMyFeedback,
  submitFeedback
} from '@main/services/feedback'
import { success, error } from './util'

export function registerFeedbackHandlers(): void {
  ipcMain.handle('feedback:status', () => {
    try {
      return success(getFeedbackStatus())
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle('feedback:context', async () => {
    try {
      return success(await getFeedbackContext())
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle('feedback:submit', async (_event, input: FeedbackSubmitInput) => {
    try {
      return success(await submitFeedback(input))
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle('feedback:mine', async () => {
    try {
      return success(await listMyFeedback())
    } catch (e) {
      return error((e as Error).message)
    }
  })
}
