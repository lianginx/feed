# Plan: 修复订阅源同步频繁误报冲突

## 现象

双机（公司 + 家里）开启同步后，家里电脑频繁弹出「同步冲突」弹窗，每次选「使用云端数据」也无法根治，下次同步继续弹。公司电脑（长期不关机）白天几乎不弹。

- 公司机不关机、定时同步持续运行；家里机白天关机，晚上使用
- 家里弹窗频率远高于公司；选「远端覆盖本地」后问题依旧

## 根因一（主因）：`updatedAt` 毒化全部相等性判断

`src/main/services/sync/index.ts`：

```ts
// L84-86  serializeSnapshot() 每次调用都生成新时间戳
const snapshot: SyncSnapshot = {
  version: 1,
  updatedAt: Date.now(),
```

同步决策全部依赖**原始字符串全等比较**（L230-231、L245）：

```ts
} else if (remote === last) {
  if (local === last) { /* noop */ }
} else {
  ...
  } else if (local === last) { /* 干净拉取 */ }
```

`last` 是上次同步成功时存入 electron-store（`syncLastDump`）的 dump 字符串。由于 `updatedAt: Date.now()`，**每次 `serializeSnapshot()` 的输出必然 ≠ 上次的字符串**，导致：

1. `local === last` 永远为 false → `noop` 分支与「干净拉取」分支是死代码
2. 每台设备每轮同步必 push（push 后 `last = pushed dump`，下一轮重新 serialize 又有新时间戳 → 又判定「本地有改动」→ 再 push），单机也空转
3. 双机在线：远端被两边轮流翻转，谁后同步谁就命中 `remote !== last && local !== last` → 必弹冲突

### 为什么选「远端」治不好

`resolveConflict('remote')` 执行 `applySnapshot(remote)` + `setLastDump(remote)`，但下一次 `serializeSnapshot()` 又产生新的 `updatedAt` → 本地再次处于「已修改」状态 → 只要另一台设备又推过一轮（它每轮必推），下次同步继续冲突。死循环。

### 与现象的对应关系

- 公司机白天不弹：家里关机 = 单写者，随便推没有对手（只是每 30 分钟静默覆盖一次远端）
- 家里晚上必弹：白天远端被公司机翻了 N 轮 → `remote !== 家里的last`；同时本地因 `updatedAt` 恒「脏」→ 首次同步即冲突

## 根因二（次要）：排序不确定性

序列化排序依赖本地自增 id（`sync/index.ts` L75、L80）：

```sql
ORDER BY sort_order ASC, id ASC
```

而 `feeds.sort_order` / `categories.sort_order` 建表默认 0（`database/migrations.ts` L17、L27），且所有新增入口都不写 sort_order：

- `ipc/feeds.ts` addRss / addAdapterSource 的 INSERT
- `ipc/categories.ts` categories:add
- `ipc/opml.ts` importFeeds

大量并列 sort_order=0 时排序退化为按 id（各设备本地 rowid）。删除过 feed 或导入历史不同的两台设备，**同一份数据会序列化出不同顺序的数组** → 即使修掉根因一，pull 后重新序列化也 ≠ 拉到的 dump → 两台设备互相把自家顺序推来推去，持续互踩并再次武装冲突条件。

## 附带说明（非 bug）

- `services/refresher.ts` L47-57 每次刷新会用 RSS 内容回写 `title/site_url`（快照字段），属于合法的后台变更；修复后会偶发正常 push，可接受
- 快照中的 `updatedAt` 字段从未参与任何业务逻辑（UI 不展示），纯属冗余
- 同步无单元测试（`__tests__/` 下无 sync 目录），本次修复需补齐核心逻辑测试

## 修复方案

### 1. 去掉快照中的 `updatedAt`（主修复）

- `SyncSnapshot` 删除 `updatedAt` 字段，`serializeSnapshot()` 不再写入
- `parseSnapshot()` 只校验 `version === 1`，旧格式远端数据多一个字段不影响解析
- 兼容性：已存量的 `syncLastDump` 含 `updatedAt` → 升级后首轮 `local !== last` 触发一次无害 push，随后收敛

### 2. 确定性排序

`serializeSnapshot()` 中：

- feeds：`ORDER BY sort_order ASC, url ASC`
- categories：`ORDER BY sort_order ASC, name ASC`

url / name 全局唯一且设备无关，保证 `serialize(apply(X)) === X` 跨设备成立。
兼容性：排序变化 vs 存量 dump → 各设备一次性额外 push，无害。

### 3. 自愈兜底

pull 应用快照后改为 `setLastDump(serializeSnapshot())`（而非存原始远端串）；`resolveConflict('remote')` 同理。保证 `last` 始终等于「当前 DB 实际状态」的序列化结果，吸收未来快照格式演进带来的一次性漂移，避免升级后反复 push/冲突。

### 4. 补充测试

新建 `src/main/__tests__/sync/`（内存 better-sqlite3）：

- 序列化确定性：同数据两次 serialize 结果一致；apply 后再 serialize 与输入一致
- 决策矩阵：remote 为 null / remote===last±local 变更 / remote 变更×local 未变 / 双方变更 → conflict
- applySnapshot：新增/更新/删除 feed 与分类、分类按名称关联、事务回滚

## 验证

- `pnpm typecheck`、`pnpm lint:fix`、`pnpm test`
- 手动场景：单机连续两轮同步第二轮应为 noop；模拟双机（两份用户数据目录）交替修改不再弹冲突，仅真实双向改动才冲突

## 后续可选（本次不做）

- 三路自动合并：以 `last` 为 base，feed 按 url 并集、字段级合并，非重叠改动自动落，减少真冲突弹窗
- 凭据改用 `safeStorage` 加密存储（token / WebDAV 密码目前明文）
