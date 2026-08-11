import { ref, computed, watch } from 'vue'
import { toast } from 'vue-sonner'
import { useApp } from '@renderer/shared/composables/useApp'
import { useArticles } from '@renderer/windows/main/composables/useArticles'
import type { TranslateResult } from '@renderer/shared/types'

/**
 * 文章翻译（模块级单例，多个组件共享同一份状态）。
 * - translating：翻译进行中
 * - translated：当前文章的译文（绑定 articleId，防切文章串台）
 * - shown：是否显示译文（false = 原文）
 * - configured：是否已配置翻译凭据（驱动按钮/菜单显示）
 */

const translating = ref(false)
// 请求序号：并发/切文章场景下仅最后一个发起的请求负责复位 translating，
// 防止旧请求的 finally 把仍在途的新请求标志提前复位（评审建议 2）
let reqSeq = 0
const translated = ref<{
  articleId: number
  title: string
  content: string
  degraded: boolean
} | null>(null)
const shown = ref(false)

export function useTranslate() {
  const { translateConfig } = useApp()
  const { currentArticle } = useArticles()

  /** 已配置凭据（渲染层复刻 createTranslateProvider 的完整性判断，两处需保持一致；
   *  因配置已由主进程下发到渲染层，本地 computed 免去额外 IPC，仍属合理做法） */
  const configured = computed(() =>
    translateConfig.value.provider === 'baidu'
      ? Boolean(translateConfig.value.baiduAppid) && Boolean(translateConfig.value.baiduSecretKey)
      : translateConfig.value.provider === 'edge'
  )

  async function performTranslate(articleId: number, forceRefresh: boolean): Promise<void> {
    const result = await window.api.translate.article(articleId, undefined, forceRefresh)
    if (result.success && result.data) {
      const data = result.data as TranslateResult
      // 展示前校验 articleId：翻译请求进行中切了文章，旧响应不落盘不展示
      if (currentArticle.value?.id !== articleId) return
      if (data.skipped) {
        toast.info('文章已为目标语言，无需翻译')
        return
      }
      translated.value = {
        articleId,
        title: data.title,
        content: data.content,
        degraded: data.degraded
      }
      shown.value = true
      if (data.degraded) {
        toast.info('部分段落翻译失败，已保留原文')
      }
    } else {
      toast.error(`翻译失败：${result.error || '未知错误'}`)
    }
  }

  async function toggle(): Promise<void> {
    if (shown.value) {
      shown.value = false
      return
    }
    const article = currentArticle.value
    if (!article || translating.value) return

    const seq = ++reqSeq
    translating.value = true
    try {
      await performTranslate(article.id, false)
    } finally {
      if (seq === reqSeq) translating.value = false
    }
  }

  async function refresh(): Promise<void> {
    const article = currentArticle.value
    if (!article || translating.value) return
    const seq = ++reqSeq
    translating.value = true
    try {
      await performTranslate(article.id, true)
    } finally {
      if (seq === reqSeq) translating.value = false
    }
  }

  watch(currentArticle, () => {
    translated.value = null
    shown.value = false
  })

  // 关闭翻译/清空凭据后：清空已显示的译文回到原文，避免按钮隐藏后无法切回（评审建议 6）
  watch(configured, (val) => {
    if (!val) {
      translated.value = null
      shown.value = false
    }
  })

  return { translating, translated, shown, configured, toggle, refresh }
}
