/**
 * 轻量语言检测（CJK/拉丁字符占比估算）。
 * 仅用于「源语言 ≈ 目标语言」的跳过判断，翻译请求一律 from=auto，不喂检测结果。
 * 简体（zh）与繁体（zh-Hant）视为不同语言：简繁互译不走跳过。
 * 保守阈值：不确定返回 'unknown'，不跳过。
 */

export type DetectedLang = 'zh' | 'zh-Hant' | 'en' | 'ja' | 'ko' | 'unknown'

const KANA = /[\u3040-\u30ff]/
const HANGUL = /[\uac00-\ud7af]/
const HAN = /[\u4e00-\u9fff\u3400-\u4dbf]/
const LATIN = /[a-zA-Z]/

/** 简体特有字（简体常用而繁体不用的字，用于简繁区分） */
const SIMPLIFIED_SET = '们这说时为发经国见门风东马龙飞过还进给现对头从开乐单双号网'
/** 繁体特有字 */
const TRADITIONAL_SET = '們這說時為發經國見門風東馬龍飛過還進給現對頭從開樂單雙號網'

/** 分析样本上限（字符），大文章只取开头足够样本即可 */
export const SAMPLE_LIMIT = 2000

export function detectLanguage(text: string): DetectedLang {
  if (!text) return 'unknown'
  const sample = text.slice(0, SAMPLE_LIMIT)

  let total = 0
  let han = 0
  let kana = 0
  let hangul = 0
  let latin = 0
  let simp = 0
  let trad = 0

  for (const ch of sample) {
    if (/\s/.test(ch)) continue
    total++
    if (KANA.test(ch)) {
      kana++
    } else if (HANGUL.test(ch)) {
      hangul++
    } else if (HAN.test(ch)) {
      han++
      if (SIMPLIFIED_SET.includes(ch)) simp++
      else if (TRADITIONAL_SET.includes(ch)) trad++
    } else if (LATIN.test(ch)) {
      latin++
    }
  }

  if (total === 0) return 'unknown'

  const hanRatio = han / total
  const kanaRatio = kana / total
  const hangulRatio = hangul / total
  const latinRatio = latin / total

  // 汉字主导（>40%）判为中文（基于提取后的纯文本，阈值放宽以容忍少量英文干扰）
  if (hanRatio > 0.4) {
    if (simp > trad && simp > 0) return 'zh'
    if (trad > simp && trad > 0) return 'zh-Hant'
    return 'zh'
  }
  if (kanaRatio > 0.3) return 'ja'
  if (hangulRatio > 0.3) return 'ko'
  if (latinRatio > 0.6) return 'en'
  return 'unknown'
}

/**
 * 源语言是否与目标语言相同（用于跳过判断）。
 * 只有检测到明确语言且与目标完全一致时才跳过；unknown 一律不跳过。
 */
export function isSameLanguage(detected: DetectedLang, target: string): boolean {
  if (detected === 'unknown') return false
  return detected === target
}

/** 微软检测返回的语言码 → 应用级 DetectedLang；未知语言归为 unknown */
export function toDetectedLang(lang: string): DetectedLang {
  switch (lang) {
    case 'zh':
    case 'zh-Hans':
    case 'zh-CN':
      return 'zh'
    case 'zh-Hant':
    case 'zh-TW':
    case 'zh-HK':
      return 'zh-Hant'
    case 'en':
      return 'en'
    case 'ja':
      return 'ja'
    case 'ko':
      return 'ko'
    default:
      return 'unknown'
  }
}
