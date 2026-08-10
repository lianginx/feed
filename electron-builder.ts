import type { Configuration } from 'electron-builder'
import { APP_METADATA } from './src/shared/appMetadata'

const config = {
  // ---------- 应用基本信息 ----------
  // appId 来自 package.json，必须在应用发布后保持稳定。
  appId: APP_METADATA.appId,
  productName: APP_METADATA.productName,

  // ---------- 目录与打包内容 ----------
  directories: {
    buildResources: 'build'
  },
  files: [
    '!**/.vscode/*',
    '!src/*',
    '!electron.vite.config.{js,ts,mjs,cjs}',
    '!electron-builder.{js,ts,mjs,cjs}',
    // 排除开发工具配置与文档
    '!{.eslintcache,eslint.config.mjs,.prettierignore,.prettierrc.yaml,dev-app-update.yml,CHANGELOG.md,README.md}',
    '!{.env,.env.*,.npmrc,pnpm-lock.yaml}',
    '!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}'
  ],
  asarUnpack: ['resources/**'],

  // ---------- Windows 平台 ----------
  win: {
    executableName: APP_METADATA.name
  },
  nsis: {
    artifactName: '${name}-${version}-setup.${ext}',
    shortcutName: '${productName}',
    uninstallDisplayName: '${productName}',
    createDesktopShortcut: 'always'
  },

  // ---------- macOS 平台 ----------
  mac: {
    entitlementsInherit: 'build/entitlements.mac.plist',
    // 禁用时间戳，避免 codesign 因网络不可达而卡住。
    timestamp: 'none',
    // 应用未开启沙盒且不调用相关 API，无需声明额外系统权限。
    notarize: false
  },
  dmg: {
    artifactName: '${productName}-${version}.${ext}'
  },

  // ---------- Linux 平台 ----------
  linux: {
    target: ['AppImage', 'deb'],
    maintainer: 'Liang',
    category: 'Utility'
  },
  appImage: {
    artifactName: '${productName}-${version}.${ext}'
  },

  // ---------- 通用配置 ----------
  npmRebuild: false,
  electronFuses: {
    resetAdHocDarwinSignature: true,
    runAsNode: false,
    enableNodeCliInspectArguments: false,
    enableNodeOptionsEnvironmentVariable: false
  },

  // ---------- 发布与自动更新 ----------
  publish: {
    provider: 'github',
    owner: 'lianginx',
    repo: 'feed',
    releaseType: 'release'
  },

  // ---------- 依赖下载镜像 ----------
  electronDownload: {
    mirror: 'https://npmmirror.com/mirrors/electron/'
  }
} satisfies Configuration

export default config
