import hljs from 'highlight.js/lib/core'
import xml from 'highlight.js/lib/languages/xml'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import css from 'highlight.js/lib/languages/css'
import json from 'highlight.js/lib/languages/json'
import bash from 'highlight.js/lib/languages/bash'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import diff from 'highlight.js/lib/languages/diff'
import markdown from 'highlight.js/lib/languages/markdown'
import yaml from 'highlight.js/lib/languages/yaml'
import php from 'highlight.js/lib/languages/php'
import ruby from 'highlight.js/lib/languages/ruby'
import type { Directive } from 'vue'

// 注册 RSS 内容中常见的语言
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('css', css)
hljs.registerLanguage('json', json)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('python', python)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('diff', diff)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('php', php)
hljs.registerLanguage('ruby', ruby)

/**
 * Vue 自定义指令：高亮元素内的代码块。
 * 用法：`v-highlight` 添加到包含 `<pre><code>` 的容器上。
 */
export const vHighlight: Directive<HTMLElement, void> = {
  mounted(el) {
    highlightBlocks(el)
  },
  updated(el) {
    highlightBlocks(el)
  }
}

function highlightBlocks(el: HTMLElement): void {
  el.querySelectorAll('pre code').forEach((block) => {
    // 跳过已高亮的块
    if (block.getAttribute('data-highlighted') === 'yes') return

    hljs.highlightElement(block as HTMLElement)
  })
}
