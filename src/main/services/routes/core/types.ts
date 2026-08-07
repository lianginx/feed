import type { ParsedFeed } from '../../rss'

/** 适配器参数声明：用户在添加订阅源时填写 */
export interface AdapterParam {
  key: string
  label: string
  required?: boolean
  placeholder?: string
}

/** 解析阶段上下文（供适配器 parse 使用） */
export interface AdapterParseContext {
  /** 用户填写的参数 */
  params: Record<string, string>
  /** 实际抓取的 URL */
  url: string
}

/**
 * 单个站点适配器（基础层核心抽象）。
 * 只描述「怎么构建 URL、怎么解析内容」，不涉及数据库 / IPC / 刷新主流程。
 */
export interface FeedAdapter {
  /** 唯一标识，如 'v2ex-hot'、'bilibili-user-video' */
  id: string
  /** 展示名，如 'V2EX 热帖' */
  name: string
  description?: string
  /** 站点域名（用于发现 / 校验），如 ['v2ex.com'] */
  domains: string[]
  /** 用户需填参数（UP 主 ID、话题等） */
  params: AdapterParam[]
  /** true → 用浏览器内核渲染抓取（反爬 / SPA）；false → 纯 HTTP */
  needsBrowser?: boolean
  /** 声明需要登录 Cookie 的域（如 '.bilibili.com'），由上层配置提供 */
  cookieDomain?: string
  /** 静态请求头（如 Referer），HTTP 抓取时附加 */
  headers?: Record<string, string>
  /** 由参数构建目标 URL */
  buildUrl(params: Record<string, string>): string
  /** 解析抓取到的原始内容（HTML 或 JSON 文本）为统一结构 */
  parse(raw: string, ctx: AdapterParseContext): Promise<ParsedFeed>
}
