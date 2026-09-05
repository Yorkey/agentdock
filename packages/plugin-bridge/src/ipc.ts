import type {
  AggregatedSkill,
  Conversation,
  GitHubSkillPreview,
  InstallFromGitHubArgs,
  ImportLocalSkillArgs,
  InstalledSkill,
  InstallToAgentsArgs,
  LocalSkillPreview,
  Message,
  SaveOverrideFileArgs,
  SkillAgentInfo,
  SkillFileDiff,
  SkillFileEntry,
  SkillOperationResult,
  SkillOverrideEntry,
  SkillOverrideStatus,
  UninstallSkillArgs,
  WorkbenchContribution
} from '@agentdock/core'
import type { ScanDone, ScanProgress, SourceInfo } from '@agentdock/plugin-registry/types'

export const IPC = {
  listConversations: 'agentdock:conversations:list',
  getMessages: 'agentdock:conversations:messages',
  search: 'agentdock:search',
  listSources: 'agentdock:sources:list',
  startScan: 'agentdock:scan:start',
  scanProgress: 'agentdock:scan:progress',
  scanDone: 'agentdock:scan:done',
  listActivities: 'agentdock:workbench:list',
  setThemeSource: 'agentdock:theme:set-source',
  readPlanFile: 'agentdock:plans:read',
  revealInFolder: 'agentdock:fs:reveal',
  readPreviewFile: 'agentdock:fs:preview',
  // Skills 管理相关通道
  listSkills: 'agentdock:skills:list',
  listAggregatedSkills: 'agentdock:skills:list-aggregated',
  listSkillAgents: 'agentdock:skills:agents',
  getSkillDetail: 'agentdock:skills:detail',
  installSkillToAgents: 'agentdock:skills:install-to-agents',
  previewGitHubSkill: 'agentdock:skills:preview-github',
  installSkillFromGitHub: 'agentdock:skills:install-from-github',
  // 本地文件/ZIP导入通道与对话框
  selectSkillFolder: 'agentdock:dialog:select-skill-folder',
  selectSkillZip: 'agentdock:dialog:select-skill-zip',
  previewLocalSkill: 'agentdock:skills:preview-local',
  installLocalSkill: 'agentdock:skills:install-local',
  uninstallSkill: 'agentdock:skills:uninstall',
  // Skill 调试覆写通道
  listSkillOverrides: 'agentdock:skills:override:list-all',
  enableSkillOverride: 'agentdock:skills:override:enable',
  getSkillOverrideStatus: 'agentdock:skills:override:status',
  readSkillFile: 'agentdock:skills:override:read-file',
  saveSkillOverrideFile: 'agentdock:skills:override:save-file',
  getSkillOverrideDiff: 'agentdock:skills:override:diff',
  revertSkillOverride: 'agentdock:skills:override:revert',
  commitSkillOverride: 'agentdock:skills:override:commit'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

export interface ListConversationsArgs {
  sourceId?: string
}

/** 与 Electron `nativeTheme.themeSource` 同名同值。 */
export type ThemeSource = 'system' | 'light' | 'dark'

export type FilePreviewResult =
  | { kind: 'text'; path: string; name: string; text: string; truncated: boolean }
  | { kind: 'image'; path: string; name: string; mime: string; dataUrl: string }
  | { kind: 'unsupported'; path: string; name: string; reason: string }

export interface DesktopApi {
  listConversations: (options?: ListConversationsArgs) => Promise<Conversation[]>
  getMessages: (conversationId: string) => Promise<Message[]>
  search: (query: string) => Promise<Conversation[]>
  listSources: () => Promise<SourceInfo[]>
  startScan: () => Promise<ScanDone>
  listActivities: () => Promise<WorkbenchContribution[]>
  setThemeSource: (source: ThemeSource) => Promise<void>
  readPlanFile: (conversationId: string, path: string) => Promise<string>
  revealInFolder: (path: string, workspace?: string) => Promise<void>
  readPreviewFile: (path: string, workspace?: string) => Promise<FilePreviewResult>
  onScanProgress: (listener: (payload: ScanProgress) => void) => () => void
  onScanDone: (listener: (payload: ScanDone) => void) => () => void

  // Skills 管理 API
  listSkills: (agentId?: string) => Promise<InstalledSkill[]>
  listAggregatedSkills: () => Promise<AggregatedSkill[]>
  listSkillAgents: () => Promise<SkillAgentInfo[]>
  getSkillDetail: (
    skillName: string,
    agentId: string
  ) => Promise<{ skill: InstalledSkill; files: SkillFileEntry[]; overrideStatus: SkillOverrideStatus } | null>
  installSkillToAgents: (args: InstallToAgentsArgs) => Promise<SkillOperationResult[]>
  previewGitHubSkill: (url: string) => Promise<GitHubSkillPreview>
  installSkillFromGitHub: (args: InstallFromGitHubArgs) => Promise<SkillOperationResult[]>
  selectSkillFolder: () => Promise<string | null>
  selectSkillZip: () => Promise<string | null>
  previewLocalSkill: (sourcePath: string) => Promise<LocalSkillPreview>
  installLocalSkill: (args: ImportLocalSkillArgs) => Promise<SkillOperationResult[]>
  uninstallSkill: (args: UninstallSkillArgs) => Promise<SkillOperationResult[]>
  listSkillOverrides: () => Promise<SkillOverrideEntry[]>
  enableSkillOverride: (agentId: string, skillId: string) => Promise<SkillOverrideStatus>
  getSkillOverrideStatus: (agentId: string, skillId: string) => Promise<SkillOverrideStatus>
  readSkillFile: (agentId: string, skillId: string, relativePath: string) => Promise<string>
  saveSkillOverrideFile: (args: SaveOverrideFileArgs) => Promise<void>
  getSkillOverrideDiff: (
    agentId: string,
    skillId: string,
    relativePath?: string
  ) => Promise<SkillFileDiff>
  revertSkillOverride: (agentId: string, skillId: string) => Promise<void>
  commitSkillOverride: (agentId: string, skillId: string) => Promise<void>
  getPathForFile?: (file: unknown) => string
}

export type {
  AggregatedSkill,
  Conversation,
  GitHubSkillPreview,
  InstallFromGitHubArgs,
  ImportLocalSkillArgs,
  InstalledSkill,
  InstallToAgentsArgs,
  LocalSkillPreview,
  Message,
  SaveOverrideFileArgs,
  ScanDone,
  ScanProgress,
  SkillAgentInfo,
  SkillFileDiff,
  SkillFileEntry,
  SkillOperationResult,
  SkillOverrideEntry,
  SkillOverrideStatus,
  SourceInfo,
  UninstallSkillArgs,
  WorkbenchContribution
}
