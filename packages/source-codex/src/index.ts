import type { Context } from 'cordis'
import type {} from '@agentdock/plugin-registry'
import { codexSource } from './source.ts'

export const name = 'source-codex'
export const inject = ['sources']

export function apply(ctx: Context): void {
  ctx.sources.register(codexSource)
}

export { SOURCE_ID, SOURCE_LABEL, codexSource, createCodexSource, defaultSessionsRoot } from './source.ts'
export { COMPACT_MARKER, mapCodexRecord } from './map.ts'

const plugin = { name, inject, apply }
export default plugin
