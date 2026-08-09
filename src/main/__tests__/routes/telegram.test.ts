import { describe, it, expect } from 'vitest'
import { telegramChannelAdapter } from '../../services/routes/adapters/telegram'

/** 组装一条 t.me/s/ 预览页消息：wrap 包裹 bubble 与日期/链接，container 拼成完整页面 */
function wrapMessage(bubble: string, post: string = '1'): string {
  return (
    '<div class="tgme_widget_message_wrap js-widget_message_wrap">' +
    `<div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="OutsightChina/${post}">` +
    `<div class="tgme_widget_message_bubble">${bubble}</div>` +
    '<div class="tgme_widget_message_footer compact js-message_footer">' +
    '<div class="tgme_widget_message_info short js-message_info">' +
    `<a class="tgme_widget_message_date" href="https://t.me/OutsightChina/${post}">` +
    `<time datetime="2026-08-01T02:12:51+00:00" class="time">02:12</time>` +
    '</a></div></div></div></div>'
  )
}

/** 拼完整页面：频道信息 + 若干消息 */
function page(messages: string[]): string {
  return (
    '<div class="tgme_page">' +
    '<div class="tgme_page_photo_image"><img src="//cdn.telesco.pe/file/avatar.jpg"></div>' +
    '<div class="tgme_channel_info">' +
    '<div class="tgme_channel_info_header_title">看鉴中国 OutsightChina</div>' +
    '<div class="tgme_channel_info_description">每日看鉴</div>' +
    '</div>' +
    '<div class="tgme_channel_history"><div class="tgme_widget_message_wrap js-widget_message_wrap"></div>' +
    messages.join('') +
    '</div></div>'
  )
}

/** 文本消息：hashtag 行 + emoji 引导标题行 */
const TEXT_MSG = wrapMessage(
  '<div class="tgme_widget_message_text js-message_text" dir="auto">' +
    '<a href="?q=%23%E5%AD%A6%E4%B9%A0">#学习</a> <a href="?q=%23%E8%8B%B1%E8%AF%AD">#英语</a><br/>' +
    '<b><i class="emoji">📚</i></b><b> My IELTS - 一个开源的雅思备考资料库</b><br/>' +
    '正文第二行内容' +
    '</div>',
  '1'
)

/** 图片消息：media_supported_cont 布局，正文含 hashtag 与图片 */
const PHOTO_MSG = wrapMessage(
  '<div class="media_supported_cont">' +
    '<a class="tgme_widget_message_photo_wrap x" href="https://t.me/OutsightChina/2" ' +
    'style="width:800px;background-image:url(\'//cdn.telesco.pe/file/photo1.jpg\')">' +
    '<div class="tgme_widget_message_photo" style="padding-top:56%"></div></a>' +
    '<div class="tgme_widget_message_text js-message_text" dir="auto">' +
    '<a href="?q=%23Windows">#Windows</a><br/>图文正文' +
    '</div></div>' +
    '<div class="media_not_supported_cont"><div class="message_media_not_supported_wrap">' +
    '<div class="message_media_not_supported"><div class="message_media_not_supported_label">' +
    'Please open Telegram to view this post</div></div></div></div>',
  '2'
)

/** 视频消息：缩略图 + video 源 */
const VIDEO_MSG = wrapMessage(
  '<a class="tgme_widget_message_video_player js-message_video_player" href="https://t.me/OutsightChina/3">' +
    '<i class="tgme_widget_message_video_thumb" ' +
    'style="background-image:url(\'//cdn1.telesco.pe/file/thumb.jpg\')"></i>' +
    '<div class="tgme_widget_message_video_wrap"><video ' +
    'src="https://cdn1.telesco.pe/file/v.mp4?token=abc" class="tgme_widget_message_video">' +
    '</video></div></a><div class="message_video_play"></div>',
  '3'
)

/** 投票消息（web 端完全不支持）：仅引用 + message_media_not_supported，无 media_supported_cont */
const POLL_MSG = wrapMessage(
  '<a class="tgme_widget_message_reply user-color-default" href="https://t.me/OutsightChina/9958">' +
    '<div class="tgme_widget_message_author"><span class="tgme_widget_message_author_name" dir="auto">看鉴中国 OutsightChina</span></div>' +
    '<div class="tgme_widget_message_text js-message_reply_text" dir="auto">被引用的上一条消息正文</div>' +
    '</a>' +
    '<div class="message_media_not_supported_wrap"><div class="message_media_not_supported">' +
    '<div class="message_media_not_supported_label">Please open Telegram to view this post</div>' +
    '<a href="https://t.me/OutsightChina/9970" class="message_media_view_in_telegram">VIEW IN TELEGRAM</a>' +
    '</div></div>',
  '4'
)

/** 服务消息（置顶/换头像） */
const SERVICE_MSG = wrapMessage('<div class="service_message">pinned</div>', '5')

/** 文档消息：文档附件（文件名 + 大小）+ 正文 */
const DOC_MSG = wrapMessage(
  '<a class="tgme_widget_message_document_wrap" href="https://t.me/OutsightChina/6">' +
    '<div class="tgme_widget_message_document_icon accent_bg"></div>' +
    '<div class="tgme_widget_message_document">' +
    '<div class="tgme_widget_message_document_title accent_color">App-1.2.0.dmg</div>' +
    '<div class="tgme_widget_message_document_extra">220.3 MB</div>' +
    '</div></a>' +
    '<div class="tgme_widget_message_text js-message_text" dir="auto">修复了若干 bug</div>',
  '6'
)

/** 纯文档消息：只有文档附件，无正文文本 */
const DOC_ONLY_MSG = wrapMessage(
  '<a class="tgme_widget_message_document_wrap" href="https://t.me/OutsightChina/7">' +
    '<div class="tgme_widget_message_document_icon accent_bg"></div>' +
    '<div class="tgme_widget_message_document">' +
    '<div class="tgme_widget_message_document_title accent_color">Setup.exe</div>' +
    '<div class="tgme_widget_message_document_extra">50 MB</div>' +
    '</div></a>',
  '7'
)

const CHANNEL_PAGE = page([TEXT_MSG, PHOTO_MSG, VIDEO_MSG, POLL_MSG, SERVICE_MSG])

describe('telegram 频道适配器', () => {
  it('buildUrl 构建 t.me/s/ 预览地址并剥离前导 @', () => {
    expect(telegramChannelAdapter.buildUrl({ username: 'OutsightChina' })).toBe(
      'https://t.me/s/OutsightChina'
    )
    // 用户手输 @username：应剥离 @，否则 t.me 不认 %40 前缀
    expect(telegramChannelAdapter.buildUrl({ username: '@OutsightChina' })).toBe(
      'https://t.me/s/OutsightChina'
    )
  })

  it('needsBrowser 为 false（纯 HTTP），无需登录', () => {
    expect(telegramChannelAdapter.needsBrowser).toBe(false)
    expect(telegramChannelAdapter.domains).toContain('t.me')
  })

  it('parse 提取频道信息并解析文本/图片/视频消息', async () => {
    const feed = await telegramChannelAdapter.parse(CHANNEL_PAGE, {
      params: { username: 'OutsightChina', includeServiceMsg: 'false' },
      url: 'https://t.me/s/OutsightChina'
    })

    expect(feed.title).toBe('看鉴中国 OutsightChina - Telegram 频道')
    expect(feed.image?.url).toBe('https://cdn.telesco.pe/file/avatar.jpg')

    // 文本消息：跳过 hashtag 行与行首 emoji，取标题行
    const text = feed.items.find((i) => i.guid === 'https://t.me/OutsightChina/1')
    expect(text?.title).toBe('My IELTS - 一个开源的雅思备考资料库')
    expect(text?.summary).toContain('正文第二行内容')

    // 图片消息：media_supported_cont 布局也能取到正文，hashtag 改绝对链接，封面取消息图
    const photo = feed.items.find((i) => i.guid === 'https://t.me/OutsightChina/2')
    expect(photo?.title).toBe('🖼 图文正文')
    expect(photo?.coverImage).toBe('https://cdn.telesco.pe/file/photo1.jpg')
    expect(photo?.content).toContain('https://t.me/s/OutsightChina?q=%23Windows')
    // 消息中残留的 // 协议背景图不污染封面（封面来自 photo_wrap）
    expect(photo?.content).toContain('<img src="https://cdn.telesco.pe/file/photo1.jpg"')

    // 视频消息：缩略图作封面与 poster，正文只含 <video>（不重复 <img>）
    const video = feed.items.find((i) => i.guid === 'https://t.me/OutsightChina/3')
    expect(video?.coverImage).toBe('https://cdn1.telesco.pe/file/thumb.jpg')
    expect(video?.content).toContain('<video controls')
    expect(video?.content).toContain('poster="https://cdn1.telesco.pe/file/thumb.jpg"')
    expect(video?.content).toContain('src="https://cdn1.telesco.pe/file/v.mp4?token=abc"')
    expect(video?.content).not.toContain('<img')

    // 投票消息（web 端不支持）：整体跳过，不产生空壳条目
    expect(feed.items.find((i) => i.guid === 'https://t.me/OutsightChina/4')).toBeUndefined()

    // 服务消息默认不收录
    expect(feed.items.find((i) => i.guid === 'https://t.me/OutsightChina/5')).toBeUndefined()
  })

  it('includeServiceMsg 为 true 时收录服务消息', async () => {
    const feed = await telegramChannelAdapter.parse(CHANNEL_PAGE, {
      params: { username: 'OutsightChina', includeServiceMsg: 'true' },
      url: 'https://t.me/s/OutsightChina'
    })
    expect(feed.items.find((i) => i.guid === 'https://t.me/OutsightChina/5')).toBeDefined()
  })

  it('回复引用文本含特殊字符时正确转义（不产生畸形 HTML）', async () => {
    const msg = wrapMessage(
      '<a class="tgme_widget_message_reply" href="https://t.me/OutsightChina/1">' +
        '<div class="tgme_widget_message_author"><span class="tgme_widget_message_author_name">频道 & 伙伴</span></div>' +
        '<div class="tgme_widget_message_text js-message_reply_text">A &lt; B</div>' +
        '</a>' +
        '<div class="tgme_widget_message_text js-message_text" dir="auto">正文 <b>加粗</b></div>',
      '6'
    )
    const feed = await telegramChannelAdapter.parse(page([msg]), {
      params: { username: 'OutsightChina' },
      url: 'https://t.me/s/OutsightChina'
    })
    const item = feed.items.find((i) => i.guid === 'https://t.me/OutsightChina/6')
    expect(item?.content).toContain('频道 &amp; 伙伴')
    expect(item?.content).toContain('A &lt; B')
  })

  it('纯 emoji 无正文的消息（如贴纸）标题不吞数字', async () => {
    const msg = wrapMessage(
      '<div class="media_supported_cont"><div class="tgme_widget_message_text js-message_text" dir="auto">' +
        '<b>⭐ 10块跑一天！稳定首选</b>' +
        '</div></div>',
      '7'
    )
    const feed = await telegramChannelAdapter.parse(page([msg]), {
      params: { username: 'OutsightChina' },
      url: 'https://t.me/s/OutsightChina'
    })
    const item = feed.items.find((i) => i.guid === 'https://t.me/OutsightChina/7')
    expect(item?.title).toBe('10块跑一天！稳定首选')
  })

  it('文档消息：附件名与大小写入正文，链接指向消息页', async () => {
    const feed = await telegramChannelAdapter.parse(page([DOC_MSG]), {
      params: { username: 'OutsightChina' },
      url: 'https://t.me/s/OutsightChina'
    })
    const item = feed.items.find((i) => i.guid === 'https://t.me/OutsightChina/6')
    expect(item?.title).toBe('📄 修复了若干 bug')
    expect(item?.content).toContain('<a href="https://t.me/OutsightChina/6">App-1.2.0.dmg</a>')
    expect(item?.content).toContain('（220.3 MB）')
    expect(item?.content).toContain('修复了若干 bug')
  })

  it('纯文档消息（无正文）：不跳过，标题回退到附件名', async () => {
    const feed = await telegramChannelAdapter.parse(page([DOC_ONLY_MSG]), {
      params: { username: 'OutsightChina' },
      url: 'https://t.me/s/OutsightChina'
    })
    const item = feed.items.find((i) => i.guid === 'https://t.me/OutsightChina/7')
    expect(item).toBeDefined()
    expect(item?.title).toBe('📄 Setup.exe')
    expect(item?.content).toContain('Setup.exe')
    expect(item?.content).toContain('（50 MB）')
  })

  it('页面无消息且无频道历史容器时抛友好错误', async () => {
    await expect(
      telegramChannelAdapter.parse('<html><body>empty</body></html>', {
        params: { username: 'no-such-channel' },
        url: 'https://t.me/s/no-such-channel'
      })
    ).rejects.toThrow('无法获取该频道的消息')
  })
})
