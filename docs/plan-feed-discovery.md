# Plan: 网址自动发现（Feed Discovery）

## 背景

当前添加订阅要求用户提供 RSS 地址，但目标新用户（从未用过 RSS）不知道 RSS 地址是什么、去哪里找，是完成第一次订阅的最大障碍与破圈主要流失点。

RSSHub Radar 扩展已验证一套成熟、低误报的发现策略：先识别页面明确声明的 feed 来源，再对疑似 feed 链接逐一抓取验证。本方案将该能力移植到添加订阅流程（仅参考策略，AGPL-3.0 禁止搬源码）。

## 目标

1. 用户粘贴任意网页地址即可完成订阅，不再需要预先知道 RSS 地址
2. 直接粘贴 RSS 地址时保持原有体验，直达订阅，不被发现流程拖慢
3. 发现失败时给出明确出路（手动输入 / 内置路由），不产生死胡同

## 用户故事

1. **新用户**：粘贴网站首页 → 自动发现可订阅 feed → 确认订阅，全程不需要理解 RSS
2. **RSS 老手**：直接粘贴 feed 地址 → 识别出这本身就是 feed → 跳过发现，一键订阅
3. **受挫用户**：网站没有任何 feed → 明确失败提示 + 引导到内置路由或手动输入

## 已确认决策

1. **范围：P0 + P1 一起做**。P1 三项（单候选自动选中、已订阅标记禁重复、发现中可取消）成本都小，且「已订阅标记」与 P0 查重边界情况天然耦合
2. **JSON Feed 本期自研解析**。feedparser 库是纯 XML 解析器，从原理上不支持 JSON Feed（JSON 格式），需在 rss.ts 自行补解析分支（约 60 行），映射到现有 `ParsedFeed/ParsedArticle`，后续入库/刷新/渲染管线走既有抽象自动兼容
3. **容错优先 + 足量单测**（用户明确要求）：解析器对畸形输入一律回退不抛错，担心历史包袱导致后续天天适配，因此配标准 + 畸形样本单测保证健壮
4. **单次抓取复用**：输入地址只 fetch 一次——先按 feed 解析（XML→feedparser / JSON→自研分支），成功即直连订阅；失败则同一份 body 当 HTML 进入发现流程，零二次抓取
5. **全部候选一律验证后展示**（含 `<link>` 声明），保证「误报为零：展示的候选必然可订阅」
6. **隐私**：发现仅本地完成，不向第三方上报用户粘贴的网址（RSSHub 兜底属后续迭代，届时单独评估）
7. 直连 feed 识别成功后**直接订阅并关窗**（与现状一致，用户故事 2「一键订阅」）
8. 单候选发现结果**自动选中**，用户只需点一次「订阅」（相对多候选少一次勾选点击）
9. 候选列表图标用首字母占位；订阅后由现有 favicon 流程补真实图标（沿用现有自动识别链路）

## 功能需求

### P0 — 核心发现

1. **输入兼容**：地址输入框接受任意 http(s) 网页地址或 RSS 地址
2. **输入分流**：
   - 粘贴内容本身可解析为有效 feed → 直接按现有订阅流程订阅，不触发发现
   - 普通网页 → 触发自动发现
3. **发现规则（按优先级递进）**：
   - a. 页面头部标准声明：`<link>` 标签声明的 feed，覆盖 RSS / Atom / RDF / JSON Feed 常见类型变体
   - b. `feed:` 协议链接：页面上以 `feed:` 协议标注的链接
   - c. 启发式候选：地址路径以 feed / rss / atom 结尾的链接，或链接文字、标题、类名中独立出现 "rss" 字样的链接；此类候选**必须逐个抓取验证确实可解析为 feed 后才展示**
4. **结果展示**：候选列表（feed 标题 + 地址）勾选确认；标题沿用现有自动识别逻辑
5. **去重**：同一 feed 不同入口只展示一次；地址规范化（相对路径解析为绝对、协议变体归一）

### P0 — 失败与兜底

1. 未发现任何 feed：明确文案（「未在该网站找到可订阅的 RSS」）+ 两条出路：**重试并手动输入地址** / **改用内置路由**
2. 超时或网络错误：沿用现有订阅失败的错误提示风格与文案体系
3. 需要登录或反爬拦截的页面（403 等）：按失败处理，走兜底路径

### P1 — 体验优化

1. 仅发现一个候选时简化确认步骤（自动选中，减少一次点击）
2. 已订阅过的候选标记「已订阅」，禁止重复添加
3. 发现过程中允许取消，取消后输入框回到可编辑状态

## 交互细节

1. **触发方式**：粘贴/输入地址后经「确定」或回车触发；先尝试按 feed 直连识别，失败自动转入发现流程（老手零额外步骤）
2. **加载态**：发现期间展示进行中并允许取消；总时长上限约 15 秒，超时按失败处理
3. **多候选**：按来源优先级排序（声明在前、启发式验证通过在后）；超过 10 条截断并提示
4. **批量订阅**：一次勾选多个同时订阅，反馈方式参照现有批量先例（OPML 导入的 `{total, added, skipped}`）

## 边界情况

| 场景 | 预期行为 |
| --- | --- |
| 粘贴内容不是网址（普通文本、邮箱等） | 维持现有格式校验提示（`isValidRssUrl` 零网络校验前置） |
| 粘贴的是 feed 地址本身 | 直接识别为 feed，不触发发现 |
| 网站无响应、超时 | 失败提示 + 兜底出路 |
| 页面返回 403 / 需要登录 | 按失败处理，走兜底 |
| 发现出的 feed 实际无法访问或解析 | 不展示该候选（验证阶段拦截） |
| 重定向 | 以最终地址为准归属 feed |
| 候选全部重复（均已订阅） | 提示「该网站的订阅源已全部添加」 |

## 技术方案

### 总体流程

```
渲染层「确定」
  → IPC feeds:discover (url, requestId)
    → 主进程 fetch 输入地址（单次，redirect follow，res.url 为最终地址）
      → parseFeedContent(body) 成功 → { kind: 'feed' } → 渲染层走现有 handleAddRss
      → 失败 → cheerio 提取候选 → 逐个验证 → { kind: 'candidates' | 'none' | 'failed' }
  → 渲染层候选列表勾选 → IPC feeds:addMany → added>0 关窗（notifyFeedAdded，与现状一致）
```

### 共享类型 `src/shared/types/discovery.ts`（新）

```ts
export type DiscoverySource = 'declared' | 'protocol' | 'heuristic'
export interface DiscoveredFeedCandidate {
  url: string
  title: string
  source: DiscoverySource
  subscribed: boolean
}
export type DiscoveryResult =
  | { kind: 'feed'; url: string; title: string }
  | { kind: 'candidates'; candidates: DiscoveredFeedCandidate[]; truncated: boolean }
  | { kind: 'none' }
  | { kind: 'failed'; reason: string }
```

### JSON Feed 解析（`src/main/services/rss.ts` 修改）

- 新增导出 `parseFeedContent(text)`：嗅探分发（trim 后 `{` 开头 → JSON 分支，否则 → `parseFeedXml`）；`parseFeed` 与发现服务统一走它
- 新增 `parseJsonFeed`：校验 `version` 含 `jsonfeed.org/version/`；映射 `home_page_url`→link、`content_html`/`content_text`→content、`date_published`→pubDate、`authors[0].name`→author、`icon/favicon`→image；`contentComplete` 对齐现有契约（L36）
- **容错优先**：字段缺失/类型错误/空数组/非法日期一律回退不抛错，仅在完全不像 feed（无 version）时失败；复用 `sanitizeHttpUrl` 过滤 URL 协议

### 发现服务 `src/main/services/discovery.ts`（新）

`discoverFeeds(rawUrl, existingUrls, signal)`，预算常量：总 15s / 页面抓取 8s / 单候选 8s / 验证并发 4 / 验证上限 24 条 / 展示上限 10 条（`AbortSignal.any` 合并 deadline 与单请求超时）：

1. URL 校验（http/https），`fetchWithTimeout` + `BROWSER_USER_AGENT` + `Accept: text/html`，redirect follow，`res.url` 为最终地址
2. `parseFeedContent` 成功 → `{ kind: 'feed', url: 最终地址, title }`
3. cheerio 提取候选（优先级递进）：
   - **declared**：`link[rel~=alternate|feed]` 且 type 匹配 `/(rss|atom|rdf)\+xml|feed\+json/`；`title` 属性作为标题提示
   - **protocol**：`a[href^=feed:|feeds:]` 归一化为 https
   - **heuristic**：路径末段匹配 `^(feed|rss|atom|feeds)(\.(xml|rss|atom|json|php|aspx|jsp))?$`，或链接文字/title/class 含独立词 `\brss\b`；上限 15 条
4. 归一化去重：相对地址按页面最终地址解析、去 hash、host 小写、去尾 `/`；key = host+path+search（http/https 同径视为同一条）；排除页面自身地址
5. 已订阅标记：现有订阅 URL 同规则归一化建 Set 比对；验证后按重定向最终地址复查一次
6. **全部候选逐个验证**：并发 4 → 2xx → `parseFeedContent` → 保留 `{ url: 重定向最终地址, title: 解析标题 || 声明提示 || 地址 }`，不可解析即丢弃
7. 按 declared → protocol → heuristic 排序，返回前 10（`truncated` 标记）；全部 subscribed 仍返回 candidates（渲染层展示「已全部添加」）

导出 `normalizeFeedUrl` 供 IPC 层与单测复用；错误文案复用 `toFriendlyFeedError` / `friendlyStatusText`（rss.ts L44-124 唯一文案表）。

### IPC 与 preload

`src/main/ipc/feeds.ts` 新增（注册在 guardIpcHandlers 之后，自动获得来源守卫）：

- `feeds:discover (url, requestId)`：查 `SELECT url FROM feeds` → `discoverFeeds`；AbortController 存 `Map<requestId>`，finally 清理；内部已分类错误走 `kind:'failed'`，信封 error 仅兜意外异常
- `feeds:discoverCancel (requestId)`：abort 对应 controller
- `feeds:addMany (items: {url, title?, siteUrl?}[])`：抽出 `addRss` 插入逻辑共用；逐条查重 + INSERT（含 `site_url`，发现来源带上网页地址，首刷后由 `parsed.link` 回填覆盖）→ `{added, skipped}`；added>0 时 refreshSingleFeed + scheduleSync + notifyFeedAdded（关窗）；全 skipped 不关窗（渲染层提示）

`src/preload/index.ts` / `index.d.ts` 同步补 `discover / discoverCancel / addMany`，类型引 `@shared/types/discovery`。

### 渲染层（守 300 行约束，拆分组件）

- `windows/addfeed/composables/useDiscovery.ts`（新）：状态机 `idle / running / candidates / none / failed / allAdded`；`start(url)`（requestId = crypto.randomUUID；`kind:'feed'` 回调直连添加）、`cancel()`、`reset()`；selectedIds 默认全选非订阅项；`matchedAdapters`（页面 host 匹配 `AdapterInfo.domains`，供兜底面板建议）；`subscribeSelected()`（addMany，added==0 → allAdded 提示）
- `windows/addfeed/components/discovery/DiscoveryResultPanel.vue`（新）四态：
  - running：Spinner「正在识别…」+ 取消（P1.3）
  - candidates：checkbox 列表（首字母头像 + 标题 + 地址；subscribed 项 badge「已订阅」禁选 P1.2）+「订阅所选 (N)」+ 截断提示；单候选自动选中（P1.1）
  - none / failed：失败文案（none 用固定文案，failed 用 reason）+「返回修改」+「改用内置路由」；`matchedAdapters` 非空时列出建议路由，点击直接切换到对应路由表单
  - allAdded：「该网站的订阅源已全部添加」
- `AddFeedApp.vue` 拆分（现 318 行已超限，随本任务收敛）：
  - RSS 表单 + 发现面板 → `components/rss/RssSourceForm.vue`（url 用 defineModel 接 `onInitialUrl` 预填；`kind:'feed'` → emit 给父级走现有 `handleAddRss`）
  - 适配器表单 → `components/adapter/AdapterSourceForm.vue`
  - 父壳保留左侧导航、`onAddResult` 订阅、error Alert
- 发现期间输入框 disabled；修改 URL / 切换 tab / 取消 → reset 回可编辑状态
- 文案：字段 label「RSS 地址」→「网址」，placeholder「粘贴网站首页或 RSS 地址，自动识别」（保留 RSS 术语，仅优化流程）

### 安全要点（Electron 最佳实践）

- 抓取的网页内容仅在主进程解析；传给渲染层的只有 URL 与标题字符串，Vue 文本插值渲染，不用 v-html
- 新 IPC 走既有 guardIpcHandlers 来源校验；渲染层 sandbox + contextIsolation 现状不变

## 测试 `src/main/__tests__/services/discovery.test.ts`（新）

- `parseJsonFeed`：标准样本 + 畸形样本（缺字段 / 类型错 / 空 items / 非法日期 / 非 feed JSON）
- 提取与优先级：HTML fixture（declared / protocol / heuristic / 相对路径解析 / feed: 归一化 / 去重 / 排除自身）
- 验证与降级：mock fetch——验证失败丢弃、重定向最终地址归属、subscribed 标记、截断
- deadline 中止行为

## 非功能要求

1. **性能**：验证抓取并发上限 4；单候选独立超时 8s；总时长 ≤15s
2. **安全**：网页内容仅在主进程解析；feed 内容展示仍走现有消毒链路
3. **隐私**：不向第三方上报网址，发现仅本地完成
4. **稳定性**：发现失败不影响其他功能；网络异常下无未清理中间状态（requestId Map finally 清理）

## 实施拆分与提交规划

分支 `feat/feed-discovery`（基于 main fd82876）。注意：`feat/builtin-routes-expand`（未合入）中的 54a855b 判重前置改动涉及同一批文件（`ipc/feeds.ts`、`AddFeedApp.vue`），后续 rebase 合入 main 时留意冲突。

1. `feat: 支持 JSON Feed 订阅源解析` —— rss.ts 解析分支 + 单测
2. `feat: 新增 RSS 自动发现服务与 IPC` —— discovery.ts + IPC + preload 类型 + 单测
3. `feat: 添加订阅窗口接入网址自动发现` —— 渲染层组件拆分、候选列表、批量订阅、失败兜底

每步提交均可构建运行。收尾运行 `pnpm typecheck` + `pnpm lint:fix`，PRD 边界表逐项验收。
