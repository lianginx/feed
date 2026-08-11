import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    build: {
      // anylang 内部使用无扩展名 ESM 导入，Node 原生 ESM 无法解析（ERR_MODULE_NOT_FOUND），
      // 因此把它从 externalizeDeps 中排除，交给 vite 内联打包（其非顶层传递依赖会一并内联）。
      externalizeDeps: {
        exclude: ['anylang']
      }
    }
  },
  // preload 编译为 CommonJS（.cjs）：沙盒 preload 不支持 ESM，
  // 项目为 ESM（"type": "module"）时默认输出 .mjs，需显式改为 cjs 才能开启沙盒（安全规则 #4）
  preload: {
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [vue(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          settings: resolve('src/renderer/settings.html'),
          addfeed: resolve('src/renderer/addfeed.html')
        }
      }
    }
  }
})
