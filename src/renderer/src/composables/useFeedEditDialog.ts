import { ref } from 'vue'
import type { FeedItem } from './useFeeds'

const editingFeed = ref<FeedItem | null>(null)
const showEditFeed = ref(false)

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
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
