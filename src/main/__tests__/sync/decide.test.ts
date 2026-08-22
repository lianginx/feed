import { describe, expect, it } from 'vitest'
import { decideSync } from '@main/services/sync/decide'

const LOCAL = '{"local":true}'
const REMOTE = '{"remote":true}'
const LAST = '{"last":true}'

describe('decideSync 三方同步决策矩阵', () => {
  it('远端不存在 → push', () => {
    expect(decideSync(LOCAL, null, LAST, false)).toEqual({ type: 'push' })
    // 首次同步（无 last）同理
    expect(decideSync(LOCAL, null, null, true)).toEqual({ type: 'push' })
  })

  it('远端与 last 相等、本地也未变 → noop（单机空转收敛）', () => {
    expect(decideSync(REMOTE, REMOTE, REMOTE, false)).toEqual({ type: 'noop' })
  })

  it('远端与本机当前状态一致但 last 落后 → noop（推送成功但 last 未落盘的窗口）', () => {
    expect(decideSync(REMOTE, REMOTE, LAST, false)).toEqual({ type: 'noop' })
    expect(decideSync(LOCAL, LOCAL, null, false)).toEqual({ type: 'noop' })
  })

  it('远端与 last 相等、本地有改动 → push', () => {
    expect(decideSync(LOCAL, LAST, LAST, false)).toEqual({ type: 'push' })
  })

  it('首次同步且本地为空 → pull（新设备接管云端数据）', () => {
    expect(decideSync('', LOCAL, null, true)).toEqual({ type: 'pull', remote: LOCAL })
  })

  it('远端变更、本地未变 → 干净拉取 pull', () => {
    expect(decideSync(LAST, LOCAL, LAST, false)).toEqual({ type: 'pull', remote: LOCAL })
  })

  it('双方都有改动 → conflict', () => {
    expect(decideSync(LOCAL, REMOTE, LAST, false)).toEqual({ type: 'conflict' })
  })

  it('本地为空但已有 last（用户删光了订阅）→ 不视为新设备，走正常决策', () => {
    // 本地空但 last 存在：local !== last 且 remote !== last 时仍应冲突，而非静默拉取覆盖
    expect(decideSync('', LOCAL, LAST, true)).toEqual({ type: 'conflict' })
  })
})
