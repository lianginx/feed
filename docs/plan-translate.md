# Plan: 文章翻译功能（anylang 多提供商 + 自定义百度适配器 + SQLite 缓存 + 应用层质量保障）

## 目标
- 阅读区工具栏加「翻译」按钮，一键翻译当前文章标题 + 正文，保留排版结构、代码块不翻译，可切回原文
- 多提供商架构：**基于 anylang 库（内置适配器 + 自定义适配器）**，v1 实现百度翻译（自定义适配器）
- 目标语言可配置（默认中文）；译文 SQLite 缓存（article_id + provider + target_lang + source_hash 失效）
- **应用层质量保障：输入侧塑形 + 输出侧校验降级**（见专章）

## 已确认决策
1. 展示：替换显示 + 按钮 toggle 切回原文
2. 保真度：保留块级结构；连续段落打包进同一请求保上下文连贯
3. 缓存：SQLite 表（用户选定，未来可扩展给 LLM 总结）
4. 目标语言：默认 'zh' + 设置可配置
5. **多提供商层：方案 A = anylang v3.4.1**（用户选定）
   - 自定义 `BaiduTranslator extends BaseTranslator`（DeepLTranslator 是模板，~60 行）
   - 不引入 Scheduler/SchedulerWithCache（一次性整篇翻译不需要队列，直接按 getRequestsTimeout() 间隔调 translateBatch）
6. **domtranslator 已评估弃用**：浏览器实时翻译器，按文本节点逐段翻译破坏上下文、不批量、依赖 DOM，与一次性整篇翻译需求错位
7. 交互细节：**未配置凭据时不显示翻译按钮**（需主动到设置启用翻译并配置凭据后出现）；菜单快捷键用 **Option+T**（accelerator `Alt+T`）
8. **引入 vitest 单元测试**（用户选定）：覆盖翻译纯逻辑模块（html/languages/detect/baidu 签名/cache），不测渲染层与 IPC
9. **可行性 PoC 前置**（用户选定）：Phase 1 前用真实 API 验证占位符 token 存活率、批量数组上下文共享、anylang 在 Electron 主进程的兼容性
10. 细节拍板：翻译请求一律 **from=auto**（detect 只做跳过判断）；**zh 与 zh-Hant 视为不同语言**（简繁走翻译，不跳过）；单篇上限 **5 万字符 / 20 请求**；缓存表**保留策略**（30 天或最近 500 篇）；`translated` **绑定 articleId** 防切文章串台

## 调研要点（anylang）
- 包名 `anylang`（`@translate-tools/core` 为旧版 2.1.0），Node≥18、ESM 走 `/esm` 子路径、Apache-2.0、TS 编写、活跃维护
- 依赖 zod/lodash/xpath/xmldom/isomorphic-fetch（**需冒烟验证 isomorphic-fetch 在 Electron 主进程可用**）
- `BaseTranslator<C>`：实现 `getLengthLimit()` / `getRequestsTimeout()` / `translate()` / `translateBatch()`；静态 `translatorName` / `isRequiredKey` / `isSupportedAutoFrom` / `getSupportedLanguages`
- `TranslatorOptions`：apiKey / apiHost / headers / fetcher（可注入自定义 fetcher 加超时 + User-Agent，README 明确 Node 需 UA）
- `translateBatch(texts, from, to)` 返回 `(string|null)[]`（失败项为 null）
- 语言码约定 ISO 639-1；百度码不同（kor/fra/spa/cht）→ 适配器内部映射

## 架构
```
src/main/services/translate/
  providers/
    baidu.ts    — BaiduTranslator extends anylang BaseTranslator（唯一自写适配器）
    index.ts    — createTranslateProvider(config): TranslatorInstanceMembers | null（工厂）
  languages.ts  — 应用级语言码表 + ISO→百度码映射
  detect.ts     — 轻量语言检测（CJK 占比估算源语言）
  html.ts       — cheerio 块级提取/占位符/打包/重建（质量保障核心）
  cache.ts      — SQLite 译文缓存
  index.ts      — TranslateService 编排（含校验/重试/降级）
```

## 应用层翻译效果保障（质量设计）
原理：提供商只把「一段文字」翻成「另一段」；**喂什么、怎么校验、怎么恢复、失败怎么办**由应用层决定。

### 输入侧（塑造喂给翻译器的内容）
1. **整段翻译单元**：p/h1-h6/li/blockquote/td/th 整段作为一个翻译单元，不按文本节点切碎（避免 domtranslator 式逐节点破坏上下文）
2. **连续段落同请求打包**：相邻段落贪心打包进同一请求（≤6000 字节），跨段落共享上下文；单段超限才按句号兜底切分
3. **行内元素占位符**（html.ts 新增，保真度关键）：
   - 提取块时把行内标签（a/strong/em/code/br/img alt/span）替换为独特占位符 token（如 `[[n]]`），记录映射
   - 译文返回后按序恢复标签 → 行内格式/链接/inline code 不丢失，且整段仍是一个翻译单元
   - 恢复前校验 token 数量/顺序；不符（百度偶尔改动占位符）→ 该段降级为纯文本，不失败
4. **保护清单**：URL/邮箱/数字/inline code 统一走占位符（发送前不翻译、恢复原样）
5. **语言检测跳过**（detect.ts）：CJK 字符占比估算源语言，源≈目标（如中文文章目标 zh）直接跳过，返回原文提示「已为目标语言」——省钱且避免无效翻译；检测结果可选喂 from 参数
6. **空段/纯符号段跳过**；**单篇总量上限**（如 >10 万字符或 >20 请求）拒绝并提示，防配额失控

### 输出侧（校验与降级）
7. **逐段校验**：译文非空、非原文、占位符数一致；anylang 契约的 null 项 → 单独重试或降级为原文
8. **有限重试**：超时（52001）/频率（52003）/网络错误 → 指数退避重试 2 次；签名/余额等确定性错误直接报错
9. **部分成功降级**：失败段落保留原文，整篇仍返回译文，不因单段失败整篇失败
10. 错误码 → 友好中文（已有）

### 数据层一致性
11. 缓存 key 含 provider+targetLang+source_hash → 换提供商/换语言/内容变化自动重译（已有）
12. 缓存存**最终译文 HTML**（占位符已恢复），渲染零成本

## Phase 0 可行性 PoC（spike，前置）
0a. 真实 API spike 脚本（临时，验证后删除）：
    - **占位符存活率**：构造含 `[[1]]`/`{{1}}` 等 token 的段落调百度，统计 token 保留/改动/丢失率 → 决定 token 格式与降级阈值
    - **批量上下文**：同一段落「同请求数组项」vs「独立请求」译文对比 → 验证打包是否真有连贯性收益（若无差异，打包仅保留省请求价值）
    - **anylang 兼容性**：Electron 主进程实例化 BaiduTranslator 发起真实请求，确认 isomorphic-fetch/node-fetch 依赖链无兼容问题
0b. 产出：PoC 结论写进提交说明，按结论微调 html.ts 的占位符/打包实现

## Phase 1 主进程服务 + IPC
1. `package.json` — `pnpm add anylang`（dependencies，主进程运行时被打进 asar）
2. `src/main/database/migrations.ts` — migration v7 建表：
   `article_translations(article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE, provider TEXT NOT NULL, target_lang TEXT NOT NULL, source_hash TEXT NOT NULL, translated_title TEXT, translated_content TEXT, created_at INTEGER, updated_at INTEGER, PRIMARY KEY(article_id, provider, target_lang))`
   （不进 articles_fts、不进同步 dump）
3. `src/main/services/http.ts`（新）— 提取共享 `fetchWithTimeout`（20s 超时）；`sync/providers/common.ts` 改为从此导入
4. `src/main/services/translate/languages.ts`（新）— 应用级目标语言列表 `{ code, label }`（zh/zh-Hant/en/ja/ko/fr/de/ru/es）+ `toBaiduCode()` 映射（zh-Hant→cht、ko→kor、fr→fra、es→spa，其余同码，未知码原样透传）
5. `src/main/services/translate/detect.ts`（新）— 轻量语言检测：CJK/拉丁字符占比估算，**仅用于跳过判断**（翻译请求一律 from=auto，不喂 detect 结果）；**zh 与 zh-Hant 视为不同语言不跳过**（简繁走翻译）；基于标题+正文合并样本，保守阈值，不确定返回 unknown 不跳过
6. `src/main/services/translate/providers/baidu.ts`（新）— `BaiduTranslator extends BaseTranslator<{ appid; secretKey }>`：
   - `getLengthLimit()`=6000；**覆盖 `checkLimitExceeding` 用 Buffer.byteLength 按 UTF-8 字节算**（百度上限是字节非字符）
   - `getRequestsTimeout()`=1100（免费版 1 QPS）
   - `translate()` 委托 `translateBatch()`
   - `translateBatch`：POST `https://fanyi-api.baidu.com/api/trans/vip/translate`，q=JSON 数组、from='auto'/to=映射后百度码、appid、salt、sign=MD5(appid+q+secretKey+salt)（sign 按 q 的 JSON 字符串，按百度文档核实）；zod 校验响应、error_code→中文（54001 签名/54003 频率/54004 余额/52001 超时…）
   - 构造时注入 `fetcher`（http.ts 的 fetchWithTimeout 包一层适配 anylang Fetcher 签名）+ headers UA
   - 静态 `isRequiredKey=true`、`isSupportedAutoFrom=true`、`getSupportedLanguages()` 返回百度支持码
7. `src/main/services/translate/providers/index.ts`（新）— `createTranslateProvider(config)`：`baidu` 且 appid+secretKey 齐全 → new BaiduTranslator；否则 null（镜像 createSyncProvider）
8. `src/main/services/translate/html.ts`（新）— 块提取/占位符/打包/重建（质量核心）：
   - 提取：按块级标签有序提取，跳过 pre/code；块内行内标签 → 占位符 token 并记录映射（见质量设计 §3）
   - 打包：按 provider.getLengthLimit()（字节）贪心打包连续块；单块超限按句子边界切分
   - 重建：译文按序恢复占位符→回填原 DOM→序列化；token 数不符降级纯文本
9. `src/main/services/translate/cache.ts`（新）— SQLite 读写；`source_hash = sha256(title+'\n'+content)`；命中 = article_id+provider+target_lang+hash 全匹配；**保留策略**：写入时顺带 DELETE 超过 30 天或超出最近 500 篇的记录
10. `src/main/services/translate/index.ts`（新）— TranslateService：
    - `translateArticle(id, to)`：读文章 → 语言检测（源≈目标直接返回原文+标记）→ 查缓存命中返回 → miss：提取块/占位符→createTranslateProvider→按批调 translateBatch（批间 await getRequestsTimeout()，失败批指数退避重试 2 次）→逐段校验（非空/非原文/占位符数）→失败段保留原文→重建→写缓存→返回 `{title, content, degraded?: boolean}`
    - `testTranslate(config)`：用传入 config 建 provider，translateBatch(['你好，世界'],'auto','en') 验证凭据（保存前可测）
    - 未配置/网络错误 → 友好中文错误；**单篇上限 5 万字符 / 20 请求**，超限拒绝并提示
11. `src/main/ipc/translate.ts`（新）— handler：`translate:article(id, to?)`（to 缺省读配置 targetLang）、`translate:test(config)`；`src/main/ipc/index.ts` 注册

## Phase 2 配置 + preload（parallel with Phase 1）
12. `src/main/config.ts` — `AppSettings` 加 `translate: TranslateConfig`（镜像 SyncConfig）：
    ```ts
    type TranslateProviderKind = 'none' | 'baidu'
    interface TranslateConfig {
      provider: TranslateProviderKind
      baiduAppid?: string
      baiduSecretKey?: string
      targetLang: string  // 默认 'zh'
    }
    ```
    defaults `{ provider:'none', targetLang:'zh' }`
13. `src/preload/index.ts` — `api.translate = { article: (id, to?) => invoke('translate:article', id, to), test: (config) => invoke('translate:test', config) }`
14. `src/preload/index.d.ts` — `TranslateApi` + `AppApi.translate` + `AppSettings` 同步加 translate
15. `src/renderer/src/types.ts` — 补 `TranslateConfig`（渲染层手写重复类型惯例）

## Phase 3 渲染进程 UI（depends on 12-14）
16. `src/renderer/src/composables/useApp.ts` — `translateConfig` ref + `setTranslateConfig`（空串清除约定同 setSyncConfig）+ loadSettings 读取
17. `src/renderer/src/composables/useTranslate.ts`（新，模块级单例同 useArticles）：
    - state：`translating`、`translated: {articleId, title, content, degraded?} | null`、`shown: boolean`；**展示前校验 `translated.articleId === currentArticle.id`**（翻译请求进行中切文章，旧响应不落盘不展示，防串台）
    - `configured` computed：读 useApp 的 translateConfig，`provider==='baidu' && baiduAppid && baiduSecretKey`（渲染层复刻 createTranslateProvider 的完整性判断）→ 驱动按钮显示/菜单可用性
    - `toggle()`：shown→原文；否则调 translate:article，失败 toast「翻译失败：…」，degraded 时 info toast「部分段落翻译失败，已保留原文」（按钮仅在 configured 时显示，无需「未配置」toast）
    - `watch(currentArticle)` 重置 shown/translated
18. `src/renderer/src/components/ArticleReader.vue`：
    - 工具栏 no-drag 容器加按钮：`Languages` 图标（@lucide/vue），`variant="ghost" size="icon-sm" class="size-8 text-muted-foreground"`，翻译中内嵌 Spinner + disabled；**`v-if="configured"`：未配置凭据时不显示**（需到设置启用翻译并填凭据后出现）
    - `displayTitle = computed(shown ? translated.title : currentArticle.title)`（h1 与 titleInToolbar 共用）
    - 正文：v-html 源改为 `shown ? sanitizeHtml(translated.content) : sanitizeHtml(currentArticle.content)`（v-highlight 复用同一 div）
19. `src/renderer/src/settings/SettingsApp.vue`：
    - 导航加「翻译」项（Languages 图标），本地编辑态 + 保存（仿 sync 区块）
    - provider Select（暂无翻译/百度翻译）、appid Input、secretKey Input（password + 显隐，仿 WebDAV）、目标语言 Select（用 languages.ts 的码表，渲染层硬编码同款）、「测试翻译」按钮（用当前表单值调 translate:test）

## Phase 4 菜单栏翻译项 + 快捷键（depends on 16-17）
20. `src/main/app/menu.ts` — 「文章」菜单在收藏项后加翻译项（镜像 menu-toggle-read/star 模式）：
    - `{ id:'menu-translate', label:'翻译当前文章', accelerator:'Alt+T', enabled:false, click: → getMainWindow()?.webContents.send('menu:translate') }`（Electron accelerator 的 Alt 在 macOS 即 Option → **Option+T**；与现有 ⌘N/R/F/E/D 等无冲突）
    - `menu:updateState` 处理器：`translate.enabled = state.hasArticle && state.translateConfigured`（未配置凭据同样禁用）；`translate.label = state.isTranslated ? '显示原文' : '翻译当前文章'`
21. `src/preload/index.ts` + `index.d.ts` — menu 命名空间加 `onTranslate(cb)`（onChannel('menu:translate')）；`MenuState` 加 `isTranslated: boolean` 与 `translateConfigured: boolean`
22. `src/renderer/src/composables/useMenuCommands.ts` — `menuState` 加 `isTranslated: shown.value` 与 `translateConfigured: configured.value`（来自 useTranslate 单例；配置变化经 onConfigChanged→loadSettings→computed 自动联动到菜单）；监听 `window.api.menu.onTranslate(() => toggle())`
    - 注意：Option+T 在设置窗口聚焦时事件仍发往主窗口（getMainWindow），行为可接受

## Phase 5 单元测试（vitest，depends on Phase 1 各模块）
23. `pnpm add -D vitest`；`package.json` 加 `"test": "vitest run"` 脚本
24. `vitest.config.ts`（新）— node 环境，test include 限定 `src/main/services/translate/**/*.test.ts`；**测试文件加入 `tsconfig.node.json` include**（让 typecheck 覆盖测试代码）；测试内**显式 `import { describe, it, expect } from 'vitest'`**（不依赖 globals，免改 tsconfig types / eslint 全局）
25. 测试文件（与被测模块同目录 `*.test.ts`）：
    - `html.test.ts`：块提取（pre/code 跳过、空块/纯符号跳过）；行内占位符替换与恢复（译文结构一致）；token 被改动→降级纯文本；字节贪心打包 ≤ 上限；超长段按句子切分
    - `languages.test.ts`：toBaiduCode 映射（zh-Hant→cht、ko→kor、fr→fra、es→spa、未知码透传）
    - `detect.test.ts`：中/英/混合文本检测、同语言跳过判断、不确定返回 unknown
    - `providers/baidu.test.ts`：MD5 sign 与百度文档已知向量一致；错误码→中文映射
    - `cache.test.ts`：node:sqlite `:memory:` 手动建表，测命中/未命中/source_hash 变化失效
26. **设计约束**：被测模块保持不 import electron（cache.ts 只依赖 node:sqlite），保证可在 node 环境运行

## 明确排除
- 第二家翻译提供商（架构已就绪）；anylang 的 Scheduler/SchedulerWithCache（一次性整篇翻译用不上）
- 渲染层组件测试与 IPC handler 测试（v1 不引入，UI 靠手动验证清单）
- 文章列表标题翻译、选中片段翻译、译文手动管理
- provider 动态语言列表（现硬编码，留待第二家时再抽象）
- 术语表/专有名词词典（占位符已覆盖 URL/code 保护，词典留待后续）
- 翻译质量评分/对比评测

## Verification
1. `pnpm typecheck` + `pnpm lint:fix`（AGENTS.md 强制）+ `pnpm test`（vitest 全绿）
2. **anylang 冒烟**：`pnpm dev` 主进程加载无报错（isomorphic-fetch 兼容）；`pnpm build` 打包通过
3. 手动：设置窗口填百度 appid/secretKey →「测试翻译」通过（未保存也能测）→ 保存
4. 手动：打开外文文章 → 点翻译 → 标题/正文替换、排版结构保留、代码块未翻译
5. **质量专项**：
   - 含行内链接/加粗/inline code 的段落：格式保留、链接完好（占位符恢复）
   - 中文文章目标 zh：点翻译被跳过并提示
   - 断网：重试后友好报错；单段失败：该段原文、其余译文（degraded 提示）
6. 手动：按钮 toggle 切回原文；切换文章后状态重置
7. 手动：刷新订阅源后重开 → hash 变化自动重译；重启应用 → 缓存命中直接显示
8. 手动：切换目标语言后同篇重新翻译（provider+targetLang 参与缓存 key）
9. 手动：**未配置凭据时工具栏不显示翻译按钮、菜单项禁用**；到设置启用翻译并填凭据保存后，按钮/菜单项立即出现可用（无需重启）
10. **菜单/快捷键**：选中文章后「文章→翻译当前文章」可点、**Option+T** 触发翻译、译文显示时菜单变「显示原文」、无文章或未配置时禁用
11. dev IPC 日志正常、guardIpcHandlers 不拦截
