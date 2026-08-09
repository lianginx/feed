/**
 * 布尔运行配置读取：命令行环境变量优先，其次 .env 文件（import.meta.env）。
 *
 * 语义简单统一：未配置、空值、0/false/off/no（大小写不敏感）一律视为关闭；
 * 其余非空值视为开启。没有隐式的开发/生产回退，行为完全由 .env 文件显式决定。
 */
export function envBool(processKey: string, metaValue: string | undefined): boolean {
  const raw = process.env[processKey] ?? metaValue
  if (raw === undefined || raw.trim() === '') return false
  const normalized = raw.trim().toLowerCase()
  return !['0', 'false', 'off', 'no'].includes(normalized)
}

/**
 * 是否显式配置了该变量（区分「未配置」与「显式设为关闭」）。
 * 用于在关键功能因未配置而静默关闭时打警告，帮助定位构建缺 .env 文件的问题。
 */
export function isEnvConfigured(processKey: string, metaValue: string | undefined): boolean {
  const raw = process.env[processKey] ?? metaValue
  return raw !== undefined && raw.trim() !== ''
}

/**
 * .env 文件变量类型声明（MAIN_VITE_ 前缀注入主进程 import.meta.env）。
 * 用 declare global 声明：主进程 tsconfig 不加载独立的 .d.ts 文件，
 * 故集中放在本模块保证类型生效。
 */
declare global {
  interface ImportMetaEnv {
    /** IPC 日志级别：off | error | info | debug；off/空=关闭 */
    readonly MAIN_VITE_IPC_LOG?: string
    /** 需要打印完整参数/返回值的 IPC 通道，逗号分隔 */
    readonly MAIN_VITE_IPC_LOG_DETAIL?: string
    /** 定时刷新开关（1 开启 / 0 关闭） */
    readonly MAIN_VITE_ENABLE_SCHEDULER?: string
    /** 自动更新开关（1 开启 / 0 关闭） */
    readonly MAIN_VITE_ENABLE_UPDATER?: string
    /** 「开发者工具」菜单开关（1 开启 / 0 关闭） */
    readonly MAIN_VITE_ENABLE_DEVTOOLS?: string
  }
}
