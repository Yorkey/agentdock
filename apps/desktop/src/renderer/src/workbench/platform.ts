/** macOS 需要为 `titleBarStyle: 'hiddenInset'` 的红绿灯留位，快捷键也要换成 Cmd。 */
export const IS_MAC = /mac/i.test(navigator.userAgent)

export const IS_WIN = /windows/i.test(navigator.userAgent)

/** 修饰键：macOS 用 Cmd，其他平台用 Ctrl，且不接受另一个键同时按下。 */
export function hasModifier(event: KeyboardEvent): boolean {
  if (event.altKey) return false
  return IS_MAC ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
}

document.documentElement.dataset.platform = IS_MAC ? 'mac' : 'other'
