import { registerAdapter } from '../core/registry'
import { v2exAdapter } from './v2ex'
import { bilibiliUserArticle, bilibiliUserVideo } from './bilibili'

/**
 * 全部内置适配器。
 * 新增站点：在 adapters/ 下建 <site>/ 目录写适配器，然后在此数组登记一行即可。
 */
const adapters = [v2exAdapter, bilibiliUserArticle, bilibiliUserVideo]

for (const adapter of adapters) {
  registerAdapter(adapter)
}

export { adapters }
