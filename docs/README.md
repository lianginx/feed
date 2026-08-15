# Feed — RSS/Atom 阅读器

基于 Electron + Vue 3 + TypeScript 构建的个人桌面端 RSS/Atom 阅读器，简洁现代，专注阅读本身。

## 设计理念

**个人使用，简洁优先。** 拒绝功能堆砌，只保留让阅读"舒服"的核心功能。

## 技术栈

- **桌面框架**：Electron 39 + electron-vite 5
- **前端**：Vue 3 + TypeScript + Vite（ESM）
- **UI**：shadcn-vue + TailwindCSS v4（源码级组件）
- **状态管理**：Vue 组合式 API（零依赖）
- **RSS 解析**：rss-parser（RSS + Atom）
- **数据存储**：better-sqlite3（文章）+ electron-store v11（配置）
- **HTML 净化**：dompurify（防 XSS，所有文章内容必须净化）
- **快捷键**：Electron 原生菜单加速器
- **虚拟滚动**：@tanstack/vue-virtual
- **拖拽排序**：原生 HTML5 拖拽
- **图标**：@lucide/vue
- **其他**：opml（导入导出）、系统托盘（Electron 内置 Tray + Menu）

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

## 文档索引

| 文档                                 | 内容                                |
| ------------------------------------ | ----------------------------------- |
| [architecture.md](./architecture.md) | IPC 通信、错误处理、进程交互        |
| [database.md](./database.md)         | 数据库 schema、索引、分页、迁移方案 |
| [design.md](./design.md)             | 设计风格、配色、快捷键方案          |
| [implementation.md](./implementation.md) | 实现步骤                       |
| [decisions.md](./decisions.md)       | 技术决策记录                        |
| [verification.md](./verification.md) | 验证方案（功能 / 安全 / 体验 / 构建） |
| [phase2.md](./phase2.md)             | 第二期功能规划                      |
| [alternatives.md](./alternatives.md) | 备选方案对比                        |
| [release.md](./release.md)           | 发布与分发                          |
| [sync-article-state.md](./sync-article-state.md) | 文章状态同步设计方案        |
