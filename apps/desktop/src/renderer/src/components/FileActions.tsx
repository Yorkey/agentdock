import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { revealInFolder } from '../api'
import { errorMessage } from '../lib/format'
import { joinWorkspace } from '../lib/local-path'
import { IS_MAC, IS_WIN } from '../workbench/platform'
import { copyText } from './CopyButton'

const RESET_DELAY = 1500

type CopyState = 'idle' | 'done' | 'fail'

const FileWorkspace = createContext<string | undefined>(undefined)

export function FileWorkspaceProvider({
  workspace,
  children
}: {
  workspace?: string
  children: ReactNode
}) {
  return <FileWorkspace.Provider value={workspace}>{children}</FileWorkspace.Provider>
}

export function useFileWorkspace(): string | undefined {
  return useContext(FileWorkspace)
}

function revealLabel(): string {
  if (IS_MAC) return '在 Finder 中显示'
  if (IS_WIN) return '在资源管理器中显示'
  return '在文件夹中显示'
}

export function FileActions({
  path,
  workspace,
  className
}: {
  path: string
  workspace?: string
  className?: string
}) {
  const scoped = useContext(FileWorkspace)
  const root = workspace ?? scoped
  const target = joinWorkspace(path, root)
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const [revealError, setRevealError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const pulse = useCallback((next: CopyState | { reveal: string }) => {
    if (timer.current) clearTimeout(timer.current)
    if (typeof next === 'object') setRevealError(next.reveal)
    else {
      setCopyState(next)
      setRevealError(null)
    }
    timer.current = setTimeout(() => {
      setCopyState('idle')
      setRevealError(null)
    }, RESET_DELAY)
  }, [])

  if (!path.trim()) return null

  const copyTitle = copyState === 'done' ? '已复制' : copyState === 'fail' ? '复制失败' : '复制路径'
  const showTitle = revealError ?? revealLabel()

  return (
    <span
      className={className ? `file-actions ${className}` : 'file-actions'}
      onClick={stop}
      onPointerDown={stop}
    >
      <button
        type="button"
        className="icon-btn"
        data-state={copyState}
        aria-label={copyTitle}
        title={copyTitle}
        onClick={() => {
          void copyText(target).then((ok) => pulse(ok ? 'done' : 'fail'))
        }}
      >
        {copyState === 'idle' ? <CopyIcon /> : <CheckIcon />}
      </button>
      <button
        type="button"
        className="icon-btn"
        data-state={revealError ? 'fail' : undefined}
        aria-label={showTitle}
        title={showTitle}
        onClick={() => {
          void revealInFolder(target, root).catch((err: unknown) => pulse({ reveal: errorMessage(err) }))
        }}
      >
        <FolderIcon />
      </button>
    </span>
  )
}

function stop(event: { stopPropagation: () => void }): void {
  event.stopPropagation()
}

function CopyIcon() {
  return (
    <svg className="icon-16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M10.5 3.5V3a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v6A1.5 1.5 0 0 0 4 10.5h.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="icon-16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.5 8.5l3 3 6-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg className="icon-16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2.5 4.5h4l1.2 1.4H13.5v7.1a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V4.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  )
}
