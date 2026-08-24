## 质量检查

每次任务结束必须运行 `pnpm typecheck` 和 `pnpm lint:fix`，并修复问题。

## 代码规范

- 渲染层目录组织（`src/renderer`）：
  - `windows/<窗口名>/`：窗口级目录，一窗口一目录（`main/`、`addfeed/`、`settings/`），内含该窗口的 `main.ts`、入口组件及窗口专属的 `components/`、`composables/`、`utils/`、`assets/`。窗口专属代码禁止被其他窗口引用
  - `shared/`：真正跨窗口共享的代码（`components/`、`composables/`、`lib/`、`types.ts`、`assets/`），仅允许被各 `windows/*/` 引用，禁止反向依赖窗口专属代码
- 渲染层 import 路径约定（`@renderer`、`@/` 均指向 `src/renderer`）：
  - 业务代码一律使用 `@renderer` 别名，禁止相对路径（Tailwind `@reference` 除外，CSS 内相对路径指向 `shared/assets/css/`）
  - `@/` 仅限 shadcn 生成的 `shared/components/ui/` 组件内部使用（如 `@/shared/lib/utils`、`@/shared/components/ui/button`），业务代码禁止使用
  - `shared/components/ui/` 组件内部之间互相引用允许使用相对路径
- 主进程 import 路径约定（`@main` 指向 `src/main`）：
  - 跨目录引用一律使用 `@main` 别名
  - 同目录内引用允许使用相对路径（如 `./xxx`）
- 跨进程共享：`@shared` 指向 `src/shared`，主进程 / preload / 渲染层均可引用
- 组件命名：
  - 功能相关组件使用 `components/<分组>/` 集中管理，分组名称使用 kebab-case 格式
  - 未归组组件放 `components/` 顶层
  - 组件名称使用 PascalCase 格式 = 分组名称 + 功能名
- 禁止非必要注释，避免注释过时与实际代码不符的情况
- 每个前端组件尽量不超过 300 行，超长组件需要按模块拆分

## Electron 最佳实践

开发、修改涉及 Electron 相关逻辑时，必须先阅读此文档，优先遵循官方最佳实践：
- 最佳实践（性能篇）：https://www.electronjs.org/zh/docs/latest/tutorial/performance
- 最佳实践（安全篇）：https://www.electronjs.org/zh/docs/latest/tutorial/security

## Git 规范

- 每完成一个独立任务节点（功能/重构/修复），主动询问用户是否提交，并给出变更摘要和建议的 commit message，确认后才执行
- 攒了多个任务时，最终提交尽量按任务颗粒度拆分多个 commit；拆分困难时允许合并
- 每个 commit 回滚后必须可正常构建运行，禁止提交半成品
- 分支合并一律使用 `rebase`（`git rebase` / `git cherry-pick`）保持 `main` 线性历史，禁止 `merge --no-ff` 产生 `Merge commit`

Commit Message 格式：`<type>: <中文描述>`，如 `feat: 增加导出功能`
type：`feat` 新功能 / `fix` 修复 / `refactor` 重构 / `docs` 文档 / `style` 样式 / `chore` 杂项

## 发布新版本

发版前必须先读取 `docs/release.md`，按其规范执行发布操作。
