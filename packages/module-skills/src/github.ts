import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { GitHubRepoInfo, GitHubSkillPreview } from '@agentdock/core'
import { parseSkillContent } from './parse-frontmatter.ts'

export function parseGitHubUrl(rawUrl: string): GitHubRepoInfo {
  let cleaned = rawUrl.trim()
  cleaned = cleaned.replace(/[?#].*$/, '') // 移除 query 与 hash

  // 匹配形如 https://github.com/owner/repo/tree/branch/subpath...
  const matchWithTree = cleaned.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:tree|blob)\/([^/]+)(?:\/(.*))?$/i
  )
  if (matchWithTree && matchWithTree[1] && matchWithTree[2] && matchWithTree[3]) {
    const owner = matchWithTree[1]
    const repo = matchWithTree[2].replace(/\.git$/i, '')
    const ref = matchWithTree[3]
    let subpath = (matchWithTree[4] || '').replace(/^\/+|\/+$/g, '')
    // 如果 URL 指向的是 SKILL.md 或 README.md 本身，回退到所在目录
    if (subpath.toLowerCase().endsWith('/skill.md') || subpath.toLowerCase().endsWith('/readme.md')) {
      subpath = dirname(subpath)
      if (subpath === '.') subpath = ''
    }
    return { owner, repo, ref, subpath }
  }

  // 匹配形如 https://github.com/owner/repo
  const matchBase = cleaned.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/(.*))?$/i)
  if (matchBase && matchBase[1] && matchBase[2]) {
    const owner = matchBase[1]
    const repo = matchBase[2].replace(/\.git$/i, '')
    const rest = (matchBase[3] || '').replace(/^\/+|\/+$/g, '')
    return { owner, repo, ref: 'main', subpath: rest }
  }

  // 匹配简写 owner/repo/path
  const parts = cleaned.split('/').filter(Boolean)
  if (parts.length >= 2 && parts[0] && parts[1]) {
    const owner = parts[0]
    const repo = parts[1].replace(/\.git$/i, '')
    const subpath = parts.slice(2).join('/')
    return { owner, repo, ref: 'main', subpath }
  }

  throw new Error(`无法识别的 GitHub 链接格式: ${rawUrl}`)
}

interface GitHubContentItem {
  name: string
  path: string
  sha: string
  size: number
  url: string
  html_url: string
  git_url: string
  download_url: string | null
  type: 'file' | 'dir'
}

export async function previewGitHubSkill(rawUrl: string): Promise<GitHubSkillPreview> {
  const repoInfo = parseGitHubUrl(rawUrl)
  const { owner, repo, ref, subpath } = repoInfo

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${subpath}?ref=${encodeURIComponent(ref)}`
  const res = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'AgentDock',
      Accept: 'application/vnd.github.v3+json'
    }
  })

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`未找到指定仓库或路径 (${owner}/${repo}/${subpath})，请检查分支与目录是否正确。`)
    }
    if (res.status === 403) {
      throw new Error('GitHub API 请求频控受限，请稍后重试。')
    }
    throw new Error(`GitHub API 请求失败: HTTP ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as GitHubContentItem | GitHubContentItem[]
  const items: GitHubContentItem[] = Array.isArray(data) ? data : [data]

  const fileTree: Array<{ path: string; size?: number; type: 'file' | 'dir' }> = items.map((item) => ({
    path: item.name,
    size: item.size,
    type: item.type
  }))

  const skillMdItem = items.find((item) => item.name.toLowerCase() === 'skill.md')
  const readmeItem = items.find((item) => item.name.toLowerCase() === 'readme.md')
  const targetDoc = skillMdItem || readmeItem

  let skillMdContent = ''
  if (targetDoc && targetDoc.download_url) {
    try {
      const docRes = await fetch(targetDoc.download_url)
      if (docRes.ok) {
        skillMdContent = await docRes.text()
      }
    } catch {
      // 忽略文档读取异常
    }
  }

  const folderName = subpath ? subpath.split('/').pop() || repo : repo
  const { metadata, markdownBody } = parseSkillContent(skillMdContent, folderName)

  return {
    name: metadata.name || folderName,
    description: metadata.description || '',
    version: metadata.version,
    author: metadata.author,
    skillMdContent: skillMdContent || markdownBody,
    fileTree,
    repoInfo
  }
}

export async function downloadGitHubSkillToDir(
  repoInfo: GitHubRepoInfo,
  targetDir: string
): Promise<void> {
  const { owner, repo, ref, subpath } = repoInfo

  async function fetchAndSaveDirectory(currentSubpath: string, currentLocalDir: string): Promise<void> {
    await mkdir(currentLocalDir, { recursive: true })
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${currentSubpath}?ref=${encodeURIComponent(ref)}`
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'AgentDock',
        Accept: 'application/vnd.github.v3+json'
      }
    })

    if (!res.ok) {
      throw new Error(`下载目录失败 (${currentSubpath}): HTTP ${res.status} ${res.statusText}`)
    }

    const data = (await res.json()) as GitHubContentItem | GitHubContentItem[]
    const items: GitHubContentItem[] = Array.isArray(data) ? data : [data]

    for (const item of items) {
      const localFilePath = join(currentLocalDir, item.name)
      if (item.type === 'dir') {
        await fetchAndSaveDirectory(item.path, localFilePath)
      } else if (item.type === 'file' && item.download_url) {
        const fileRes = await fetch(item.download_url)
        if (!fileRes.ok) {
          throw new Error(`下载文件失败 (${item.name}): HTTP ${fileRes.status}`)
        }
        const buffer = Buffer.from(await fileRes.arrayBuffer())
        await writeFile(localFilePath, buffer)
      }
    }
  }

  await fetchAndSaveDirectory(subpath, targetDir)
}
