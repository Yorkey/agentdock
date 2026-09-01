import { setThemeSource, type ThemeSource } from '../api'

/**
 * 主题三态。`system` 时不写 `data-theme`，交给 tokens.css 里的
 * `@media (prefers-color-scheme: dark)` 处理。
 */
export type ThemePref = ThemeSource

const THEME_KEY = 'agentdock.theme'
const LEGACY_THEME_KEY = 'chats.theme'

export const THEME_ORDER: ThemePref[] = ['system', 'light', 'dark']

export const THEME_LABEL: Record<ThemePref, string> = {
  system: '跟随系统',
  light: '亮色',
  dark: '暗色'
}

function isThemePref(value: unknown): value is ThemePref {
  return value === 'system' || value === 'light' || value === 'dark'
}

function migrateLegacyKey(nextKey: string, legacyKey: string): void {
  try {
    const legacy = localStorage.getItem(legacyKey)
    if (legacy && !localStorage.getItem(nextKey)) {
      localStorage.setItem(nextKey, legacy)
      localStorage.removeItem(legacyKey)
    }
  } catch {
    // ignore
  }
}

export function loadThemePref(): ThemePref {
  migrateLegacyKey(THEME_KEY, LEGACY_THEME_KEY)
  try {
    const value = localStorage.getItem(THEME_KEY)
    if (isThemePref(value)) return value
  } catch {
    // ignore
  }
  return 'system'
}

export function saveThemePref(pref: ThemePref): void {
  try {
    localStorage.setItem(THEME_KEY, pref)
  } catch {
    // ignore
  }
}

export function nextThemePref(pref: ThemePref): ThemePref {
  const index = THEME_ORDER.indexOf(pref)
  return THEME_ORDER[(index + 1) % THEME_ORDER.length] ?? 'system'
}

/** 解析成实际生效的明暗，仅用于展示与断言。 */
export function resolvedTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'system') return pref
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function writeThemeAttr(pref: ThemePref): void {
  const root = document.documentElement
  if (pref === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', pref)
}

export function applyTheme(pref: ThemePref): void {
  writeThemeAttr(pref)
  setThemeSource(pref)
}

// 在首帧之前写好 data-theme，避免主题闪一下再纠正。
writeThemeAttr(loadThemePref())
