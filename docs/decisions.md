# 技术文档索引与决策记录

> 开发时请查阅以下官方文档获取最新信息，避免使用过时的 LLM 训练数据。

## ⚠️ 安全注意事项

- **RSS 文章 `articles.content` 为裸存，渲染前必须用 `sanitizeHtml`（DOMPurify）净化**（feedparser 不做任何 XSS 过滤）
- **禁止直接 `v-html` 裸渲染**
- 详见：https://github.com/cure53/DOMPurify#readme

## 数据库注意事项

- **数据库使用 Node 内置 `node:sqlite`（`DatabaseSync`）**，零外部依赖、无原生模块编译问题
- 需要 Node.js 22.5+（Electron 39 内置的 Node 版本已满足）
- 详见：https://nodejs.org/api/sqlite.html

## 核心框架

| 技术          | 版本 | 官方文档                                  |
| ------------- | ---- | ----------------------------------------- |
| Electron      | ^39  | https://www.electronjs.org/docs           |
| Vue 3         | ^3.5 | https://vuejs.org/guide/introduction.html |
| TypeScript    | ^5.9 | https://www.typescriptlang.org/docs/      |
| Vite          | ^7.2 | https://vite.dev/guide/                   |
| electron-vite | ^5.0 | https://electron-vite.org/guide/          |

## UI & 样式

| 技术         | 版本        | 官方文档                                       |
| ------------ | ----------- | ---------------------------------------------- |
| shadcn-vue   | latest (v4) | https://www.shadcn-vue.com/                    |
| Tailwind CSS | v4          | https://tailwindcss.com/docs                   |
| Reka UI      | latest      | https://reka-ui.com/ （shadcn-vue 底层原语库） |
| Lucide Icons | latest      | https://lucide.dev/icons/                      |

## 状态管理

| 技术           | 版本 | 官方文档                                                |
| -------------- | ---- | ------------------------------------------------------- |
| Vue 组合式 API | —    | https://vuejs.org/guide/extras/reactivity-in-depth.html |

## 功能库

| 技术                         | 版本   | 用途                                 | 官方文档                                                           |
| ---------------------------- | ------ | ------------------------------------ | ------------------------------------------------------------------ |
| feedparser                   | ^2.6   | RSS/Atom 解析                        | https://github.com/danmactough/node-feedparser                     |
| node:sqlite                  | Node 内置 | SQLite 数据库                     | https://nodejs.org/api/sqlite.html                                 |
| electron-store               | ^11    | 配置存储                             | https://github.com/sindresorhus/electron-store#readme              |
| @tanstack/vue-virtual        | latest | 虚拟滚动                             | https://tanstack.com/virtual/latest                                |
| dompurify                    | latest | HTML 净化（防 XSS）                  | https://github.com/cure53/DOMPurify#readme                         |
| @vueuse/core                 | ^14.3  | 渲染层工具函数（shadcn 基础组件 reactiveOmit、useLocalStorage 等） | https://vueuse.org/                                                |

## 开发工具

| 技术             | 版本  | 官方文档                        |
| ---------------- | ----- | ------------------------------- |
| ESLint           | ^9.39 | https://eslint.org/docs/latest/ |
| Prettier         | ^3.7  | https://prettier.io/docs/       |
| electron-builder | ^26   | https://www.electron.build/     |

## 决策记录

| 决策             | 选择                                            | 理由                                                                  |
| ---------------- | ----------------------------------------------- | --------------------------------------------------------------------- |
| 模块系统         | ESM（`"type": "module"`）                       | electron-store v11 等纯 ESM 包需要，项目本身已在用 ESM 语法，风险极低 |
| 存储方案         | 分层存储（electron-store + node:sqlite）      | 配置轻量、文章数据量大，分开管理；node:sqlite 为 Node 内置，无原生模块编译负担 |
| UI 框架          | shadcn-vue + TailwindCSS v4                     | 源码级组件高度可定制、设计现代简约、AI 友好                           |
| 状态管理         | Vue 组合式 API（Composable）                    | 零依赖、代码直观、TypeScript 类型推断优秀                             |
| 快捷键           | Electron 原生菜单加速器                        | 原生支持（⌘N/R/F/E/D 等），无渲染层依赖、无 JS 延迟                 |
| RSS 解析         | feedparser                                      | 流式解析、RSS/Atom 兼容性好                                           |
| HTML 净化        | DOMPurify                                       | feedparser 不做 XSS 过滤，Electron 中 v-html 必须净化                 |
| OPML 导入导出    | opml（Dave Winer）                              | 最成熟的 OPML 库，支持 parse/stringify                                |
| 虚拟滚动         | @tanstack/vue-virtual                           | 配合 shadcn-vue 使用，性能优秀                                        |
| 拖拽排序         | 原生 HTML5 拖拽                                  | 零依赖、实现简单，无需第三方库                                    |
| 图标             | @lucide/vue                                     | 与 shadcn-vue 原生集成，图标简洁现代                                  |
| 架构设计         | 清晰的进程分层                                  | Renderer 负责 UI，Main 负责业务逻辑和数据存储                         |
| macOS 启动崩溃修复 | fuses 翻转 + `resetAdHocDarwinSignature: true` | 未签名构建（CI）翻转 fuses 会破坏 ad-hoc 签名，启动被内核杀死；开启后 flipFuses 自动对整个 .app 重新 ad-hoc 签名，有真实证书的构建不受影响 |
| macOS 钥匙串弹窗 | 关闭 `enableCookieEncryption`（fuse 置 false），不设 `--password-store` | v0.6.2 曾用 `--password-store=basic`，但它只影响 Chromium 密码存储、与 Cookie 加密（走 Keychain）无关，无法消除弹窗；v0.6.3 关闭 Cookie 加密才是根治。权衡：Cookie 磁盘加密降级为基础加密（安全清单 #4 主动回退），换取无弹窗启动体验 |
| 应用名称         | Feed                                            | 简洁直接                                                              |
| 关闭行为         | 最小化到系统托盘                                | 不退出应用，托盘右键菜单恢复/退出                                     |
| 文章存储         | 存完整 HTML（裸存，仅 `normalizeContentImages`；渲染前 `sanitizeHtml` 净化） | 支持离线阅读，规避主进程 `JSDOM` 常驻泄漏                             |
| 数据库 schema    | 三张表 + FTS5                                   | feeds/categories/articles + 全文搜索虚拟表                            |
| 文章去重         | UNIQUE(feed_id, guid)                           | 同一订阅源内文章唯一，防止重复入库                                    |
| 文章内容更新     | 覆盖保存                                        | 匹配到已有 article 则直接覆盖 content/title/author，不保留历史        |
| 数据库索引       | 6 个索引（含复合索引）                          | 保障文章列表查询性能                                                  |
| 分页策略         | Keyset Pagination（游标分页）                   | 基于 (published_at, id) 游标，默认 50 条/页，支持无限滚动             |
| 数据库迁移       | DIY 零依赖（_migrations 表 + migrations.ts 内联迁移） | 完全控制，无额外依赖，事务安全                                  |
| 容错策略         | 20s 超时 + 失败自动重试 3 次 + last_error 记录展示 | 避免频繁请求被封，优雅处理网络异常                                 |
| CSP 策略         | img-src/media-src 允许 https:                   | 安全同时保证 RSS 文章中的图片/视频正常加载                            |
| Tailwind v4 集成 | @theme inline + @custom-variant dark            | 桥接设计变量到 Tailwind 工具类，data-theme 属性驱动暗色模式           |
| Favicon 方案     | 自实现 5 层降级 + 磁盘缓存                      | 无需外部库，NetNewsWire 已验证的模式                                  |
| OPML 导入冲突    | 静默跳过 + toast 汇总报告                       | 符合 Miniflux/FreshRSS/NetNewsWire 等行业共识做法                     |
| 窗口状态记忆     | debounce(500ms) 持续保存                        | 异常崩溃也不丢失窗口位置                                              |
| API Key 存储     | electron-store 明文                             | 与 VSCode/OpenCode 等主流做法一致，不做过度设计                       |
| 格式支持         | RSS + Atom                                      | feedparser 原生支持，文档统一表述                                     |

> 分期说明：**路由架构 / 统一缓存 / 全局代理**为一期（立即实施）；**Telegram 相关**为二期目标（待 api_id/api_hash 申请成功，暂缓）。

| 路由架构          | source 判别联合 + 注册表分发                     | 开闭原则：加新数据源只需新增模块+注册，分发器与 core 不改            |
| 统一缓存          | services/cache/（favicon:// 保留 + media:// 新增） | 同一套 LRU/清理/协议机制，favicon 记录零迁移                        |
| 网络代理          | 全局（自动跟随系统代理 → 手动覆盖）              | 覆盖 MTProto/Node fetch/浏览器三条路径，满足隐私与未来需求           |
| Telegram 取数方式 | MTProto（mtcute）+ 用户账号登录                  | Bot API 读不了任意频道/私有内容；mtcute 纯 TS 无 native，适合 Electron 分发 |
| Telegram 凭据     | 用户自备 api_id/api_hash                        | 申请免费即时；应用内置共享 api_id 全量用户共用易触发封号、违反官方"每号一 api_id"限制 |
| Telegram 账号模型 | 全局单账号                                      | 一次登录全 app 复用；多账号封号风险翻倍、管理复杂                     |
| Telegram 登录     | 二维码（auth.exportLoginToken）                 | 免短信验证码/2FA 输入，桌面端体验最好                                |
| Telegram web 降级 | 暂缓（二期移除），一期保留 web 解析             | 二期移除后单一路径；一期以 web 解析为过渡，功能不倒退               |
| Telegram 更新     | 定时轮询增量（getHistory + offset_id）          | 契合现有 refresher；连接时间短，封号信号弱                           |
| Telegram 媒体     | 图片/音频本地缓存，视频/文档跳转链接             | 媒体无公开直链（MTProto 无 URL 概念），本地下载是唯一稳定方案；视频体积大不值当 |
| IPC 错误处理     | `{ success, data?, error? }`                    | 统一格式，调用方只需判断 success                                      |
