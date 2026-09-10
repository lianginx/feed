import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import { promisify } from 'node:util'
import Store from 'electron-store'
import type {
  FeedbackCategoryOption,
  FeedbackStatus,
  FeedbackSubmitInput,
  FeedbackSubmitResult,
  MyFeedbackItem
} from '@shared/types/feedback'
import { APP_METADATA } from '@shared/appMetadata'
import { BROWSER_USER_AGENT, fetchWithTimeout } from './http'

const execFileAsync = promisify(execFile)

const PRODUCT_SLUG = 'feed'
const CONTENT_MIN = 10
const CONTENT_MAX = 2000
const CONTACT_MAX = 200

// 与反馈后端 feed 产品的 categories 枚举保持一致；后端无公开类别端点，改动需两端同步
const FEEDBACK_CATEGORIES: FeedbackCategoryOption[] = [
  { value: 'feature', label: '功能建议' },
  { value: 'improvement', label: '体验优化' },
  { value: 'bug', label: '问题反馈' },
  { value: 'question', label: '使用咨询' }
]

function getApiBase(): string | null {
  const value = import.meta.env.MAIN_VITE_FEEDBACK_API_BASE_URL?.trim()
  if (!value) return null
  return value.replace(/\/+$/, '')
}

interface StoredSubmission {
  id: string
  content: string
  createdAt: string
}

// 状态投影端点单次最多查询 50 个 id，本地也只保留最新 50 条
const SUBMISSIONS_MAX = 50

const installStore = new Store<{ installId?: string; submissions?: StoredSubmission[] }>({
  name: 'feedback-install'
})

function getInstallId(): string {
  let id = installStore.get('installId')
  if (!id) {
    id = randomUUID()
    installStore.set('installId', id)
  }
  return id
}

function recordSubmission(id: string, content: string): void {
  const list = installStore.get('submissions') ?? []
  list.unshift({ id, content, createdAt: new Date().toISOString() })
  installStore.set('submissions', list.slice(0, SUBMISSIONS_MAX))
}

interface SystemInfo {
  osVersion: string
  device: string
}

let systemInfoPromise: Promise<SystemInfo> | null = null

function readSystemInfo(): Promise<SystemInfo> {
  systemInfoPromise ??= Promise.all([readOsVersion(), readDeviceName()]).then(
    ([osVersion, device]) => ({ osVersion, device })
  )
  return systemInfoPromise
}

async function readOsVersion(): Promise<string> {
  try {
    const { stdout } = await execFileAsync('sw_vers', ['-productVersion'], { timeout: 4000 })
    return stdout.trim()
  } catch {
    return os.release()
  }
}

async function readDeviceName(): Promise<string> {
  try {
    const { stdout } = await execFileAsync('system_profiler', ['SPHardwareDataType'], {
      timeout: 8000
    })
    return stdout.match(/Model Name:\s*(.+)/)?.[1]?.trim() ?? ''
  } catch {
    return ''
  }
}

export async function getFeedbackContext(): Promise<Record<string, string>> {
  const info = await readSystemInfo()
  const context: Record<string, string> = {
    app_version: APP_METADATA.version,
    platform: process.platform === 'darwin' ? 'macOS' : process.platform,
    os_version: info.osVersion,
    install_id: getInstallId(),
    arch: process.arch
  }
  if (info.device) context.device = info.device
  return context
}

export function getFeedbackStatus(): FeedbackStatus {
  return { enabled: getApiBase() !== null, categories: FEEDBACK_CATEGORIES }
}

export async function submitFeedback(input: FeedbackSubmitInput): Promise<FeedbackSubmitResult> {
  const base = getApiBase()
  if (!base) throw new Error('反馈服务未配置')

  const category = FEEDBACK_CATEGORIES.find((c) => c.value === input.category)
  if (!category) throw new Error('请选择反馈类别')

  const content = input.content?.trim() ?? ''
  const contentLength = [...content].length
  if (contentLength < CONTENT_MIN) throw new Error(`反馈内容至少需要 ${CONTENT_MIN} 个字符`)
  if (contentLength > CONTENT_MAX) throw new Error(`反馈内容最多 ${CONTENT_MAX} 个字符`)

  const contact = input.contact?.trim() ?? ''
  if ([...contact].length > CONTACT_MAX) throw new Error('联系方式过长')

  const res = await fetchWithTimeout(`${base}/v1/products/${PRODUCT_SLUG}/feedback`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': BROWSER_USER_AGENT
    },
    body: JSON.stringify({
      category: category.value,
      content,
      ...(contact ? { contact } : {}),
      context: await getFeedbackContext()
    })
  })
  if (res.status === 410) throw new Error('反馈通道暂未开放')
  if (res.status === 404) throw new Error('反馈服务配置有误')
  if (!res.ok) throw new Error(`提交失败（HTTP ${res.status}）`)

  const data = (await res.json()) as { id?: string }
  if (!data.id) throw new Error('提交失败')
  recordSubmission(data.id, content)
  return { id: data.id }
}

export async function listMyFeedback(): Promise<MyFeedbackItem[]> {
  const base = getApiBase()
  const submissions = installStore.get('submissions') ?? []
  if (!base || submissions.length === 0) return []

  const ids = submissions.map((s) => s.id).join(',')
  const res = await fetchWithTimeout(
    `${base}/v1/products/${PRODUCT_SLUG}/feedback?ids=${encodeURIComponent(ids)}`
  )
  if (!res.ok) throw new Error(`查询失败（HTTP ${res.status}）`)

  const projection = (await res.json()) as { items?: MyFeedbackItem[] }
  const remote = new Map((projection.items ?? []).map((item) => [item.id, item]))
  return submissions.map(
    (s) =>
      remote.get(s.id) ?? {
        id: s.id,
        category: '',
        content: s.content,
        status: 'new' as const,
        reply: null,
        fixed_version: null,
        reject_reason: null,
        created_at: s.createdAt,
        updated_at: s.createdAt
      }
  )
}
