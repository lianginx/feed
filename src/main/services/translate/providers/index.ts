import type { TranslateConfig } from '@main/config'
import type { Fetcher } from 'anylang/esm/utils/fetcher/types.js'
import type { TranslatorInstanceMembers } from 'anylang/esm/translators/Translator.js'
import { fetchWithTimeout } from '@main/services/http'

export type { TranslatorInstanceMembers } from 'anylang/esm/translators/Translator.js'

const USER_AGENT = 'Feed/1.0 (Electron RSS Reader)'

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

export async function createTranslateProvider(
  config: TranslateConfig
): Promise<TranslatorInstanceMembers | null> {
  switch (config.provider) {
    case 'baidu': {
      if (!config.baiduAppid || !config.baiduSecretKey) return null
      const { BaiduTranslator } = await import('./baidu')
      return new BaiduTranslator({
        appid: config.baiduAppid,
        secretKey: config.baiduSecretKey,
        fetcher: anylangFetcher,
        headers: {}
      })
    }
    case 'edge': {
      const { EdgeTranslator } = await import('./edge')
      return new EdgeTranslator({ fetcher: anylangFetcher, headers: {} })
    }
    default:
      return null
  }
}
