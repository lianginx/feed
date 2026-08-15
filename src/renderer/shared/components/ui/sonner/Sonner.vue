<script lang="ts" setup>
import type { ToasterProps } from 'vue-sonner'
import { reactiveOmit } from '@vueuse/core'
import { Toaster } from 'vue-sonner'

const props = defineProps<ToasterProps>()
const delegatedProps = reactiveOmit(props, 'toastOptions')
</script>

<template>
  <Toaster
    class="toaster group"
    v-bind="{
      ...delegatedProps
    }"
  />
</template>

<style>
[data-sonner-toaster] [data-sonner-toast] {
  app-region: no-drag;
}
</style>
