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
import type { DesktopApi, FilePreviewResult, ListConversationsArgs, ThemeSource } from '@agentdock/plugin-bridge/ipc'
import type { ScanDone, ScanProgress, SourceInfo } from '@agentdock/plugin-registry/types'

export type {
  AggregatedSkill,
  Conversation,
  FilePreviewResult,
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
  ThemeSource,
  UninstallSkillArgs,
  WorkbenchContribution
}

export function getApi(): DesktopApi {
  const api = window.api
  if (api == null) {
    throw new Error('window.api 不可用（需要 Electron preload）')
  }
  return api
}

function bindScanListener<T>(
  method: ((listener: (payload: T) => void) => unknown) | undefined,
  listener: (payload: T) => void
): (() => void) | undefined {
  if (typeof method !== 'function') return undefined
  const result = method(listener)
  return typeof result === 'function' ? () => void result() : undefined
}

/** 订阅 `agentdock:scan:progress` / `agentdock:scan:done`。 */
export function subscribeScanEvents(handlers: {
  onProgress?: (payload: ScanProgress) => void
  onDone?: (payload: ScanDone) => void
}): () => void {
  const api = getApi()
  const offs: Array<() => void> = []
  if (handlers.onProgress) {
    const off = bindScanListener(api.onScanProgress, handlers.onProgress)
    if (off) offs.push(off)
  }
  if (handlers.onDone) {
    const off = bindScanListener(api.onScanDone, handlers.onDone)
    if (off) offs.push(off)
  }
  return () => {
    for (const off of offs) off()
  }
}

export function listSources(): Promise<SourceInfo[]> {
  return getApi().listSources()
}

export function listConversations(filter?: ListConversationsArgs): Promise<Conversation[]> {
  return getApi().listConversations(filter)
}

export function searchConversations(query: string): Promise<Conversation[]> {
  return getApi().search(query)
}

export function getMessages(conversationId: string): Promise<Message[]> {
  return getApi().getMessages(conversationId)
}

export function readPlanFile(conversationId: string, path: string): Promise<string> {
  const api = getApi()
  if (typeof api.readPlanFile !== 'function') {
    return Promise.reject(new Error('readPlanFile unavailable'))
  }
  return api.readPlanFile(conversationId, path)
}

export function revealInFolder(path: string, workspace?: string): Promise<void> {
  const api = window.api
  if (typeof api?.revealInFolder !== 'function') {
    return Promise.reject(new Error('需要重启应用才能在文件夹中显示'))
  }
  return api.revealInFolder(path, workspace)
}

export function readPreviewFile(path: string, workspace?: string): Promise<FilePreviewResult> {
  const api = window.api
  if (typeof api?.readPreviewFile !== 'function') {
    return Promise.reject(new Error('需要重启应用才能预览文件'))
  }
  return api.readPreviewFile(path, workspace)
}

export function startScan(): Promise<ScanDone> {
  return getApi().startScan()
}

export function listActivities(): Promise<WorkbenchContribution[]> {
  return getApi().listActivities()
}

/** 同步主题到主进程的 `nativeTheme`；preload 不可用时静默跳过。 */
export function setThemeSource(source: ThemeSource): void {
  const api = window.api
  if (typeof api?.setThemeSource !== 'function') return
  void api.setThemeSource(source).catch(() => {
    // 主题同步失败不影响渲染层已生效的 data-theme
  })
}

// ======================= Skills 相关 API =======================

export function listSkills(agentId?: string): Promise<InstalledSkill[]> {
  return getApi().listSkills(agentId)
}

export function listAggregatedSkills(): Promise<AggregatedSkill[]> {
  return getApi().listAggregatedSkills()
}

export function listSkillAgents(): Promise<SkillAgentInfo[]> {
  return getApi().listSkillAgents()
}

export function getSkillDetail(
  skillName: string,
  agentId: string
): Promise<{ skill: InstalledSkill; files: SkillFileEntry[]; overrideStatus: SkillOverrideStatus } | null> {
  return getApi().getSkillDetail(skillName, agentId)
}

export function installSkillToAgents(args: InstallToAgentsArgs): Promise<SkillOperationResult[]> {
  return getApi().installSkillToAgents(args)
}

export function previewGitHubSkill(url: string): Promise<GitHubSkillPreview> {
  return getApi().previewGitHubSkill(url)
}

export function installSkillFromGitHub(args: InstallFromGitHubArgs): Promise<SkillOperationResult[]> {
  return getApi().installSkillFromGitHub(args)
}

export function selectSkillFolder(): Promise<string | null> {
  return getApi().selectSkillFolder()
}

export function selectSkillZip(): Promise<string | null> {
  return getApi().selectSkillZip()
}

export function previewLocalSkill(sourcePath: string): Promise<LocalSkillPreview> {
  return getApi().previewLocalSkill(sourcePath)
}

export function installLocalSkill(args: ImportLocalSkillArgs): Promise<SkillOperationResult[]> {
  return getApi().installLocalSkill(args)
}

export function uninstallSkill(args: UninstallSkillArgs): Promise<SkillOperationResult[]> {
  return getApi().uninstallSkill(args)
}

export function listSkillOverrides(): Promise<SkillOverrideEntry[]> {
  const api = getApi()
  if (typeof api.listSkillOverrides !== 'function') {
    return Promise.resolve([])
  }
  return api.listSkillOverrides()
}

export function enableSkillOverride(agentId: string, skillId: string): Promise<SkillOverrideStatus> {
  return getApi().enableSkillOverride(agentId, skillId)
}

export function getSkillOverrideStatus(agentId: string, skillId: string): Promise<SkillOverrideStatus> {
  return getApi().getSkillOverrideStatus(agentId, skillId)
}

export function readSkillFile(agentId: string, skillId: string, relativePath: string): Promise<string> {
  return getApi().readSkillFile(agentId, skillId, relativePath)
}

export function saveSkillOverrideFile(args: SaveOverrideFileArgs): Promise<void> {
  return getApi().saveSkillOverrideFile(args)
}

export function getSkillOverrideDiff(
  agentId: string,
  skillId: string,
  relativePath?: string
): Promise<SkillFileDiff> {
  return getApi().getSkillOverrideDiff(agentId, skillId, relativePath)
}

export function revertSkillOverride(agentId: string, skillId: string): Promise<void> {
  return getApi().revertSkillOverride(agentId, skillId)
}

export function commitSkillOverride(agentId: string, skillId: string): Promise<void> {
  return getApi().commitSkillOverride(agentId, skillId)
}

/**
 * 获取拖拽到窗口中的本地文件/目录的真实绝对路径
 * 兼容 Electron webUtils.getPathForFile 及降级方案
 */
export function getPathForFile(file: File): string {
  const api = window.api
  if (typeof api?.getPathForFile === 'function') {
    try {
      const p = api.getPathForFile(file)
      if (p && typeof p === 'string') return p
    } catch {
      // 忽略调用异常，降级到 file.path
    }
  }
  return (file as File & { path?: string }).path || ''
}

