# Agent Instructions

## 质量检查
每次任务结束必须运行 `pnpm typecheck` 和 `pnpm lint:fix`，并修复问题。

## 最佳实践参考（Electron 官方文档）
开发涉及 Electron 的功能/配置时，必须遵循官方最佳实践：

- 性能篇：<https://www.electronjs.org/zh/docs/latest/tutorial/performance>
- 安全篇：<https://www.electronjs.org/zh/docs/latest/tutorial/security>

安全篇的 20 条清单是持续约束：

<constraints>
1. 安全篇的 20 条清单，任何 Electron 改动都不得违反其中条目（不因当前代码状态而豁免）。
2. 性能相关改动遵循性能篇：启动速度、懒加载、避免主进程阻塞。
</constraints>

## 提交规范（Conventional Commits）

### 节点提交提醒
- 每完成一个独立任务节点（功能/重构/修复），**必须主动询问用户是否提交**，禁止攒着多个功能一次性提交
- 询问时给出变更摘要和建议的 commit message，确认后才执行

### 分批提交（兜底）
- 若用户无视提醒、攒了多个任务，最终提交时**尽量按任务颗粒度拆分多个 commit**
- 每个 commit 回滚后必须可正常构建运行，禁止提交半成品
- 不强求：拆分困难时允许合并相关提交

### Commit Message 格式
`<type>: <中文描述>`，如 `feat: 增加导出功能`
type：`feat` 新功能 / `fix` 修复 / `refactor` 重构 / `docs` 文档 / `style` 样式 / `chore` 杂项

## 发版规范（GitHub Release）

<constraints>
1. 发版唯一入口是推送 `v*` 标签（`git tag vX.Y.Z && git push origin vX.Y.Z`），由 CI（`.github/workflows/release.yml`）自动创建 draft、上传三平台安装包并正式发布。
2. 禁止直接用 `gh release create` / `gh release edit` / `gh api .../releases` 创建或发布 Release，否则会绕过 CI、生成不带安装包的空 Release，并抢占 tag 导致 CI 产物无法发布。
3. 发版前必须先检查该 tag 是否已有 Release（`gh release view vX.Y.Z`），若存在（尤其空壳的正式版或残留 draft），需先与用户确认清理，再重新走 tag 推送流程。
4. 发布完成后用 `gh release view vX.Y.Z --json draft,assets` 验证：`draft` 为 `false` 且 `assets` 包含安装包；若失败需修复后再继续。
</constraints>
