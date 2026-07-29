import { ref, type Ref } from 'vue'

const showAddFeed = ref(false)

export function useAddFeedDialog(): { showAddFeed: Ref<boolean> } {
  return { showAddFeed }
}
