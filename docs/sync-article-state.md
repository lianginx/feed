# 文章状态同步设计方案（已读 / 未读 / 星标）

> 状态：规划中，未定稿

> 关联：现有订阅源同步（`feed-subscriptions.json`，整体快照 + lastDump 冲突检测）

> 术语：op（operation，操作记录）= 一次状态变更的最小单元，如「某篇文章标为已读」「某 feed 全部标已读」。本地变更日志、同步文件、合并单位均以 op 为粒度。

## 1. 背景与目标

现有同步系统只同步订阅源与分类（`feed-subscriptions.json`，整体快照 + lastDump 冲突检测）。
用户两台设备交替使用，需要文章**未读 / 已读 / 星标**状态跨设备收敛。

目标：两设备各自点已读、标星后，另一台设备在下次同步时状态一致；星标作为用户资产永不丢失。

## 2. 约束与现状

- 无自建服务器，同步载体为纯文件存储（GitHub Gist / Gitee / WebDAV），只有 `pull / push` 两个原语，冲突检测与合并逻辑必须在客户端完成
- Gist 单文件 1MB 硬上限，WebDAV 无此限制，但载体实现需统一
- 文章本地 id 为自增主键，不可跨设备使用；跨设备唯一标识为 `(feed_url, guid)`
- guid 稳定性已验证：标准 RSS 由源决定（RFC 4287 永久唯一）；适配器全部基于源内稳定 ID 生成（v2ex: `topic.id`、bilibili: `bvid`/`opus_id`、telegram/hapigo: 链接）；refresher 跳过无 guid 的文章（此类文章状态无法跨设备同步，可接受）
- RSS 源渐进删除：源只保留最近文章，老文章只存在于早抓取的设备 → 跨设备状态同步的前提「两端都有这篇文章」不成立，需特殊处理星标

## 3. 核心设计决策

| 决策           | 选择                                                                   | 理由                                                                     |
| -------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 同步内容       | 只同步非默认状态：未读集合 + 星标集合的变更                            | 已读为隐含默认，文件有界，无膨胀治理；首次同步量小                       |
| 「已读」的表示 | 未读集合的删除操作（markRead op）                                      | 已读无需记录为状态，但「读过」的变更必须传播，否则另一设备未读永远删不掉 |
| 文章标识       | `(feed_url, guid)` 复合键，文件内用 `sha256(feed_url#guid)` 前 16 字节 | 与本地自增 id 解耦；缩短体积、规避特殊字符                               |
| 星标存储       | 独立表 `article_stars`（真相源）+ `articles_v` 视图映射 `is_starred`   | 星标不依赖文章存在，老文章永不丢失；视图实时计算，无冗余维护             |
| 合并语义       | LWW（last-write-wins），ts 大者胜，同 ts 以 device_id 兜底             | 无服务器冲突协调，LWW 为对等模型标准做法                                 |
| 批量标已读     | 范围 op（时间戳水位），不逐条生成                                      | 一次全量标已读可能上万条，逐条会撑爆 1MB                                 |
| 增量传输       | 本地 oplog 表 + 推送游标 + 归并后 lastDump 比较                        | 复用订阅同步模式，无变化不推送                                           |

### 3.1 为什么不复用订阅同步的整体快照方案

订阅同步是「整体替换 + 冲突让用户选」：本地与远端都有改动时挂起等待人工选择。文章状态是双向高频变更（两台设备交替读文章），整体替换会产生无尽冲突；快照体积也会随已读历史无限膨胀。因此状态同步必须独立成文件、独立合并语义。

### 3.2 为什么不使用「已读状态 + 保留期清理」

曾设计「同步已读全量 + 定期清理 180 天前已读」，后被「默认已读，只同步非默认状态」替代：
只同步未读/星标变更后，文件天然有界，不需要保留期机制，首次推送量也小。
主流参照：Read You / Reeder 只同步「星标全量 + 未读全量 + 一个月内已读」，验证了只同步非默认态的可行性。

### 3.3 为什么星标独立成表

星标是唯一必须保证不丢的状态。文章不存在时（B 设备永远没有的老文章），
若 is_starred 仍是文章字段则无从标记。方案演进：

1. ~~占位文章~~：往 articles 插假行，被星标表替代
2. ~~pending 表回放~~：星标表不依赖文章存在，无需回放
3. ~~触发器双写~~：视图映射 is_starred，读写分离更声明式，无隐晦维护逻辑

与 NetNewsWire 架构一致：articles 与 statuses 分离存储，状态可在文章到达前先行同步。

### 3.4 为什么用视图而非生成列 / 触发器

- 生成列（`GENERATED ALWAYS AS`）表达式只能引用本行同表列，不能跨表/子查询，无法映射 `article_stars`
- 触发器可自动维护 `is_starred` 列，但引入冗余列 + 三个隐晦触发器，调试与迁移成本高
- 视图（`articles_v`）：SQLite 将视图定义作为命名查询内联展开（宏替换），查询成本等价于手写 SQL；支持跨表子查询，实时一致，写路径保持单一真相源（只写星标表），误写视图会立即显式报错

已知代价（接受）：`WHERE is_starred = 1` 在视图下展开为相关子查询，无法利用列索引，星标筛选为全表扫描 + 每行主键查找；几万文章量级约几十毫秒，可接受；若未来文章量爆炸再物化列兜底。

## 4. 数据模型

### 4.1 星标表（migration v10）

```sql
CREATE TABLE article_stars (
  feed_url TEXT NOT NULL,
  guid TEXT NOT NULL,
  title TEXT,
  url TEXT,
  author TEXT,
  published_at INTEGER,
  starred_at INTEGER NOT NULL,
  PRIMARY KEY (feed_url, guid)
);
```

- 元数据仅作兜底展示（文章不存在时显示标题 + 原文链接），文章存在时以 articles 内容为准
- 文章/订阅删除不联动删除星标（星标是资产）
- 首次启用回填（迁移时）：把本地既有 `articles.is_starred = 1` 的文章按 (feed_url, guid) 导入星标表（join feeds 取 feed_url），存量星标从第一天起参与同步

### 4.2 视图（migration v10）

```sql
CREATE VIEW articles_v AS
SELECT a.*,
  EXISTS(
    SELECT 1 FROM article_stars s JOIN feeds sf ON sf.url = s.feed_url
    WHERE sf.id = a.feed_id AND s.guid = a.guid
  ) AS is_starred
FROM articles a;
```

读写边界（决策）：写路径（抓取入库 / 状态变更 / 同步应用远端）一律操作原表；读路径（列表、详情、搜索）一律查视图，`is_starred` 字段名不变，调用方无感知。视图内 join feeds 使用别名避免与外层冲突。

- 本地星标切换（标星/取消）只 upsert / delete `article_stars`，不再更新 articles 表，视图实时反映
- `articles_fts` 全文索引的 content 表仍是 articles 原表，FTS 写入与触发链不受视图影响，无需迁移

### 4.3 本地状态变更日志（migration v10）

```sql
CREATE TABLE article_state_ops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_url TEXT NOT NULL,
  guid TEXT,             -- 范围 op 为 NULL
  kind TEXT NOT NULL,    -- 'article' | 'feed_all_read'
  field TEXT,            -- 'read' | 'star'（kind='article' 时）
  value INTEGER NOT NULL,
  ts INTEGER NOT NULL    -- 毫秒时间戳，LWW 依据
);
```

写入规则（决策）：所有本地状态变更（单篇切换、批量标已读）与数据更新处于同一事务，保证 op 与状态永不脱节。star op 的元数据推送时 JOIN 星标表获取，op 表不冗余存储。
有界性：op 表按 (feed_url, guid, kind, field) 折叠，同 key 只保留 ts 最大的一条（写入时顺带清理或定期压缩），表容量与远端文件一致有界，id 单调性不受折叠影响（保留的是最大 id），推送游标语义保持正确。

### 4.4 远端文件（`feed-state.json`，与订阅文件同载体同目录）

```json
{
  "version": 1,
  "updatedAt": 1730000000000,
  "deviceIds": ["a1b2c3", "d4e5f6"],
  "ops": [
    {
      "key": "sha256(feed_url#guid) 前 16 字节",
      "deviceId": "a1b2c3",
      "kind": "article", "field": "read" | "star", "value": 0 | 1, "ts": 1730000000000,
      "feedUrl": "...", "guid": "...",
      "title": "...", "url": "...", "author": "...", "publishedAt": 1730000000000
    },
    {
      "deviceId": "d4e5f6", "kind": "feed_all_read", "feedUrl": "...", "ts": 1730000000000
    }
  ]
}
```

- ops 为各设备 op 的归并并集：同 key 同字段至多一条，保留 ts 最新
- 元数据（title/url 等）仅 star=1 的 op 携带，其余留空；不携带摘要/正文
- 有界性：未读集合 + 星标集合 + 范围 op，总量有限，1MB 安全，无需保留期清理
- 星标元数据体积评估：标题 + 链接 + 时间 ≈ 0.2KB/篇，5000 篇星标 ≈ 1MB，安全
- deviceId 为设备随机生成并持久化的标识（本地存储），用于 LWW 同 ts 时的确定性兜底；文件头部维护已知设备列表

## 5. 同步协议

### 5.1 op 语义

| op             | 含义                                        | 应用方                                            |
| -------------- | ------------------------------------------- | ------------------------------------------------- |
| article read=1 | 退出未读集合（=已读）                       | 文章存在则 `is_read=1`；不存在则丢弃（无损失）    |
| article read=0 | 加入未读集合                                | 文章存在则 `is_read=0`；不存在则丢弃              |
| article star=1 | 加入星标集合                                | 无条件 upsert `article_stars`（文章存在与否无关） |
| article star=0 | 退出星标集合                                | 无条件 delete `article_stars`                     |
| feed_all_read  | 该 feed published_at <= ts 全部退出未读集合 | feed 存在则范围更新；不存在则丢弃                 |

范围 op 的粒度：单个 feed 标已读 → 一条范围 op；分类/全部标已读 → 拆成该范围内每个 feed 各一条范围 op（feed 数量有限，可接受）。
任何远端 op 应用到本地后，刷新未读数与角标（与本地操作走同一更新通道）。

### 5.2 同步流程

状态同步与订阅同步为两个独立流程，共享同步互斥锁（同一时刻只跑一个）。
触发：启动 / 定时 / 手动 / 状态变更防抖（1.5s）。

1. 序列化本地新 op（`id > lastPushedId`），star op 携带星标表元数据
2. `provider.pull()` 远端文件；远端为 null（首次）→ 推送本地全部 op
3. 远端存在 → 双向归并（内存中，LWW：ts 大者胜，同 ts 比 device_id 字典序）：
   - 远端 op 应用回本地：按 5.1 语义落库；吸收进本地 op 表（ts 取 max，不更新推送游标）
   - 本地新 op 并入远端 ops，按 key 折叠
4. 归并结果与 `lastDump` 比较：相同 → noop；不同 → `push` 并更新游标
5. 游标与 lastDump 存 `_app_state` 表（已存在，migration v9）

### 5.3 冲突与收敛

- 两设备同时读同一篇：都产生 read=1，归并后一致
- A 标已读、B 标未读：LWW 取后操作者
- 重复推送无害：同 key 同 ts 归并后文件不变，且推前有 lastDump 比较
- 已知竞态：两设备对同一 key 在**同一毫秒**操作时，ts 相同且各端拥有的 deviceId 集合不同，可能得出不一致胜者；概率极低且下次任何一方新操作即纠正，接受
- 同步失败（网络/载体错误）：游标与 lastDump 不推进，下次同步重试

## 6. 边界与取舍

| 场景                                        | 处理                                                                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| B 收到星标 op，文章不存在                   | 直接落 `article_stars`，星标列表可显示（标题 + 原文链接跳转），永不丢失                                               |
| 未读/已读 op 匹配不到文章                   | 丢弃（B 上本来就没有这篇文章，同步无意义）                                                                            |
| feed_all_read 时 feed 不存在                | 丢弃（B 从未刷过该 feed，最坏情况是下次刷新后手动重标；可后续升级为 pending）                                         |
| 星标文章后续出现在源中                      | 刷新插入正常落库，视图实时映射，无需回填逻辑                                                                          |
| 取消星标后文章仍不存在                      | 仅删星标表记录，无其他副作用                                                                                          |
| 首次启用，本地已读历史                      | 不生成 op（已读是默认态，回填会让文件瞬间爆炸）；若另一端恰好有反向操作（手动标未读），本地已读可能被覆盖，接受       |
| 订阅被删除                                  | 星标保留（资产）；该 feed 的未读/已读 op 残留无碍——应用端因文章不存在自然丢弃，可选在同步时按订阅列表清理，防文件堆积 |
| guid 缺失的文章                             | refresher 已跳过，无法跨设备同步状态，本地兜底                                                                        |
| bilibili article 兜底到 content 全文作 guid | 罕见且会变，接受丢失                                                                                                  |

## 7. 遗留决策（实施时确认）

1. feed_all_read 在 feed 不存在时是否升级为 pending 回放
2. 同步设置 UI 中状态同步与订阅同步的开关粒度

## 8. 参照

- NetNewsWire：articles/statuses 分离存储（状态先行）、状态合并后周期性发送
- Read You / Reeder：只同步星标 + 未读 + 近期已读（非默认态优先）
- Capy：SQLite outbox 单向推送状态
- Google Reader API：`mark-all-as-read` 时间戳范围操作
- NetNewsWire iCloud 教训：不同步文章内容，避免同步通道被未读内容撑爆（本方案只同步状态，不碰内容）
