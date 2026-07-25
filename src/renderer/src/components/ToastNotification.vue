<script setup lang="ts">
import type { ToastMessage } from '../composables/useToast'

defineProps<{
  toasts: ToastMessage[]
}>()

const emit = defineEmits<{
  dismiss: [id: number]
}>()
</script>

<template>
  <Teleport to="body">
    <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      <TransitionGroup name="toast">
        <div
          v-for="t in toasts"
          :key="t.id"
          class="px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all duration-300 cursor-pointer max-w-sm"
          :class="{
            'bg-green-600 text-white': t.type === 'success',
            'bg-red-600 text-white': t.type === 'error',
            'bg-blue-600 text-white': t.type === 'info'
          }"
          @click="emit('dismiss', t.id)"
        >
          {{ t.message }}
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active {
  transition: all 0.3s ease;
}

.toast-leave-active {
  transition: all 0.2s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(1rem);
}

.toast-leave-to {
  opacity: 0;
  transform: translateY(-0.5rem);
}
</style>
