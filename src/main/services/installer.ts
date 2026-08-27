import { app } from 'electron'
import { existsSync, mkdtempSync, rmSync, renameSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname, resolve, isAbsolute, normalize } from 'path'
import { spawn } from 'child_process'

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const p = spawn(cmd, args)
    let stderr = ''
    p.stderr.on('data', (d) => (stderr += String(d)))
    p.on('error', reject)
    p.on('close', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${cmd} ${args.join(' ')} 失败 (code ${code}): ${stderr.trim()}`))
    })
  })
}

function runWithAdmin(cmd: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const script = `do shell script ${JSON.stringify(cmd)} with administrator privileges`
    const p = spawn('osascript', ['-e', script])
    let stderr = ''
    p.stderr.on('data', (d) => (stderr += String(d)))
    p.on('error', reject)
    p.on('close', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`授权执行失败: ${stderr.trim() || `code ${code}`}`))
    })
  })
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

function isValidTarget(target: string): boolean {
  if (!isAbsolute(target) || !target.endsWith('.app')) return false
  if (/["'`$;|&*?~<>\\\n]/.test(target) || target.includes('`')) return false
  const resolved = resolve(normalize(target))
  return (
    resolved.startsWith('/Applications/') ||
    resolved.startsWith('/tmp/') ||
    resolved === '/Applications/Feed.app'
  )
}

export async function installZipSilently(
  zipPath: string,
  expectedSha512?: string | null
): Promise<void> {
  if (!existsSync(zipPath)) {
    throw new Error(`安装包不存在: ${zipPath}`)
  }
  if (expectedSha512) {
    const { createHash } = await import('crypto')
    const { createReadStream } = await import('fs')
    const hash = createHash('sha512')
    await new Promise<void>((resolvePromise, reject) => {
      const stream = createReadStream(zipPath)
      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('end', () => resolvePromise())
      stream.on('error', reject)
    })
    const actual = hash.digest('base64')
    if (actual !== expectedSha512) {
      throw new Error('安装包校验失败：SHA-512 不匹配，可能已损坏或被篡改')
    }
  }

  const exePath = app.getPath('exe')
  const appBundleResolved = resolve(join(dirname(exePath), '../..'))

  if (!existsSync(join(appBundleResolved, 'Contents', 'Info.plist'))) {
    throw new Error(`无法定位当前 App 包: ${appBundleResolved}`)
  }

  if (appBundleResolved.startsWith('/Volumes/')) {
    throw new Error('请先将 Feed 拖到“应用程序”文件夹后再更新')
  }

  const envTarget = !app.isPackaged ? process.env.FEED_UPDATE_TARGET?.trim() : undefined
  if (envTarget && !isValidTarget(envTarget)) {
    throw new Error(`非法的更新目标路径: ${envTarget}`)
  }

  const rawTarget = envTarget
    ? normalize(envTarget)
    : !app.isPackaged
      ? '/tmp/Feed-Test.app'
      : appBundleResolved

  const targetPath = resolve(normalize(rawTarget))

  const targetValid = isValidTarget(targetPath)
  const isCurrentBundle = targetPath === appBundleResolved
  if (!targetValid && !isCurrentBundle) {
    throw new Error(`非法的更新目标路径: ${targetPath}`)
  }
  if (isCurrentBundle && /["'`$;|&*?~<>\\\n]/.test(targetPath)) {
    throw new Error(`非法的更新目标路径: ${targetPath}`)
  }

  if (!zipPath.endsWith('.zip')) {
    throw new Error(`非法的安装包类型: ${zipPath}`)
  }
  const zipResolved = resolve(zipPath)
  const allowedDirs: string[] = []
  try {
    allowedDirs.push(resolve(app.getPath('userData')))
  } catch (_e) {
    void _e
  }
  try {
    allowedDirs.push(resolve(app.getPath('temp')))
  } catch (_e) {
    void _e
  }
  try {
    allowedDirs.push(resolve(join(app.getPath('home'), 'Library/Caches')))
  } catch (_e) {
    void _e
  }
  allowedDirs.push(resolve(tmpdir()))
  const inAllowedDir = allowedDirs.some((d) => {
    const dir = d.endsWith('/') ? d : `${d}/`
    return zipResolved === d || zipResolved.startsWith(dir)
  })
  if (!inAllowedDir) {
    throw new Error(`安装包不在允许的缓存目录: ${zipPath}`)
  }

  const stageDir = mkdtempSync(join(tmpdir(), 'feed-update-'))
  try {
    await run('ditto', ['-xk', zipPath, stageDir])

    const candidates = [join(stageDir, 'Feed.app'), join(stageDir, 'mac-arm64', 'Feed.app')]
    let stagedApp: string | null = null
    for (const c of candidates) {
      if (existsSync(join(c, 'Contents', 'Info.plist'))) {
        stagedApp = c
        break
      }
    }
    if (!stagedApp) {
      const { readdirSync } = await import('fs')
      const entries = readdirSync(stageDir, { withFileTypes: true })
      for (const e of entries) {
        if (e.isDirectory() && e.name.endsWith('.app')) {
          const p = join(stageDir, e.name)
          if (existsSync(join(p, 'Contents', 'Info.plist'))) {
            stagedApp = p
            break
          }
        }
      }
    }
    if (!stagedApp) {
      throw new Error('解压后未找到 Feed.app')
    }
    try {
      const { readFileSync } = await import('fs')
      const plistText = readFileSync(join(stagedApp, 'Contents', 'Info.plist'), 'utf-8')
      if (!plistText.includes('com.lianginx.feed')) {
        throw new Error('安装包校验失败：Bundle 标识不匹配')
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('Bundle 标识')) throw e
      throw new Error('安装包校验失败：无法读取 Bundle 信息')
    }

    const isInApplications = targetPath.startsWith('/Applications')
    const pendingPath = `${targetPath}.pending`
    const backupPath = `${targetPath}.backup`

    for (const p of [pendingPath, backupPath]) {
      try {
        rmSync(p, { recursive: true, force: true })
      } catch (_e) {
        void _e
      }
      if (isInApplications && existsSync(p)) {
        try {
          await runWithAdmin(`rm -rf -- ${shellEscape(p)}`)
        } catch (_e) {
          void _e
        }
      }
    }

    await run('ditto', [stagedApp, pendingPath])
    await run('xattr', ['-cr', pendingPath])

    const doReplace = async (): Promise<void> => {
      renameSync(targetPath, backupPath)
      try {
        renameSync(pendingPath, targetPath)
      } catch (e) {
        try {
          if (existsSync(backupPath)) {
            try {
              if (existsSync(targetPath)) rmSync(targetPath, { recursive: true, force: true })
            } catch (_e6) {
              void _e6
            }
            renameSync(backupPath, targetPath)
          }
        } catch (_e4) {
          void _e4
        }
        throw e
      }
    }

    try {
      await doReplace()
      if (!existsSync(join(targetPath, 'Contents', 'Info.plist'))) {
        try {
          if (existsSync(backupPath)) {
            try {
              if (existsSync(targetPath)) rmSync(targetPath, { recursive: true, force: true })
            } catch (_e7) {
              void _e7
            }
            renameSync(backupPath, targetPath)
          }
        } catch (_e8) {
          void _e8
        }
        throw new Error('安装后校验失败：目标应用不存在或不完整')
      }
      try {
        rmSync(backupPath, { recursive: true, force: true })
      } catch (_e) {
        void _e
      }
    } catch (err) {
      if (!isInApplications) {
        try {
          rmSync(pendingPath, { recursive: true, force: true })
        } catch (_e2) {
          void _e2
        }
        throw err
      }
      const msg = err instanceof Error ? err.message : String(err)
      if (/Operation not permitted|Permission denied|EBUSY|ENOENT|ENOTEMPTY|ENOTDIR/i.test(msg)) {
        const cmd = `rm -rf -- ${shellEscape(backupPath)}; mv -- ${shellEscape(targetPath)} ${shellEscape(backupPath)} && mv -- ${shellEscape(pendingPath)} ${shellEscape(targetPath)}`
        try {
          await runWithAdmin(cmd)
          if (!existsSync(join(targetPath, 'Contents', 'Info.plist'))) {
            await runWithAdmin(
              `rm -rf -- ${shellEscape(targetPath)}; mv -- ${shellEscape(backupPath)} ${shellEscape(targetPath)}`
            )
            throw new Error('安装后校验失败：目标应用不存在或不完整')
          }
          await runWithAdmin(`rm -rf -- ${shellEscape(backupPath)}`)
        } catch (adminErr) {
          try {
            if (existsSync(backupPath)) {
              await runWithAdmin(
                `rm -rf -- ${shellEscape(targetPath)}; mv -- ${shellEscape(backupPath)} ${shellEscape(targetPath)}`
              )
            } else if (existsSync(`${targetPath}.pending`)) {
              await runWithAdmin(`rm -rf -- ${shellEscape(`${targetPath}.pending`)}`)
            }
          } catch (_e5) {
            void _e5
          }
          throw adminErr
        }
      } else {
        try {
          if (existsSync(backupPath)) {
            try {
              if (existsSync(targetPath)) rmSync(targetPath, { recursive: true, force: true })
            } catch (_e9) {
              void _e9
            }
            renameSync(backupPath, targetPath)
          }
        } catch (_e10) {
          void _e10
        }
        try {
          rmSync(pendingPath, { recursive: true, force: true })
        } catch (_e2) {
          void _e2
        }
        throw err
      }
    }
  } finally {
    try {
      rmSync(stageDir, { recursive: true, force: true })
    } catch (_e) {
      void _e
    }
    try {
      const pendingPath2 = `${targetPath}.pending`
      if (existsSync(pendingPath2)) {
        rmSync(pendingPath2, { recursive: true, force: true })
      }
    } catch (_e3) {
      void _e3
    }
  }
}
