/**
 * 兼容 shim：路由契约已提升至 routes/types.ts（顶层，见 docs/architecture.md）。
 * 现有 import 点（适配器 / 测试 / siteCookies）暂经此处转发，后续清理时改为直接
 * import from '../../types' 后删除本文件。
 */
export * from '../types'
