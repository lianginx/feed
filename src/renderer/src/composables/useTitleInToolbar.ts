import { ref, watch, nextTick, onUnmounted, useTemplateRef } from 'vue'
import type { Ref } from 'vue'

export interface UseTitleInToolbarReturn {
  titleInToolbar: Ref<boolean>
}

/**
 * 文章标题滚出视野后显示在顶栏（类似 macOS 原生标题栏）。
 *
 * 通过 IntersectionObserver 监测标题是否滚出滚动区顶部，
 * 以顶栏高度为 top 裁切——标题滚进顶栏下方即视为“消失”，
 * 此时把标题放进顶栏显示。
 *
 * 使用方式：文章标题元素需绑定 `ref="articleTitle"`。
 *
 * @param contentRef  滚动容器
 * @param toolbarRef  顶栏元素（用于测量高度）
 * @param resetSignal 值变化时重置并重新监测（例如切换文章）
 */
export function useTitleInToolbar(
  contentRef: Ref<HTMLElement | null>,
  toolbarRef: Ref<HTMLElement | null>,
  resetSignal: Ref<unknown>
): UseTitleInToolbarReturn {
  const titleRef = useTemplateRef<HTMLElement>('articleTitle')
  const titleInToolbar = ref(false)
  let titleObserver: IntersectionObserver | null = null

  function observeTitle(): void {
    titleObserver?.disconnect()
    titleInToolbar.value = false
    const container = contentRef.value
    const title = titleRef.value
    if (!container || !title) return
    const inset = toolbarRef.value?.offsetHeight ?? 0
    titleObserver = new IntersectionObserver(
      ([entry]) => {
        titleInToolbar.value = !entry.isIntersecting
      },
      { root: container, rootMargin: `-${inset}px 0px 0px 0px`, threshold: 0 }
    )
    titleObserver.observe(title)
  }

  watch(resetSignal, () => nextTick(() => observeTitle()), { immediate: true })

  onUnmounted(() => titleObserver?.disconnect())

  return { titleInToolbar }
}
