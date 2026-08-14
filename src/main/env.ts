export function envBool(value: string | undefined): boolean {
  if (value === undefined || value.trim() === '') return false
  const normalized = value.trim().toLowerCase()
  return !['0', 'false', 'off', 'no'].includes(normalized)
}

export function isEnvConfigured(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== ''
}

declare global {
  interface ImportMetaEnv {
    readonly MAIN_VITE_IPC_LOG?: string
    readonly MAIN_VITE_IPC_LOG_DETAIL?: string
    readonly MAIN_VITE_ENABLE_SCHEDULER?: string
    readonly MAIN_VITE_ENABLE_UPDATER?: string
    readonly MAIN_VITE_ENABLE_DEVTOOLS?: string
    readonly MAIN_VITE_DEBUG_FETCH_WINDOW?: string
    readonly MAIN_VITE_DEBUG_FETCH_LOG?: string
  }
}
