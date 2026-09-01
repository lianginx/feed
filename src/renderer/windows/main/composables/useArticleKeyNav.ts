import { onUnmounted } from 'vue'
import { useArticles } from '@renderer/windows/main/composables/useArticles'

export function registerArticleKeyNav(): void {
  const { navigateArticle } = useArticles()

  const handler = (event: KeyboardEvent): void => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
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
    event.preventDefault()
    void navigateArticle(event.key === 'ArrowDown' ? 1 : -1)
  }

  window.addEventListener('keydown', handler, true)
  onUnmounted(() => {
    window.removeEventListener('keydown', handler, true)
  })
}
