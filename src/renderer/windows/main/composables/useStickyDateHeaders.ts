import { ref } from 'vue'
import type { ComponentPublicInstance } from 'vue'

export function useStickyDateHeaders(getViewport: () => HTMLElement | null) {
  const stuckDates = ref<Set<string>>(new Set())
  const headerEls = new Map<string, HTMLElement>()

  function setHeaderRef(el: Element | ComponentPublicInstance | null, dateKey: string) {
    if (el instanceof HTMLElement) headerEls.set(dateKey, el)
    else headerEls.delete(dateKey)
  }

  function updateStuckHeaders() {
    const viewport = getViewport()
    if (!viewport) return
    if (viewport.scrollTop <= 0) {
      if (stuckDates.value.size > 0) stuckDates.value = new Set()
      return
    }
    const vTop = viewport.getBoundingClientRect().top
    const next = new Set<string>()
    for (const [dateKey, el] of headerEls) {
      if (el.getBoundingClientRect().top <= vTop) next.add(dateKey)
    }
    if (next.size !== stuckDates.value.size || [...next].some((k) => !stuckDates.value.has(k))) {
      stuckDates.value = next
    }
  }

  return { stuckDates, setHeaderRef, updateStuckHeaders }
}
