# 第二期功能

> 以下功能不在第一版范围内，记录设计以便后续实现。

## 1. AI 文章摘要

### 目标

接入 LLM API 自动生成文章摘要，提升阅读效率。

### 技术方案

- 适配 OpenAI API 兼容格式（支持 OpenAI、DeepSeek、Moonshot 等）
- 使用 `fetch` 直接调用 API，无需额外依赖
- 在文章详情页添加"生成摘要"按钮
- 摘要结果缓存到数据库，避免重复调用

### API 配置

```typescript
interface LLMConfig {
  baseUrl: string // API 地址，如 https://api.openai.com/v1
  apiKey: string // API Key
  model: string // 模型名称，如 gpt-4o-mini
  maxTokens?: number // 最大 token 数
}
```

### 存储方式

API Key 使用 **electron-store 明文存储**（不做加密，与 VSCode/OpenCode 等主流工具一致）。

### 实现位置

- Main 进程：`src/main/services/llm.ts`（LLM 服务封装）
- Renderer 进程：设置弹窗配置 API、文章详情页调用摘要

### UI 设计

- 设置弹窗：LLM API 配置表单（baseUrl、apiKey、model）
- 文章详情页：工具栏添加"AI 摘要"按钮
- 摘要展示：折叠面板，显示在文章标题下方

---

## 2. GitHub Gist 云同步 ✅（已实现，设计有变）

> 已实现，实际设计与下述原始设计不同，以下仅为历史记录。现状：
> - 载体三种：GitHub Gist / Gitee 代码片段 / WebDAV（`src/main/services/sync/providers/`）
> - 同步数据：仅订阅源 + 分类（不含用户配置），快照格式见 `services/sync/index.ts`
> - 冲突策略：三方状态比较（local / remote / lastSyncDump），冲突时弹窗二选一

### 目标

通过 GitHub Private Gist 实现订阅源和配置的跨设备同步。

### 参考实现

[great-start](https://github.com/lianginx/great-start) 项目的 `useGistBackup.ts`

### 技术方案

- 使用 GitHub Gist API v3（REST API）
- 用户提供 GitHub Personal Access Token（需 `gist` 权限）
- 同步数据：订阅源列表、分类、用户配置（不含文章数据）
- 同步策略：比对 `lastSyncDump` 避免重复推送；推送前检查远程是否有更新

### 同步数据格式

```typescript
interface GistData {
  feeds: Feed[] // 订阅源列表
  categories: Category[] // 分类
  settings: AppSettings // 用户配置
  version: number // 数据版本号
  updatedAt: number // 更新时间戳
}
```

### 存储方式

GitHub Token 使用 **electron-store 明文存储**（不做加密，与 VSCode/OpenCode 等主流工具一致）。

### 实现位置

- Main 进程：`src/main/services/gist.ts`（Gist API 封装）
- Renderer 进程：设置弹窗同步管理 UI

### UI 设计

- 设置弹窗：同步设置区域
  - Token 输入框（密码输入，显示掩码）
  - 连接状态指示（已连接/未连接）
  - 上次同步时间
  - 备份/恢复/断开按钮
- 自动同步：配置保存时自动推送
- 启动恢复：应用启动时自动从 Gist 恢复

---

## 不考虑的功能

- ❌ 插件系统
- ❌ 移动端适配
