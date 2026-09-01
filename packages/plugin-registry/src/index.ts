import { Service, type Context } from 'cordis'
import type { ConversationSource, FileFingerprint, Message, SourceFileRef } from '@agentdock/core'
import type {} from '@agentdock/plugin-store'
import type { ScanDone, ScanEngine, ScanJob, ScanProgress } from './types.ts'

export type {
  ScanDone,
  ScanEngine,
  ScanJob,
  ScanProgress,
  SourceInfo
} from './types.ts'

export class SourceRegistry extends Service {
  static provide = 'sources'
  static name = 'sources'
  static inject = ['store']

  items: ConversationSource[]
  busy: boolean
  engine: ScanEngine | undefined

  constructor(ctx: Context) {
    super(ctx, 'sources')
    this.items = []
    this.busy = false
    this.engine = undefined
  }

  register(source: ConversationSource) {
    return this.ctx.effect(() => {
      this.items.push(source)
      return () => {
        this.items = this.items.filter((item) => item !== source)
      }
    })
  }

  useEngine(engine: ScanEngine) {
    this.engine = engine
    return this.ctx.effect(() => {
      return () => {
        if (this.engine === engine) this.engine = undefined
      }
    })
  }

  list(): ConversationSource[] {
    return this.items.slice()
  }

  get(id: string): ConversationSource | undefined {
    return this.items.find((source) => source.id === id)
  }

  async scan(): Promise<ScanDone> {
    if (this.busy) {
      return { processed: 0, skipped: 0, written: 0, error: 'busy' }
    }
    this.busy = true
    try {
      const result = this.engine
        ? await this.engine.scan(this.createJob())
        : await this.scanInProcess(this.createJob())
      this.ctx.emit('scan/done', result)
      return result
    } catch (error) {
      const result: ScanDone = {
        processed: 0,
        skipped: 0,
        written: 0,
        error: error instanceof Error ? error.message : String(error)
      }
      this.ctx.emit('scan/done', result)
      return result
    } finally {
      this.busy = false
    }
  }

  createJob(): ScanJob {
    const fingerprints = new Map<string, FileFingerprint>()
    for (const fingerprint of this.ctx.store.listFingerprints()) {
      fingerprints.set(`${fingerprint.sourceId}\0${fingerprint.path}`, fingerprint)
    }
    return {
      sourceIds: this.list().map((source) => source.id),
      getFingerprint: (sourceId, path) => fingerprints.get(`${sourceId}\0${path}`),
      replaceConversation: (conversation, messages, ref) => {
        this.ctx.store.replaceConversation(conversation, messages, ref)
      },
      onProgress: (payload) => {
        this.ctx.emit('scan/progress', payload)
      }
    }
  }

  async scanInProcess(job: ScanJob): Promise<ScanDone> {
    const result: ScanDone = { processed: 0, skipped: 0, written: 0 }
    const discovered: Array<{ source: ConversationSource; ref: SourceFileRef }> = []
    for (const source of this.list()) {
      for await (const ref of source.discover()) {
        discovered.push({ source, ref })
      }
    }
    const total = discovered.length
    try {
      for (const { source, ref } of discovered) {
        result.processed += 1
        const fingerprint = job.getFingerprint(source.id, ref.path)
        if (
          fingerprint &&
          fingerprint.mtimeMs === ref.mtimeMs &&
          fingerprint.size === ref.size
        ) {
          result.skipped += 1
          this.emitProgress(source.id, ref.path, result, total)
          await yieldEventLoop()
          continue
        }

        const messages: Message[] = []
        for await (const message of source.parse(ref)) {
          messages.push(message)
        }
        const conversation = source.meta(ref, messages)
        this.ctx.store.replaceConversation(conversation, messages, ref)
        result.written += 1
        this.emitProgress(source.id, ref.path, result, total)
        await yieldEventLoop()
      }
      return result
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error)
      return result
    }
  }

  emitProgress(sourceId: string, path: string, result: ScanDone, total: number): void {
    const payload: ScanProgress = {
      sourceId,
      path,
      done: result.processed,
      total,
      processed: result.processed,
      skipped: result.skipped,
      written: result.written
    }
    this.ctx.emit('scan/progress', payload)
  }
}

function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve)
  })
}

declare module 'cordis' {
  interface Context {
    sources: SourceRegistry
  }

  interface Events {
    'scan/progress'(payload: ScanProgress): void
    'scan/done'(payload: ScanDone): void
  }
}

export default SourceRegistry
