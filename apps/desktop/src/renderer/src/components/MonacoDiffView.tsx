import { useEffect, useRef, useState } from 'react'

export interface MonacoDiffViewProps {
  original: string
  modified: string
  path: string
  name?: string
  readOnly?: boolean
  renderSideBySide?: boolean
  onChange?: (value: string) => void
  onSave?: () => void
  className?: string
}

export function MonacoDiffView({
  original,
  modified,
  path,
  name,
  readOnly = false,
  renderSideBySide = true,
  onChange,
  onSave,
  className
}: MonacoDiffViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  const editorRef = useRef<{
    dispose: () => void
    setOriginal: (value: string) => void
    setModified: (value: string) => void
    getValue: () => string
  } | null>(null)

  // Keep latest callbacks
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    setFailed(false)

    void import('../lib/monaco')
      .then(({ mountDiffEditor }) => {
        if (cancelled || !host.isConnected) return
        const instance = mountDiffEditor(host, {
          original,
          modified,
          path,
          name,
          readOnly,
          renderSideBySide,
          onChange: (val) => onChangeRef.current?.(val),
          onSave: () => onSaveRef.current?.()
        })
        if (cancelled) {
          instance.dispose()
        } else {
          editorRef.current = instance
        }
      })
      .catch((err) => {
        console.error('加载 Monaco Diff 编辑器失败:', err)
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
      editorRef.current?.dispose()
      editorRef.current = null
    }
  }, [path, name, readOnly, renderSideBySide])

  // Sync content updates without recreating editor
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.setOriginal(original)
    }
  }, [original])

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.setModified(modified)
    }
  }, [modified])

  if (failed) {
    return (
      <div className="empty-hero">
        <p className="empty-title">差异对比加载失败</p>
        <p className="empty-copy">未能正确初始化 Monaco Diff 模块</p>
      </div>
    )
  }

  return <div ref={hostRef} className={`monaco-diff-container ${className || ''}`} />
}
