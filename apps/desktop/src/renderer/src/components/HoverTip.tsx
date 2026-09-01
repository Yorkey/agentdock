import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'

const SHOW_DELAY = 300

interface TipState {
  text: string
  /** 触发元素的水平中点（视口坐标） */
  centerX: number
  top: number
  bottom: number
}

export interface HoverTipHandlers {
  onPointerEnter: (event: { currentTarget: HTMLElement }) => void
  onPointerLeave: () => void
  onFocus: (event: { currentTarget: HTMLElement }) => void
  onBlur: () => void
}

export type TipTrigger = (text: string) => HoverTipHandlers

export interface TipRect {
  left: number
  width: number
  top: number
  bottom: number
}

export interface TipControl {
  show: (text: string, rect: TipRect) => void
  hide: () => void
}

const NOOP: HoverTipHandlers = {
  onPointerEnter: () => {},
  onPointerLeave: () => {},
  onFocus: () => {},
  onBlur: () => {}
}

const TipContext = createContext<TipTrigger>(() => NOOP)
const TipControlContext = createContext<TipControl>({
  show: () => {},
  hide: () => {}
})

/**
 * 全应用只挂一层 tooltip。省掉逐行组件各自持有计时器，也保证同时只有一个浮层。
 * 用法：`const tip = useTip()`，再把 `{...tip(text)}` 展开到触发元素上。
 * 时间线 canvas 这类没有子节点的轨道用 `useTipControl()` 按命中矩形委托。
 */
export function HoverTipProvider({ children, delayMs = SHOW_DELAY }: { children: ReactNode; delayMs?: number }) {
  const [tip, setTip] = useState<TipState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const visible = useRef(false)

  const hide = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    visible.current = false
    setTip((current) => (current ? null : current))
  }, [])

  const show = useCallback(
    (text: string, rect: TipRect): void => {
      if (!text.trim()) return
      const next: TipState = {
        text,
        centerX: rect.left + rect.width / 2,
        top: rect.top,
        bottom: rect.bottom
      }
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
      if (visible.current) {
        setTip(next)
        return
      }
      timer.current = setTimeout(() => {
        timer.current = null
        visible.current = true
        setTip(next)
      }, delayMs)
    },
    [delayMs]
  )

  useEffect(() => hide, [hide])

  // 浮层是 fixed 定位的，触发元素一旦跟着虚拟列表滚走就会留下悬空浮层；
  // scroll 用捕获阶段监听才能收到内层滚动容器的事件。
  useEffect(() => {
    if (!tip) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') hide()
    }
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
      window.removeEventListener('keydown', onKey)
    }
  }, [tip, hide])

  const trigger = useCallback<TipTrigger>(
    (text) => {
      const open = (event: { currentTarget: HTMLElement }): void => {
        const rect = event.currentTarget.getBoundingClientRect()
        show(text, rect)
      }
      return { onPointerEnter: open, onPointerLeave: hide, onFocus: open, onBlur: hide }
    },
    [hide, show]
  )

  const control = useMemo<TipControl>(() => ({ show, hide }), [show, hide])

  return (
    <TipContext.Provider value={trigger}>
      <TipControlContext.Provider value={control}>
        {children}
        {tip ? <TipLayer tip={tip} /> : null}
      </TipControlContext.Provider>
    </TipContext.Provider>
  )
}

export function useTip(): TipTrigger {
  return useContext(TipContext)
}

export function useTipControl(): TipControl {
  return useContext(TipControlContext)
}

/** 一次性生成一组固定文案的 handlers，省掉调用点自己写 useMemo */
export function useTipFor(text: string): HoverTipHandlers {
  const trigger = useTip()
  return useMemo(() => trigger(text), [trigger, text])
}

function TipLayer({ tip }: { tip: TipState }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const gap = 8
    const above = tip.top - rect.height - gap
    const top = above >= gap ? above : tip.bottom + gap
    const left = clamp(tip.centerX - rect.width / 2, gap, window.innerWidth - rect.width - gap)
    setPos({ left, top: clamp(top, gap, window.innerHeight - rect.height - gap) })
  }, [tip])

  return createPortal(
    <div
      ref={ref}
      className="hovertip"
      role="tooltip"
      style={{ left: pos?.left ?? tip.centerX, top: pos?.top ?? tip.top, visibility: pos ? 'visible' : 'hidden' }}
    >
      {tip.text}
    </div>,
    document.body
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}
