import { readdirSync } from 'node:fs'
import path from 'node:path'

const slugCache = new Map<string, string>()
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Cursor turns path separators and other non-alphanumerics into `-`. */
function cursorSlugSegment(name: string): string {
  return name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** Extract `<slug>` from `.../.cursor/projects/<slug>/agent-transcripts/...`. */
export function projectSlugFromTranscriptPath(filePath: string): string | undefined {
  const normalized = filePath.replaceAll('\\', '/')
  const needle = '/.cursor/projects/'
  const index = normalized.indexOf(needle)
  if (index === -1) return undefined
  const rest = normalized.slice(index + needle.length)
  const slug = rest.split('/')[0]
  return slug || undefined
}

/**
 * Reverse a Cursor project slug back to a workspace path.
 * Cursor stores `/Volumes/WY/my-projects/chats` as `Volumes-WY-my-projects-chats`
 * (leading slash stripped, non-alphanumerics including `/` and `_` → `-`).
 * A naive `-` → `/` replace would split `my-projects`, so we walk the real
 * filesystem with longest slug-prefix matching and restore `/` on macOS/Linux.
 */
export function slugToWorkspacePath(slug: string): string {
  const cached = slugCache.get(slug)
  if (cached !== undefined) return cached
  const resolved = resolveSlug(slug)
  slugCache.set(slug, resolved)
  return resolved
}

function resolveSlug(slug: string): string {
  if (!slug) return slug
  // Windows drive: `C-Users-foo` → `C:/Users/foo`
  if (/^[A-Za-z]-/.test(slug)) {
    const drive = slug[0]!.toUpperCase()
    const rest = slug.slice(2)
    return (
      resolveAgainst(`${drive}:\\`, rest, path.win32) ?? `${drive}:/${rest.replaceAll('-', '/')}`
    )
  }
  // macOS / Linux slugs omit the leading slash
  return resolveAgainst('/', slug, path.posix) ?? `/${slug.replaceAll('-', '/')}`
}

function resolveAgainst(
  root: string,
  remainder: string,
  impl: { join: (...parts: string[]) => string }
): string | undefined {
  let dir = root
  let remain = remainder
  while (remain) {
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      return impl.join(dir, remain.replaceAll('-', '/'))
    }
    let bestName: string | undefined
    let bestSlug: string | undefined
    let bestExact = -1
    for (const name of names) {
      const slug = cursorSlugSegment(name)
      if (!slug) continue
      if (remain === slug || remain.startsWith(`${slug}-`)) {
        const exact = remain === name || remain.startsWith(`${name}-`) ? 1 : 0
        const better =
          bestSlug === undefined ||
          slug.length > bestSlug.length ||
          (slug.length === bestSlug.length && exact > bestExact) ||
          (slug.length === bestSlug.length && exact === bestExact && name.length > (bestName?.length ?? 0))
        if (better) {
          bestName = name
          bestSlug = slug
          bestExact = exact
        }
      }
    }
    if (bestName === undefined || bestSlug === undefined) {
      const tail = UUID_RE.test(remain) ? remain : remain.replaceAll('-', '/')
      return impl.join(dir, tail)
    }
    dir = impl.join(dir, bestName)
    remain = remain === bestSlug ? '' : remain.slice(bestSlug.length + 1)
  }
  return dir
}
