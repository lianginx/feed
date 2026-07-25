# 备选方案记录

## 拖拽排序方案

当前方案：**vue-dnd-kit**（自研，零依赖，Vue 3.5+）

如果 vue-dnd-kit 实现有问题，可切换到以下备选方案。

### 备选方案 A：vue-draggable-plus

- **GitHub**：https://github.com/Alfred-Skyblue/vue-draggable-plus
- **Stars**：4,012 | **npm 周下载**：230,901
- **底层**：基于 SortableJS
- **优势**：开箱即用，跨列表拖拽只需设置 `group` 属性
- **劣势**：个人维护，6 个月未更新，108 个 open issues

```bash
pnpm add vue-draggable-plus sortablejs
```

```vue
<!-- 跨分类拖拽示例 -->
<VueDraggable v-model="分类A的订阅源" group="feeds" animation="150">
  <div v-for="feed in 分类A的订阅源" :key="feed.id">{{ feed.title }}</div>
</VueDraggable>

<VueDraggable v-model="分类B的订阅源" group="feeds" animation="150">
  <div v-for="feed in 分类B的订阅源" :key="feed.id">{{ feed.title }}</div>
</VueDraggable>
```

### 备选方案 B：@vueuse/integrations 的 useSortable

- **文档**：https://vueuse.org/integrations/useSortable/
- **底层**：基于 SortableJS
- **优势**：VueUse 团队维护，类型完善
- **劣势**：**仅支持单列表排序**，跨列表需手动实现 `onAdd`/`onRemove` 事件，代码量大

```bash
pnpm add @vueuse/integrations sortablejs
```

```ts
// 仅适合单列表排序
import { useSortable } from '@vueuse/integrations/useSortable'

const el = useTemplateRef('el')
const list = shallowRef([...])

useSortable(el, list, { animation: 150 })
```

### 方案对比速查表

| 场景       | vue-dnd-kit | vue-draggable-plus | useSortable   |
| ---------- | ----------- | ------------------ | ------------- |
| 单列表排序 | ✅          | ✅✅               | ✅✅          |
| 跨列表拖拽 | ✅          | ✅✅               | ⚠️ 需手动实现 |
| 多选拖拽   | ✅✅        | ❌                 | ❌            |
| 键盘导航   | ✅✅        | ❌                 | ❌            |
| 生态成熟度 | ⚠️ 较新     | ✅✅               | ✅✅          |
| 维护活跃度 | ✅✅ 活跃   | ⚠️ 停滞            | ✅✅ 活跃     |

### 切换步骤

1. 安装新依赖：`pnpm add vue-draggable-plus sortablejs`（或 `@vueuse/integrations sortablejs`）
2. 移除旧依赖：`pnpm remove @vue-dnd-kit/core`
3. 重构 `Sidebar.vue` 中的拖拽逻辑
4. 测试跨分类拖拽功能
