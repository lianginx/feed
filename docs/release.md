# 新版本发布规范

> 发版操作与 Release Note 编写的完整规范。发版时先读本文档。

## 发版流程

1. 收集提交历史：`git log --no-merges --format='%h %s' <上一版本tag>..HEAD`
2. 按下方「Release Note 编写规范」编写发布说明，先给用户确认
3. 更新 `package.json` 版本号（语义化、递增）→ 提交 → 推送 main → 推 `vX.Y.Z` tag
4. 推送 tag 即触发 GitHub Actions 构建 macOS 安装包并创建 draft release；draft 创建后立即用 `gh release edit vX.Y.Z --notes-file <file>` 覆盖 notes（脚本生成的 notes 仅作兜底）
5. `gh run watch <run-id> --exit-status > /dev/null 2>&1` 等待构建完成
6. 验证 `gh release view vX.Y.Z --json isDraft,assets`：`isDraft=false` 且 assets 含安装包

## Release Note 编写规范

发版时由 Agent 在对话中编写发布说明，用 `gh release edit vX.Y.Z --notes-file <file>` 覆盖 CI 生成的 draft release notes（CI 脚本生成的 notes 仅作无人介入时的兜底）。

### 输入

`git log --no-merges --format='%h %s' <上一版本tag>..<当前tag>`

### 编写规则

- 面向普通用户而非开发者，使用简体中文，简洁自然，像知名软件（微信、Notion）的更新日志
- 只列出用户可感知的变更；纯内部的重构、依赖升级、文档、构建与 CI 改动一律不展示
- 分组结构（无内容的分组省略）：

  ```
  ## ✨ 新功能
  ## 🛠 体验改进
  ## 🐛 修复
  ## 📌 其他
  ```

  「其他」仅用于面向用户的平台/支持范围变化（如平台降级为实验性支持），不用于内部杂项
- 每条以「- 」开头，从用户视角描述（「列表折叠后自动加载更多内容」，而不是「重构填充逻辑」）
- 样式类提交并入对应功能描述，不单独列出
- 内部提交（refactor / style / docs / chore / perf）若含用户可感知的部分，只提炼该部分，不照搬 commit message
- 版本号提升、纯文档提交直接忽略
- 严禁编造提交历史中不存在的内容

## 注意事项

- 版本号必须递增、不能回退（electron-updater 只检测更高版本）
- 当前仅发布 macOS；Windows / Linux 已暂时取消支持，待完成充分适配与测试后再考虑恢复

## 未来计划（需要时再详细规划）

- Homebrew Cask 分发（macOS）：新建 tap 仓库 + `brew bump-cask-pr` 自动更新
- macOS 签名 + 公证（消除 Gatekeeper 提示，需 Apple 开发者证书）
- Windows / Linux 支持恢复：完成平台适配、测试与分发方案后再重新规划
