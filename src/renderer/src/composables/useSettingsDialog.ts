import { ref, type Ref } from 'vue'

const showSettings = ref(false)

export function useSettingsDialog(): { showSettings: Ref<boolean> } {
  return { showSettings }
}
