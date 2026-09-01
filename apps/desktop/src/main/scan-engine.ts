import { utilityProcess, type UtilityProcess } from 'electron'
import type { ScanDone, ScanEngine, ScanJob, ScanProgress } from '@agentdock/plugin-registry/types'
import {
  isUnchanged,
  isWorkerMessage,
  type DiscoveredFile,
  type ParentToWorker,
  type WorkerToParent
} from '../worker/protocol.ts'

export interface UtilityScanEngine extends ScanEngine {
  dispose(): void
}

/**
 * electron-vite `?modulePath` 产出的路径仍指向 asar 内文件。
 * utilityProcess.fork 不能执行 asar 里的脚本，需改到 asar.unpacked。
 */
export function resolveUtilityWorkerPath(workerPath: string): string {
  return workerPath.replace(/app\.asar(?!\.unpacked)/, 'app.asar.unpacked')
}

export function createUtilityScanEngine(
  workerPath: string,
  storePath: string
): UtilityScanEngine {
  let current: UtilityProcess | undefined
  const modulePath = resolveUtilityWorkerPath(workerPath)

  const engine: UtilityScanEngine = {
    async scan(job) {
      engine.dispose()
      const child = utilityProcess.fork(modulePath, [], {
        serviceName: 'agentdock-scan',
        stdio: ['ignore', 'pipe', 'pipe']
      })
      current = child
      pipeChildLogs(child)

      try {
        return await runWorkerScan(child, job, storePath)
      } finally {
        if (current === child) {
          child.kill()
          current = undefined
        }
      }
    },

    dispose() {
      current?.kill()
      current = undefined
    }
  }
  return engine
}

function pipeChildLogs(child: UtilityProcess) {
  child.stdout?.on('data', (chunk: Buffer | string) => {
    const text = String(chunk).trim()
    if (text) console.log('[scan-worker]', text)
  })
  child.stderr?.on('data', (chunk: Buffer | string) => {
    const text = String(chunk).trim()
    if (text) console.error('[scan-worker]', text)
  })
}

function send(child: UtilityProcess, message: ParentToWorker): void {
  child.postMessage(message)
}

async function runWorkerScan(
  child: UtilityProcess,
  job: ScanJob,
  storePath: string
): Promise<ScanDone> {
  const result: ScanDone = { processed: 0, skipped: 0, written: 0 }

  return await new Promise<ScanDone>((resolve) => {
    let settled = false
    let started = false
    let total = 0

    const finish = (value: ScanDone) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    const fail = (error: string) => {
      result.error = error
      finish(result)
    }

    const onSpawn = () => {
      if (started) return
      started = true
      send(child, { type: 'start', sourceIds: job.sourceIds, storePath })
    }

    let messageQueue = Promise.resolve()
    const onMessage = (raw: unknown) => {
      messageQueue = messageQueue
        .then(async () => {
          if (settled || !isWorkerMessage(raw)) return
          await handleWorkerMessage(raw, {
            child,
            job,
            result,
            getTotal: () => total,
            setTotal: (value) => {
              total = value
            },
            finish,
            fail
          })
        })
        .catch((error: unknown) => {
          fail(error instanceof Error ? error.message : String(error))
        })
    }

    child.on('spawn', onSpawn)
    child.on('message', onMessage)
    child.on('exit', (code) => {
      if (settled) return
      if (code === 0) {
        finish(result)
        return
      }
      fail(`scan worker exited (${code ?? 'unknown'})`)
    })
    child.on('error', (_type, location, report) => {
      fail(`scan worker fatal error at ${location}: ${report}`)
    })

    if (child.pid !== undefined) {
      onSpawn()
    }
  })
}

async function handleWorkerMessage(
  message: WorkerToParent,
  ctx: {
    child: UtilityProcess
    job: ScanJob
    result: ScanDone
    getTotal: () => number
    setTotal: (value: number) => void
    finish: (value: ScanDone) => void
    fail: (error: string) => void
  }
): Promise<void> {
  switch (message.type) {
    case 'ready':
      return
    case 'discovered': {
      ctx.setTotal(message.files.length)
      const { parse, skipped } = partitionFiles(message.files, ctx.job)
      ctx.result.processed = skipped.length
      ctx.result.skipped = skipped.length
      for (const file of skipped) {
        ctx.job.onProgress(
          toProgress(file.sourceId, file.ref.path, ctx.result, message.files.length)
        )
      }
      send(ctx.child, {
        type: 'parse',
        files: parse,
        total: message.files.length,
        completed: skipped.length
      })
      return
    }
    case 'file':
      ctx.result.written += 1
      ctx.result.processed += 1
      return
    case 'progress':
      ctx.job.onProgress({
        sourceId: message.sourceId,
        path: message.path,
        done: message.done,
        total: message.total,
        processed: ctx.result.processed,
        skipped: ctx.result.skipped,
        written: ctx.result.written
      })
      return
    case 'file-error':
      ctx.result.processed += 1
      if (!ctx.result.error) {
        ctx.result.error = `${message.path}: ${message.error}`
      }
      ctx.job.onProgress(toProgress(message.sourceId, message.path, ctx.result, ctx.getTotal()))
      return
    case 'done':
      ctx.finish(ctx.result)
      return
    case 'error':
      ctx.fail(message.error)
      return
    default:
      return
  }
}

function partitionFiles(
  files: DiscoveredFile[],
  job: ScanJob
): { parse: DiscoveredFile[]; skipped: DiscoveredFile[] } {
  const parse: DiscoveredFile[] = []
  const skipped: DiscoveredFile[] = []
  for (const file of files) {
    const fingerprint = job.getFingerprint(file.sourceId, file.ref.path)
    if (isUnchanged(fingerprint, file.ref)) {
      skipped.push(file)
    } else {
      parse.push(file)
    }
  }
  return { parse, skipped }
}

function toProgress(
  sourceId: string,
  path: string,
  result: ScanDone,
  total: number
): ScanProgress {
  return {
    sourceId,
    path,
    done: result.processed,
    total,
    processed: result.processed,
    skipped: result.skipped,
    written: result.written
  }
}
