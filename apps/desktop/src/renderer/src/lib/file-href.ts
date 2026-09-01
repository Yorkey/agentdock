/** 把 markdown / a[href] 收成可预览的本地路径；http(s) 等带协议的不算。 */

export function hrefToLocalPath(href: string): string | undefined {
  const trimmed = href.trim().replace(/^<|>$/g, '')
  if (!trimmed || trimmed === '#' || trimmed.startsWith('#')) return undefined
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^file:/i.test(trimmed)) return undefined
  if (/^file:/i.test(trimmed)) return fileUrlToPath(trimmed)
  return decodeURIComponentSafe(trimmed)
}

function fileUrlToPath(href: string): string | undefined {
  try {
    const url = new URL(href)
    let path = decodeURIComponent(url.pathname)
    if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1)
    return path || undefined
  } catch {
    const stripped = href.replace(/^file:\/\//i, '')
    return decodeURIComponentSafe(stripped) || undefined
  }
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
