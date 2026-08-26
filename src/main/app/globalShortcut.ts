import { globalShortcut } from 'electron'
import { defaults, getSettings, updateSettings } from '@main/config'
import { disableAppMenu, restoreAppMenu } from './menu'
import { ensureMainWindow, getMainWindow, isQuitting } from './window'

let registeredShortcut: string | null = null

function toggleMainWindow(): void {
  if (isQuitting()) return
  const win = getMainWindow()
  if (!win || win.isDestroyed()) {
    ensureMainWindow()
    return
  }
  if (win.isVisible() && win.isFocused() && !win.isMinimized()) {
    win.hide()
    return
  }
  ensureMainWindow()
}

function tryRegister(accelerator: string): boolean {
  const ok = globalShortcut.register(accelerator, toggleMainWindow)
  if (ok) registeredShortcut = accelerator
  return ok
}

export function registerGlobalShortcuts(): void {
  unregisterGlobalShortcuts()
  const accelerator = getSettings().toggleWindowShortcut || defaults.toggleWindowShortcut
  if (!tryRegister(accelerator)) {
    console.warn(`全局快捷键注册失败，可能被其他应用占用: ${accelerator}`)
  }
}

export function unregisterGlobalShortcuts(): void {
  if (registeredShortcut) {
    globalShortcut.unregister(registeredShortcut)
    registeredShortcut = null
  }
}

export function applyToggleWindowShortcut(accelerator: string): void {
  const previous = registeredShortcut
  unregisterGlobalShortcuts()
  if (!tryRegister(accelerator)) {
    if (previous) tryRegister(previous)
    throw new Error(`快捷键 ${accelerator} 注册失败，可能被系统或其他应用占用`)
  }
  updateSettings({ toggleWindowShortcut: accelerator })
}

let capturing = false

export function beginShortcutCapture(): void {
  if (capturing) return
  capturing = true
  unregisterGlobalShortcuts()
  disableAppMenu()
}

export function endShortcutCapture(): void {
  if (!capturing) return
  capturing = false
  restoreAppMenu()
  registerGlobalShortcuts()
}
