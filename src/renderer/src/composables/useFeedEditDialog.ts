import { ref } from 'vue'
import type { FeedItem } from '@/composables/useFeeds'

const editingFeed = ref<FeedItem | null>(null)
const showEditFeed = ref(false)

export function useFeedEditDialog() {
  function open(feed: FeedItem): void {
    editingFeed.value = feed
    showEditFeed.value = true
  }

  function close(): void {
    showEditFeed.value = false
    editingFeed.value = null
  }

  return { editingFeed, showEditFeed, open, close }
}
