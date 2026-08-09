import { describe, it, expect } from 'vitest'
import { buildManualProxyUrl, proxyAgentFromRule } from '../../services/proxy'
import type { ProxyConfig } from '../../config'

describe('全局网络代理', () => {
  it('buildManualProxyUrl：http / socks5 / 带认证 / 缺字段', () => {
    const http: ProxyConfig = { mode: 'manual', protocol: 'http', host: '127.0.0.1', port: 7890 }
    expect(buildManualProxyUrl(http)).toBe('http://127.0.0.1:7890')

    const socks: ProxyConfig = { mode: 'manual', protocol: 'socks5', host: '1.2.3.4', port: 1080 }
    expect(buildManualProxyUrl(socks)).toBe('socks5://1.2.3.4:1080')

    const auth: ProxyConfig = {
      mode: 'manual',
      protocol: 'socks5',
      host: '1.2.3.4',
      port: 1080,
      username: 'u',
      password: 'p'
    }
    expect(buildManualProxyUrl(auth)).toBe('socks5://u:p@1.2.3.4:1080')

    expect(buildManualProxyUrl({ mode: 'manual' } as ProxyConfig)).toBeNull()
    expect(
      buildManualProxyUrl({ mode: 'manual', protocol: 'http', host: 'x' } as ProxyConfig)
    ).toBeNull()
  })

  it('proxyAgentFromRule：DIRECT / PROXY / SOCKS5 / 非法规则', () => {
    expect(proxyAgentFromRule('DIRECT')).toBeUndefined()
    expect(proxyAgentFromRule('PROXY 127.0.0.1:7890')).toBeTruthy()
    expect(proxyAgentFromRule('SOCKS5 127.0.0.1:7891')).toBeTruthy()
    expect(proxyAgentFromRule('garbage')).toBeUndefined()
  })
})
