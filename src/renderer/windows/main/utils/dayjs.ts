import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'

dayjs.locale('zh-cn')

export function formatRelativeDay(timestamp: number): string {
  const d = dayjs(timestamp * 1000)
  const now = dayjs()
  const diffSec = now.diff(d, 'second')

  if (diffSec < 60) return '刚刚'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`

  const dayDiff = Math.floor(now.startOf('day').diff(d.startOf('day'), 'day'))
  if (dayDiff <= 0) return `${Math.floor(diffSec / 3600)} 小时前`
  if (dayDiff === 1) return '昨天'
  if (dayDiff < 7) return `${dayDiff} 天前`

  const sameYear = d.year() === now.year()
  return sameYear
    ? `${d.month() + 1}月${d.date()}日`
    : `${d.year()}年${d.month() + 1}月${d.date()}日`
}

export { dayjs }
