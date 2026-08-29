import type { ParsedFeed } from '@main/services/rss'
import type { FetchPageOptions } from './core/fetcher/http'
import type { BrowserFetchOptions, BrowserFetchResult } from './core/fetcher/browser'

/** 适配器参数控件类型（动态表单据此渲染） */
export type AdapterParamType = 'text' | 'number' | 'select' | 'textarea' | 'url' | 'boolean'

/** 适配器参数声明：用户在添加订阅源时填写 */
export interface AdapterParam {
  key: string
  label: string
  required?: boolean
  placeholder?: string
  /** 控件类型，默认 text */
  type?: AdapterParamType
  /** 字段辅助说明 */
  description?: string
  /** select 类型选项 */
  options?: { label: string; value: string }[]
}

/** 解析阶段上下文（供适配器 parse 使用） */
export interface AdapterParseContext {
  /** 用户填写的参数 */
  params: Record<string, string>
  /** 实际抓取的 URL */
  url: string
}

/**
 * 取数通道类型（source）。划分标准是「数据契约形态」而非传输实现：
 * - http / browser：URL → 原始文本（HTML/JSON）→ parse，同一通道，用 needsBrowser 选 fetcher
 * - telegram（二期）：客户端 → 结构化消息对象 → parseFromClient
 * 新增数据源：在此扩展一个值 + 实现 SourceRunner 并在运行期 registerSource。
 */
export type SourceKind = 'http' | 'browser'

/**
 * 单个站点适配器（基础层核心抽象）。
 * 只描述「怎么构建 URL、怎么解析内容」，不涉及数据库 / IPC / 刷新主流程。
 * source 缺省为 http（现有适配器无需声明）；声明了已注册的自定义 source 时，
 * 由对应 SourceRunner 执行（见 core/runner.ts 分发器）。
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
  /** 取数通道，缺省 http（向后兼容）；自定义通道（如 telegram）二期接入 */
  source?: SourceKind
  /** true → 用浏览器内核渲染抓取（反爬 / SPA）；false → 纯 HTTP */
  needsBrowser?: boolean
  /** 声明需要登录 Cookie 的域（如 '.bilibili.com'），由上层配置提供 */
  cookieDomain?: string
  /** 声明该站点的登录页 URL（设置里「用浏览器登录」用） */
  loginUrl?: string
  /** 声明登录态 cookie 名（全部出现即视为已登录，如 ['SESSDATA']） */
  loginCookieNames?: string[]
  /**
   * 声明浏览器抓取时注入的 cookie 白名单（只注入这些；缺省注入全部）。
   * 用于过滤浏览器指纹类 cookie（如 B 站 buvid3/buvid_fp）：这些 cookie 与环境
   * 真实指纹不匹配时会被站点风控识别，导致数据接口返回空。让页面 JS 自行生成更稳。
   */
  injectCookieNames?: string[]
  /**
   * 页面内提取脚本（needsBrowser 适配器可选）：一段在渲染进程执行的 JS，
   * 返回「可 JSON 序列化」的结构化数据（如条目数组）。声明后浏览器抓取会在渲染进程
   * 直接提取数据，parse 收到的是 JSON 文本而非整页大 HTML——避免主进程 cheerio 解析
   * 深度嵌套大 HTML 导致的原生栈溢出崩溃（SIGSEGV），也更快更省内存。
   */
  browserExtract?: string
  /** 静态请求头（如 Referer），HTTP 抓取时附加 */
  headers?: Record<string, string>
  /** HTTP 请求方法，缺省 GET；POST 用于以 JSON body 传参的站点接口（如掘金） */
  httpMethod?: 'POST'
  /** 构建 POST 请求体（JSON 文本）；httpMethod 为 POST 时必配 */
  buildBody?: (params: Record<string, string>) => string
  /**
   * 可选：抓取后补充 feed 级元信息（如 UP 主名/头像/简介），由上层（addAdapter / refreshSingleFeed）调用。
   * 适合纯 HTTP 适配器里 UP 主信息不在列表接口的场景。
   */
  fetchMeta?: (
    params: Record<string, string>,
    feed: ParsedFeed
  ) =>
    | Promise<{ title?: string; description?: string; imageUrl?: string }>
    | { title?: string; description?: string; imageUrl?: string }
  /** 由参数构建目标 URL */
  buildUrl(params: Record<string, string>): string
  /**
   * 站点首页（人工页面），订阅源 site_url 的权威来源：添加时即写入、刷新时优先于 parsed.link。
   * 抓取地址（buildUrl）常是 JSON API，直接当站点链接会打开裸数据。缺省回落 parsed.link。
   */
  siteUrl?: string | ((params: Record<string, string>) => string)
  /** 解析抓取到的原始内容（HTML 或 JSON 文本）为统一结构 */
  parse(raw: string, ctx: AdapterParseContext): Promise<ParsedFeed>
}

/** 适配器执行结果 */
export interface AdapterRunResult {
  adapterId: string
  url: string
  feed: ParsedFeed
}

/** fetcher 依赖注入（单测可 mock，避免真实网络 / Electron） */
export interface AdapterFetchers {
  http?: (url: string, options?: FetchPageOptions) => Promise<string>
  browser?: (url: string, options?: BrowserFetchOptions) => Promise<BrowserFetchResult>
}

/** runAdapter 选项 */
export interface RunAdapterOptions {
  fetchers?: AdapterFetchers
  /** 登录态 Cookie（name → value），由上层配置提供 */
  cookies?: Record<string, string>
}

/**
 * 取数通道执行器（SourceRunner）。
 * 框架通过 registerSource 注册自定义 source 的执行器；runAdapter 按 adapter.source 查表分发，
 * 未注册 / 未声明 source 的适配器走内置 http runner（缺省路径）。
 */
export interface SourceRunner {
  /** 执行适配器，返回 ParsedFeed（含适配器元信息） */
  run(
    adapter: FeedAdapter,
    params: Record<string, string>,
    options: RunAdapterOptions
  ): Promise<AdapterRunResult>
}
