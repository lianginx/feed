import { registerFeedHandlers } from './feeds'
import { registerCategoryHandlers } from './categories'
import { registerArticleHandlers } from './articles'
import { registerSettingsHandlers } from './settings'
import { registerOpmlHandlers } from './opml'
import { registerSyncHandlers } from './sync'
import { registerTranslateHandlers } from './translate'
import { registerClipboardHandlers } from './clipboard'

export function registerAllHandlers(): void {
  registerFeedHandlers()
  registerCategoryHandlers()
  registerArticleHandlers()
  registerSettingsHandlers()
  registerOpmlHandlers()
  registerSyncHandlers()
  registerTranslateHandlers()
  registerClipboardHandlers()
}
