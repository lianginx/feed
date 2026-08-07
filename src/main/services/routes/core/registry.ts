import type { FeedAdapter } from './types'

/** 适配器注册表（core 框架层） */
const registry = new Map<string, FeedAdapter>()

export function registerAdapter(adapter: FeedAdapter): void {
  registry.set(adapter.id, adapter)
}

export function getAdapter(id: string): FeedAdapter | undefined {
  return registry.get(id)
}

export function listAdapters(): FeedAdapter[] {
  return [...registry.values()]
}

/** 按域名匹配适配器（忽略 www 前缀） */
export function findAdaptersByDomain(domain: string): FeedAdapter[] {
  const host = domain.replace(/^www\./, '')
  return [...registry.values()].filter(
    (a) => a.domains.includes(host) || a.domains.includes(domain)
  )
}
