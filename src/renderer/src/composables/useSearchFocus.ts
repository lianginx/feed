import { ref } from 'vue'

const focusSignal = ref(0)

export function useSearchFocus(): {
  focusSignal: typeof focusSignal
  requestSearchFocus: () => void
} {
  function requestSearchFocus(): void {
    focusSignal.value++
  }

  return { focusSignal, requestSearchFocus }
}
