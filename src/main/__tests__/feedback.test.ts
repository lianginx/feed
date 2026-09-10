import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

const storeData: Record<string, unknown> = {}

vi.mock('electron-store', () => ({
  default: class FakeStore {
    get(key: string): unknown {
      return storeData[key]
    }
    set(key: string, value: unknown): void {
      storeData[key] = value
    }
  }
}))

interface CapturedRequest {
  method: string
  url: string
  body: Record<string, unknown>
  ids: string[]
}

interface ServerConfig {
  postStatus?: number
  postBody?: unknown
  projectionItems?: unknown[]
}

async function startServer(
  config: ServerConfig = {}
): Promise<{ base: string; requests: CapturedRequest[]; close: () => Promise<void> }> {
  const requests: CapturedRequest[] = []
  const server: Server = createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => (raw += String(chunk)))
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      requests.push({
        method: req.method ?? '',
        url: req.url ?? '',
        body: raw ? JSON.parse(raw) : {},
        ids: (url.searchParams.get('ids') ?? '').split(',').filter(Boolean)
      })
      if (req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ items: config.projectionItems ?? [] }))
        return
      }
      res.writeHead(config.postStatus ?? 201, { 'content-type': 'application/json' })
      res.end(JSON.stringify(config.postBody ?? {}))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    base: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

async function loadService(): Promise<typeof import('@main/services/feedback')> {
  vi.resetModules()
  return import('@main/services/feedback')
}

beforeEach(() => {
  storeData.submissions = []
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getFeedbackStatus', () => {
  it('未配置后端地址时返回 disabled', async () => {
    vi.stubEnv('MAIN_VITE_FEEDBACK_API_BASE_URL', '')
    const { getFeedbackStatus } = await loadService()
    expect(getFeedbackStatus().enabled).toBe(false)
  })

  it('配置后端地址后返回 4 个内置类别', async () => {
    vi.stubEnv('MAIN_VITE_FEEDBACK_API_BASE_URL', 'https://feedback.example.com')
    const { getFeedbackStatus } = await loadService()
    const status = getFeedbackStatus()
    expect(status.enabled).toBe(true)
    expect(status.categories.map((c) => c.value)).toEqual([
      'feature',
      'improvement',
      'bug',
      'question'
    ])
  })
})

describe('submitFeedback', () => {
  it('提交成功：组装裁剪后的载荷与完整 context，install_id 复用稳定', async () => {
    const { base, requests, close } = await startServer({
      postStatus: 201,
      postBody: { id: 'aB3xY9zK1qW2' }
    })
    vi.stubEnv('MAIN_VITE_FEEDBACK_API_BASE_URL', `${base}/`)
    try {
      const { submitFeedback } = await loadService()
      const result = await submitFeedback({
        category: 'feature',
        content: '  建议增加深色模式跟随系统的开关  ',
        contact: '   '
      })
      expect(result.id).toBe('aB3xY9zK1qW2')
      expect(requests[0].url).toBe('/v1/products/feed/feedback')

      const body = requests[0].body
      expect(body.category).toBe('feature')
      expect(body.content).toBe('建议增加深色模式跟随系统的开关')
      expect(body.contact).toBeUndefined()

      const context = body.context as Record<string, string>
      expect(typeof context.app_version).toBe('string')
      expect(context.platform).toBe(process.platform === 'darwin' ? 'macOS' : process.platform)
      expect(typeof context.os_version).toBe('string')
      expect(context.install_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i)
      expect(context.arch).toBe(process.arch)

      await submitFeedback({ category: 'bug', content: '重复提交时安装标识应保持一致用于去重' })
      const second = requests[1].body.context as Record<string, string>
      expect(second.install_id).toBe(context.install_id)
    } finally {
      await close()
    }
  })

  it('内容低于最小长度时拒绝提交', async () => {
    const { base, requests, close } = await startServer()
    vi.stubEnv('MAIN_VITE_FEEDBACK_API_BASE_URL', base)
    try {
      const { submitFeedback } = await loadService()
      await expect(submitFeedback({ category: 'bug', content: '太短' })).rejects.toThrow(/至少/)
      expect(requests).toHaveLength(0)
    } finally {
      await close()
    }
  })

  it('类别非法时拒绝提交', async () => {
    const { base, requests, close } = await startServer()
    vi.stubEnv('MAIN_VITE_FEEDBACK_API_BASE_URL', base)
    try {
      const { submitFeedback } = await loadService()
      await expect(
        submitFeedback({ category: 'unknown', content: '这是一条足够长的合法内容内容' })
      ).rejects.toThrow(/类别/)
      expect(requests).toHaveLength(0)
    } finally {
      await close()
    }
  })

  it('产品下线（410）时给出友好提示', async () => {
    const { base, close } = await startServer({ postStatus: 410, postBody: { error: 'gone' } })
    vi.stubEnv('MAIN_VITE_FEEDBACK_API_BASE_URL', base)
    try {
      const { submitFeedback } = await loadService()
      await expect(
        submitFeedback({ category: 'bug', content: '产品下线后提交应当收到友好错误' })
      ).rejects.toThrow('反馈通道暂未开放')
    } finally {
      await close()
    }
  })

  it('未配置后端地址时拒绝提交', async () => {
    vi.stubEnv('MAIN_VITE_FEEDBACK_API_BASE_URL', '')
    const { submitFeedback } = await loadService()
    await expect(
      submitFeedback({ category: 'bug', content: '未配置后端地址时不应发起请求' })
    ).rejects.toThrow('反馈服务未配置')
  })
})

describe('listMyFeedback', () => {
  it('提交后记录本地凭证，查询时合并远端状态投影', async () => {
    const { base, requests, close } = await startServer({
      postStatus: 201,
      postBody: { id: 'remoteMine0001' },
      projectionItems: [
        {
          id: 'remoteMine0001',
          category: 'bug',
          content: '这条反馈应该出现在我的反馈列表',
          status: 'processing',
          reply: '已复现，排期修复',
          fixed_version: null,
          reject_reason: null,
          created_at: '2026-09-10T00:00:00.000Z',
          updated_at: '2026-09-10T01:00:00.000Z'
        }
      ]
    })
    vi.stubEnv('MAIN_VITE_FEEDBACK_API_BASE_URL', base)
    try {
      const { submitFeedback, listMyFeedback } = await loadService()
      await submitFeedback({ category: 'bug', content: '这条反馈应该出现在我的反馈列表' })

      const mine = await listMyFeedback()
      const getReq = requests.find((r) => r.method === 'GET')
      expect(getReq?.ids).toEqual(['remoteMine0001'])
      expect(mine).toHaveLength(1)
      expect(mine[0].status).toBe('processing')
      expect(mine[0].reply).toBe('已复现，排期修复')
    } finally {
      await close()
    }
  })

  it('投影缺失的本地记录回退为已提交状态', async () => {
    const { base, close } = await startServer({
      postStatus: 201,
      postBody: { id: 'orphanMine0001' },
      projectionItems: []
    })
    vi.stubEnv('MAIN_VITE_FEEDBACK_API_BASE_URL', base)
    try {
      const { submitFeedback, listMyFeedback } = await loadService()
      await submitFeedback({ category: 'question', content: '投影查不到时本地记录仍应展示' })

      const mine = await listMyFeedback()
      expect(mine).toHaveLength(1)
      expect(mine[0].id).toBe('orphanMine0001')
      expect(mine[0].status).toBe('new')
      expect(mine[0].content).toBe('投影查不到时本地记录仍应展示')
    } finally {
      await close()
    }
  })

  it('无本地记录时不发起查询', async () => {
    const { base, requests, close } = await startServer()
    vi.stubEnv('MAIN_VITE_FEEDBACK_API_BASE_URL', base)
    try {
      const { listMyFeedback } = await loadService()
      expect(await listMyFeedback()).toEqual([])
      expect(requests).toHaveLength(0)
    } finally {
      await close()
    }
  })
})
