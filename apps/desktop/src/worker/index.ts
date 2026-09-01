import { parentPort as threadParentPort } from 'node:worker_threads'
import { SqliteStore } from '@agentdock/plugin-store'
import {
  isParentMessage,
  type ParentToWorker,
  type WorkerToParent
} from './protocol.ts'
import { discoverFiles, getBuiltinSource, parseOne } from './run-scan.ts'

interface HostPort {
  post(message: WorkerToParent): void
  onMessage(listener: (message: unknown) => void): void
}

function attachHost(): HostPort {
  if (threadParentPort) {
    const port = threadParentPort
    return {
      post: (message) => {
        port.postMessage(message)
      },
      onMessage: (listener) => {
        port.on('message', listener)
      }
    }
  }

  const electronPort = (
    process as NodeJS.Process & {
      parentPort?: {
        postMessage(message: unknown): void
        on(event: 'message', listener: (event: { data: unknown }) => void): void
      }
    }
  ).parentPort

  if (!electronPort) {
    throw new Error('scan worker has no parent port')
  }

  return {
    post: (message) => {
      electronPort.postMessage(message)
    },
    onMessage: (listener) => {
      electronPort.on('message', (event) => {
        listener(event.data)
      })
    }
  }
}

const host = attachHost()

let parseWaiter: ((message: Extract<ParentToWorker, { type: 'parse' }>) => void) | undefined
let aborted = false

function waitParse(): Promise<Extract<ParentToWorker, { type: 'parse' }>> {
  return new Promise((resolve, reject) => {
    if (aborted) {
      reject(new Error('aborted'))
      return
    }
    parseWaiter = resolve
  })
}

async function runStart(sourceIds: string[], storePath: string): Promise<void> {
  const files = await discoverFiles(sourceIds)
  const parsePromise = waitParse()
  host.post({ type: 'discovered', files })
  const parse = await parsePromise
  if (parse.files.length === 0) {
    host.post({ type: 'done' })
    return
  }

  const store = new SqliteStore(storePath)
  try {
    let done = parse.completed
    for (const file of parse.files) {
      if (aborted) break
      const source = getBuiltinSource(file.sourceId)
      try {
        const { conversation, messages } = await parseOne(source, file.ref)
        store.replaceConversation(conversation, messages, file.ref)
        host.post({ type: 'file', sourceId: file.sourceId, path: file.ref.path })
      } catch (error) {
        host.post({
          type: 'file-error',
          sourceId: file.sourceId,
          path: file.ref.path,
          error: error instanceof Error ? error.message : String(error)
        })
      }
      done += 1
      host.post({
        type: 'progress',
        sourceId: file.sourceId,
        path: file.ref.path,
        done,
        total: parse.total
      })
    }
    host.post({ type: 'done' })
  } finally {
    store.close()
  }
}

host.onMessage((raw) => {
  if (!isParentMessage(raw)) return
  if (raw.type === 'abort') {
    aborted = true
    const resolve = parseWaiter
    parseWaiter = undefined
    resolve?.({ type: 'parse', files: [], total: 0, completed: 0 })
    return
  }
  if (raw.type === 'parse') {
    const resolve = parseWaiter
    parseWaiter = undefined
    resolve?.(raw)
    return
  }
  if (raw.type === 'start') {
    void runStart(raw.sourceIds, raw.storePath).catch((error: unknown) => {
      host.post({
        type: 'error',
        error: error instanceof Error ? error.message : String(error)
      })
    })
  }
})

host.post({ type: 'ready' })
