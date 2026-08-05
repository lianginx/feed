/**
 * 自动更新状态（由主进程通过 IPC 推送给渲染进程展示）。
 * 该类型是主进程（services/updater.ts）、preload（index.ts / index.d.ts）
 * 与渲染进程的公共契约，统一在此定义，避免多处重复定义造成类型漂移。
 * 注意：本文件是纯类型声明，不包含任何运行时逻辑。
 */
export type UpdaterStatus =
  | { state: 'disabled' } // 自动更新未启用（开发模式）
  | { state: 'checking' } // 正在检查更新
  | {
      state: 'available'
      version: string
      currentVersion: string
      releaseNotes: string
      releasePageUrl: string
      /** macOS 手动模式下安装包已存在且 SHA-512 校验通过，可直接安装 */
      alreadyDownloaded?: boolean
    } // 发现新版本，携带版本号/更新日志/发布页
  | { state: 'not-available'; currentVersion: string; releasePageUrl: string } // 已是最新版本
  | { state: 'downloading'; percent: number } // 下载进度（0-100）
  | { state: 'downloaded' } // 下载完成，可安装
  | { state: 'error'; message: string } // 检查/下载出错
