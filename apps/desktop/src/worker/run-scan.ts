import type { Conversation, ConversationSource, Message, SourceFileRef } from '@agentdock/core'
import { claudeCodeSource } from '@agentdock/source-claude-code'
import { codexSource } from '@agentdock/source-codex'
import { cursorSource } from '@agentdock/source-cursor'
import type { DiscoveredFile } from './protocol.ts'

export const builtinSources: ConversationSource[] = [
  cursorSource,
  claudeCodeSource,
  codexSource
]

const sourceMap = new Map(builtinSources.map((source) => [source.id, source]))

export function getBuiltinSource(id: string): ConversationSource {
  const source = sourceMap.get(id)
  if (!source) {
    throw new Error(`unknown source: ${id}`)
  }
  return source
}

export async function discoverFiles(sourceIds: string[]): Promise<DiscoveredFile[]> {
  const files: DiscoveredFile[] = []
  for (const sourceId of sourceIds) {
    const source = getBuiltinSource(sourceId)
    for await (const ref of source.discover()) {
      files.push({ sourceId, ref })
    }
  }
  return files
}

export async function parseOne(
  source: ConversationSource,
  ref: SourceFileRef
): Promise<{ conversation: Conversation; messages: Message[] }> {
  const messages: Message[] = []
  for await (const message of source.parse(ref)) {
    messages.push(message)
  }
  return {
    conversation: source.meta(ref, messages),
    messages
  }
}
