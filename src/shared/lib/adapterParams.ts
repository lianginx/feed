/**
 * 内置路由参数判重的共享口径。
 * 主进程添加判重与渲染层添加窗口的前置校验必须用同一实现，避免两端口径漂移。
 */

export function canonicalAdapterParams(params: Record<string, string>): string {
  return JSON.stringify(
    Object.keys(params)
      .sort()
      .map((key) => [key, params[key] ?? ''])
  )
}

export function isParamsAdded(
  params: Record<string, string>,
  addedList: Record<string, string>[]
): boolean {
  const canonical = canonicalAdapterParams(params)
  return addedList.some((added) => canonicalAdapterParams(added) === canonical)
}
