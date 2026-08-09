# 重构计划：内置路由改造（Source 通道 + 统一缓存 + 全局代理 + Telegram MTProto）

> 目标架构见 [architecture.md](./architecture.md)「路由框架架构（Source 通道分发）」与「Telegram 订阅（MTProto）」；决策理由见 [decisions.md](./decisions.md) 决策记录表。
> 本文档是**实施计划**：记录分期、任务节点、阻塞项与风险。执行期持续更新，完成后归档。

## 0. 现状与阻塞

- **一期已完成** ✅：路由框架 source 分发、统一缓存模块、全局网络代理均已落地（见下方任务节点状态）。
- **阻塞项**：Telegram MTProto 改造依赖用户自行申请 `api_id/api_hash`（my.telegram.org）。当前申请被 IP 风控卡住（反复 ERROR），**二期暂停**，凭据到位后继续。
- **过渡**：一期期间现有 t.me/s web 解析适配器**继续保留**，作为普通 http 适配器服务公开频道，功能不倒退。

## 1. 分期

| 期 | 内容 | 依赖 | 状态 |
|----|------|------|------|
| **一期** | 路由框架重构、统一缓存模块、全局网络代理 | 无 | ✅ 已完成 |
| **二期** | Telegram MTProto 连接服务、适配器改造、移除 web 解析、账号 UI | api_id/api_hash 到位 | ⏸ 待凭据 |

## 2. 一期任务节点（已全部完成）

| 节点 | 内容 | 状态 | commit |
|------|------|------|--------|
| P1-N1 | 路由框架重构：`types.ts` 契约 + core 分发器 + `registerSource`，内置 http runner 保持默认路径，现有适配器零改动 | ✅ | `75a5a51 refactor: 路由框架引入 source 通道分发` |
| P1-N2 | 统一缓存模块：favicon 内容寻址（源内嵌 URL + 定长 hash 文件）+ `media://` 协议，LRU + 手动清理；扩展 CSP | ✅ | `13a2c37 refactor: 统一本地缓存模块` + `4e98b90 fix: favicon 源内嵌与定长 hash 文件` |
| P1-N3 | 全局网络代理：自动跟随系统代理 + 手动覆盖，接入 Node fetch / 浏览器两条路径 | ✅ | `be05f8b feat: 全局网络代理设置` |

一期不涉及 Telegram：现有 web 适配器保持 http 适配器身份，无改动。

## 3. 二期任务节点（阻塞：待 api_id/api_hash）

| 节点 | 内容 | 依赖 |
|------|------|------|
| P2-N1 | Telegram 连接服务：mtcute、会话持久化、二维码登录、getDialogs、resolveUsername、getHistory(offset_id 增量)、媒体下载 | 凭据 |
| P2-N2 | Telegram 适配器 + source：`adapters/telegram/source.ts` 注册，`index.ts` 重写为 `source:'telegram'` | P1-N1 + P2-N1 |
| P2-N3 | 移除 t.me/s web 解析适配器及其测试 | P2-N2 |
| P2-N4 | UI：设置页 Telegram 账号管理 + 添加订阅表单（单输入框 + 「从我的频道选择」）+ IPC/preload | P2-N1 + P1-N2 + P1-N3 |
| P2-N5 | 测试收尾：typecheck + lint + 补充测试 | 以上全部 |

依赖关系：P2-N2 ← P1-N1+P2-N1；P2-N4 ← P2-N1+P1-N2+P1-N3；P2-N3 ← P2-N2。

## 4. 二期前置 Spike（凭据到位后第一件事）

| # | 验证项 | 方法 | 预期 |
|---|--------|------|------|
| 1 | 受限频道（web 打不开、客户端可预览）非成员 `getHistory` 可读性 | `resolveUsername` → 检查 `restriction_reason` → 非成员 `getHistory` | 大概率返回数据（限制主要在客户端本地过滤） |
| 2 | 账号所属地区对 `sensitive/porno` 内容的影响 | 实际拉取该类内容 | 地区决定年龄验证/拒发 |

## 5. 一期需要修改的现有文件清单

- `routes/core/types.ts` → 契约提升为 `routes/types.ts`（顶层）
- `routes/core/runner.ts` → 加 `registerSource` + 分发器
- `services/favicon.ts` + `app/protocol.ts` → 迁入统一缓存模块，新增 `media://`
- renderer 三个 HTML（index/addfeed/settings）CSP → `img-src/media-src` 放行 `media:`
- `config`（electron-store）→ 新增全局代理设置项
- `services/http.ts`、`core/fetcher/browser.ts` → 接入全局代理

## 6. 关键设计约定（实现时遵循）

- 取数通道 source 划分标准是**数据契约形态**：http/browser 都是原始文本 → 同一 source，`needsBrowser` 选 fetcher；telegram 是消息对象 → 独立 source。
- 分发器无 switch：`sourceRunners` 注册表查表，未声明 source 走内置 http runner。
- `media://` 协议沿用 `favicon://` 防路径穿越写法（安全规则 #20）。
- 全局代理默认「自动跟随系统代理」→ 可手动覆盖。

## 7. 风险与提示

- **api_id 申请**：my.telegram.org 未关闭申请，ERROR 为 IP 风控。替代方案：用第二个手机号/朋友的号创建 api_id，主账号登录使用；或 WARP / 手机流量 / 换干净节点重试；报错后刷新 apps 页确认是否已创建成功。
- **封号风险**：第三方 API 抓取受限内容有先例被封；用户自备 api_id、手动加入、连接时间短以降低信号；登录 UI 提示风险。
- **api_hash 为永久密钥**：官方不可重置，设置页提示妥善保管，泄漏需换号重开。
- **file_reference 过期**：缓存/下载需在用时重取消息，不能长期持有消息对象。
- **FloodWait**：`resolveUsername` 有限频，需缓存 access_hash / 加入重试退避。
