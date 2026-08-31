export type Role = 'user' | 'assistant' | 'system' | 'tool'

export type Part =
  | { kind: 'text'; text: string }
  | { kind: 'reasoning'; text: string }
  | { kind: 'tool_call'; name: string; input: unknown; callId?: string }
  | { kind: 'tool_result'; callId?: string; output: string; isError?: boolean }
  | { kind: 'diff'; path: string; patch: string }
  | { kind: 'attachment'; resourceId: string }

export interface Conversation {
  id: string
  sourceId: string
  sourcePath: string
  title: string
  workspace?: string
  gitBranch?: string
  models: string[]
  createdAt: number
  updatedAt: number
  messageCount: number
}

export interface Message {
  id: string
  conversationId: string
  seq: number
  role: Role
  createdAt: number
  parts: Part[]
}

export interface Resource {
  id: string
  conversationId: string
  mimeType?: string
  localPath?: string
  byteLength?: number
}

export interface SourceFileRef {
  path: string
  mtimeMs: number
  size: number
}

export interface ConversationSource {
  id: string
  label: string
  discover(): AsyncIterable<SourceFileRef>
  parse(ref: SourceFileRef): AsyncIterable<Message>
  meta(ref: SourceFileRef, messages: Message[]): Conversation
}

export interface FileFingerprint extends SourceFileRef {
  sourceId: string
}
