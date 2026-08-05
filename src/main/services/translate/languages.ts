/**
 * 应用级翻译语言码表。
 * 目标语言使用 ISO 639-1 应用码；各提供商若有不同编码在此统一映射（如百度）。
 */

export interface TargetLanguage {
  code: string
  label: string
}

/** 应用级目标语言列表（设置界面与默认值共用） */
export const TARGET_LANGUAGES: TargetLanguage[] = [
  { code: 'zh', label: '简体中文' },
  { code: 'zh-Hant', label: '繁体中文' },
  { code: 'en', label: '英语' },
  { code: 'ja', label: '日语' },
  { code: 'ko', label: '韩语' },
  { code: 'fr', label: '法语' },
  { code: 'de', label: '德语' },
  { code: 'ru', label: '俄语' },
  { code: 'es', label: '西班牙语' }
]

/** 应用码 → 百度翻译语言码（百度特殊编码，其余同码透传） */
const BAIDU_CODE_MAP: Record<string, string> = {
  'zh-Hant': 'cht',
  ja: 'jp', // 百度日语码为 jp，非 ISO 的 ja；漏映射会导致 58001「译文语言方向不支持」
  ko: 'kor',
  fr: 'fra',
  es: 'spa'
}

/** 应用语言码 → 百度翻译语言码；未知码原样透传 */
export function toBaiduCode(code: string): string {
  return BAIDU_CODE_MAP[code] ?? code
}
