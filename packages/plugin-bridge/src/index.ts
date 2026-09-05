import { homedir } from 'node:os'
import { readFile, realpath } from 'node:fs/promises'
import { BrowserWindow, dialog, ipcMain, nativeTheme, type IpcMainInvokeEvent } from 'electron'
import { Service, type Context } from 'cordis'
import type {} from '@agentdock/plugin-store'
import type { ScanDone, ScanProgress, SourceInfo } from '@agentdock/plugin-registry/types'
import type {} from '@agentdock/plugin-registry'
import type {} from '@agentdock/plugin-workbench'
import type {} from '@agentdock/module-skills'
import type {
  ImportLocalSkillArgs,
  InstallFromGitHubArgs,
  InstallToAgentsArgs,
  SaveOverrideFileArgs,
  UninstallSkillArgs
} from '@agentdock/core'
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
  static inject = ['store', 'sources', 'workbench', 'skills']

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

      // Skill 管理 IPC 处理函数
      handle(IPC.listSkills, async (_event, agentId) => {
        return this.ctx.skills.listSkills(typeof agentId === 'string' ? agentId : undefined)
      })

      handle(IPC.listAggregatedSkills, async () => {
        return this.ctx.skills.listAggregatedSkills()
      })

      handle(IPC.listSkillAgents, async () => {
        return this.ctx.skills.listAdapters()
      })

      handle(IPC.getSkillDetail, async (_event, skillName, agentId) => {
        if (typeof skillName !== 'string' || typeof agentId !== 'string') {
          throw new Error('skillName and agentId must be strings')
        }
        return this.ctx.skills.getSkillDetail(skillName, agentId)
      })

      handle(IPC.installSkillToAgents, async (_event, rawArgs) => {
        const args = rawArgs as InstallToAgentsArgs
        return this.ctx.skills.installSkillToAgents(args)
      })

      handle(IPC.previewGitHubSkill, async (_event, url) => {
        if (typeof url !== 'string') {
          throw new Error('url must be a string')
        }
        return this.ctx.skills.previewGitHubSkill(url)
      })

      handle(IPC.installSkillFromGitHub, async (_event, rawArgs) => {
        const args = rawArgs as InstallFromGitHubArgs
        return this.ctx.skills.installSkillFromGitHub(args)
      })

      // 本地技能/ZIP导入相关处理
      handle(IPC.selectSkillFolder, async () => {
        const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
        const options = {
          title: '选择本地 Skill 技能文件夹',
          properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'>
        }
        const result = win
          ? await dialog.showOpenDialog(win, options)
          : await dialog.showOpenDialog(options)
        return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
      })

      handle(IPC.selectSkillZip, async () => {
        const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
        const options = {
          title: '选择本地 Skill ZIP 压缩包',
          properties: ['openFile'] as Array<'openFile'>,
          filters: [{ name: 'ZIP 压缩包', extensions: ['zip'] }]
        }
        const result = win
          ? await dialog.showOpenDialog(win, options)
          : await dialog.showOpenDialog(options)
        return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
      })

      handle(IPC.previewLocalSkill, async (_event, sourcePath) => {
        if (typeof sourcePath !== 'string') {
          throw new Error('sourcePath must be a string')
        }
        return this.ctx.skills.previewLocalSkill(sourcePath)
      })

      handle(IPC.installLocalSkill, async (_event, rawArgs) => {
        const args = rawArgs as ImportLocalSkillArgs
        return this.ctx.skills.installLocalSkill(args)
      })

      handle(IPC.uninstallSkill, async (_event, rawArgs) => {
        const args = rawArgs as UninstallSkillArgs
        return this.ctx.skills.uninstallSkill(args)
      })

      // Skill 调试覆写相关处理
      handle(IPC.listSkillOverrides, async () => {
        return this.ctx.skills.listOverrides()
      })

      handle(IPC.enableSkillOverride, async (_event, agentId, skillId) => {
        if (typeof agentId !== 'string' || typeof skillId !== 'string') {
          throw new Error('agentId and skillId must be strings')
        }
        return this.ctx.skills.enableOverride(agentId, skillId)
      })

      handle(IPC.getSkillOverrideStatus, async (_event, agentId, skillId) => {
        if (typeof agentId !== 'string' || typeof skillId !== 'string') {
          throw new Error('agentId and skillId must be strings')
        }
        return this.ctx.skills.getOverrideStatus(agentId, skillId)
      })

      handle(IPC.readSkillFile, async (_event, agentId, skillId, relativePath) => {
        if (typeof agentId !== 'string' || typeof skillId !== 'string' || typeof relativePath !== 'string') {
          throw new Error('agentId, skillId, and relativePath must be strings')
        }
        return this.ctx.skills.readSkillFile(agentId, skillId, relativePath)
      })

      handle(IPC.saveSkillOverrideFile, async (_event, rawArgs) => {
        const args = rawArgs as SaveOverrideFileArgs
        return this.ctx.skills.saveOverrideFile(args)
      })

      handle(IPC.getSkillOverrideDiff, async (_event, agentId, skillId, relativePath) => {
        if (typeof agentId !== 'string' || typeof skillId !== 'string') {
          throw new Error('agentId and skillId must be strings')
        }
        return this.ctx.skills.getOverrideDiff(
          agentId,
          skillId,
          typeof relativePath === 'string' ? relativePath : 'SKILL.md'
        )
      })

      handle(IPC.revertSkillOverride, async (_event, agentId, skillId) => {
        if (typeof agentId !== 'string' || typeof skillId !== 'string') {
          throw new Error('agentId and skillId must be strings')
        }
        return this.ctx.skills.revertOverride(agentId, skillId)
      })

      handle(IPC.commitSkillOverride, async (_event, agentId, skillId) => {
        if (typeof agentId !== 'string' || typeof skillId !== 'string') {
          throw new Error('agentId and skillId must be strings')
        }
        return this.ctx.skills.commitOverride(agentId, skillId)
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
        ipcMain.removeHandler(IPC.listSkills)
        ipcMain.removeHandler(IPC.listAggregatedSkills)
        ipcMain.removeHandler(IPC.listSkillAgents)
        ipcMain.removeHandler(IPC.getSkillDetail)
        ipcMain.removeHandler(IPC.installSkillToAgents)
        ipcMain.removeHandler(IPC.previewGitHubSkill)
        ipcMain.removeHandler(IPC.installSkillFromGitHub)
        ipcMain.removeHandler(IPC.uninstallSkill)
        ipcMain.removeHandler(IPC.listSkillOverrides)
        ipcMain.removeHandler(IPC.enableSkillOverride)
        ipcMain.removeHandler(IPC.getSkillOverrideStatus)
        ipcMain.removeHandler(IPC.readSkillFile)
        ipcMain.removeHandler(IPC.saveSkillOverrideFile)
        ipcMain.removeHandler(IPC.getSkillOverrideDiff)
        ipcMain.removeHandler(IPC.revertSkillOverride)
        ipcMain.removeHandler(IPC.commitSkillOverride)
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
