import { useState } from 'react'
import type { GitHubSkillPreview, SkillAgentInfo } from '@agentdock/core'
import { installSkillFromGitHub, previewGitHubSkill } from '../../../api'

interface InstallFromGitHubModalProps {
  isOpen: boolean
  agents: SkillAgentInfo[]
  onClose: () => void
  onInstalled: () => void
}

export function InstallFromGitHubModal({
  isOpen,
  agents,
  onClose,
  onInstalled
}: InstallFromGitHubModalProps) {
  const [url, setUrl] = useState('')
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [preview, setPreview] = useState<GitHubSkillPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedAgents, setSelectedAgents] = useState<string[]>(
    agents.map((a) => a.id)
  )
  const [overwrite, setOverwrite] = useState(false)

  if (!isOpen) return null

  const handleFetchPreview = async () => {
    const trimmed = url.trim()
    if (!trimmed) {
      setError('请输入 GitHub 仓库或目录链接')
      return
    }
    setError(null)
    setLoadingPreview(true)
    try {
      const data = await previewGitHubSkill(trimmed)
      setPreview(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingPreview(false)
    }
  }

  const toggleAgent = (agentId: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    )
  }

  const handleInstall = async () => {
    if (!url.trim()) return
    if (selectedAgents.length === 0) {
      setError('请至少选择一个目标 Agent')
      return
    }

    setError(null)
    setInstalling(true)
    try {
      const results = await installSkillFromGitHub({
        url: url.trim(),
        targetAgentIds: selectedAgents,
        overwrite
      })

      const failures = results.filter((r) => !r.success)
      if (failures.length > 0) {
        const msgs = failures.map((f) => `${f.agentId}: ${f.error}`).join('; ')
        setError(`部分 Agent 安装失败: ${msgs}`)
      } else {
        onInstalled()
        onClose()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setInstalling(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog skills-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-head">
          <h2 className="modal-title">从 GitHub 安装 Skill</h2>
          <button
            type="button"
            className="icon-btn modal-close-btn"
            onClick={onClose}
            aria-label="关闭"
          >
            <svg className="icon-16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                d="M4.8 4.8l6.4 6.4M11.2 4.8l-6.4 6.4"
              />
            </svg>
          </button>
        </div>

        <div className="modal-body skills-modal-body">
          {error && <div className="modal-error-banner">{error}</div>}

          {/* GitHub 链接输入 */}
          <div className="modal-field-group">
            <label className="modal-field-label">GitHub 技能目录链接</label>
            <div className="skills-gh-input-wrap">
              <input
                type="text"
                className="skills-gh-input"
                placeholder="例如：https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-demo/skills/bash"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value)
                  if (preview) setPreview(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleFetchPreview()
                }}
              />
              <button
                type="button"
                className="dialog-btn dialog-btn-secondary skills-gh-fetch-btn"
                disabled={loadingPreview || !url.trim()}
                onClick={() => void handleFetchPreview()}
              >
                {loadingPreview ? '解析中…' : '解析预览'}
              </button>
            </div>
            <p className="modal-field-hint">
              支持 GitHub 网页目录链接，自动拉取指定路径下的 SKILL.md 文档及所有文件（免全量克隆）。
            </p>
          </div>

          {/* 技能预览卡片 */}
          {preview && (
            <div className="skills-gh-preview-card">
              <div className="preview-card-head">
                <div className="preview-title-row">
                  <span className="preview-skill-name">{preview.name}</span>
                  {preview.version && (
                    <span className="skills-item-version">v{preview.version}</span>
                  )}
                  {preview.author && (
                    <span className="skills-detail-author">by {preview.author}</span>
                  )}
                </div>
                <span className="preview-repo-badge">
                  {preview.repoInfo.owner}/{preview.repoInfo.repo}@{preview.repoInfo.ref}
                </span>
              </div>

              {preview.description && (
                <p className="preview-desc">{preview.description}</p>
              )}

              <div className="preview-meta-row">
                <span className="preview-file-count">
                  文件数：{preview.fileTree.length} 个文件
                </span>
                {preview.repoInfo.subpath && (
                  <span className="preview-subpath">
                    路径：{preview.repoInfo.subpath}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* 目标 Agent 多选 */}
          <div className="modal-field-group">
            <label className="modal-field-label">安装到目标 Agent（可多选）</label>
            <div className="skills-agent-checkbox-group">
              {agents.map((agent) => (
                <label key={agent.id} className="skills-agent-checkbox-item">
                  <input
                    type="checkbox"
                    checked={selectedAgents.includes(agent.id)}
                    onChange={() => toggleAgent(agent.id)}
                  />
                  <span className="agent-checkbox-label">{agent.label}</span>
                  <span className="agent-checkbox-dir">({agent.skillsDir})</span>
                </label>
              ))}
            </div>
          </div>

          {/* 同名覆盖选项 */}
          <div className="modal-field-group">
            <label className="skills-agent-checkbox-item inline-label">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
              />
              <span>若目标 Agent 已存在同名技能，直接覆盖</span>
            </label>
          </div>
        </div>

        <div className="modal-foot">
          <button
            type="button"
            className="dialog-btn dialog-btn-secondary"
            onClick={onClose}
            disabled={installing}
          >
            取消
          </button>
          <button
            type="button"
            className="dialog-btn dialog-btn-primary"
            disabled={installing || !url.trim() || selectedAgents.length === 0}
            onClick={() => void handleInstall()}
          >
            {installing ? '正在安装…' : '确认安装'}
          </button>
        </div>
      </div>
    </div>
  )
}
