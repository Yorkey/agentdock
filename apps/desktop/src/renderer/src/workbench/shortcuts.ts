import { useEffect } from 'react'
import { hasModifier } from './platform'

interface ShortcutHandlers {
  /** Cmd/Ctrl+1..9：按 Activity Bar 顺序切模块，越界忽略。 */
  onSelectIndex: (index: number) => void
  /** Cmd/Ctrl+B */
  onToggleSidebar: () => void
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

function isVisible(element: HTMLElement): boolean {
  if (typeof element.checkVisibility === 'function') {
    return element.checkVisibility({ visibilityProperty: true, opacityProperty: true })
  }
  return element.offsetParent !== null
}

/**
 * 聚焦当前可见模块里的搜索框。内容区的搜索框在 DOM 中排在侧栏之后，
 * 两个都可见时优先聚焦内容区那个。
 */
function focusSearchInput(): boolean {
  const active = document.querySelector('.module-root:not(.is-hidden)')
  if (!active) return false
  const inputs = Array.from(
    active.querySelectorAll<HTMLInputElement>('input[data-search-input]')
  ).filter(isVisible)
  const target = inputs.at(-1)
  if (!target) return false
  target.focus()
  target.select()
  return true
}

export function useWorkbenchShortcuts({ onSelectIndex, onToggleSidebar }: ShortcutHandlers): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.shiftKey || !hasModifier(event)) return

      if (event.code === 'KeyF') {
        event.preventDefault()
        focusSearchInput()
        return
      }

      if (event.code === 'KeyB' && !isEditable(event.target)) {
        event.preventDefault()
        onToggleSidebar()
        return
      }

      const digit = /^Digit([1-9])$/.exec(event.code)
      if (digit?.[1] && !isEditable(event.target)) {
        event.preventDefault()
        onSelectIndex(Number(digit[1]) - 1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onSelectIndex, onToggleSidebar])
}
