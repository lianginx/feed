import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@main': resolve('src/main'),
      '@shared': resolve('src/shared')
    }
  },
  test: {
    // 集中式测试目录：主进程纯逻辑与服务单测（不测渲染层与 IPC）
    include: ['src/main/__tests__/**/*.test.ts'],
    environment: 'node'
  }
})
