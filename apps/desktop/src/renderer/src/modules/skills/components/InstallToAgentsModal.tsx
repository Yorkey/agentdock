import { useState } from 'react'
import type { SkillAgentInfo } from '@agentdock/core'
import { installSkillToAgents } from '../../../api'

interface InstallToAgentsModalProps {
  isOpen: boolean
  skillName: string
  sourceAgentId: string
  installedAgentIds: string[]
  allAgents: SkillAgentInfo[]
  onClose: () => void
  onInstalled: () => void
}

export function InstallToAgentsModal({
  isOpen,
  skillName,
  sourceAgentId,
  installedAgentIds,
  allAgents,
  onClose,
  onInstalled
}: InstallToAgentsModalProps) {
  const [selectedAgents, setSelectedAgents] = useState<string[]>(
    allAgents.filter((a) => a.id !== sourceAgentId).map((a) => a.id)
  )
  const [overwrite, setOverwrite] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const sourceAgent = allAgents.find((a) => a.id === sourceAgentId)
  const otherAgents = allAgents.filter((a) => a.id !== sourceAgentId)

  const toggleAgent = (agentId: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    )
  }

  const handleInstall = async () => {
    if (selectedAgents.length === 0) {
      setError('请选择至少一个目标 Agent')
      return
    }

    setError(null)
    setLoading(true)
    try {
      const results = await installSkillToAgents({
        skillName,
        sourceAgentId,
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
      setLoading(false)
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
          <h2 className="modal-title">安装已有 Skill 到其他 Agent</h2>
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

          <div className="modal-info-box">
            <svg
              className="info-box-icon"
              width="18"
              height="18"
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <path d="M8 5v.5M8 7.5v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <div className="info-box-content">
              将技能 <strong>{skillName}</strong> 从{' '}
              <span className="source-label">{sourceAgent?.label || sourceAgentId}</span>{' '}
              完整复制到其他目标 Agent。
            </div>
          </div>

          <div className="modal-field-group">
            <label className="modal-field-label">选择目标 Agent</label>
            <div className="skills-agent-checkbox-group">
              {otherAgents.map((agent) => {
                const isAlreadyInstalled = installedAgentIds.includes(agent.id)
                return (
                  <label key={agent.id} className="skills-agent-checkbox-item">
                    <input
                      type="checkbox"
                      checked={selectedAgents.includes(agent.id)}
                      onChange={() => toggleAgent(agent.id)}
                    />
                    <span className="agent-checkbox-label">{agent.label}</span>
                    {isAlreadyInstalled && (
                      <span className="agent-installed-tag">已安装</span>
                    )}
                    <span className="agent-checkbox-dir">({agent.skillsDir})</span>
                  </label>
                )
              })}
            </div>
          </div>

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
            disabled={loading}
          >
            取消
          </button>
          <button
            type="button"
            className="dialog-btn dialog-btn-primary"
            disabled={loading || selectedAgents.length === 0}
            onClick={() => void handleInstall()}
          >
            {loading ? '正在复制安装…' : '确认安装'}
          </button>
        </div>
      </div>
    </div>
  )
}
