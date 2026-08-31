import type { Context } from 'cordis'
import type {} from '@chats/plugin-registry'
import { cursorSource } from './source.ts'

export { cursorSource, conversationIdFromPath, projectsRoot, SOURCE_ID, SOURCE_LABEL } from './source.ts'
export { slugToWorkspacePath, projectSlugFromTranscriptPath } from './workspace.ts'
export { parseCursorTimestamp, stripWrappers } from './content.ts'

const plugin = {
  name: 'source-cursor',
  inject: ['sources'],
  apply(ctx: Context) {
    ctx.sources.register(cursorSource)
  }
}

export default plugin
