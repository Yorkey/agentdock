import { basename } from 'node:path'

const UUID_RE =
  /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.jsonl)?$/i

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isErrno(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code
}

export function parseTimestamp(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    if (typeof value !== 'string' || !value) return undefined
    const ms = Date.parse(value)
    return Number.isFinite(ms) ? ms : undefined
  }
  if (value > 1e12) return value
  if (value > 1e9) return value * 1000
  return undefined
}

export function sessionUuidFromFilename(filePath: string): string | undefined {
  const name = basename(filePath)
  const match = UUID_RE.exec(name)
  return match?.[1]
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return value
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return value
  }
}

export function stringifyOutput(value: unknown): string {
  if (typeof value === 'string') return value
  if (value == null) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function isEnvironmentContext(text: string): boolean {
  const trimmed = text.trimStart()
  return trimmed.startsWith('<environment_context>') || trimmed.startsWith('<permissions')
}
