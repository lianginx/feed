import * as cheerio from 'cheerio'
import { normalizeUrl } from '../../core/extract'
import type { ParsedArticle, ParsedFeed } from '../../../rss'
import type { AdapterParseContext, FeedAdapter } from '../../core/types'

/**
 * Telegram 频道适配器——「参考 RSSHub 的 telegram/channel 路由设计，自写实现」。
 *
 * 设计借鉴（AGPL 允许借鉴思路，不复制代码）：
 * - 抓 https://t.me/s/:username 网页预览（纯 HTTP、无需登录/API Session），cheerio 解析
 * - 按消息媒体类型（图片/视频/投票/语音/文档/贴纸等）打标题前缀，正文拼接媒体 HTML
 * - 支持开关：是否收录服务消息（对应 RSSHub 的 routeParams）
 * 实现全部自写。
 */

/** 消息类型（按 t.me/s/ 预览页的 DOM 特征识别）→ 标题前缀 emoji */
const TYPE = {
  FORWARDED: '🔁',
  REPLY: '↩️',
  SERVICE: '🔧',
  VIDEO: '🎬',
  PHOTO: '🖼',
  POLL: '📊',
  VOICE: '🎙',
  DOCUMENT: '📄',
  STICKER: '🏷'
} as const

type MsgType = keyof typeof TYPE

/** HTML 转义文本插值（转发来源/回复引用拼接进正文前） */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 清理频道用户名：去掉前导 @（用户常手输 @username，t.me 不认 %40 前缀） */
function cleanUsername(name: string): string {
  return name.trim().replace(/^@+/, '')
}

/** 从背景图样式提取 URL：url('https://...') 或 url(https://...) */
function extractBackgroundUrl(style: string): string | undefined {
  const m = style.match(/url\(['"]?(.*?)['"]?\)/)
  return m ? normalizeUrl(m[1]) : undefined
}

/** 识别一条消息的媒体类型（按优先级返回数组；转发/回复/服务可与其他媒体共存） */
function detectTypes($item: cheerio.Cheerio<import('domhandler').AnyNode>): MsgType[] {
  const types: MsgType[] = []
  if ($item.find('.tgme_widget_message_forwarded_from').length) types.push('FORWARDED')
  if ($item.find('.tgme_widget_message_reply').length) types.push('REPLY')
  if ($item.find('.service_message').length) types.push('SERVICE')
  if ($item.find('.tgme_widget_message_video_player,.tgme_widget_message_video').length)
    types.push('VIDEO')
  if ($item.find('.tgme_widget_message_photo,.tgme_widget_message_service_photo').length)
    types.push('PHOTO')
  if ($item.find('.tgme_widget_message_poll').length) types.push('POLL')
  if ($item.find('.tgme_widget_message_voice').length) types.push('VOICE')
  if ($item.find('.tgme_widget_message_document').length) types.push('DOCUMENT')
  if ($item.find('.tgme_widget_message_sticker,.tgme_widget_message_tgsticker').length)
    types.push('STICKER')
  return types
}

/**
 * 消息正文 HTML：转发来源 + 回复引用 + 文本 + 媒体（图片/视频/贴纸）+ 文档附件。
 * 返回拼接后的 HTML、纯文本（供标题/摘要）、首张封面图与文档附件名（供标题回退/判空）。
 */
function buildMessageHtml(
  $: cheerio.CheerioAPI,
  $item: cheerio.Cheerio<import('domhandler').AnyNode>,
  username: string
): { html: string; text: string; firstImage: string | undefined; documentTitles: string[] } {
  const parts: string[] = []
  const media: string[] = []
  const documentTitles: string[] = []

  // 转发来源
  const fwdName = $item.find('.tgme_widget_message_forwarded_from_name')
  if (fwdName.length) {
    const href = fwdName.attr('href')
    const name = escapeHtml(fwdName.text().trim())
    const author = escapeHtml(
      $item.find('.tgme_widget_message_forwarded_from_author').text().trim()
    )
    const linkHtml = href ? `<a href="${normalizeUrl(href)}">${name}</a>` : name
    parts.push(`<p>转发自 <b>${linkHtml}</b>${author ? `（${author}）` : ''}</p>`)
  }

  // 回复引用
  const reply = $item.find('.tgme_widget_message_reply')
  if (reply.length) {
    const replyAuthor = escapeHtml(reply.find('.tgme_widget_message_author_name').text().trim())
    const replyText = escapeHtml(reply.find('.tgme_widget_message_text').text().trim())
    const replyLink = reply.attr('href')
    const quoteLink = replyLink
      ? `<a href="${normalizeUrl(replyLink)}"><b>${replyAuthor}</b></a>`
      : `<b>${replyAuthor}</b>`
    parts.push(`<blockquote>${quoteLink}:${replyText ? `<p>${replyText}</p>` : ''}</blockquote>`)
  }

  // 正文文本：
  // - 常见布局 `.tgme_widget_message_bubble > .tgme_widget_message_text`
  // - t.me 对带媒体的消息用「部分支持」布局，文本在 `.media_supported_cont > .tgme_widget_message_text`
  //   （RSSHub 同款：按 PARTIALLY_UNSUPPORTED 切换容器，实现自写）
  const textEl = $item
    .find('.media_supported_cont > .tgme_widget_message_text')
    .add($item.find('.tgme_widget_message_bubble > .tgme_widget_message_text'))
    .first()
  // 提取纯文本时先 <br> → \n，保证每行即消息中的一行（用于标题首行/摘要）
  const textClone = textEl.clone()
  textClone.find('br').replaceWith('\n')
  const text = (textClone.text() || '').replace(/\u00a0/g, ' ').trim()
  // 改写 hashtag 相对链接（?q=#tag → https://t.me/s/:channel?q=#tag）为绝对地址，
  // 否则渲染时按应用自身 URL 解析，点击会跳到无关页面（RSSHub 同款处理）
  textEl.find('a[href^="?q="]').each((_, a) => {
    const href = $(a).attr('href')
    if (href) $(a).attr('href', `https://t.me/s/${encodeURIComponent(username)}${href}`)
  })
  // 规范化 emoji：t.me 用 <tg-emoji><i class="emoji" style="background-image:url('//telegram.org/...')">
  // 渲染；<tg-emoji> 不在 DOMPurify 白名单会被剥离，// 协议背景图会按应用协议解析失效。
  // 统一替换为 <span class="emoji">文字</span>（RSSHub 同款），保留 emoji 文字本身。
  textEl.find('.emoji').each((_, emoji) => {
    const $emoji = $(emoji)
    $emoji.replaceWith(`<span class="emoji">${$emoji.text()}</span>`)
  })
  const textHtml = textEl.length ? (textEl.html() ?? '') : ''
  if (textHtml) {
    parts.push(`<p>${textHtml}</p>`)
  }

  // 媒体：图片 / 视频 / 贴纸
  const seen = new Set<string>()
  const pushImage = (src: string): void => {
    const clean = normalizeUrl(src)
    if (seen.has(clean)) return
    seen.add(clean)
    media.push(clean)
    parts.push(`<img src="${clean}" />`)
  }

  // 图片（背景图方式）：.tgme_widget_message_photo_wrap 或 service_photo
  $item.find('.tgme_widget_message_photo_wrap,.tgme_widget_message_service_photo').each((_, el) => {
    const url = extractBackgroundUrl($(el).attr('style') ?? '')
    if (url) pushImage(url)
  })

  // 视频：缩略图仅作封面/播放器 poster（不重复写入正文 <img>），video 源输出为 <video>
  // （CSP media-src 放行 https）
  $item.find('.tgme_widget_message_video_player').each((_, el) => {
    const $player = $(el)
    const thumb = extractBackgroundUrl(
      $player.find('.tgme_widget_message_video_thumb').attr('style') ?? ''
    )
    if (thumb && !seen.has(thumb)) {
      seen.add(thumb)
      media.push(thumb)
    }
    const videoSrc = $player.find('.tgme_widget_message_video').attr('src')
    if (videoSrc) {
      const clean = normalizeUrl(videoSrc)
      if (!seen.has(`video:${clean}`)) {
        seen.add(`video:${clean}`)
        parts.push(
          `<video controls preload="metadata"${thumb ? ` poster="${thumb}"` : ''}>` +
            `<source src="${clean}" />` +
            `</video>`
        )
      }
    }
  })

  // 贴纸 / 普通图片 img
  $item
    .find('.tgme_widget_message_sticker img,.tgme_widget_message_photo_wrap img')
    .each((_, el) => {
      const src = $(el).attr('src')
      if (src) pushImage(src)
    })

  // 文档附件：文件名 + 大小，链接指向消息页（t.me 预览页无文件直链）
  $item.find('.tgme_widget_message_document_wrap').each((_, el) => {
    const $doc = $(el)
    const title = escapeHtml($doc.find('.tgme_widget_message_document_title').text().trim())
    if (!title) return
    const extra = escapeHtml($doc.find('.tgme_widget_message_document_extra').text().trim())
    const href = $doc.attr('href')
    const link = href ? `<a href="${normalizeUrl(href)}">${title}</a>` : title
    parts.push(`<p>${link}${extra ? `（${extra}）` : ''}</p>`)
    documentTitles.push(title)
  })

  return { html: parts.join(''), text, firstImage: media[0], documentTitles }
}

/**
 * 从正文纯文本提取标题首行：
 * - 跳过空行、纯 hashtag 行（`#学习 #英语`，含中文标签）；
 * - 去行首 emoji 前缀（Telegram 常用 emoji 引导标题）。
 */
function extractTitle(text: string): string {
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    // 纯 hashtag 行（#标签 组合）跳过，取后续真正的标题行
    if (/^#\S+(\s+#\S+)*$/.test(line)) continue
    // 去行首 emoji 前缀（含 ZWJ 组合序列；不用 \p{Emoji} 以免误吞 ASCII 数字）
    const clean = line.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D]+/u, '').trim()
    if (!clean) continue
    return clean.slice(0, 80)
  }
  return ''
}

/**
 * Telegram 频道订阅。
 * 纯 HTTP：抓 t.me/s/:username 网页预览，cheerio 解析消息卡片。
 * 无需登录、无需 Telegram API Session；部分频道 web 端不可见时抓不到内容。
 */
export const telegramChannelAdapter: FeedAdapter = {
  id: 'telegram-channel',
  name: 'Telegram 频道',
  description: 'Telegram 频道消息（网页预览，无需登录）',
  domains: ['t.me', 'telegram.me'],
  params: [
    { key: 'username', label: '频道用户名', required: true, placeholder: '如 NewlearnerChannel' },
    {
      key: 'includeServiceMsg',
      label: '收录服务消息',
      type: 'boolean',
      description: '置顶、换头像等系统消息是否收录'
    }
  ],
  needsBrowser: false,
  buildUrl: (params) =>
    `https://t.me/s/${encodeURIComponent(cleanUsername(params.username ?? ''))}`,
  async parse(raw: string, ctx: AdapterParseContext): Promise<ParsedFeed> {
    const includeService = (ctx.params.includeServiceMsg ?? 'true') === 'true'
    const username = cleanUsername(ctx.params.username ?? '')

    const $ = cheerio.load(raw)

    // 频道级信息
    const channelName = $('.tgme_channel_info_header_title').text().trim()
    const channelDesc = $('.tgme_channel_info_description').text().trim()
    const avatarEl = $('.tgme_page_photo_image > img')
    const avatar = avatarEl.attr('src')

    // 消息卡片：排除「没有消息」占位与（可选的）服务消息
    const messageWraps = $(
      includeService
        ? '.tgme_widget_message_wrap:not(:has(.tme_no_messages_found))'
        : '.tgme_widget_message_wrap:not(:has(.service_message)):not(:has(.tme_no_messages_found))'
    )

    // 页面无任何消息且无频道历史容器 → 频道在 web 端不可见/不可解析
    if (messageWraps.length === 0 && $('.tgme_channel_history').length === 0) {
      throw new Error('无法获取该频道的消息，频道可能不存在或已被限制公开访问')
    }

    const items: ParsedArticle[] = []
    messageWraps.each((_, el) => {
      const $item = $(el)

      const { html, text, firstImage, documentTitles } = buildMessageHtml($, $item, username)

      // 无正文也无封面图的消息（如 web 端不支持的投票：仅引用 + not_supported，
      // 无 media_supported_cont 也无可提取媒体）整体跳过，不产出空壳条目。
      // 服务消息（置顶等，includeService 已决定是否收录）不受此限制。
      // 注意不能用「message_media_not_supported 且无 media_supported_cont」判定：
      // 视频消息同样满足该特征（提示浏览器不支持），但带缩略图/文字，必须保留。
      if (!text && !firstImage && !documentTitles.length && !$item.find('.service_message').length)
        return

      // 无文本也无媒体的空消息（纯媒体已处理）跳过
      const dateEl = $item.find('.tgme_widget_message_date time')
      const datetime = dateEl.attr('datetime')
      const linkEl = $item.find('.tgme_widget_message_date')
      const link = linkEl.attr('href')
      if (!link || !datetime) return

      const types = detectTypes($item)
      const mediaTag = types.map((t) => TYPE[t]).join('')
      // 标题：优先取正文首行；纯文档消息无正文时回退到附件文件名（多个用逗号连接）
      const titleLine = extractTitle(text) || documentTitles.slice(0, 3).join('、').slice(0, 80)

      items.push({
        guid: link,
        title:
          `${mediaTag}${mediaTag && titleLine ? ' ' : ''}${titleLine}`.trim() || 'Telegram 消息',
        link,
        content: html || undefined,
        summary: text || undefined,
        contentSnippet: text || undefined,
        pubDate: new Date(datetime).toISOString(),
        author: $item.find('.tgme_widget_message_from_author').text().trim() || channelName,
        coverImage: firstImage
      })
    })

    return {
      title: channelName ? `${channelName} - Telegram 频道` : 'Telegram 频道',
      description: channelDesc || 'Telegram 频道',
      link: `https://t.me/s/${encodeURIComponent(username)}`,
      image: avatar ? { url: normalizeUrl(avatar) } : undefined,
      items
    }
  }
}
