/**
 * 三方同步决策（纯函数）。
 * local：本机当前状态序列化结果；remote：远端内容（null 表示不存在）；last：上次同步成功时的序列化结果。
 */
export type SyncAction =
  { type: 'push' } | { type: 'pull'; remote: string } | { type: 'noop' } | { type: 'conflict' }

export function decideSync(
  local: string,
  remote: string | null,
  last: string | null,
  localEmpty: boolean
): SyncAction {
  if (remote === null) return { type: 'push' }

  // 远端与本机当前状态已完全一致（如推送成功但 last 未及落盘、对端推送了相同内容）：
  // 无需传输，仅需编排层把 last 对齐到 local，否则落后的 last 会让后续同步误判冲突
  if (remote === local) return { type: 'noop' }

  if (remote === last) {
    return local === last ? { type: 'noop' } : { type: 'push' }
  }

  if (last === null && localEmpty) return { type: 'pull', remote }
  if (local === last) return { type: 'pull', remote }

  return { type: 'conflict' }
}
