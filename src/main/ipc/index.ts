import { registerFeedHandlers } from './feeds'
import { registerCategoryHandlers } from './categories'
import { registerArticleHandlers } from './articles'
import { registerSettingsHandlers } from './settings'
import { registerOpmlHandlers } from './opml'
import { registerSyncHandlers } from './sync'
import { registerTranslateHandlers } from './translate'

/**
 * 注册所有 IPC 处理器。
 * 各领域处理器分散在独立模块中，由本函数统一调用。
 */
export function registerAllHandlers(): void {
  registerFeedHandlers()
  registerCategoryHandlers()
  registerArticleHandlers()
  registerSettingsHandlers()
  registerOpmlHandlers()
  registerSyncHandlers()
  registerTranslateHandlers()
}
