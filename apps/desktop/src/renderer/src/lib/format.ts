import type { Conversation, Role } from '@agentdock/core'

export const ROLE_LABEL: Record<Role, string> = {
  user: '用户',
  assistant: '助手',
  system: '系统',
  tool: '工具'
}

export function prettyJson(value: unknown): string {
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      return value
    }
  }
  try {
    return JSON.stringify(value, null, 2) ?? 'null'
  } catch {
    return String(value)
  }
}

export function workspaceLabel(workspace: string | undefined): string {
  if (!workspace) return '未绑定工作区'
  const parts = workspace.replace(/\\/g, '/').split('/').filter(Boolean)
  if (parts.length <= 2) return workspace
  return parts.slice(-2).join('/')
}

export function workspaceKey(workspace: string | undefined): string {
  return workspace ?? ''
}

export function fileName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts.at(-1) || path
}

export function formatListTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const date = new Date(ms)
  const now = new Date()
  const opts: Intl.DateTimeFormatOptions = {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }
  if (date.getFullYear() !== now.getFullYear()) {
    opts.year = 'numeric'
  }
  return new Intl.DateTimeFormat('zh-CN', opts).format(date)
}

export function formatFullTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date(ms))
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat('zh-CN').format(n)
}

/** DSH-style compact relative time: 12m / 5h / 2d / 06/26 */
export function formatRelativeTime(ms: number, now = Date.now()): string {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const delta = Math.max(0, now - ms)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (delta < minute) return '刚刚'
  if (delta < hour) return `${Math.floor(delta / minute)}m`
  if (delta < day) return `${Math.floor(delta / hour)}h`
  if (delta < 7 * day) return `${Math.floor(delta / day)}d`
  return formatListTime(ms)
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s'
  if (ms < 1000) return `${Math.round(ms)}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds - minutes * 60)
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const minRest = minutes % 60
  return minRest ? `${hours}h ${minRest}m` : `${hours}h`
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function formatConversationCite(
  conversation: Pick<Conversation, 'title' | 'workspace' | 'gitBranch' | 'models' | 'sourcePath'>,
  sourceLabel: string
): string {
  const title = conversation.title.trim() || '未命名会话'
  const models = conversation.models
    .map((model) => model.trim())
    .filter(Boolean)
    .join(' · ')
  const fields: Array<[string, string | undefined]> = [
    ['来源', sourceLabel.trim() || undefined],
    ['工作区', conversation.workspace?.trim() || undefined],
    ['分支', conversation.gitBranch?.trim() || undefined],
    ['模型', models || undefined],
    ['会话文件', conversation.sourcePath.trim() || undefined]
  ]
  const items: string[] = []
  for (const [label, value] of fields) {
    if (value) items.push(`- ${label}：${value}`)
  }
  if (items.length === 0) return `# ${title}`
  return [`# ${title}`, '', ...items].join('\n')
}
