import { useCallback, useEffect, useState } from 'react'
import {
  listConversations,
  listSources,
  startScan as startScanApi,
  subscribeScanEvents,
  type Conversation,
  type ScanDone,
  type ScanProgress,
  type SourceInfo
} from '../api'
import { errorMessage } from '../lib/format'
import { sortByUpdatedAt } from '../lib/tree'

export function useIndexedChats() {
  const [sources, setSources] = useState<SourceInfo[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [lastScan, setLastScan] = useState<ScanDone | null>(null)

  const refresh = useCallback(async () => {
    const [nextSources, nextConversations] = await Promise.all([
      listSources(),
      listConversations()
    ])
    setSources(nextSources)
    setConversations(sortByUpdatedAt(nextConversations))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void refresh()
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    let unsubscribe = (): void => {}
    try {
      unsubscribe = subscribeScanEvents({
        onProgress: (payload) => {
          setScanning(true)
          setProgress(payload)
        },
        onDone: (payload) => {
          setLastScan(payload)
          setProgress(null)
          setScanning(false)
          if (payload.error && payload.error !== 'busy') {
            setError(payload.error)
          }
          void refresh().catch((err: unknown) => {
            setError(errorMessage(err))
          })
        }
      })
    } catch (err: unknown) {
      setError(errorMessage(err))
    }

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [refresh])

  const startScan = useCallback(async () => {
    setScanning(true)
    setError(null)
    try {
      const done = await startScanApi()
      setLastScan(done)
      if (done.error === 'busy') setError('已有扫描在进行')
      else if (done.error) setError(done.error)
      await refresh()
    } catch (err: unknown) {
      setError(errorMessage(err))
    } finally {
      setScanning(false)
      setProgress(null)
    }
  }, [refresh])

  return {
    sources,
    conversations,
    loading,
    error,
    scanning,
    progress,
    lastScan,
    startScan,
    refresh
  }
}
