# 发布与分发

> 记录 Feed 的构建、发布、自动更新与未来分发渠道规划。

## 当前状态（已实现）

### GitHub Actions 自动构建发布

- 工作流：`.github/workflows/release.yml`
- 触发方式：推送 `v*` 标签（如 `v0.1.0`）或 Actions 页面手动触发
- 构建矩阵：macOS / Windows / Linux 三平台并行
- 产物自动上传到 GitHub Releases（`lianginx/feed`）

### 应用内自动更新（electron-updater）

- 依赖：`electron-updater`
- 更新源：GitHub Releases（由 `electron-builder.yml` 的 `publish` 配置决定）
- 主进程逻辑：`src/main/services/updater.ts`
- 入口：菜单「检查更新…」；发现新版自动后台下载，重启安装
- 产物配套：`latest-mac.yml`（更新清单）+ `*.blockmap`（差分更新）

### 发版流程

1. 修改 `package.json` 版本号（语义化、递增）
2. 提交并推送代码
3. 打标签：`git tag vX.Y.Z && git push origin vX.Y.Z`
4. CI 自动构建三平台并发布 Release
5. 用户应用内「检查更新」自动升级

## 未来计划（未实现，需要时再详细规划）

### Homebrew Cask 分发（macOS）

- 新建 tap 仓库：`lianginx/homebrew-tap`，内放 `Casks/feed.rb`
- cask 指向 GitHub Releases 产物（`url` + `sha256`）
- 可选：在 release workflow 末尾加 `brew bump-cask-pr` 自动更新 cask
- 用户安装：`brew install lianginx/tap/feed`
- 与现有流程零冲突——Homebrew 只是消费同一份 Release 产物

### 待评估

- macOS 签名 + 公证（消除 Gatekeeper 提示，需 Apple 开发者证书）
- Windows 更新签名验证
- 更多分发渠道（如 Scoop、winget）

## 注意事项

- 版本号必须递增、不能回退（electron-updater 只检测更高版本）
- 预发布版本（`-beta` / `-rc`）默认不会被稳定版检测到
- 产物未公证，macOS 首次打开会有 Gatekeeper 提示（预期现象）
