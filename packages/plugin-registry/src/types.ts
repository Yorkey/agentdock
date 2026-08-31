import type {
  Conversation,
  FileFingerprint,
  Message,
  SourceFileRef
} from '@chats/core'

export interface SourceInfo {
  id: string
  label: string
}

export interface ScanProgress {
  sourceId: string
  path: string
  done: number
  total: number
  processed: number
  skipped: number
  written: number
}

export interface ScanDone {
  processed: number
  skipped: number
  written: number
  error?: string
}

export interface ScanJob {
  sourceIds: string[]
  getFingerprint(sourceId: string, path: string): FileFingerprint | undefined
  replaceConversation(
    conversation: Conversation,
    messages: Message[],
    ref: SourceFileRef
  ): void
  onProgress(payload: ScanProgress): void
}

export interface ScanEngine {
  scan(job: ScanJob): Promise<ScanDone>
}
