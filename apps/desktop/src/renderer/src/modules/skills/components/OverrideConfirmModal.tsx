import { useEffect, useState } from 'react'

interface OverrideConfirmModalProps {
  isOpen: boolean
  type: 'revert' | 'commit'
  skillName: string
  agentLabel: string
  changedCount: number
  onClose: () => void
  onConfirm: () => Promise<void>
}

export function OverrideConfirmModal({
  isOpen,
  type,
  skillName,
  agentLabel,
  changedCount,
  onClose,
  onConfirm
}: OverrideConfirmModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const isRevert = type === 'revert'

  const handleExecute = async () => {
    setError(null)
    setLoading(true)
    try {
      await onConfirm()
      onClose()
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
          <h2 className="modal-title">
            {isRevert ? '还原技能原版' : '固化调试修改为正式版'}
          </h2>
          <button
            type="button"
            className="icon-btn modal-close-btn"
            onClick={onClose}
            aria-label="关闭"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M4.8 4.8l6.4 6.4M11.2 4.8l-6.4 6.4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="modal-body skills-modal-body">
          {error && <div className="modal-error-banner">{error}</div>}

          {isRevert ? (
            <div className="modal-danger-box">
              <svg
                className="danger-box-icon"
                width="18"
                height="18"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 8a5 5 0 0 1 8.5-3.5L14 7M14 3v4h-4M13 8a5 5 0 0 1-8.5 3.5L2 9M2 13V9h4" />
              </svg>
              <div className="danger-box-content">
                <p className="danger-box-title">
                  确定还原技能 <strong>{skillName}</strong> 吗？
                </p>
                <p className="danger-box-desc">
                  目标 Agent：<strong>{agentLabel}</strong>
                  <br />
                  此操作将<strong>丢弃当前所有本地调试修改</strong>（涉及 {changedCount} 个已修改文件），并彻底恢复为开启调试覆写前的快照版本。
                  <br />
                  <span style={{ color: 'var(--danger)', fontWeight: 600 }}>注意：此操作不可撤销！</span>
                </p>
              </div>
            </div>
          ) : (
            <div className="modal-notice-box">
              <svg
                className="notice-box-icon"
                width="18"
                height="18"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M13.5 4.5l-7 7L3 8" />
              </svg>
              <div className="notice-box-content">
                <p className="notice-box-title">
                  确定固化技能 <strong>{skillName}</strong> 为正式版吗？
                </p>
                <p className="notice-box-desc">
                  目标 Agent：<strong>{agentLabel}</strong>
                  <br />
                  此操作将把当前调试编辑的代码（涉及 {changedCount} 个已变动文件）<strong>永久保留为正式版本</strong>，并清除调试备份快照。
                  <br />
                  后续该 Agent 将直接基于当前代码运行。
                </p>
              </div>
            </div>
          )}
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
            className={`dialog-btn ${isRevert ? 'dialog-btn-danger' : 'dialog-btn-primary'}`}
            onClick={handleExecute}
            disabled={loading}
          >
            {loading ? '正在处理…' : isRevert ? '确认还原原版' : '确认固化正式版'}
          </button>
        </div>
      </div>
    </div>
  )
}
