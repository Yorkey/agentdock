import type { ScanDone, ScanEngine, ScanProgress } from '@chats/plugin-registry/types'
import { isUnchanged } from './protocol.ts'
import { discoverFiles, getBuiltinSource, parseOne } from './run-scan.ts'

function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve)
  })
}

export function createInlineScanEngine(): ScanEngine {
  return {
    async scan(job) {
      const result: ScanDone = { processed: 0, skipped: 0, written: 0 }
      const files = await discoverFiles(job.sourceIds)
      const total = files.length
      const emit = (sourceId: string, path: string) => {
        const payload: ScanProgress = {
          sourceId,
          path,
          done: result.processed,
          total,
          processed: result.processed,
          skipped: result.skipped,
          written: result.written
        }
        job.onProgress(payload)
      }

      for (const file of files) {
        result.processed += 1
        const fingerprint = job.getFingerprint(file.sourceId, file.ref.path)
        if (isUnchanged(fingerprint, file.ref)) {
          result.skipped += 1
          emit(file.sourceId, file.ref.path)
          await yieldEventLoop()
          continue
        }

        const source = getBuiltinSource(file.sourceId)
        try {
          const { conversation, messages } = await parseOne(source, file.ref)
          job.replaceConversation(conversation, messages, file.ref)
          result.written += 1
        } catch (error) {
          if (!result.error) {
            const message = error instanceof Error ? error.message : String(error)
            result.error = `${file.ref.path}: ${message}`
          }
        }
        emit(file.sourceId, file.ref.path)
        await yieldEventLoop()
      }

      return result
    }
  }
}
