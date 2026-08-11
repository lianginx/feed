import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * dataMigration 是副作用模块（import 即执行 setPath 与迁移），
 * 通过 mock electron + 真实临时目录 + resetModules 模拟每次启动。
 */

let appDataDir = ''
const setPathCalls: [string, string][] = []

function loadDataMigration(opts: { isPackaged: boolean; renameThrows?: boolean }): Promise<void> {
  vi.resetModules()
  vi.doMock('electron', () => ({
    app: {
      isPackaged: opts.isPackaged,
      getPath: () => appDataDir,
      setPath: (key: string, value: string) => {
        setPathCalls.push([key, value])
      }
    }
  }))
  vi.doMock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>()
    if (opts.renameThrows) {
      return {
        ...actual,
        renameSync: () => {
          throw new Error('EPERM')
        }
      }
    }
    return actual
  })
  return import('@main/dataMigration').then(() => undefined)
}

function setupAppData(legacyExists: boolean, targetExists: boolean): void {
  appDataDir = mkdtempSync(join(tmpdir(), 'feed-dm-'))
  const legacy = join(appDataDir, 'feed')
  if (legacyExists) {
    mkdirSync(legacy)
    writeFileSync(join(legacy, 'feed.db'), 'legacy-data')
  }
  const target = join(appDataDir, 'com.lianginx.feed')
  if (targetExists) {
    mkdirSync(target)
    writeFileSync(join(target, 'config.json'), '{}')
  }
}

function getSetPathUserData(): string {
  const calls = setPathCalls.filter(([key]) => key === 'userData')
  return calls[calls.length - 1]?.[1] ?? ''
}

afterEach(() => {
  if (appDataDir) rmSync(appDataDir, { recursive: true, force: true })
  appDataDir = ''
  setPathCalls.length = 0
  vi.resetModules()
})

describe('dataMigration', () => {
  it('正式版：legacy 存在且目标不存在时迁移到 appId 目录', async () => {
    setupAppData(true, false)
    await loadDataMigration({ isPackaged: true })

    expect(existsSync(join(appDataDir, 'feed'))).toBe(false)
    expect(existsSync(join(appDataDir, 'com.lianginx.feed', 'feed.db'))).toBe(true)
    expect(getSetPathUserData()).toBe(join(appDataDir, 'com.lianginx.feed'))
  })

  it('正式版：目标已存在时跳过迁移，legacy 保留', async () => {
    setupAppData(true, true)
    await loadDataMigration({ isPackaged: true })

    expect(existsSync(join(appDataDir, 'feed'))).toBe(true)
    expect(getSetPathUserData()).toBe(join(appDataDir, 'com.lianginx.feed'))
  })

  it('正式版：无 legacy 数据时直接使用新目录', async () => {
    setupAppData(false, false)
    await loadDataMigration({ isPackaged: true })

    expect(getSetPathUserData()).toBe(join(appDataDir, 'com.lianginx.feed'))
  })

  it('正式版：迁移失败时降级使用 legacy 目录，数据不被移动', async () => {
    setupAppData(true, false)
    await loadDataMigration({ isPackaged: true, renameThrows: true })

    expect(existsSync(join(appDataDir, 'feed', 'feed.db'))).toBe(true)
    expect(getSetPathUserData()).toBe(join(appDataDir, 'feed'))
  })

  it('开发版：不执行迁移，指向 .dev 目录', async () => {
    setupAppData(true, false)
    await loadDataMigration({ isPackaged: false })

    expect(existsSync(join(appDataDir, 'feed', 'feed.db'))).toBe(true)
    expect(getSetPathUserData()).toBe(join(appDataDir, 'com.lianginx.feed.dev'))
  })
})
