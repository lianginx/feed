import { app } from 'electron'
import { existsSync, renameSync } from 'fs'
import { join } from 'path'
import { APP_METADATA } from '@shared/appMetadata'

/**
 * 应用数据目录初始化（副作用模块）。
 *
 * 必须作为 main/index.ts 的第一个 import 执行：
 * 后续 import 的 ./config 顶层就会读取 userData（electron-store），
 * 因此这里必须在最前完成目录确定与迁移。
 *
 * 目录命名使用反向域名 bundle ID（appId），避免与同名应用冲突：
 * - 打包版：Application Support/<appId>
 * - 开发版：Application Support/<appId>.dev（与正式版隔离，避免共用真实数据）
 *
 * 老目录（旧命名 feed，即 app.getName() 小写名）一次性迁移到新目录，
 * 只对正式版执行：开发版不迁移，避免与正式版争夺同一份旧数据
 * （谁先启动谁搬走，会导致另一方升级后数据「消失」）。
 * 目标目录已有数据则跳过，避免重复迁移。
 * 迁移失败时降级继续使用旧目录，保证升级后数据一定可见。
 */

function resolveAppData(): string {
  return app.getPath('appData')
}

// 正式版与开发版使用不同目录，互不干扰
const dev = !app.isPackaged
const targetDir = dev ? `${APP_METADATA.appId}.dev` : APP_METADATA.appId

// 必须在任何读取 userData 的模块（尤其 ./config）之前设置
app.setPath('userData', join(resolveAppData(), targetDir))

// 老目录数据一次性迁移（仅正式版）：目标目录不存在且老目录存在时整体搬移（rename 同盘原子，保留全部数据）
if (!dev) {
  const target = join(resolveAppData(), targetDir)
  const legacy = join(resolveAppData(), APP_METADATA.name)
  if (!existsSync(target) && existsSync(legacy)) {
    try {
      renameSync(legacy, target)
    } catch (e) {
      // 迁移失败（跨盘/权限等）时降级用旧目录继续，数据立即可见；下次启动会再次尝试迁移
      console.error('[dataMigration] 迁移数据目录失败，降级使用旧目录:', e)
      app.setPath('userData', legacy)
    }
  }
}
