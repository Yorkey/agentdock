import type { Context } from 'cordis'
import type {} from '@agentdock/plugin-workbench'
import { SkillRegistry } from './service.ts'
import { ClaudeCodeSkillAdapter } from './adapters/claude.ts'
import { CursorSkillAdapter } from './adapters/cursor.ts'
import { CodexSkillAdapter } from './adapters/codex.ts'
import { CommonSkillAdapter } from './adapters/common.ts'

export { SkillRegistry } from './service.ts'
export { BaseSkillAgentAdapter } from './adapters/base.ts'
export { ClaudeCodeSkillAdapter } from './adapters/claude.ts'
export { CursorSkillAdapter } from './adapters/cursor.ts'
export { CodexSkillAdapter } from './adapters/codex.ts'
export { CommonSkillAdapter } from './adapters/common.ts'
export { parseSkillContent } from './parse-frontmatter.ts'
export { parseGitHubUrl, previewGitHubSkill, downloadGitHubSkillToDir } from './github.ts'
export { previewLocalSkill, extractZipToDir, parseZipBuffer } from './local-import.ts'

export const skillsModulePlugin = {
  name: 'module-skills',
  inject: ['workbench'],
  async apply(ctx: Context) {
    // 注册 SkillRegistry 服务（提供 ctx.skills 并内置加载三大 Agent 适配器）
    await ctx.plugin(SkillRegistry)

    // 注册工作台入口
    ctx.workbench.register({
      id: 'skills',
      title: 'Skills',
      icon: 'skills',
      order: 10
    })
  }
}

export default skillsModulePlugin
