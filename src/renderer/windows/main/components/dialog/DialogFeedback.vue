<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import { Button } from '@renderer/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@renderer/shared/components/ui/dialog'
import { useFeedbackDialog } from '@renderer/windows/main/composables/useFeedbackDialog'
import FeedbackForm from '@renderer/windows/main/components/feedback/FeedbackForm.vue'
import FeedbackMineList from '@renderer/windows/main/components/feedback/FeedbackMineList.vue'
import FeedbackDetail from '@renderer/windows/main/components/feedback/FeedbackDetail.vue'

const {
  show,
  view,
  categories,
  mineItems,
  mineLoading,
  mineError,
  selectedItem,
  close,
  toMine,
  toForm,
  toDetail,
  backToList,
  loadMine
} = useFeedbackDialog()
</script>

<template>
  <Dialog :open="show" @update:open="(open: boolean) => (open ? undefined : close())">
    <DialogContent
      class="h-160 max-h-[calc(100vh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-140"
      @escape-key-down.prevent
      @pointer-down-outside.prevent
      @interact-outside.prevent
    >
      <DialogHeader v-if="view === 'form'" class="h-8 flex-row items-center">
        <DialogTitle>提交反馈</DialogTitle>
      </DialogHeader>
      <DialogHeader v-else-if="view === 'detail'" class="h-8 flex-row items-center">
        <Button variant="ghost" size="icon" title="返回" @click="backToList">
          <ArrowLeft class="size-4.5" />
        </Button>
        <DialogTitle class="ml-1">反馈详情</DialogTitle>
      </DialogHeader>
      <DialogHeader v-else class="h-8 flex-row items-center">
        <Button variant="ghost" size="icon" title="返回" @click="toForm">
          <ArrowLeft class="size-4.5" />
        </Button>
        <DialogTitle class="ml-1">我的反馈</DialogTitle>
      </DialogHeader>

      <FeedbackForm v-if="view === 'form'" :categories="categories" @open-mine="toMine" />
      <FeedbackDetail
        v-else-if="view === 'detail' && selectedItem"
        :item="selectedItem"
        :categories="categories"
      />
      <FeedbackMineList
        v-else
        :items="mineItems"
        :loading="mineLoading"
        :error="mineError"
        @refresh="loadMine"
        @create="toForm"
        @select="toDetail"
      />
    </DialogContent>
  </Dialog>
</template>
