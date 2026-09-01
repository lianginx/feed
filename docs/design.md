# 设计风格

**核心理念**：内容优先，UI 克制，拒绝 AI 味

## 设计原则

1. **极致留白**：大量负空间，让内容呼吸
2. **清晰层级**：通过字号、字重、颜色深浅建立视觉层级
3. **克制色彩**：主色 + 1-2 个强调色，大面积中性色
4. **精确排版**：系统字体栈，行高 1.5-1.7，中文用苹方/思源黑体
5. **微妙交互**：200-300ms 过渡动画，精确的 hover/active 状态
6. **内容优先**：UI 元素不抢内容风头

## 设计参考

- **Reeder**：时间线同步、极简布局、流畅动画
- **NetNewsWire**：经典三栏、键盘导航、智能订阅源
- **Things 3**：极致简约、色彩运用、微交互
- **Bear**：阅读体验、主题系统、标签

## 主题实现（现状）

配色基于 shadcn-vue 的 CSS 变量体系（oklch 色彩空间），源码即事实，以下文件为准：

- `src/renderer/shared/assets/css/main.css` — 入口：引入 tailwindcss、typography、shadcn.css、prose.css、theme.css
- `src/renderer/shared/assets/css/shadcn.css` — 全部语义变量（`--background`、`--primary` 等）与 `@theme inline` 桥接
- `src/renderer/shared/assets/css/theme.css` — 应用专属变量（未读点、星标色、canvas、FAB 阴影）

暗色模式由设置项 `theme`（light / dark / system，默认 system）经 `nativeTheme.themeSource` 应用，CSS 侧通过 `prefers-color-scheme` 自动响应。调整配色直接改上述 CSS 文件，本文档不再维护具体色值。

### 使用方式

模板中直接用语义化的 Tailwind 类名：

```vue
<div class="bg-background text-foreground">
  <aside class="bg-card">
    <p class="text-muted-foreground">内容</p>
    <button class="bg-primary text-primary-foreground">按钮</button>
  </aside>
</div>
```

## 快捷键方案

使用 Electron 原生菜单加速器实现固定快捷键（`src/main/app/menu.ts`），无需渲染层依赖、无 JS 延迟；菜单项通过 `webContents.send` 向渲染进程下发指令，由 `useMenuCommands.ts` 统一监听处理。

### 默认绑定

| 菜单   | 快捷键                 | 动作                     |
| ------ | ---------------------- | ------------------------ |
| 应用   | `Cmd/Ctrl + ,`         | 设置                     |
| 应用   | `Cmd/Ctrl + Q`         | 退出                     |
| 订阅源 | `Cmd/Ctrl + N`         | 添加订阅源               |
| 订阅源 | `Cmd/Ctrl + R`         | 刷新当前订阅源           |
| 订阅源 | `Cmd/Ctrl + Shift + R` | 刷新全部                 |
| 订阅源 | `Cmd/Ctrl + Shift + A` | 全部标为已读             |
| 文章   | `Cmd/Ctrl + F`         | 搜索文章                 |
| 文章   | `Cmd/Ctrl + E`         | 标为已读 / 标记未读      |
| 文章   | `Cmd/Ctrl + Shift + E` | 全部文章标为已读         |
| 文章   | `Cmd/Ctrl + D`         | 收藏 / 取消收藏          |
| 文章   | `Alt + T`              | 翻译当前文章（显示原文） |
| 文章   | `Alt + Shift + T`      | 强制刷新翻译             |

### 实现要点

- 依赖上下文动态禁用：未选中文章时禁用 ⌘E/⌘D/翻译，未选中订阅源时禁用 ⌘R（渲染进程通过 `menu:updateState` 上报状态）；未配置翻译时翻译菜单项及其分隔线整体隐藏（`visible` 而非 `disabled`），与阅读器工具栏按钮行为一致
- 编辑菜单（剪切/拷贝/粘贴/全选）使用原生 role，无渲染层参与
- 无「启用快捷键」开关——原生菜单加速器由系统级处理，无需配置
