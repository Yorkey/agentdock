import type { DesktopApi } from '@chats/plugin-bridge/ipc'

export type { DesktopApi }

declare global {
  interface Window {
    api: DesktopApi
  }
}

export {}
