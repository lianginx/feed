import { ipcMain } from 'electron'
import type { TranslateConfig } from '@main/config'
import { success, error } from './util'

export function registerTranslateHandlers(): void {
  ipcMain.handle(
    'translate:article',
    async (_event, id: number, targetLang?: string, forceRefresh?: boolean) => {
      try {
        const { translateArticle } = await import('@main/services/translate')
        const result = await translateArticle(id, targetLang, forceRefresh)
        return success(result)
      } catch (e) {
        return error((e as Error).message)
      }
    }
  )

  ipcMain.handle('translate:test', async (_event, config: TranslateConfig) => {
    try {
      const { testTranslate } = await import('@main/services/translate')
      await testTranslate(config)
      return success({ ok: true })
    } catch (e) {
      return error((e as Error).message)
    }
  })
}
