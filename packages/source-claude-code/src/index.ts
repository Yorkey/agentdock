import type { Context } from 'cordis'
import type {} from '@chats/plugin-registry'
import { claudeCodeSource } from './source.ts'

export { SOURCE_ID, SOURCE_LABEL, claudeCodeSource, claudeProjectsRoot } from './source.ts'
export { parseClaudeSession } from './parse.ts'

export const name = 'source-claude-code'
export const inject = ['sources']

export function apply(ctx: Context): void {
  ctx.sources.register(claudeCodeSource)
}

const plugin = { name, inject, apply }

export default plugin
