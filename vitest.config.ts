import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 集中式测试目录：只跑翻译纯逻辑模块的单测（不测渲染层与 IPC）
    include: ['src/main/__tests__/**/*.test.ts'],
    environment: 'node'
  }
})
