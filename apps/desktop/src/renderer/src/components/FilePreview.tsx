import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { readPreviewFile, type FilePreviewResult } from '../api'
import { errorMessage, fileName } from '../lib/format'
import { FileActions, useFileWorkspace } from './FileActions'
import { useTip } from './HoverTip'
import { PaneError, PaneSkeleton } from '../workbench/Feedback'

interface FilePreviewApi {
  open: (path: string) => void
  close: () => void
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; result: FilePreviewResult }

const FilePreview = createContext<FilePreviewApi | null>(null)

export function useFilePreview(): FilePreviewApi | null {
  return useContext(FilePreview)
}

export function FilePreviewProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState<string | null>(null)
  const open = useCallback((next: string) => setPath(next), [])
  const close = useCallback(() => setPath(null), [])
  const api = useMemo(() => ({ open, close }), [open, close])

  return (
    <FilePreview.Provider value={api}>
      {children}
      <div className={path ? 'file-preview is-open' : 'file-preview'} aria-hidden={!path}>
        {path ? <FilePreviewDrawer path={path} onClose={close} /> : null}
      </div>
    </FilePreview.Provider>
  )
}

function FilePreviewDrawer({ path, onClose }: { path: string; onClose: () => void }) {
  const workspace = useFileWorkspace()
  const [reloadKey, setReloadKey] = useState(0)
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const closeRef = useRef<HTMLButtonElement>(null)
  const tip = useTip()

  useEffect(() => {
    let cancelled = false
    setLoad({ status: 'loading' })
    void readPreviewFile(path, workspace)
      .then((result) => {
        if (!cancelled) setLoad({ status: 'ready', result })
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoad({ status: 'error', message: errorMessage(err) })
      })
    return () => {
      cancelled = true
    }
  }, [path, workspace, reloadKey])

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true })
    const body = closeRef.current?.closest('.session-body')
    if (body instanceof HTMLElement) body.scrollLeft = 0
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const title =
    load.status === 'ready' ? load.result.name : fileName(path)
  const actionsPath = load.status === 'ready' ? load.result.path : path

  return (
    <>
      <button type="button" className="file-preview-scrim" aria-label="关闭预览" onClick={onClose} />
      <aside
        className="file-preview-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-preview-title"
      >
        <header className="file-preview-head">
          <h2 id="file-preview-title" className="file-preview-name" {...tip(actionsPath)}>
            {title}
          </h2>
          <FileActions path={actionsPath} />
          <button
            ref={closeRef}
            type="button"
            className="icon-btn"
            aria-label="关闭预览"
            title="关闭预览"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>
        <div className="file-preview-body">
          {load.status === 'loading' ? (
            <PaneSkeleton label="正在读取文件" />
          ) : load.status === 'error' ? (
            <PaneError message={load.message} onRetry={() => setReloadKey((key) => key + 1)} />
          ) : (
            <PreviewContent result={load.result} />
          )}
        </div>
      </aside>
    </>
  )
}

function PreviewContent({ result }: { result: FilePreviewResult }) {
  switch (result.kind) {
    case 'text':
      return (
        <>
          {result.truncated ? (
            <p className="file-preview-note">只显示前 512 KB</p>
          ) : null}
          <pre className="file-preview-text">{result.text}</pre>
        </>
      )
    case 'image':
      return <img className="file-preview-image" src={result.dataUrl} alt={result.name} draggable={false} />
    case 'unsupported':
      return (
        <div className="empty-hero">
          <p className="empty-title">无法预览</p>
          <p className="empty-copy">{result.reason}</p>
        </div>
      )
    default: {
      const _exhaustive: never = result
      return _exhaustive
    }
  }
}

function CloseIcon() {
  return (
    <svg className="icon-16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M4 4l8 8M12 4l-8 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}
