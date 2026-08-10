import packageJson from '../../package.json'

/** 应用身份元信息：package.json 是唯一来源，其他进程通过此适配层读取。 */
export const APP_METADATA = {
  appId: packageJson.appId,
  name: packageJson.name,
  version: packageJson.version,
  productName: packageJson.productName ?? packageJson.name
} as const
