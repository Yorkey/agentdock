import { cp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { InstalledSkill, SkillAgentAdapter } from '@agentdock/core'
import { parseSkillContent } from '../parse-frontmatter.ts'

export abstract class BaseSkillAgentAdapter implements SkillAgentAdapter {
  abstract id: string
  abstract label: string
  icon?: string
  skillsDir: string
  commonSkillsDirs: string[]

  constructor(skillsDir: string, commonSkillsDirs: string[] = []) {
    this.skillsDir = skillsDir
    this.commonSkillsDirs = commonSkillsDirs
  }

  getSkillsDir(): string {
    return this.skillsDir
  }

  getCommonSkillsDirs(): string[] {
    return this.commonSkillsDirs
  }

  async ensureSkillsDir(): Promise<string> {
    try {
      await mkdir(this.skillsDir, { recursive: true })
    } catch {
      // 忽略已存在异常
    }
    return this.skillsDir
  }

  async discoverSkills(): Promise<InstalledSkill[]> {
    const results: InstalledSkill[] = []
    let entries
    try {
      entries = await readdir(this.skillsDir, { withFileTypes: true })
    } catch {
      return results
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = join(this.skillsDir, entry.name)
      let isDir = entry.isDirectory()
      let isFile = entry.isFile()

      if (entry.isSymbolicLink()) {
        try {
          const s = await stat(fullPath)
          isDir = s.isDirectory()
          isFile = s.isFile()
        } catch {
          continue
        }
      }

      if (isDir) {
        const skill = await this.parseSkillDir(entry.name, fullPath)
        if (skill) results.push(skill)
      } else if (isFile && entry.name.endsWith('.md')) {
        const skill = await this.parseSkillFile(entry.name, fullPath)
        if (skill) results.push(skill)
      }
    }

    return results.sort((a, b) => a.name.localeCompare(b.name))
  }

  private async parseSkillDir(dirName: string, dirPath: string): Promise<InstalledSkill | null> {
    try {
      const subEntries = await readdir(dirPath)
      if (subEntries.length === 0) return null

      const skillMdFile = subEntries.find((f) => f.toLowerCase() === 'skill.md')
      const readmeFile = subEntries.find((f) => f.toLowerCase() === 'readme.md')
      const anyMdFile = subEntries.find((f) => f.toLowerCase().endsWith('.md'))
      const targetDoc = skillMdFile || readmeFile || anyMdFile

      let rawContent = ''
      let hasSkillMd = false
      if (targetDoc) {
        hasSkillMd = Boolean(skillMdFile)
        rawContent = await readFile(join(dirPath, targetDoc), 'utf8')
      }

      const info = await stat(dirPath)
      const { metadata, markdownBody } = parseSkillContent(rawContent, dirName)

      return {
        id: dirName,
        name: metadata.name || dirName,
        description: metadata.description || '',
        version: metadata.version,
        author: metadata.author,
        agentId: this.id,
        agentLabel: this.label,
        path: dirPath,
        isDir: true,
        hasSkillMd,
        updatedAt: info.mtimeMs,
        skillMdContent: rawContent || markdownBody
      }
    } catch {
      return null
    }
  }

  private async parseSkillFile(fileName: string, filePath: string): Promise<InstalledSkill | null> {
    try {
      const id = basename(fileName, '.md')
      const rawContent = await readFile(filePath, 'utf8')
      const info = await stat(filePath)
      const { metadata, markdownBody } = parseSkillContent(rawContent, id)

      return {
        id,
        name: metadata.name || id,
        description: metadata.description || '',
        version: metadata.version,
        author: metadata.author,
        agentId: this.id,
        agentLabel: this.label,
        path: filePath,
        isDir: false,
        hasSkillMd: false,
        updatedAt: info.mtimeMs,
        skillMdContent: rawContent || markdownBody
      }
    } catch {
      return null
    }
  }

  async installSkill(skillName: string, sourcePath: string, overwrite?: boolean): Promise<InstalledSkill> {
    await this.ensureSkillsDir()
    const srcStat = await stat(sourcePath)
    const isDir = srcStat.isDirectory()
    const targetName = isDir ? skillName : (skillName.endsWith('.md') ? skillName : `${skillName}.md`)
    const targetPath = join(this.skillsDir, targetName)

    let exists = false
    try {
      await stat(targetPath)
      exists = true
    } catch {
      exists = false
    }

    if (exists && !overwrite) {
      throw new Error(`Agent ${this.label} 已存在同名技能 ${skillName}，请选择是否覆盖。`)
    }

    if (exists) {
      await rm(targetPath, { recursive: true, force: true })
    }

    if (isDir) {
      await cp(sourcePath, targetPath, { recursive: true, force: true })
      const installed = await this.parseSkillDir(targetName, targetPath)
      if (!installed) {
        throw new Error(`安装技能失败：无法解析目标目录 ${targetPath}`)
      }
      return installed
    } else {
      await cp(sourcePath, targetPath, { force: true })
      const installed = await this.parseSkillFile(targetName, targetPath)
      if (!installed) {
        throw new Error(`安装技能失败：无法解析目标文件 ${targetPath}`)
      }
      return installed
    }
  }

  async uninstallSkill(skillName: string): Promise<void> {
    const targetDir = join(this.skillsDir, skillName)
    const targetFile = join(this.skillsDir, `${skillName}.md`)

    let removed = false
    try {
      await rm(targetDir, { recursive: true, force: true })
      removed = true
    } catch {
      // ignore
    }

    try {
      await rm(targetFile, { force: true })
      removed = true
    } catch {
      // ignore
    }

    if (!removed) {
      // 检查原目录是否存在
      try {
        await stat(targetDir)
        await rm(targetDir, { recursive: true, force: true })
      } catch {
        // 确实不存在，视作成功
      }
    }
  }
}
