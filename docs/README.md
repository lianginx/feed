# Feed — RSS/Atom 阅读器

基于 Electron + Vue 3 + TypeScript 构建的个人桌面端 RSS/Atom 阅读器，简洁现代，专注阅读本身。

## 设计理念

**个人使用，简洁优先。** 拒绝功能堆砌，只保留让阅读"舒服"的核心功能。市面 RSS 阅读器太复杂太杂，这个项目要反其道而行。

## 技术栈

- **前端框架**：Vue 3 + TypeScript + Vite
- **模块系统**：ESM（`"type": "module"` in package.json）
- **UI 组件库**：shadcn-vue + TailwindCSS v4（源码级组件，高度可定制）
- **状态管理**：Vue 组合式 API（Composable 模块，零依赖）
- **快捷键绑定**：@vueuse/core 的 useMagicKeys（固定绑定+开关，自定义绑定延后）
- **RSS 解析**：rss-parser（支持 RSS + Atom）
- **数据存储**：better-sqlite3（文章数据） + electron-store v11（配置）
- **HTML 净化**：dompurify（防 XSS，所有文章内容必须净化）
- **OPML 导入导出**：opml（Dave Winer 维护，成熟稳定）
- **桌面框架**：Electron 39
- **构建工具**：electron-vite 5
- **虚拟滚动**：@tanstack/vue-virtual
- **拖拽排序**：vue-dnd-kit（备选：vue-draggable-plus）
- **图标**：@lucide/vue
- **系统托盘**：Electron 内置 Tray + Menu API

## TypeScript 约定

**务实原则**：类型是为了写代码更舒服，不是为了写类型体操。

### 允许
- 接口/类型定义清晰明确
- 函数参数和返回值有类型
- `as` 用于合理的类型收窄
- `any` 用于类型确实不好定义的地方
- 工具类型（`Pick`、`Omit`、`Partial`）适度使用

### 禁止
- ❌ 为了类型而类型，增加无意义的复杂度
- ❌ 嵌套 5 层以上的泛型
- ❌ 到处 `as any` 逃避类型检查
- ❌ 重复定义相似的类型（该合并就合并）
- ❌ 类型和实现混在一个文件超过 200 行

## 文件结构

```
src/
├── main/
│   ├── index.ts              # 主进程入口（窗口创建、托盘、生命周期）
│   ├── database/
│   │   ├── index.ts          # 数据库初始化 + 迁移运行器
│   │   ├── connection.ts     # 单例数据库连接
│   │   └── migrations/       # 数据库迁移 SQL 文件
│   ├── services/
│   │   ├── rss.ts            # RSS/Atom 解析服务
│   │   ├── favicon.ts        # Favicon 多层降级获取
│   ├── config.ts             # 配置管理（electron-store v11）
│   ├── tray.ts               # 系统托盘管理
│   └── ipc.ts                # IPC 通信（集中管理，统一错误处理）
├── preload/
│   ├── index.ts              # 预加载脚本（window.api 扩展）
│   └── index.d.ts            # 类型声明
└── renderer/
    ├── src/
    │   ├── main.ts           # Vue 入口
    │   ├── App.vue           # 根组件（三栏布局）
    │   ├── composables/      # 状态管理
    │   │   ├── useFeeds.ts
    │   │   ├── useArticles.ts
    │   │   └── useApp.ts
    │   ├── components/
    │   │   ├── ui/           # shadcn-vue 组件
    │   │   ├── Sidebar.vue
    │   │   ├── ArticleList.vue
    │   │   ├── ArticleReader.vue
    │   │   ├── AddFeedDialog.vue
    │   │   ├── AddCategoryDialog.vue
    │   │   └── SettingsDialog.vue
    │   ├── utils/
    │   │   ├── sanitize.ts   # DOMPurify HTML 净化
    │   │   └── index.ts
    │   ├── lib/
    │   │   └── utils.ts      # cn() 工具函数
    │   └── assets/
    │       └── css/
    │           └── main.css  # Tailwind v4 入口（@theme + @custom-variant）
    └── index.html
```

## 文档索引

| 文档                                     | 内容                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| [architecture.md](./architecture.md)     | IPC 通信设计、错误处理、容错策略、进程交互                                  |
| [database.md](./database.md)             | 数据库 schema、索引、分页、迁移方案（feeds / categories / articles / FTS5） |
| [design.md](./design.md)                 | 设计风格、配色方案、Tailwind v4 集成、快捷键方案                            |
| [implementation.md](./implementation.md) | 6 阶段实现步骤（含去重/分页/迁移/favicon）                                  |
| [decisions.md](./decisions.md)           | 技术决策记录、技术文档索引（含所有新增决策）                                |
| [verification.md](./verification.md)     | 验证方案（功能 / 安全 / 体验 / 构建）                                       |
| [phase2.md](./phase2.md)                 | 第二期功能（AI 摘要、Gist 云同步）                                          |
| [alternatives.md](./alternatives.md)     | 备选方案（拖拽排序方案对比）                                                |
