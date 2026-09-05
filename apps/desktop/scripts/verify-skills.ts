import { mkdtemp, mkdir, rm, writeFile, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { Context } from 'cordis'
import {
  parseSkillContent,
  parseGitHubUrl,
  ClaudeCodeSkillAdapter,
  CursorSkillAdapter,
  CodexSkillAdapter,
  CommonSkillAdapter,
  SkillRegistry,
  extractZipToDir
} from '../../../packages/module-skills/src/index.ts'

// =========================================================================
// 1. 测试 parseSkillContent (SKILL.md 与 frontmatter 解析)
// =========================================================================

const sampleSkillMd = `---
name: Code Reviewer
description: Automates code reviews and security audits
version: 1.2.0
author: Alice
tools:
  - git
  - linter
---

# Code Reviewer Instructions

Use this skill to inspect pull requests.
`

const parsed1 = parseSkillContent(sampleSkillMd, 'fallback-dir')
if (parsed1.metadata.name !== 'Code Reviewer') {
  throw new Error(`parseSkillContent name: ${parsed1.metadata.name}`)
}
if (parsed1.metadata.version !== '1.2.0') {
  throw new Error(`parseSkillContent version: ${parsed1.metadata.version}`)
}
if (parsed1.metadata.author !== 'Alice') {
  throw new Error(`parseSkillContent author: ${parsed1.metadata.author}`)
}
if (parsed1.metadata.description !== 'Automates code reviews and security audits') {
  throw new Error(`parseSkillContent description: ${parsed1.metadata.description}`)
}
if (!Array.isArray(parsed1.metadata.tools) || parsed1.metadata.tools.length !== 2) {
  throw new Error('parseSkillContent tools array failed')
}

// 测试 YAML 换行折叠 scalar (description: >)
const foldedScalarSkillMd = `---
name: udc-debug
description: >
  Guides local debug and preview for udc:
  start with pnpm start, set proxy rules.
---

# UDC
`
const parsedFolded = parseSkillContent(foldedScalarSkillMd, 'fallback')
if (parsedFolded.metadata.description === '>' || !parsedFolded.metadata.description?.includes('Guides local debug')) {
  throw new Error(`folded scalar description failed: ${parsedFolded.metadata.description}`)
}

console.log('ok: parseSkillContent (frontmatter & markdown body)')

// =========================================================================
// 2. 测试 parseGitHubUrl (GitHub 链接解析)
// =========================================================================

const url1 = 'https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-demo/skills/bash'
const gh1 = parseGitHubUrl(url1)
if (
  gh1.owner !== 'anthropics' ||
  gh1.repo !== 'anthropic-quickstarts' ||
  gh1.ref !== 'main' ||
  gh1.subpath !== 'computer-use-demo/skills/bash'
) {
  throw new Error(`parseGitHubUrl tree url failed: ${JSON.stringify(gh1)}`)
}

// 指向 SKILL.md 本身应自动回退到所在目录
const url2 = 'https://github.com/foo/bar/blob/release-v1/skills/my-tool/SKILL.md'
const gh2 = parseGitHubUrl(url2)
if (gh2.subpath !== 'skills/my-tool' || gh2.ref !== 'release-v1') {
  throw new Error(`parseGitHubUrl blob SKILL.md strip failed: ${JSON.stringify(gh2)}`)
}

// 根仓库形式
const url3 = 'https://github.com/org/cool-skills'
const gh3 = parseGitHubUrl(url3)
if (gh3.owner !== 'org' || gh3.repo !== 'cool-skills' || gh3.ref !== 'main' || gh3.subpath !== '') {
  throw new Error(`parseGitHubUrl base repo failed: ${JSON.stringify(gh3)}`)
}

// 简写形式
const url4 = 'awesome-org/super-skills/path/to/tool'
const gh4 = parseGitHubUrl(url4)
if (gh4.owner !== 'awesome-org' || gh4.subpath !== 'path/to/tool') {
  throw new Error(`parseGitHubUrl shorthand failed: ${JSON.stringify(gh4)}`)
}

console.log('ok: parseGitHubUrl (tree / blob / base / shorthand)')

// =========================================================================
// 3. 测试 SkillAgentAdapter 与 SkillRegistry (发现、聚合、跨 Agent 同步与删除)
// =========================================================================

const testTmpDir = await mkdtemp(join(tmpdir(), 'agentdock-skills-test-'))

try {
  const claudeDir = join(testTmpDir, 'claude', 'skills')
  const cursorDir = join(testTmpDir, 'cursor', 'skills')
  const codexDir = join(testTmpDir, 'codex', 'skills')
  const commonDir = join(testTmpDir, 'agents', 'skills')

  await mkdir(claudeDir, { recursive: true })
  await mkdir(cursorDir, { recursive: true })
  await mkdir(codexDir, { recursive: true })
  await mkdir(commonDir, { recursive: true })

  // 在 common 目录中创建一个通用技能 (global-tool)
  const globalSkillDir = join(commonDir, 'global-tool')
  await mkdir(globalSkillDir, { recursive: true })
  await writeFile(
    join(globalSkillDir, 'SKILL.md'),
    `---
name: Global Tool
description: Available universally to all agents
version: 2.0.0
---
# Global Tool
Universal tool content.
`
  )

  // 1. 在 claude 目录中创建一个子目录技能 (code-audit)
  const auditSkillDir = join(claudeDir, 'code-audit')
  await mkdir(auditSkillDir, { recursive: true })
  await writeFile(
    join(auditSkillDir, 'SKILL.md'),
    `---
name: Code Audit
description: Inspects code vulnerabilities
version: 1.0.0
---
# Code Audit
Audit tool body.
`
  )
  await writeFile(join(auditSkillDir, 'helper.sh'), '#!/bin/bash\necho "checking..."\n')

  // 2. 在 claude 目录中创建一个单个 .md 技能 (fast-commit.md)
  await writeFile(
    join(claudeDir, 'fast-commit.md'),
    `# Fast Commit
Generates clean git commit messages.
`
  )

  // 3. 在 cursor 目录中也创建一个同名 code-audit 技能（模拟多 Agent 共存）
  const cursorAuditDir = join(cursorDir, 'code-audit')
  await mkdir(cursorAuditDir, { recursive: true })
  await writeFile(
    join(cursorAuditDir, 'SKILL.md'),
    `---
name: Code Audit
description: Inspects code vulnerabilities (cursor custom)
version: 1.0.1
---
# Code Audit on Cursor
`
  )

  // 实例化适配器与 Cordis Service
  const ctx = new Context()
  const registry = new SkillRegistry(ctx, join(testTmpDir, 'overrides'))

  const claudeAdapter = new ClaudeCodeSkillAdapter(claudeDir, [commonDir])
  const cursorAdapter = new CursorSkillAdapter(cursorDir, [commonDir])
  const codexAdapter = new CodexSkillAdapter(codexDir, [commonDir])
  const commonAdapter = new CommonSkillAdapter(commonDir)

  registry.registerAdapter(claudeAdapter)
  registry.registerAdapter(cursorAdapter)
  registry.registerAdapter(codexAdapter)
  registry.registerAdapter(commonAdapter)

  // 测试 CommonSkillAdapter discoverSkills
  const commonSkills = await commonAdapter.discoverSkills()
  if (commonSkills.length !== 1 || commonSkills[0]?.name !== 'Global Tool') {
    throw new Error('commonAdapter discoverSkills failed')
  }

  // 测试 discoverSkills
  const claudeSkills = await claudeAdapter.discoverSkills()
  if (claudeSkills.length !== 2) {
    throw new Error(`expected 2 claude skills, got ${claudeSkills.length}`)
  }
  const auditSkill = claudeSkills.find((s) => s.id === 'code-audit')
  if (!auditSkill || auditSkill.name !== 'Code Audit' || !auditSkill.hasSkillMd) {
    throw new Error('claude code-audit discovery failed')
  }

  const commitSkill = claudeSkills.find((s) => s.id === 'fast-commit')
  if (!commitSkill || commitSkill.isDir !== false) {
    throw new Error('claude fast-commit single file discovery failed')
  }

  // 测试平铺模式聚合 listAggregatedSkills
  const aggregated = await registry.listAggregatedSkills()
  const aggAudit = aggregated.find((s) => s.id === 'code-audit')
  if (!aggAudit) throw new Error('aggregated code-audit missing')
  if (aggAudit.agents.length !== 2) {
    throw new Error(`aggregated code-audit agents count should be 2, got ${aggAudit.agents.length}`)
  }
  const agentIds = aggAudit.agents.map((a) => a.agentId)
  if (!agentIds.includes('claude-code') || !agentIds.includes('cursor')) {
    throw new Error(`aggregated agentIds mismatch: ${agentIds.join(', ')}`)
  }

  // 测试 getSkillDetail 读取文件清单
  const detail = await registry.getSkillDetail('code-audit', 'claude-code')
  if (!detail || detail.files.length !== 2) {
    throw new Error(`code-audit files count should be 2, got ${detail?.files.length}`)
  }

  // 测试已有技能跨 Agent 安装 (fast-commit 从 claude 安装到 cursor 与 codex)
  const installResults = await registry.installSkillToAgents({
    skillName: 'fast-commit',
    sourceAgentId: 'claude-code',
    targetAgentIds: ['cursor', 'codex'],
    overwrite: false
  })
  if (!installResults.every((r) => r.success)) {
    throw new Error(`installSkillToAgents failed: ${JSON.stringify(installResults)}`)
  }

  // 验证 codex 中已存在 fast-commit
  const codexSkills = await codexAdapter.discoverSkills()
  if (!codexSkills.some((s) => s.id === 'fast-commit')) {
    throw new Error('fast-commit was not installed into codex')
  }

  // 测试重复安装且不覆盖 -> 预期报覆盖阻止
  const dupResults = await registry.installSkillToAgents({
    skillName: 'fast-commit',
    sourceAgentId: 'claude-code',
    targetAgentIds: ['codex'],
    overwrite: false
  })
  if (dupResults[0]?.success !== false) {
    throw new Error('duplicate install without overwrite should have failed')
  }

  // 测试重复安装且开启覆盖 -> 预期成功
  const overwriteResults = await registry.installSkillToAgents({
    skillName: 'fast-commit',
    sourceAgentId: 'claude-code',
    targetAgentIds: ['codex'],
    overwrite: true
  })
  if (!overwriteResults[0]?.success) {
    throw new Error('duplicate install with overwrite should succeed')
  }

  // 测试删除指定 Agent 技能：仅从 cursor 删除 code-audit，claude 依然保留
  const uninstallResults = await registry.uninstallSkill({
    skillName: 'code-audit',
    agentIds: ['cursor']
  })
  if (!uninstallResults[0]?.success) {
    throw new Error('uninstallSkill from cursor failed')
  }

  const cursorSkillsAfter = await cursorAdapter.discoverSkills()
  if (cursorSkillsAfter.some((s) => s.id === 'code-audit')) {
    throw new Error('code-audit should have been removed from cursor')
  }

  const claudeSkillsAfter = await claudeAdapter.discoverSkills()
  if (!claudeSkillsAfter.some((s) => s.id === 'code-audit')) {
    throw new Error('code-audit in claude must NOT be affected by cursor deletion')
  }

  console.log('ok: SkillAgentAdapter & SkillRegistry (discover, aggregate, cross-install, overwrite, delete)')

  // =========================================================================
  // 5. 测试本地调试覆写能力 (DevTools Overwrite: enable, edit, diff, revert, commit)
  // =========================================================================

  // 5.1 开启调试覆写
  const enableStatus = await registry.enableSkillOverride('claude-code', 'code-audit')
  if (!enableStatus.isOverridden) {
    throw new Error('enableSkillOverride failed: isOverridden is false')
  }

  // 验证初始无变更
  const initialStatus = await registry.getSkillOverrideStatus('claude-code', 'code-audit')
  if (initialStatus.changedFiles.length !== 0) {
    throw new Error('initial override status should have 0 changed files')
  }

  // 5.2 读取文件
  const originalSkillMd = await registry.readSkillFile('claude-code', 'code-audit', 'SKILL.md')
  if (!originalSkillMd.includes('Code Audit')) {
    throw new Error(`readSkillFile unexpected content: ${originalSkillMd}`)
  }

  // 5.3 保存覆写文件
  const modifiedSkillMd = originalSkillMd + '\n\n# OVERRIDE_DEBUG_MARKER\n'
  await registry.saveSkillOverrideFile({
    agentId: 'claude-code',
    skillId: 'code-audit',
    relativePath: 'SKILL.md',
    content: modifiedSkillMd
  })

  // 验证 Agent 运行时文件已立即生效
  const liveSkillMd = await readFile(join(claudeDir, 'code-audit', 'SKILL.md'), 'utf-8')
  if (!liveSkillMd.includes('# OVERRIDE_DEBUG_MARKER')) {
    throw new Error('saveSkillOverrideFile did not write live file immediately')
  }

  // 5.4 获取 Diff
  const diff = await registry.getSkillOverrideDiff('claude-code', 'code-audit', 'SKILL.md')
  if (!diff.hasChanges) {
    throw new Error('getSkillOverrideDiff should report changes')
  }
  if (diff.originalContent.includes('# OVERRIDE_DEBUG_MARKER')) {
    throw new Error('diff.originalContent should NOT have override marker')
  }
  if (!diff.currentContent.includes('# OVERRIDE_DEBUG_MARKER')) {
    throw new Error('diff.currentContent should have override marker')
  }

  // 5.5 状态显示 changedFiles
  const statusAfterEdit = await registry.getSkillOverrideStatus('claude-code', 'code-audit')
  if (!statusAfterEdit.changedFiles.includes('SKILL.md')) {
    throw new Error('getSkillOverrideStatus should include SKILL.md in changedFiles')
  }

  // 5.6 还原原版 (Revert)
  await registry.revertSkillOverride('claude-code', 'code-audit')
  const statusAfterRevert = await registry.getSkillOverrideStatus('claude-code', 'code-audit')
  if (statusAfterRevert.isOverridden) {
    throw new Error('revertSkillOverride should set isOverridden to false')
  }
  const revertedLiveSkillMd = await readFile(join(claudeDir, 'code-audit', 'SKILL.md'), 'utf-8')
  if (revertedLiveSkillMd.includes('# OVERRIDE_DEBUG_MARKER')) {
    throw new Error('revertSkillOverride failed: live file still has override marker')
  }

  // 5.7 重新开启 -> 修改 -> 固化为正式版 (Commit)
  await registry.enableSkillOverride('claude-code', 'code-audit')
  await registry.saveSkillOverrideFile({
    agentId: 'claude-code',
    skillId: 'code-audit',
    relativePath: 'SKILL.md',
    content: modifiedSkillMd
  })
  await registry.commitSkillOverride('claude-code', 'code-audit')
  const statusAfterCommit = await registry.getSkillOverrideStatus('claude-code', 'code-audit')
  if (statusAfterCommit.isOverridden) {
    throw new Error('commitSkillOverride should set isOverridden to false')
  }
  const committedLiveSkillMd = await readFile(join(claudeDir, 'code-audit', 'SKILL.md'), 'utf-8')
  if (!committedLiveSkillMd.includes('# OVERRIDE_DEBUG_MARKER')) {
    throw new Error('commitSkillOverride failed: live file lost override changes')
  }

  // 5.8 路径越界安全性校验 (Path traversal prevention)
  let traversalCaught = false
  try {
    await registry.readSkillFile('claude-code', 'code-audit', '../../etc/passwd')
  } catch {
    traversalCaught = true
  }
  if (!traversalCaught) {
    throw new Error('path traversal check failed to throw error')
  }

  // 5.9 测试 listOverrides 及其对 listSkills 和 listAggregatedSkills 的同步
  await registry.enableSkillOverride('claude-code', 'code-audit')
  const allOverrides = await registry.listOverrides()
  if (!allOverrides.some((o) => o.agentId === 'claude-code' && o.skillId === 'code-audit')) {
    throw new Error('listOverrides should return active overrides')
  }
  const skillsWithOverride = await registry.listSkills('claude-code')
  const targetSkill = skillsWithOverride.find((s) => s.id === 'code-audit')
  if (!targetSkill?.isOverridden) {
    throw new Error('listSkills should set isOverridden to true')
  }
  const aggWithOverride = await registry.listAggregatedSkills()
  const targetAgg = aggWithOverride.find((s) => s.id === 'code-audit')
  if (!targetAgg?.isOverridden) {
    throw new Error('listAggregatedSkills should set isOverridden to true')
  }
  await registry.revertSkillOverride('claude-code', 'code-audit')

  console.log('ok: Skill Override (enable, read, save, diff, revert, commit, security, listOverrides)')

  // =========================================================================
  // 6. 测试从本地文件夹或 ZIP 包导入技能 (Local Folder / ZIP Import)
  // =========================================================================

  // 6.1 测试从本地文件夹预览与导入
  const localFolderSource = join(testTmpDir, 'source-folder-skill')
  await mkdir(localFolderSource, { recursive: true })
  await writeFile(
    join(localFolderSource, 'SKILL.md'),
    '---\nname: Local Folder Tool\ndescription: Tested from folder\nversion: 2.1.0\nauthor: Bob\n---\n# Local Folder Skill\nContent here'
  )
  await writeFile(join(localFolderSource, 'helper.py'), 'print("hello")')

  const folderPreview = await registry.previewLocalSkill(localFolderSource)
  if (
    folderPreview.sourceType !== 'folder' ||
    folderPreview.name !== 'Local Folder Tool' ||
    folderPreview.version !== '2.1.0' ||
    folderPreview.fileCount !== 2 ||
    !folderPreview.hasSkillMd
  ) {
    throw new Error('previewLocalSkill for folder failed: ' + JSON.stringify(folderPreview))
  }

  const folderInstallRes = await registry.installLocalSkill({
    sourcePath: localFolderSource,
    targetAgentIds: ['cursor', 'codex'],
    overwrite: false
  })
  if (folderInstallRes.some((r) => !r.success)) {
    throw new Error('installLocalSkill from folder failed: ' + JSON.stringify(folderInstallRes))
  }
  const installedInCursor = await stat(join(cursorDir, 'source-folder-skill', 'SKILL.md')).catch(() => null)
  const installedInCodex = await stat(join(codexDir, 'source-folder-skill', 'helper.py')).catch(() => null)
  if (!installedInCursor || !installedInCodex) {
    throw new Error('folder install files missing in target agents')
  }

  // 6.2 测试从 ZIP 压缩包预览与导入（带顶级包装目录及 macOS 临时文件）
  const zipStagingDir = join(testTmpDir, 'zip-staging')
  const zipWrapperDir = join(zipStagingDir, 'my-zip-skill-main')
  const macosxDir = join(zipStagingDir, '__MACOSX')
  await mkdir(zipWrapperDir, { recursive: true })
  await mkdir(macosxDir, { recursive: true })
  await writeFile(
    join(zipWrapperDir, 'SKILL.md'),
    '---\nname: Zip Packaged Skill\ndescription: Unpacked from zip\nversion: 3.0.0\n---\n# Packaged Zip\nWorks nicely'
  )
  await writeFile(join(zipWrapperDir, 'config.json'), '{"enabled":true}')
  await writeFile(join(macosxDir, '._SKILL.md'), 'metadata')

  const testZipPath = join(testTmpDir, 'test-package.zip')
  execSync(`zip -r "${testZipPath}" my-zip-skill-main __MACOSX`, { cwd: zipStagingDir })

  const zipPreview = await registry.previewLocalSkill(testZipPath)
  if (
    zipPreview.sourceType !== 'zip' ||
    zipPreview.name !== 'Zip Packaged Skill' ||
    zipPreview.version !== '3.0.0' ||
    !zipPreview.hasSkillMd
  ) {
    throw new Error('previewLocalSkill for zip failed: ' + JSON.stringify(zipPreview))
  }

  const zipInstallRes = await registry.installLocalSkill({
    sourcePath: testZipPath,
    skillName: 'unpacked-zip-skill',
    targetAgentIds: ['claude-code'],
    overwrite: false
  })
  if (zipInstallRes.some((r) => !r.success)) {
    throw new Error('installLocalSkill from zip failed: ' + JSON.stringify(zipInstallRes))
  }
  const unpackedSkillMd = await readFile(join(claudeDir, 'unpacked-zip-skill', 'SKILL.md'), 'utf8')
  if (!unpackedSkillMd.includes('Packaged Zip')) {
    throw new Error('zip extract failed to unpack root skill contents cleanly')
  }
  const macosJunkExists = await stat(join(claudeDir, 'unpacked-zip-skill', '__MACOSX')).catch(() => null)
  if (macosJunkExists) {
    throw new Error('zip extract should have ignored __MACOSX directory')
  }

  // 6.3 覆盖保护测试 (Overwrite protection)
  const conflictRes = await registry.installLocalSkill({
    sourcePath: testZipPath,
    skillName: 'unpacked-zip-skill',
    targetAgentIds: ['claude-code'],
    overwrite: false
  })
  if (conflictRes[0]?.success !== false || !conflictRes[0]?.error?.includes('已存在同名技能')) {
    throw new Error('overwrite protection failed to reject existing skill')
  }

  const overwriteRes = await registry.installLocalSkill({
    sourcePath: testZipPath,
    skillName: 'unpacked-zip-skill',
    targetAgentIds: ['claude-code'],
    overwrite: true
  })
  if (overwriteRes[0]?.success !== true) {
    throw new Error('overwrite allowed installation failed: ' + JSON.stringify(overwriteRes))
  }

  // 6.4 Zip Slip 路径穿越防御测试 (Zip Slip prevention)
  const evilZipBuf = Buffer.alloc(300)
  const evilName = '../../evil.txt'
  evilZipBuf.writeUInt32LE(0x04034b50, 0)
  evilZipBuf.writeUInt16LE(20, 4)
  evilZipBuf.writeUInt16LE(0, 6)
  evilZipBuf.writeUInt16LE(0, 8)
  evilZipBuf.writeUInt32LE(0, 10)
  evilZipBuf.writeUInt32LE(0, 14)
  evilZipBuf.writeUInt32LE(4, 18)
  evilZipBuf.writeUInt32LE(4, 22)
  evilZipBuf.writeUInt16LE(evilName.length, 26)
  evilZipBuf.writeUInt16LE(0, 28)
  evilZipBuf.write(evilName, 30, 'utf8')
  evilZipBuf.write('evil', 30 + evilName.length, 'utf8')

  const cdStart = 30 + evilName.length + 4
  evilZipBuf.writeUInt32LE(0x02014b50, cdStart)
  evilZipBuf.writeUInt16LE(20, cdStart + 4)
  evilZipBuf.writeUInt16LE(20, cdStart + 6)
  evilZipBuf.writeUInt16LE(0, cdStart + 8)
  evilZipBuf.writeUInt16LE(0, cdStart + 10)
  evilZipBuf.writeUInt32LE(0, cdStart + 12)
  evilZipBuf.writeUInt32LE(0, cdStart + 16)
  evilZipBuf.writeUInt32LE(4, cdStart + 20)
  evilZipBuf.writeUInt32LE(4, cdStart + 24)
  evilZipBuf.writeUInt16LE(evilName.length, cdStart + 28)
  evilZipBuf.writeUInt16LE(0, cdStart + 30)
  evilZipBuf.writeUInt16LE(0, cdStart + 32)
  evilZipBuf.writeUInt16LE(0, cdStart + 34)
  evilZipBuf.writeUInt16LE(0, cdStart + 36)
  evilZipBuf.writeUInt32LE(0, cdStart + 38)
  evilZipBuf.writeUInt32LE(0, cdStart + 42)
  evilZipBuf.write(evilName, cdStart + 46, 'utf8')

  const eocdStart = cdStart + 46 + evilName.length
  evilZipBuf.writeUInt32LE(0x06054b50, eocdStart)
  evilZipBuf.writeUInt16LE(0, eocdStart + 4)
  evilZipBuf.writeUInt16LE(0, eocdStart + 6)
  evilZipBuf.writeUInt16LE(1, eocdStart + 8)
  evilZipBuf.writeUInt16LE(1, eocdStart + 10)
  evilZipBuf.writeUInt32LE(46 + evilName.length, eocdStart + 12)
  evilZipBuf.writeUInt32LE(cdStart, eocdStart + 16)
  evilZipBuf.writeUInt16LE(0, eocdStart + 20)

  const evilZipPath = join(testTmpDir, 'evil.zip')
  await writeFile(evilZipPath, evilZipBuf.subarray(0, eocdStart + 22))

  let zipSlipCaught = false
  try {
    await extractZipToDir(evilZipPath, join(testTmpDir, 'sandbox'))
  } catch (err) {
    if (err instanceof Error && err.message.includes('Zip Slip')) {
      zipSlipCaught = true
    }
  }
  if (!zipSlipCaught) {
    throw new Error('Zip Slip security vulnerability not prevented')
  }

  console.log('ok: Local Skill Import (folder preview/install, zip preview/install, overwrite control, zip-slip security)')
} finally {
  await rm(testTmpDir, { recursive: true, force: true })
}

