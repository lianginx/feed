import { ref } from 'vue'

const focusSignal = ref(0)

export function useSearchFocus() {
  function requestSearchFocus(): void {
    focusSignal.value++
  }

  return { focusSignal, requestSearchFocus }
}
