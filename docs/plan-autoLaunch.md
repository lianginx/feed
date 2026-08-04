# Plan: 开机自动启动 + 启动时隐藏窗口（默认禁用）

## 目标
设置窗口新增「开机自动启动」开关（默认关）与「启动时隐藏窗口」开关（默认关，仅登录自动启动时生效）；三平台（macOS/Windows/Linux）统一支持。

## 平台实现（调研结论：Electron 39.8.10 electron.d.ts + 项目配置）
- **macOS/Windows**：`app.setLoginItemSettings`（官方标注 darwin,win32）
  - macOS：系统登录项（13+ 走 SMAppService，系统设置→通用→登录项可见）；`wasOpenedAtLogin` 可检测本次是否登录自动启动
  - Windows：注册表 Run 键（HKCU）；无 wasOpenedAtLogin → 注册时 `args: ['--hidden']` 标记，启动检查 process.argv
  - ⚠️ `openAsHidden` 已废弃（13+ 无效，MAS 不可用）→ **不传**，统一应用内判断
  - Squirrel path：仅 Squirrel.Windows target 需要（path 指 Update.exe + --processStart args）；本项目 Windows 用 **NSIS**，execPath 稳定，**无需特判**
- **Linux**（官方 API 不支持 → XDG Autostart，用户已确认）：
  - 写 `~/.config/autostart/feed.desktop`（`app.getPath('appData')/autostart`，Linux 上即 ~/.config）
  - Exec 行：AppImage 用 `process.env.APPIMAGE`（execPath 是 /tmp/.mount_xxx 临时路径不可用），deb 用 process.execPath；追加 `--hidden` 当 launchHidden
  - 关闭：unlink 该文件

## 启动时隐藏窗口（统一判断，仅登录自动启动生效）
- `shouldLaunchHidden()`：
  - darwin：`getLoginItemSettings().wasOpenedAtLogin && config.launchHidden`
  - win32/linux：`process.argv.includes('--hidden')`（只有登录注册项带此参数，手动启动不带）
- `createWindow()` ready-to-show 时：shouldLaunchHidden() → 不 show（恢复途径：托盘显示/双击、Dock activate，现有机制已支持）

## 服务：新建 src/main/services/autoLaunch.ts
- `applyAutoLaunch(enabled, hidden)`：
  - `!app.isPackaged` 或 platform 不在 darwin/win32/linux → return（dev 不污染）
  - darwin：`setLoginItemSettings({ openAtLogin: enabled })`
  - win32：`setLoginItemSettings({ openAtLogin: enabled, args: hidden ? ['--hidden'] : [] })`
  - linux：写/删 feed.desktop（内容含 Exec 路径 + --hidden 条件）
- `initAutoLaunch()`：启动时仅当 config.autoLaunch===true 才注册（幂等；不主动移除，避免覆盖系统设置手动操作）

## 配置：src/main/config.ts
- `autoLaunch: boolean`（默认 false）、`launchHidden: boolean`（默认 false）
- getSettings() 已有 defaults 兜底合并，旧配置自动补字段

## 接线
- `src/main/index.ts` whenReady：`initAutoLaunch()`
- `src/main/ipc/settings.ts` config:update：`autoLaunch`/`launchHidden` 变化时 `applyAutoLaunch(autoLaunch, launchHidden)`（与 theme/updateInterval 模式一致）
- `src/main/app/window.ts`：ready-to-show 隐藏判断

## 渲染层
- `src/renderer/src/composables/useApp.ts`：autoLaunch/launchHidden ref + setter + loadSettings 回填
- `src/renderer/src/settings/SettingsApp.vue`：内容 section 后新增「启动」section：
  - 「开机自动启动」Switch v-model="autoLaunch"
  - 「启动时隐藏窗口」Switch v-model="launchHidden"，autoLaunch=false 时 disabled（复用检查间隔联动模式）
  - **Switch 必须 v-model**（reka-ui 无 checked prop，已调研确认）

## 不改动
- 不做 dock.hide、不做 openAsHidden（废弃）
- 不做 Windows Squirrel path 特判（NSIS 无此问题）

## 验证
1. `pnpm typecheck` && `pnpm lint:fix`
2. 打包后手动：开关切换 → 系统设置登录项/注册表/autostart 目录确认；勾选隐藏后重启登录确认窗口不弹出、托盘可恢复
3. dev 模式跳过注册是预期行为
4. 完成后按 AGENTS.md 询问提交（feat: 增加开机自动启动设置）
