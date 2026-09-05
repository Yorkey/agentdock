import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { Service, type Context } from 'cordis'
import type {
  AggregatedSkill,
  GitHubSkillPreview,
  InstallFromGitHubArgs,
  ImportLocalSkillArgs,
  InstalledSkill,
  InstallToAgentsArgs,
  LocalSkillPreview,
  SaveOverrideFileArgs,
  SkillAgentAdapter,
  SkillAgentInfo,
  SkillFileDiff,
  SkillFileEntry,
  SkillOperationResult,
  SkillOverrideEntry,
  SkillOverrideStatus,
  UninstallSkillArgs
} from '@agentdock/core'
import { downloadGitHubSkillToDir, previewGitHubSkill } from './github.ts'
import { previewLocalSkill, extractZipToDir } from './local-import.ts'
import { ClaudeCodeSkillAdapter } from './adapters/claude.ts'
import { CursorSkillAdapter } from './adapters/cursor.ts'
import { CodexSkillAdapter } from './adapters/codex.ts'
import { CommonSkillAdapter } from './adapters/common.ts'

export class SkillRegistry extends Service {
  static provide = 'skills'
  static name = 'skills'

  private adapters = new Map<string, SkillAgentAdapter>()
  private overridesBaseDir: string

  constructor(ctx: Context, overridesBaseDir?: string) {
    super(ctx, 'skills')
    this.overridesBaseDir = overridesBaseDir || join(homedir(), '.agentdock', 'overrides')
    this.registerAdapter(new ClaudeCodeSkillAdapter())
    this.registerAdapter(new CursorSkillAdapter())
    this.registerAdapter(new CodexSkillAdapter())
    this.registerAdapter(new CommonSkillAdapter())
  }

  registerAdapter(adapter: SkillAgentAdapter) {
    return this.ctx.effect(() => {
      this.adapters.set(adapter.id, adapter)
      return () => {
        this.adapters.delete(adapter.id)
      }
    })
  }

  async listAdapters(): Promise<SkillAgentInfo[]> {
    const infos: SkillAgentInfo[] = []
    for (const adapter of this.adapters.values()) {
      let available = false
      let skillCount = 0
      try {
        const dir = adapter.getSkillsDir()
        const s = await stat(dir)
        available = s.isDirectory()
        if (available) {
          const skills = await adapter.discoverSkills()
          skillCount = skills.length
        }
      } catch {
        available = false
      }
      infos.push({
        id: adapter.id,
        label: adapter.label,
        skillsDir: adapter.getSkillsDir(),
        available,
        skillCount
      })
    }
    return infos
  }

  getAdapter(id: string): SkillAgentAdapter | undefined {
    return this.adapters.get(id)
  }

  async listOverrides(): Promise<SkillOverrideEntry[]> {
    const results: SkillOverrideEntry[] = []
    try {
      const agentDirs = await readdir(this.overridesBaseDir, { withFileTypes: true })
      for (const agentDir of agentDirs) {
        if (!agentDir.isDirectory() || agentDir.name.startsWith('.')) continue
        const agentPath = join(this.overridesBaseDir, agentDir.name)
        const skillDirs = await readdir(agentPath, { withFileTypes: true })
        for (const skillDir of skillDirs) {
          if (!skillDir.isDirectory() || skillDir.name.startsWith('.')) continue
          results.push({
            agentId: agentDir.name,
            skillId: skillDir.name
          })
        }
      }
    } catch {
      // 容错 overrides 根目录尚不存在的情况
    }
    return results
  }

  async listSkills(agentId?: string): Promise<InstalledSkill[]> {
    const overrides = await this.listOverrides()
    const overrideSet = new Set(overrides.map((o) => `${o.agentId}:${o.skillId}`))

    if (agentId) {
      const adapter = this.adapters.get(agentId)
      if (!adapter) return []
      const skills = await adapter.discoverSkills()
      for (const s of skills) {
        s.isOverridden = overrideSet.has(`${s.agentId}:${s.id}`)
      }
      return skills
    }

    const all: InstalledSkill[] = []
    for (const adapter of this.adapters.values()) {
      try {
        const skills = await adapter.discoverSkills()
        for (const s of skills) {
          s.isOverridden = overrideSet.has(`${s.agentId}:${s.id}`)
        }
        all.push(...skills)
      } catch {
        // 容错单个 Agent 目录扫描失败
      }
    }
    return all
  }

  async listAggregatedSkills(): Promise<AggregatedSkill[]> {
    const all = await this.listSkills()
    const overrides = await this.listOverrides()
    const overrideSet = new Set(overrides.map((o) => `${o.agentId}:${o.skillId}`))
    const map = new Map<string, AggregatedSkill>()

    for (const skill of all) {
      const isOverridden = overrideSet.has(`${skill.agentId}:${skill.id}`) || Boolean(skill.isOverridden)
      skill.isOverridden = isOverridden

      const existing = map.get(skill.id)
      if (existing) {
        existing.agents.push({
          agentId: skill.agentId,
          agentLabel: skill.agentLabel,
          path: skill.path,
          updatedAt: skill.updatedAt,
          isOverridden
        })
        if (isOverridden) {
          existing.isOverridden = true
        }
        if (!existing.description && skill.description) {
          existing.description = skill.description
        }
        if (!existing.skillMdContent && skill.skillMdContent) {
          existing.skillMdContent = skill.skillMdContent
          existing.hasSkillMd = skill.hasSkillMd
        }
      } else {
        map.set(skill.id, {
          id: skill.id,
          name: skill.name,
          description: skill.description,
          version: skill.version,
          author: skill.author,
          agents: [
            {
              agentId: skill.agentId,
              agentLabel: skill.agentLabel,
              path: skill.path,
              updatedAt: skill.updatedAt,
              isOverridden
            }
          ],
          hasSkillMd: skill.hasSkillMd,
          skillMdContent: skill.skillMdContent,
          isOverridden
        })
      }
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }

  async getSkillDetail(
    skillName: string,
    agentId: string
  ): Promise<{ skill: InstalledSkill; files: SkillFileEntry[]; overrideStatus: SkillOverrideStatus } | null> {
    const adapter = this.adapters.get(agentId)
    if (!adapter) return null

    const skills = await adapter.discoverSkills()
    const target = skills.find((s) => s.id === skillName || s.name === skillName)
    if (!target) return null

    const overrideStatus = await this.getOverrideStatus(agentId, target.id)
    target.isOverridden = overrideStatus.isOverridden

    const files = await this.walkSkillFiles(target.path)
    return { skill: target, files, overrideStatus }
  }

  private async walkSkillFiles(rootPath: string): Promise<SkillFileEntry[]> {
    const results: SkillFileEntry[] = []

    try {
      const rootStat = await stat(rootPath)
      if (!rootStat.isDirectory()) {
        return [
          {
            name: basename(rootPath),
            path: rootPath,
            relativePath: basename(rootPath),
            size: rootStat.size,
            isDirectory: false
          }
        ]
      }

      async function walk(current: string) {
        const entries = await readdir(current, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = join(current, entry.name)
          const relPath = relative(rootPath, fullPath)
          if (entry.isDirectory()) {
            results.push({
              name: entry.name,
              path: fullPath,
              relativePath: relPath,
              size: 0,
              isDirectory: true
            })
            await walk(fullPath)
          } else if (entry.isFile()) {
            const s = await stat(fullPath)
            results.push({
              name: entry.name,
              path: fullPath,
              relativePath: relPath,
              size: s.size,
              isDirectory: false
            })
          }
        }
      }

      await walk(rootPath)
    } catch {
      // 容错
    }

    return results
  }

  async installSkillToAgents(args: InstallToAgentsArgs): Promise<SkillOperationResult[]> {
    const { skillName, sourceAgentId, targetAgentIds, overwrite } = args
    const sourceAdapter = this.adapters.get(sourceAgentId)
    if (!sourceAdapter) {
      throw new Error(`来源 Agent (${sourceAgentId}) 不存在`)
    }

    const sourceSkills = await sourceAdapter.discoverSkills()
    const sourceSkill = sourceSkills.find((s) => s.id === skillName || s.name === skillName)
    if (!sourceSkill) {
      throw new Error(`在 ${sourceAdapter.label} 中未找到技能: ${skillName}`)
    }

    const results: SkillOperationResult[] = []

    for (const targetId of targetAgentIds) {
      if (targetId === sourceAgentId) continue
      const targetAdapter = this.adapters.get(targetId)
      if (!targetAdapter) {
        results.push({ agentId: targetId, success: false, error: '目标 Agent 未就绪' })
        continue
      }
      try {
        await targetAdapter.installSkill(sourceSkill.id, sourceSkill.path, overwrite)
        results.push({ agentId: targetId, success: true })
      } catch (error) {
        results.push({
          agentId: targetId,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    return results
  }

  async previewGitHubSkill(url: string): Promise<GitHubSkillPreview> {
    return previewGitHubSkill(url)
  }

  async installSkillFromGitHub(args: InstallFromGitHubArgs): Promise<SkillOperationResult[]> {
    const { url, targetAgentIds, overwrite } = args
    const preview = await previewGitHubSkill(url)
    const folderName = preview.repoInfo.subpath
      ? preview.repoInfo.subpath.split('/').pop() || preview.repoInfo.repo
      : preview.repoInfo.repo

    const results: SkillOperationResult[] = []

    for (const agentId of targetAgentIds) {
      const adapter = this.adapters.get(agentId)
      if (!adapter) {
        results.push({ agentId, success: false, error: 'Agent 未就绪' })
        continue
      }

      try {
        const skillsDir = await adapter.ensureSkillsDir()
        const targetDir = join(skillsDir, folderName)

        let exists = false
        try {
          await stat(targetDir)
          exists = true
        } catch {
          exists = false
        }

        if (exists && !overwrite) {
          results.push({
            agentId,
            success: false,
            error: `Agent ${adapter.label} 已存在同名技能 ${folderName}，未勾选覆盖`
          })
          continue
        }

        await downloadGitHubSkillToDir(preview.repoInfo, targetDir)
        results.push({ agentId, success: true })
      } catch (error) {
        results.push({
          agentId,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    return results
  }

  async previewLocalSkill(sourcePath: string): Promise<LocalSkillPreview> {
    return previewLocalSkill(sourcePath)
  }

  async installLocalSkill(args: ImportLocalSkillArgs): Promise<SkillOperationResult[]> {
    const { sourcePath, targetAgentIds, overwrite } = args
    const preview = await previewLocalSkill(sourcePath)
    const rawName = (args.skillName && args.skillName.trim()) || preview.folderName || preview.name
    // 清理技能名称中可能的非法字符及路径穿越符号
    const skillName = rawName.replace(/[\\/:*?"<>|]/g, '-').replace(/^\.+/, '') || 'custom-skill'

    const results: SkillOperationResult[] = []

    for (const agentId of targetAgentIds) {
      const adapter = this.adapters.get(agentId)
      if (!adapter) {
        results.push({ agentId, success: false, error: 'Agent 未就绪' })
        continue
      }

      try {
        const skillsDir = await adapter.ensureSkillsDir()
        const targetDir = join(skillsDir, skillName)

        let exists = false
        try {
          await stat(targetDir)
          exists = true
        } catch {
          exists = false
        }

        if (exists && !overwrite) {
          results.push({
            agentId,
            success: false,
            error: `Agent ${adapter.label} 已存在同名技能 ${skillName}，未勾选覆盖`
          })
          continue
        }

        if (exists) {
          await rm(targetDir, { recursive: true, force: true })
        }

        if (preview.sourceType === 'folder') {
          await cp(sourcePath, targetDir, { recursive: true, force: true })
        } else {
          await extractZipToDir(sourcePath, targetDir)
        }

        results.push({ agentId, success: true })
      } catch (error) {
        results.push({
          agentId,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    return results
  }

  async uninstallSkill(args: UninstallSkillArgs): Promise<SkillOperationResult[]> {
    const { skillName, agentIds } = args
    const results: SkillOperationResult[] = []

    for (const agentId of agentIds) {
      const adapter = this.adapters.get(agentId)
      if (!adapter) {
        results.push({ agentId, success: false, error: 'Agent 不存在' })
        continue
      }

      try {
        await adapter.uninstallSkill(skillName)
        results.push({ agentId, success: true })
      } catch (error) {
        results.push({
          agentId,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    return results
  }

  getOverrideSnapshotDir(agentId: string, skillId: string): string {
    return join(this.overridesBaseDir, agentId, skillId)
  }

  async isSkillOverridden(agentId: string, skillId: string): Promise<boolean> {
    try {
      const dir = this.getOverrideSnapshotDir(agentId, skillId)
      const s = await stat(dir)
      return s.isDirectory()
    } catch {
      return false
    }
  }

  async getOverrideStatus(agentId: string, skillId: string): Promise<SkillOverrideStatus> {
    const isOverridden = await this.isSkillOverridden(agentId, skillId)
    if (!isOverridden) {
      return { isOverridden: false, changedFiles: [] }
    }

    const snapshotDir = this.getOverrideSnapshotDir(agentId, skillId)
    const target = await this.findSkill(agentId, skillId)
    if (!target) {
      return { isOverridden: true, changedFiles: [] }
    }

    try {
      const snapStat = await stat(snapshotDir)
      let changedFiles: string[] = []
      if (target.isDir) {
        changedFiles = await this.compareDirectoryFiles(snapshotDir, target.path)
      } else {
        const origContent = await readFile(join(snapshotDir, basename(target.path)), 'utf8')
        const currContent = await readFile(target.path, 'utf8')
        if (origContent !== currContent) {
          changedFiles = [basename(target.path)]
        }
      }
      return {
        isOverridden: true,
        changedFiles,
        originalUpdatedAt: snapStat.mtimeMs
      }
    } catch {
      return { isOverridden: true, changedFiles: [] }
    }
  }

  async enableOverride(agentId: string, skillId: string): Promise<SkillOverrideStatus> {
    const target = await this.findSkill(agentId, skillId)
    if (!target) {
      throw new Error(`未找到技能: ${skillId} (Agent: ${agentId})`)
    }

    const snapshotDir = this.getOverrideSnapshotDir(agentId, skillId)
    const exists = await this.isSkillOverridden(agentId, skillId)
    if (!exists) {
      await mkdir(dirname(snapshotDir), { recursive: true })
      if (target.isDir) {
        await cp(target.path, snapshotDir, { recursive: true })
      } else {
        await mkdir(snapshotDir, { recursive: true })
        await cp(target.path, join(snapshotDir, basename(target.path)))
      }
    }

    return this.getOverrideStatus(agentId, skillId)
  }

  async readSkillFile(agentId: string, skillId: string, relativePath: string): Promise<string> {
    const target = await this.findSkill(agentId, skillId)
    if (!target) {
      throw new Error(`未找到技能: ${skillId} (Agent: ${agentId})`)
    }
    const fullPath = target.isDir ? this.safeResolve(target.path, relativePath) : target.path
    return await readFile(fullPath, 'utf8')
  }

  async saveOverrideFile(args: SaveOverrideFileArgs): Promise<void> {
    const { agentId, skillId, relativePath, content } = args
    const target = await this.findSkill(agentId, skillId)
    if (!target) {
      throw new Error(`未找到技能: ${skillId} (Agent: ${agentId})`)
    }

    // 确保已存在原始快照，防止无基准被覆盖
    await this.enableOverride(agentId, skillId)

    const targetFilePath = target.isDir ? this.safeResolve(target.path, relativePath) : target.path
    await mkdir(dirname(targetFilePath), { recursive: true })
    await writeFile(targetFilePath, content, 'utf8')
  }

  async getOverrideDiff(
    agentId: string,
    skillId: string,
    relativePath: string = 'SKILL.md'
  ): Promise<SkillFileDiff> {
    const target = await this.findSkill(agentId, skillId)
    if (!target) {
      throw new Error(`未找到技能: ${skillId} (Agent: ${agentId})`)
    }

    const snapshotDir = this.getOverrideSnapshotDir(agentId, skillId)
    const isOverridden = await this.isSkillOverridden(agentId, skillId)

    let currentContent = ''
    try {
      const currPath = target.isDir ? this.safeResolve(target.path, relativePath) : target.path
      currentContent = await readFile(currPath, 'utf8')
    } catch {
      currentContent = ''
    }

    if (!isOverridden) {
      return {
        relativePath,
        originalContent: currentContent,
        currentContent,
        hasChanges: false
      }
    }

    let originalContent = ''
    try {
      const origPath = target.isDir
        ? this.safeResolve(snapshotDir, relativePath)
        : join(snapshotDir, basename(target.path))
      originalContent = await readFile(origPath, 'utf8')
    } catch {
      originalContent = ''
    }

    return {
      relativePath,
      originalContent,
      currentContent,
      hasChanges: originalContent !== currentContent
    }
  }

  async revertOverride(agentId: string, skillId: string): Promise<void> {
    const target = await this.findSkill(agentId, skillId)
    if (!target) {
      throw new Error(`未找到技能: ${skillId} (Agent: ${agentId})`)
    }

    const snapshotDir = this.getOverrideSnapshotDir(agentId, skillId)
    const isOverridden = await this.isSkillOverridden(agentId, skillId)
    if (!isOverridden) return

    if (target.isDir) {
      await rm(target.path, { recursive: true, force: true })
      await cp(snapshotDir, target.path, { recursive: true })
    } else {
      await cp(join(snapshotDir, basename(target.path)), target.path)
    }

    await rm(snapshotDir, { recursive: true, force: true })
  }

  async commitOverride(agentId: string, skillId: string): Promise<void> {
    const snapshotDir = this.getOverrideSnapshotDir(agentId, skillId)
    const isOverridden = await this.isSkillOverridden(agentId, skillId)
    if (!isOverridden) return

    await rm(snapshotDir, { recursive: true, force: true })
  }

  // Alias methods matching IPC naming convention
  async enableSkillOverride(agentId: string, skillId: string): Promise<SkillOverrideStatus> {
    return this.enableOverride(agentId, skillId)
  }

  async getSkillOverrideStatus(agentId: string, skillId: string): Promise<SkillOverrideStatus> {
    return this.getOverrideStatus(agentId, skillId)
  }

  async saveSkillOverrideFile(args: SaveOverrideFileArgs): Promise<void> {
    return this.saveOverrideFile(args)
  }

  async getSkillOverrideDiff(
    agentId: string,
    skillId: string,
    relativePath?: string
  ): Promise<SkillFileDiff> {
    return this.getOverrideDiff(agentId, skillId, relativePath)
  }

  async revertSkillOverride(agentId: string, skillId: string): Promise<void> {
    return this.revertOverride(agentId, skillId)
  }

  async commitSkillOverride(agentId: string, skillId: string): Promise<void> {
    return this.commitOverride(agentId, skillId)
  }


  private async findSkill(agentId: string, skillId: string): Promise<InstalledSkill | null> {
    const adapter = this.adapters.get(agentId)
    if (!adapter) return null
    const skills = await adapter.discoverSkills()
    return skills.find((s) => s.id === skillId || s.name === skillId) || null
  }

  private safeResolve(baseDir: string, relPath: string): string {
    const normalized = relPath.replace(/^(\/|\\)+/, '')
    const resolved = resolve(baseDir, normalized)
    const resolvedBase = resolve(baseDir)
    if (!resolved.startsWith(resolvedBase)) {
      throw new Error(`非法路径访问: ${relPath}`)
    }
    return resolved
  }

  private async compareDirectoryFiles(originalDir: string, currentDir: string): Promise<string[]> {
    const changed: string[] = []
    const originalFiles = await this.walkSkillFiles(originalDir)
    const currentFiles = await this.walkSkillFiles(currentDir)

    const origMap = new Map(
      originalFiles.filter((f) => !f.isDirectory).map((f) => [f.relativePath, f])
    )
    const currMap = new Map(
      currentFiles.filter((f) => !f.isDirectory).map((f) => [f.relativePath, f])
    )

    for (const [relPath, curr] of currMap.entries()) {
      const orig = origMap.get(relPath)
      if (!orig) {
        changed.push(relPath)
      } else if (orig.size !== curr.size) {
        changed.push(relPath)
      } else {
        try {
          const [c1, c2] = await Promise.all([readFile(orig.path), readFile(curr.path)])
          if (!c1.equals(c2)) {
            changed.push(relPath)
          }
        } catch {
          changed.push(relPath)
        }
      }
    }

    for (const relPath of origMap.keys()) {
      if (!currMap.has(relPath)) {
        changed.push(relPath)
      }
    }

    return changed.sort()
  }
}

declare module 'cordis' {
  interface Context {
    skills: SkillRegistry
  }
}
