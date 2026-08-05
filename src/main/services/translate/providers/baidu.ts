import { createHash } from 'crypto'
import { z } from 'zod'
import { BaseTranslator } from 'anylang/esm/translators/BaseTranslator.js'
import type { TranslatorOptions } from 'anylang/esm/translators/BaseTranslator.js'
import { toBaiduCode } from '../languages'

/**
 * 百度翻译适配器（自定义 anylang 适配器）。
 * 参考 DeepLTranslator 模板实现，接入百度通用翻译 API：
 * POST https://fanyi-api.baidu.com/api/trans/vip/translate
 * 认证：MD5(appid + q + salt + 密钥)
 */

export interface BaiduCredentials {
  appid: string
  secretKey: string
  // BaseTranslator<C> 约束 C extends Record<string, unknown>
  [key: string]: unknown
}

export const BAIDU_API_HOST = 'https://fanyi-api.baidu.com/api/trans/vip/translate'

/** 百度 API 错误码 → 中文说明 */
export const BAIDU_ERROR_MESSAGES: Record<string, string> = {
  '52001': '请求超时，请重试',
  '52002': '系统错误，请重试',
  '52003': '未授权用户，请检查 appid 是否正确',
  '54000': '必填参数为空',
  '54001': '签名错误，请检查 appid 与密钥',
  '54003': '访问频率受限，请稍后再试',
  '54004': '账户余额不足',
  '54005': '长 query 请求频繁，请稍后再试',
  '58000': '客户端 IP 非法',
  '58001': '译文语言方向不支持',
  '58002': '服务当前已关闭',
  '90107': '认证未通过或未生效'
}

/** 确定性错误（签名/凭据/余额等），重试无意义，直接报错 */
const DETERMINISTIC_CODES = new Set(['52003', '54001', '54004', '58000', '58001', '58002', '90107'])

export interface BaiduApiError extends Error {
  /** 百度错误码（存在时） */
  code?: string
  /** false = 确定性错误不重试；undefined = 网络/超时等可重试 */
  retryable?: boolean
}

export function baiduErrorText(code: string): string {
  return BAIDU_ERROR_MESSAGES[code] ?? `翻译失败（${code}）`
}

/** 计算百度 API 签名：MD5(appid + q + salt + 密钥)，q 为实际发送的待翻译文本（UTF-8） */
export function buildBaiduSign(appid: string, q: string, salt: string, secretKey: string): string {
  return createHash('md5').update(`${appid}${q}${salt}${secretKey}`).digest('hex')
}

/**
 * 构造百度 q 参数：一次翻译多段文本用换行符 \n 分隔（百度官方推荐方式）。
 * 百度不支持 JSON 数组 q——传 `q=["a","b"]` 会被当普通文本翻译，译文带 `["..."]` 方括号。
 * 段内换行折叠为空格，避免被误判为额外分段导致响应 trans_result 数量错位。
 */
export function buildBaiduQuery(text: string[]): string {
  return text.map((t) => t.replace(/\n+/g, ' ')).join('\n')
}

const BaiduResponseSchema = z.object({
  error_code: z.string().optional(),
  error_msg: z.string().optional(),
  trans_result: z
    .array(z.object({ src: z.string(), dst: z.string() }))
    .optional()
    .default([])
})

export class BaiduTranslator extends BaseTranslator<BaiduCredentials> {
  static readonly translatorName = 'BaiduTranslator'
  static isRequiredKey = (): boolean => true
  static isSupportedAutoFrom = (): boolean => true
  static getSupportedLanguages(): string[] {
    return [
      'zh',
      'cht',
      'en',
      'jp',
      'kor',
      'fra',
      'spa',
      'ru',
      'de',
      'it',
      'nl',
      'pt',
      'th',
      'vie',
      'ara',
      'pl',
      'cs',
      'uk'
    ]
  }

  getLengthLimit(): number {
    return 6000
  }

  getRequestsTimeout(): number {
    // 百度认证后（高级版）QPS=10，请求间隔 = 1000/10 = 100ms
    // （未认证标准版为 1 QPS；认证实名后即提升为 10 QPS）
    return 100
  }

  /**
   * 百度按 UTF-8 字节计数（6000 字节），覆盖基类按字符数的默认实现。
   * 本仓库分批走 packPieces（字节上限取 getLengthLimit），不调用此方法；
   * 但它是 anylang TranslatorInstanceMembers 接口契约，anylang 的 Scheduler
   * （文本自动分批）会调用它——删除会回退到字符计数，对百度这类按字节限额的
   * 提供商（1 汉字 = 3 字节）会低估超限，故保留以确保接口语义正确。
   */
  checkLimitExceeding(text: string | string[]): number {
    const plain = Array.isArray(text) ? text.join('') : text
    const extra = Buffer.byteLength(plain, 'utf8') - this.getLengthLimit()
    return extra > 0 ? extra : 0
  }

  /**
   * anylang 契约要求返回 string，失败时按约定返回 ''（批量接口 translateBatch 才用 null 表示失败项）。
   * 本库翻译流程统一走 translateBatch，此单发方法仅用于满足接口与外部兼容。
   */
  async translate(text: string, from: string, to: string): Promise<string> {
    const [result] = await this.translateBatch([text], from, to)
    return result ?? ''
  }

  async translateBatch(text: string[], from: string, to: string): Promise<(string | null)[]> {
    // 百度官方：一次翻译多段文本用换行符 \n 分隔 q（不支持 JSON 数组，见 buildBaiduQuery 说明）
    const q = buildBaiduQuery(text)
    const salt = String(Date.now())
    const sign = buildBaiduSign(this.options.appid, q, salt, this.options.secretKey)

    const params = new URLSearchParams({
      q,
      from,
      to: toBaiduCode(to),
      appid: this.options.appid,
      salt,
      sign
    })

    const res = await this.fetch(`${BAIDU_API_HOST}?${params.toString()}`, {
      responseType: 'json',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Feed/1.0 (Electron RSS Reader)',
        ...this.options.headers
      }
    })

    const data = BaiduResponseSchema.parse(res.data)
    if (data.error_code) {
      const code = data.error_code
      const err = new Error(baiduErrorText(code)) as BaiduApiError
      err.code = code
      err.retryable = !DETERMINISTIC_CODES.has(code)
      throw err
    }

    const results = data.trans_result.map((r) => r.dst)
    return text.map((_, i) => results[i] ?? null)
  }
}

export type BaiduTranslatorOptions = TranslatorOptions<BaiduCredentials>
