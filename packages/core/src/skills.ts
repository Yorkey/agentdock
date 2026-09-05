export interface SkillMetadata {
  name?: string
  description?: string
  version?: string
  author?: string
  tools?: string[]
  tags?: string[]
  [key: string]: unknown
}

export interface SkillFileEntry {
  name: string
  path: string
  relativePath: string
  size: number
  isDirectory: boolean
}

export interface InstalledSkill {
  id: string
  name: string
  description: string
  version?: string
  author?: string
  agentId: string
  agentLabel: string
  path: string
  isDir: boolean
  hasSkillMd: boolean
  updatedAt: number
  skillMdContent?: string
  isOverridden?: boolean
}

export interface AggregatedSkill {
  id: string
  name: string
  description: string
  version?: string
  author?: string
  agents: Array<{
    agentId: string
    agentLabel: string
    path: string
    updatedAt: number
    isOverridden?: boolean
  }>
  hasSkillMd: boolean
  skillMdContent?: string
  isOverridden?: boolean
}

export interface SkillAgentInfo {
  id: string
  label: string
  skillsDir: string
  available: boolean
  skillCount: number
}

export interface SkillAgentAdapter {
  id: string
  label: string
  icon?: string
  getSkillsDir(): string
  getCommonSkillsDirs?(): string[]
  ensureSkillsDir(): Promise<string>
  discoverSkills(): Promise<InstalledSkill[]>
  installSkill(skillName: string, sourcePath: string, overwrite?: boolean): Promise<InstalledSkill>
  uninstallSkill(skillName: string): Promise<void>
}

export interface GitHubRepoInfo {
  owner: string
  repo: string
  ref: string
  subpath: string
}

export interface GitHubSkillPreview {
  name: string
  description: string
  version?: string
  author?: string
  skillMdContent: string
  fileTree: Array<{ path: string; size?: number; type: 'file' | 'dir' }>
  repoInfo: GitHubRepoInfo
}

export interface InstallToAgentsArgs {
  skillName: string
  sourceAgentId: string
  targetAgentIds: string[]
  overwrite?: boolean
}

export interface InstallFromGitHubArgs {
  url: string
  targetAgentIds: string[]
  overwrite?: boolean
}

export interface UninstallSkillArgs {
  skillName: string
  agentIds: string[]
}

export interface SkillOperationResult {
  agentId: string
  success: boolean
  error?: string
}

export interface SkillOverrideStatus {
  isOverridden: boolean
  changedFiles: string[]
  originalUpdatedAt?: number
}

export interface SkillFileDiff {
  relativePath: string
  originalContent: string
  currentContent: string
  hasChanges: boolean
}

export interface SaveOverrideFileArgs {
  agentId: string
  skillId: string
  relativePath: string
  content: string
}

export interface SkillOverrideEntry {
  agentId: string
  skillId: string
}

export interface LocalSkillPreview {
  sourceType: 'folder' | 'zip'
  sourcePath: string
  folderName: string
  name: string
  description?: string
  version?: string
  author?: string
  hasSkillMd: boolean
  skillMdContent?: string
  fileCount: number
  totalSize: number
}

export interface ImportLocalSkillArgs {
  sourcePath: string
  skillName?: string
  targetAgentIds: string[]
  overwrite?: boolean
}
