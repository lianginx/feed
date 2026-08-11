<script setup lang="ts">
import { Toaster } from '@renderer/shared/components/ui/sonner'
import { useApp } from '@renderer/shared/composables/useApp'

const { resolvedTheme } = useApp()
</script>

<template>
  <Toaster
    :theme="resolvedTheme"
    rich-colors
    close-button
    :duration="3000"
    :gap="8"
    position="bottom-right"
  />
</template>
