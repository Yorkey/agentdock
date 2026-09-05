import { useState, useEffect, type DragEvent } from 'react'
import type { LocalSkillPreview, SkillAgentInfo } from '@agentdock/core'
import {
  getPathForFile,
  installLocalSkill,
  previewLocalSkill,
  selectSkillFolder,
  selectSkillZip
} from '../../../api'
import { formatFileSize } from '../../../lib/format'

interface ImportFromLocalModalProps {
  isOpen: boolean
  agents: SkillAgentInfo[]
  onClose: () => void
  onInstalled: () => void
}

export function ImportFromLocalModal({
  isOpen,
  agents,
  onClose,
  onInstalled
}: ImportFromLocalModalProps) {
  const [sourcePath, setSourcePath] = useState('')
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [preview, setPreview] = useState<LocalSkillPreview | null>(null)
  const [customSkillName, setCustomSkillName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [selectedAgents, setSelectedAgents] = useState<string[]>(
    agents.map((a) => a.id)
  )
  const [overwrite, setOverwrite] = useState(false)
  const [isDraggingOver, setIsDraggingOver] = useState(false)

  const handleResetSource = () => {
    setSourcePath('')
    setPreview(null)
    setCustomSkillName('')
    setError(null)
    setOverwrite(false)
  }

  // 关闭弹窗时自动重置选择状态，保证下次打开为干净状态
  useEffect(() => {
    if (!isOpen) {
      handleResetSource()
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleLoadPath = async (filePath: string) => {
    const trimmed = filePath.trim()
    if (!trimmed) return
    setSourcePath(trimmed)
    setError(null)
    setLoadingPreview(true)
    try {
      const data = await previewLocalSkill(trimmed)
      setPreview(data)
      setCustomSkillName(data.folderName || data.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPreview(null)
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleChooseFolder = async () => {
    try {
      const selected = await selectSkillFolder()
      if (selected) {
        await handleLoadPath(selected)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleChooseZip = async () => {
    try {
      const selected = await selectSkillZip()
      if (selected) {
        await handleLoadPath(selected)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    const resolvedPath = getPathForFile(file)
    if (resolvedPath && typeof resolvedPath === 'string') {
      void handleLoadPath(resolvedPath)
    } else {
      setError('未能获取拖拽文件的本地绝对路径，请使用下方选择按钮。')
    }
  }

  const toggleAgent = (agentId: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    )
  }

  const handleToggleSelectAllAgents = () => {
    if (selectedAgents.length === agents.length) {
      setSelectedAgents([])
    } else {
      setSelectedAgents(agents.map((a) => a.id))
    }
  }

  const handleInstall = async () => {
    if (!sourcePath.trim()) {
      setError('请先选择要导入的技能文件夹或 .zip 压缩包')
      return
    }
    if (selectedAgents.length === 0) {
      setError('请至少选择一个目标 Agent')
      return
    }

    const finalName = customSkillName.trim()
    if (!finalName) {
      setError('技能名称/安装目录名不能为空')
      return
    }

    setError(null)
    setInstalling(true)
    try {
      const results = await installLocalSkill({
        sourcePath: sourcePath.trim(),
        skillName: finalName,
        targetAgentIds: selectedAgents,
        overwrite
      })

      const failures = results.filter((r) => !r.success)
      if (failures.length > 0) {
        const msgs = failures.map((f) => `${f.agentId}: ${f.error}`).join('; ')
        setError(`部分 Agent 导入失败: ${msgs}`)
      } else {
        handleResetSource()
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
        className="modal-dialog skills-modal-dialog local-import-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-head">
          <h2 className="modal-title">从本地导入 Skill</h2>
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

          {/* 尚未选取文件时的投放区与选择按钮 */}
          {!preview && (
            <div
              className={`skills-local-dropzone ${isDraggingOver ? 'is-drag-over' : ''} ${loadingPreview ? 'is-loading' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {loadingPreview ? (
                <div className="dropzone-inner-loading">
                  <div className="dropzone-spinner" />
                  <p className="dropzone-text">正在分析技能内容与元数据…</p>
                </div>
              ) : (
                <div className="dropzone-inner">
                  <div className="dropzone-icon">
                    <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
                      <polyline points="7 9 12 4 17 9" strokeLinecap="round" strokeLinejoin="round" />
                      <line x1="12" y1="4" x2="12" y2="16" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <p className="dropzone-title">拖拽技能文件夹或 .zip 压缩包至此处</p>
                  <p className="dropzone-sub">支持包含 SKILL.md 或独立配置的技能包</p>

                  <div className="dropzone-actions">
                    <button
                      type="button"
                      className="dialog-btn dialog-btn-secondary dropzone-action-btn"
                      onClick={() => void handleChooseFolder()}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                        <path d="M1.5 3A1.5 1.5 0 0 1 3 1.5h3.293a1.5 1.5 0 0 1 1.06.44l1.414 1.414A1.5 1.5 0 0 0 9.828 4H13A1.5 1.5 0 0 1 14.5 5.5v7.5a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 13V3z" />
                      </svg>
                      <span>选择本地文件夹</span>
                    </button>
                    <button
                      type="button"
                      className="dialog-btn dialog-btn-secondary dropzone-action-btn"
                      onClick={() => void handleChooseZip()}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                        <path d="M2.5 2.5h11v11h-11zM8 2.5v11M2.5 8h11" />
                      </svg>
                      <span>选择 ZIP 压缩包</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 成功解析后的技能预览与配置卡片 */}
          {preview && (
            <div className="skills-local-preview-section">
              <div className="skills-local-source-bar">
                <span className="source-type-pill">
                  {preview.sourceType === 'folder' ? '📁 本地文件夹' : '📦 ZIP 压缩包'}
                </span>
                <span className="source-path-text" title={preview.sourcePath}>
                  {preview.sourcePath}
                </span>
                <button
                  type="button"
                  className="btn-action-subtle rechoose-btn"
                  onClick={handleResetSource}
                  title="更换其他技能文件"
                >
                  重新选择
                </button>
              </div>

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
                    {preview.hasSkillMd && (
                      <span className="skills-has-doc-pill">SKILL.md 规范</span>
                    )}
                  </div>
                  <span className="preview-file-stat">
                    {preview.fileCount} 个文件 · {formatFileSize(preview.totalSize)}
                  </span>
                </div>

                {preview.description && (
                  <p className="preview-desc">{preview.description}</p>
                )}
              </div>

              {/* 技能安装目录名称 */}
              <div className="modal-field-group">
                <label className="modal-field-label">安装目录标识名称 (Skill ID)</label>
                <input
                  type="text"
                  className="skills-gh-input"
                  value={customSkillName}
                  placeholder="例如：my-skill"
                  onChange={(e) => setCustomSkillName(e.target.value)}
                />
                <p className="modal-field-hint">
                  该名称将作为技能在 Agent 目录中的文件夹名，支持字母、数字及下划线连字符。
                </p>
              </div>

              {/* 目标 Agent 多选 */}
              <div className="modal-field-group">
                <div className="modal-label-row">
                  <label className="modal-field-label">安装到目标 Agent（可多选）</label>
                  <button
                    type="button"
                    className="select-all-btn"
                    onClick={handleToggleSelectAllAgents}
                  >
                    {selectedAgents.length === agents.length ? '取消全选' : '全选'}
                  </button>
                </div>
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
                  <span>若目标 Agent 已存在同名技能，直接覆盖现有内容</span>
                </label>
              </div>
            </div>
          )}
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
            disabled={installing || !preview || selectedAgents.length === 0}
            onClick={() => void handleInstall()}
          >
            {installing ? '正在导入安装…' : '开始导入'}
          </button>
        </div>
      </div>
    </div>
  )
}
