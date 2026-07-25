# 实现步骤

> 6 个阶段，每个阶段完成后可独立验证。

## 阶段一：项目初始化与基础架构（1-2天）

### 1. 切换 ESM + 依赖安装与配置
- `package.json` 加 `"type": "module"`（让 electron-store v11 等纯 ESM 包正常工作）
- 安装 UI 相关：shadcn-vue、tailwindcss v4、@tailwindcss/vite、@lucide/vue、clsx、tailwind-merge、reka-ui
- 安装功能相关：rss-parser、better-sqlite3、electron-store v11、@tanstack/vue-virtual、@vue-dnd-kit/core、dompurify、@types/dompurify、@vueuse/core、opml、cheerio
- 初始化 shadcn-vue（`npx shadcn-vue@latest init --template vite`，默认 Tailwind v4）
- 配置 TypeScript 类型定义
- 配置 ESLint 和 Prettier 规则
- 更新 Content-Security-Policy（`index.html`），详见 [architecture.md](./architecture.md#content-security-policy)

### 2. 目录结构搭建
- 创建标准的 Electron + Vue 3 目录结构
- 配置路径别名（@renderer、@main、@preload、@/）
- 设置环境变量配置

### 3. 主进程基础架构
- 初始化 better-sqlite3 数据库
- 初始化 electron-store 配置管理
- 实现基础 IPC 通信框架

---

## 阶段二：数据层实现（1-2天）

### 4. 数据库设计与实现
- 数据库文件位于 `app.getPath('userData')/feed.db`
- 详见 [database.md](./database.md) 了解完整 schema
- 实现数据库初始化（创建表、索引、FTS 虚拟表）
- 实现数据库迁移框架（`_migrations` 表 + 顺序 SQL 文件）
- 实现基础 CRUD 操作

### 5. RSS 解析服务
- 封装 rss-parser 为服务类
- 实现 feed 解析和文章提取
- 实现错误处理

### 6. 配置管理
- 使用 electron-store v11 管理用户偏好（ESM 模块）
- 配置项：主题（深色/浅色/跟随系统）、更新间隔、快捷键开关、字体大小、窗口状态（位置+尺寸）
- 所有配置（含 API Key）统一明文存储，不做额外加密

---

## 阶段三：核心功能实现（2-3天）

### 7. 订阅源管理
- 实现添加/删除/编辑订阅源
- 实现订阅源的验证
- 实现分类管理（创建/重命名/删除分类）
- 实现订阅源拖拽排序（同一分类内）
- 实现订阅源拖拽移动（跨分类）
- 实现 Favicon 服务（多层降级：feed.image → HTML link → /favicon.ico → Google → 彩色占位符），保存到 feeds.favicon_url

### 8. 文章获取与存储
- 实现手动/定时刷新
- RSS 文章内容**保存前使用 DOMPurify 净化**，存储净化后的内容
- 文章去重与更新覆盖：按 `(feed_id, guid)` 匹配，不存在则插入，存在则更新 content/title/author/published_at
- 实现已读/未读状态
- 实现星标功能
- 实现"全部标记已读"
- 实现 Keyset Pagination（基于 published_at + id 游标，每页 50 条）

### 9. 文章阅读
- 实现文章列表展示（虚拟滚动）
- 实现文章内容渲染

---

## 阶段四：界面开发（2-3天）

### 10. 主界面布局
- 使用 shadcn-vue 的 Resizable 组件实现可拖拽三栏布局
- 使用 CSS 变量实现深色/浅色模式切换

### 11. 侧边栏
- 分类列表（可折叠，使用 Collapsible 组件）
- 分类下的订阅源（显示未读数 + 网站图标）
- **拖拽排序**：订阅源可在同一分类内拖拽排序
- **拖拽移动**：订阅源可拖拽到其他分类
- 添加订阅源、添加分类
- 右键菜单：编辑、删除、移动到其他分类
- 底部：全部已读按钮

### 12. 文章列表
- 使用 @tanstack/vue-virtual 实现虚拟滚动
- 显示：标题、来源、时间、星标状态
- 筛选：全部 / 未读 / 星标
- 基础搜索框

### 13. 阅读区域
- 文章内容渲染（HTML，存储时已净化，可直接渲染）
- 工具栏：星标、在浏览器中打开、标记已读
- 自动标记已读（滚动到底部）

---

## 阶段五：进阶功能（1-2天）

### 14. 搜索功能
- 使用 SQLite FTS5 实现全文搜索
- 简单的搜索结果列表

### 15. 导入导出
- OPML 文件导入（静默跳过重复订阅源，导入完成后 toast 汇总报告）
- OPML 文件导出

### 16. 自动更新
- 后台定时刷新订阅源
- 可配置更新间隔（默认 30 分钟）

---

## 阶段六：优化与完善（1-2天）

### 17. 快捷键（使用 @vueuse/core 的 useMagicKeys）
- 默认快捷键（固定绑定，不支持自定义）：
  - `↓/↑` 上下移动（仅在文章列表聚焦时）
  - `Enter` 打开文章
  - `Cmd/Ctrl + B` 星标（Bookmark）
  - `Cmd/Ctrl + R` 刷新
  - `Cmd/Ctrl + Shift + A` 全部已读
  - `Esc` 返回文章列表
- 支持快捷键开关（设置页面可禁用）
- 输入框中自动禁用快捷键（useMagicKeys 内置支持）
- 自定义绑定延后到后续迭代（方案 B）

### 18. 系统托盘
- 使用 `electron` 内置的 `Tray` + `Menu` API
- 关闭窗口时最小化到托盘（不退出应用）
- 托盘右键菜单：显示主窗口、刷新所有订阅、退出
- 点击托盘图标恢复窗口显示
- macOS 下使用 Template 图标（自动适配深色/浅色模式）

### 19. 窗口状态记忆
- 使用 electron-store 记住窗口大小和位置
- 应用启动时恢复上次窗口状态
- 首次启动使用默认尺寸 1200x800
- **防抖保存**：监听窗口 `move`/`resize` 事件，`debounce(500ms)` 持续保存，异常崩溃时也不丢失
- 关闭窗口时再存一次作为兜底

### 20. 测试与调试
- 功能测试
- 修复 bug
