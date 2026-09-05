import { useEffect, useRef, useState } from 'react'

export interface MonacoCodeEditorProps {
  value: string
  path: string
  name?: string
  readOnly?: boolean
  wordWrap?: 'on' | 'off'
  onChange?: (value: string) => void
  onSave?: () => void
  className?: string
}

export function MonacoCodeEditor({
  value,
  path,
  name,
  readOnly = false,
  wordWrap = 'on',
  onChange,
  onSave,
  className
}: MonacoCodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  const editorRef = useRef<{
    dispose: () => void
    setValue: (value: string) => void
    getValue: () => string
    focus: () => void
  } | null>(null)

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
      .then(({ mountCodeEditor }) => {
        if (cancelled || !host.isConnected) return
        const instance = mountCodeEditor(host, {
          value,
          path,
          name,
          readOnly,
          wordWrap,
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
        console.error('加载 Monaco 代码编辑器失败:', err)
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
      editorRef.current?.dispose()
      editorRef.current = null
    }
  }, [path, name, readOnly, wordWrap])

  // Sync value changes if external value changes drastically
  useEffect(() => {
    if (editorRef.current && editorRef.current.getValue() !== value) {
      editorRef.current.setValue(value)
    }
  }, [value])

  if (failed) {
    return (
      <div className="empty-hero">
        <p className="empty-title">编辑器加载失败</p>
        <p className="empty-copy">未能正确初始化 Monaco 代码编辑器</p>
      </div>
    )
  }

  return <div ref={hostRef} className={`monaco-code-editor-container ${className || ''}`} />
}
