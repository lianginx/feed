import type { TranslateConfig } from '@main/config'
import type { Fetcher } from 'anylang/esm/utils/fetcher/types.js'
import type { TranslatorInstanceMembers } from 'anylang/esm/translators/Translator.js'
import { fetchWithTimeout } from '@main/services/http'
import { BaiduTranslator } from './baidu'
import { EdgeTranslator } from './edge'

export type { TranslatorInstanceMembers } from 'anylang/esm/translators/Translator.js'

const USER_AGENT = 'Feed/1.0 (Electron RSS Reader)'

/**
 * 适配 anylang Fetcher 契约：用 http.ts 的 fetchWithTimeout（20s 超时）发请求，
 * 并把标准 Response 转成 anylang 的 FetcherResponse 形状（含 data）。
 * Node 下请求统一带 User-Agent。
 */
const anylangFetcher: Fetcher = async (url, options) => {
  const { responseType, headers, ...rest } = options
  const res = await fetchWithTimeout(url, {
    ...rest,
    headers: { 'User-Agent': USER_AGENT, ...(headers ?? {}) }
  })
  const data =
    responseType === 'json'
      ? await res.json()
      : responseType === 'arrayBuffer'
        ? await res.arrayBuffer()
        : await res.text()
  const headerMap = new Map<string, string>()
  res.headers.forEach((value, key) => headerMap.set(key, value))
  return { headers: headerMap, ok: res.ok, status: res.status, statusText: res.statusText, data }
}

/**
 * 根据配置创建翻译提供商实例。
 * 配置不完整（如缺 appid / secretKey）时返回 null（镜像 createSyncProvider）。
 */
export function createTranslateProvider(config: TranslateConfig): TranslatorInstanceMembers | null {
  switch (config.provider) {
    case 'baidu':
      return config.baiduAppid && config.baiduSecretKey
        ? new BaiduTranslator({
            appid: config.baiduAppid,
            secretKey: config.baiduSecretKey,
            fetcher: anylangFetcher,
            headers: {}
          })
        : null
    case 'edge':
      // 微软 Edge 免费接口：免注册 / 免 API key
      return new EdgeTranslator({ fetcher: anylangFetcher, headers: {} })
    default:
      return null
  }
}
