import { useState } from 'react'
import { uninstallSkill } from '../../../api'

interface DeleteSkillModalProps {
  isOpen: boolean
  skillName: string
  installedAgents: Array<{ agentId: string; agentLabel: string }>
  defaultAgentId?: string | null
  onClose: () => void
  onDeleted: () => void
}

export function DeleteSkillModal({
  isOpen,
  skillName,
  installedAgents,
  defaultAgentId,
  onClose,
  onDeleted
}: DeleteSkillModalProps) {
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>(
    defaultAgentId ? [defaultAgentId] : installedAgents.map((a) => a.agentId)
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const toggleAgent = (agentId: string) => {
    setSelectedAgentIds((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    )
  }

  const selectAll = () => {
    setSelectedAgentIds(installedAgents.map((a) => a.agentId))
  }

  const handleDelete = async () => {
    if (selectedAgentIds.length === 0) {
      setError('请选择至少一个要移除的 Agent')
      return
    }

    setError(null)
    setLoading(true)
    try {
      const results = await uninstallSkill({
        skillName,
        agentIds: selectedAgentIds
      })

      const failures = results.filter((r) => !r.success)
      if (failures.length > 0) {
        const msgs = failures.map((f) => `${f.agentId}: ${f.error}`).join('; ')
        setError(`部分 Agent 删除失败: ${msgs}`)
      } else {
        onDeleted()
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
          <h2 className="modal-title">删除 Skill</h2>
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

          <div className="modal-danger-box">
            <svg
              className="danger-box-icon"
              width="18"
              height="18"
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7.13 2.75a1 1 0 0 1 1.74 0l5.88 10.2A1 1 0 0 1 13.88 14.5H2.12a1 1 0 0 1-.87-1.55l5.88-10.2zM8 6v3.5M8 12v.5"
              />
            </svg>
            <div className="danger-box-content">
              <p className="danger-box-title">
                确定要删除技能 <strong>{skillName}</strong> 吗？
              </p>
              <p className="danger-box-desc">
                此操作将物理删除对应 Agent 目录下的技能文件夹，不可撤销。
              </p>
            </div>
          </div>

          <div className="modal-field-group">
            <div className="modal-label-row">
              <label className="modal-field-label">选择要移除的 Agent</label>
              <button type="button" className="select-all-btn" onClick={selectAll}>
                全选
              </button>
            </div>
            <div className="skills-agent-checkbox-group">
              {installedAgents.map((agent) => (
                <label key={agent.agentId} className="skills-agent-checkbox-item">
                  <input
                    type="checkbox"
                    checked={selectedAgentIds.includes(agent.agentId)}
                    onChange={() => toggleAgent(agent.agentId)}
                  />
                  <span className="agent-checkbox-label">{agent.agentLabel}</span>
                </label>
              ))}
            </div>
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
            className="dialog-btn dialog-btn-danger"
            disabled={loading || selectedAgentIds.length === 0}
            onClick={() => void handleDelete()}
          >
            {loading ? '正在删除…' : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  )
}
