import type { DesktopApi } from '@agentdock/plugin-bridge/ipc'

export type { DesktopApi }

declare global {
  interface Window {
    api: DesktopApi
  }
}

export {}
