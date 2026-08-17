import { app } from 'electron'
import { resolve } from 'node:path'
import { createAddFeedWindow } from './addFeedWindow'
import { getMainWindow } from './window'
import { findFeedUrl, parseFeedUrl } from './feedUrl'

const FEED_PROTOCOL = 'feed'
let isReady = false
let pendingFeedUrl: string | undefined

function focusMainWindow(): void {
  const mainWindow = getMainWindow()
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
}

function openParsedFeedUrl(feedUrl: string): void {
  if (!isReady) {
    pendingFeedUrl = feedUrl
    return
  }

  focusMainWindow()
  createAddFeedWindow(feedUrl)
}

function openFeedUrl(value: string): void {
  const feedUrl = parseFeedUrl(value)
  if (feedUrl) openParsedFeedUrl(feedUrl)
}

export function registerFeedProtocolEvents(): void {
  app.on('open-url', (event, url) => {
    event.preventDefault()
    openFeedUrl(url)
  })

  app.on('second-instance', (_event, commandLine) => {
    const feedUrl = findFeedUrl(commandLine)
    if (feedUrl) {
      openParsedFeedUrl(feedUrl)
    } else {
      focusMainWindow()
    }
  })
}

export function registerFeedProtocolClient(): void {
  if (process.defaultApp && process.argv[1]) {
    app.setAsDefaultProtocolClient(FEED_PROTOCOL, process.execPath, [resolve(process.argv[1])])
  } else {
    app.setAsDefaultProtocolClient(FEED_PROTOCOL)
  }
}

export function handleInitialFeedUrl(): void {
  isReady = true

  const feedUrl = pendingFeedUrl ?? findFeedUrl(process.argv)
  pendingFeedUrl = undefined
  if (feedUrl) openParsedFeedUrl(feedUrl)
}
