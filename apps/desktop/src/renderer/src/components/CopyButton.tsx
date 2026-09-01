import { useCallback, useEffect, useRef, useState } from 'react'

const RESET_DELAY = 1500

type CopyState = 'idle' | 'done' | 'fail'

const STATE_LABEL: Record<CopyState, string> = {
  idle: '复制',
  done: '已复制',
  fail: '复制失败'
}

export function CopyButton({
  text,
  className = 'copy-btn',
  title = '复制到剪贴板'
}: {
  text: string
  className?: string
  title?: string
}) {
  const [state, setState] = useState<CopyState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const run = useCallback(() => {
    void copyText(text).then((ok) => {
      setState(ok ? 'done' : 'fail')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setState('idle'), RESET_DELAY)
    })
  }, [text])

  return (
    <button type="button" className={className} data-state={state} title={title} onClick={run}>
      {state === 'idle' ? <CopyIcon /> : <CheckIcon />}
      <span className="copy-btn-lab">{STATE_LABEL[state]}</span>
    </button>
  )
}

/** 优先用异步剪贴板；不可用或被拒时退回 execCommand，全部失败也只返回 false 不抛出 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 落到下面的兜底路径
  }
  return legacyCopy(text)
}

function legacyCopy(text: string): boolean {
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
      <rect x="5.5" y="5.5" width="8" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M10.5 3.5V3a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v6A1.5 1.5 0 0 0 4 10.5h.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
