import { onUnmounted } from 'vue'
import { useArticles } from '@renderer/windows/main/composables/useArticles'

export function registerArticleKeyNav(): void {
  const { navigateArticle, currentArticle } = useArticles()

  function openCurrentInBrowser(): void {
    const article = currentArticle.value
    if (article?.url) window.open(article.url, '_blank')
  }

  function isInteractiveControl(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLElement &&
      target.matches(
        'button, [role="button"], a[href], select, [role="menuitem"], [role="option"], [role="switch"], [role="tab"]'
      )
    )
  }

  const handler = (event: KeyboardEvent): void => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown' && event.key !== 'Enter') return
    if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return
    const target = event.target as HTMLElement | null
    if (
      target &&
      (target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable)
    ) {
      return
    }
    if (event.isComposing) return
    const dialogOpen = document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'
    )
    if (dialogOpen) return
    if (event.key === 'Enter') {
      if (event.repeat) return
      // 焦点在交互控件上时交由其原生处理（如按钮激活），避免劫持
      if (isInteractiveControl(target)) return
      event.preventDefault()
      openCurrentInBrowser()
      return
    }
    event.preventDefault()
    void navigateArticle(event.key === 'ArrowDown' ? 1 : -1)
  }

  window.addEventListener('keydown', handler, true)
  onUnmounted(() => {
    window.removeEventListener('keydown', handler, true)
  })
}
