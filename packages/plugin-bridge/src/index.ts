import { homedir } from 'node:os'
import { readFile, realpath } from 'node:fs/promises'
import { BrowserWindow, ipcMain, nativeTheme, type IpcMainInvokeEvent } from 'electron'
import { Service, type Context } from 'cordis'
import type {} from '@agentdock/plugin-store'
import type { ScanDone, ScanProgress, SourceInfo } from '@agentdock/plugin-registry/types'
import type {} from '@agentdock/plugin-registry'
import type {} from '@agentdock/plugin-workbench'
import { IPC, type ListConversationsArgs, type ThemeSource } from './ipc.ts'
import { readWhitelistedPlanFile } from './plan-file.ts'
import { readPreviewFile } from './preview-file.ts'
import { revealInFolder } from './reveal.ts'

export { IPC }
export type {
  DesktopApi,
  IpcChannel,
  ListConversationsArgs,
  ScanDone,
  ScanProgress,
  ThemeSource
} from './ipc.ts'
export type { WorkbenchContribution } from '@agentdock/core'

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

export class BridgeService extends Service {
  static provide = 'bridge'
  static name = 'bridge'
  static inject = ['store', 'sources', 'workbench']

  constructor(ctx: Context) {
    super(ctx, 'bridge')
    this.bindIpc()
    this.bindScanEvents()
  }

  bindIpc(): void {
    this.ctx.effect(() => {
      const handle = (
        channel: string,
        listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
      ) => {
        ipcMain.handle(channel, listener)
      }

      handle(IPC.listConversations, (_event, options) => {
        const filter = isListOptions(options) ? options : undefined
        return this.ctx.store.listConversations(filter)
      })
      handle(IPC.getMessages, (_event, conversationId) => {
        if (typeof conversationId !== 'string') {
          throw new Error('conversationId must be a string')
        }
        return this.ctx.store.getMessages(conversationId)
      })
      handle(IPC.search, (_event, query) => {
        if (typeof query !== 'string') {
          throw new Error('query must be a string')
        }
        return this.ctx.store.search(query)
      })
      handle(IPC.listSources, () => {
        return this.ctx.sources.list().map(
          (source): SourceInfo => ({
            id: source.id,
            label: source.label
          })
        )
      })
      handle(IPC.startScan, () => this.ctx.sources.scan())
      handle(IPC.listActivities, () => this.ctx.workbench.list())
      handle(IPC.setThemeSource, (_event, source) => {
        if (!isThemeSource(source)) {
          throw new Error('source must be system | light | dark')
        }
        nativeTheme.themeSource = source
      })
      handle(IPC.readPlanFile, async (_event, conversationId, filePath) => {
        if (typeof conversationId !== 'string') {
          throw new Error('conversationId must be a string')
        }
        if (typeof filePath !== 'string') {
          throw new Error('path must be a string')
        }
        const messages = this.ctx.store.getMessages(conversationId)
        return readWhitelistedPlanFile(filePath, messages, {
          home: homedir(),
          readFile: (target) => readFile(target, 'utf8'),
          realpath
        })
      })

      handle(IPC.revealInFolder, async (_event, filePath, workspace) => {
        if (typeof filePath !== 'string') {
          throw new Error('path must be a string')
        }
        if (workspace !== undefined && typeof workspace !== 'string') {
          throw new Error('workspace must be a string')
        }
        return revealInFolder(filePath, workspace)
      })

      handle(IPC.readPreviewFile, async (_event, filePath, workspace) => {
        if (typeof filePath !== 'string') {
          throw new Error('path must be a string')
        }
        if (workspace !== undefined && typeof workspace !== 'string') {
          throw new Error('workspace must be a string')
        }
        return readPreviewFile(filePath, workspace)
      })

      return () => {
        ipcMain.removeHandler(IPC.listConversations)
        ipcMain.removeHandler(IPC.getMessages)
        ipcMain.removeHandler(IPC.search)
        ipcMain.removeHandler(IPC.listSources)
        ipcMain.removeHandler(IPC.startScan)
        ipcMain.removeHandler(IPC.listActivities)
        ipcMain.removeHandler(IPC.setThemeSource)
        ipcMain.removeHandler(IPC.readPlanFile)
        ipcMain.removeHandler(IPC.revealInFolder)
        ipcMain.removeHandler(IPC.readPreviewFile)
      }
    })
  }

  bindScanEvents(): void {
    this.ctx.effect(() => {
      const offProgress = this.ctx.on('scan/progress', (payload: ScanProgress) => {
        broadcast(IPC.scanProgress, payload)
      })
      const offDone = this.ctx.on('scan/done', (payload: ScanDone) => {
        broadcast(IPC.scanDone, payload)
      })
      return () => {
        offProgress()
        offDone()
      }
    })
  }
}

function isThemeSource(value: unknown): value is ThemeSource {
  return value === 'system' || value === 'light' || value === 'dark'
}

function isListOptions(value: unknown): value is ListConversationsArgs {
  if (value == null || typeof value !== 'object') return false
  const sourceId = (value as ListConversationsArgs).sourceId
  return sourceId === undefined || typeof sourceId === 'string'
}

declare module 'cordis' {
  interface Context {
    bridge: BridgeService
  }
}

export default BridgeService
