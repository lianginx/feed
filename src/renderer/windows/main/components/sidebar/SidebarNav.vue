<script setup lang="ts">
import { Collapsible, CollapsibleContent } from '@renderer/shared/components/ui/collapsible'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator
} from '@renderer/shared/components/ui/context-menu'
import {
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenuSub
} from '@renderer/shared/components/ui/sidebar'
import { useFeeds } from '@renderer/windows/main/composables/useFeeds'
import { useAddCategoryDialog } from '@renderer/windows/main/composables/useAddCategoryDialog'
import { useFeedDnD } from '@renderer/windows/main/composables/useFeedDnD'
import { useFeedEditDialog } from '@renderer/windows/main/composables/useFeedEditDialog'
import DialogEditFeed from '@renderer/windows/main/components/dialog/DialogEditFeed.vue'
import SidebarFeedItem from '@renderer/windows/main/components/sidebar/SidebarFeedItem.vue'
import SidebarGroupHeader from '@renderer/windows/main/components/sidebar/SidebarGroupHeader.vue'
import SidebarEmptyState from '@renderer/windows/main/components/sidebar/SidebarEmptyState.vue'
import SidebarFeedActions from '@renderer/windows/main/components/sidebar/SidebarFeedActions.vue'
import SidebarViewSwitcher from '@renderer/windows/main/components/sidebar/SidebarViewSwitcher.vue'

const { categories, feeds, loadFeeds, refreshCategoryFeeds } = useFeeds()
const { showAddCategory, handleEditCategory, handleDeleteCategory } = useAddCategoryDialog()
const { editingFeed, showEditFeed, close: closeEditFeed } = useFeedEditDialog()
const {
  dragCategoryId,
  collapsedCategories,
  uncategorizedCollapsed,
  isCategoryCollapsed,
  onDragOverCategory,
  onDragLeaveCategory,
  onDropToCategory
} = useFeedDnD()

async function handleMarkAllReadByCategory(catId: number | null): Promise<void> {
  await window.api.categories.markAllRead(catId)
  await loadFeeds()
}
</script>

<template>
  <SidebarHeader class="px-3 pt-12 pb-2 gap-2" style="app-region: drag">
    <SidebarViewSwitcher />
    <SidebarFeedActions />
  </SidebarHeader>

  <SidebarContent class="px-3">
    <ContextMenu>
      <ContextMenuTrigger class="block h-full">
        <div
          class="h-full"
          @dragover="onDragOverCategory(null, $event)"
          @dragleave="onDragLeaveCategory"
          @drop="onDropToCategory(null, $event)"
        >
          <SidebarEmptyState v-if="categories.length === 0 && feeds.length === 0" />

          <div v-else class="flex flex-col gap-2">
            <div
              v-for="cat in categories"
              :key="cat.id"
              @dragover="onDragOverCategory(cat.id, $event)"
              @dragleave="onDragLeaveCategory"
              @drop="onDropToCategory(cat.id, $event)"
            >
              <Collapsible
                :open="!isCategoryCollapsed(cat.id)"
                class="w-full"
                @update:open="(open: boolean) => (collapsedCategories[cat.id] = !open)"
              >
                <ContextMenu>
                  <ContextMenuTrigger>
                    <SidebarGroup>
                      <SidebarGroupHeader :cat-id="cat.id" :name="cat.name" />
                      <CollapsibleContent>
                        <SidebarMenuSub class="mr-0 pr-0 pt-1 gap-0">
                          <SidebarFeedItem
                            v-for="feed in feeds.filter((f) => f.category_id === cat.id)"
                            :key="feed.id"
                            :feed="feed"
                            :drop-category-id="cat.id"
                            class="pb-1 last:pb-0"
                          />
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarGroup>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem @select="handleMarkAllReadByCategory(cat.id)">
                      全部标为已读
                    </ContextMenuItem>
                    <ContextMenuItem @select.stop="refreshCategoryFeeds(cat.id)">
                      刷新
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem @select="handleEditCategory(cat)">编辑</ContextMenuItem>
                    <ContextMenuItem
                      class="text-destructive! focus:text-destructive"
                      @select="handleDeleteCategory(cat.id)"
                    >
                      删除
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </Collapsible>
            </div>

            <div
              v-if="feeds.filter((f) => f.category_id === null).length > 0"
              v-show="dragCategoryId === null"
              @dragover="onDragOverCategory(null, $event)"
              @dragleave="onDragLeaveCategory"
              @drop="onDropToCategory(null, $event)"
            >
              <Collapsible
                :open="!uncategorizedCollapsed"
                class="w-full"
                @update:open="(open: boolean) => (uncategorizedCollapsed = !open)"
              >
                <ContextMenu>
                  <ContextMenuTrigger>
                    <SidebarGroup>
                      <SidebarGroupHeader :cat-id="null" name="未分类" />
                      <CollapsibleContent>
                        <SidebarGroupContent>
                          <SidebarMenuSub class="mr-0 pr-0 pt-1 gap-0">
                            <SidebarFeedItem
                              v-for="feed in feeds.filter((f) => f.category_id === null)"
                              :key="feed.id"
                              :feed="feed"
                              :drop-category-id="null"
                              class="pb-1 last:pb-0"
                            />
                          </SidebarMenuSub>
                        </SidebarGroupContent>
                      </CollapsibleContent>
                    </SidebarGroup>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem @select="handleMarkAllReadByCategory(null)">
                      全部标为已读
                    </ContextMenuItem>
                    <ContextMenuItem @select.stop="refreshCategoryFeeds(null)">
                      刷新
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </Collapsible>
            </div>
            <div class="h-20" />
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem @select="showAddCategory = true">添加分类</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  </SidebarContent>

  <DialogEditFeed v-model:open="showEditFeed" :feed="editingFeed" @saved="closeEditFeed" />
</template>
