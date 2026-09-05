import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  AggregatedSkill,
  InstalledSkill,
  SkillFileEntry,
  SkillOverrideStatus
} from '@agentdock/core'
import {
  commitSkillOverride,
  enableSkillOverride,
  getSkillOverrideDiff,
  getSkillOverrideStatus,
  readSkillFile,
  revertSkillOverride,
  saveSkillOverrideFile
} from '../../../api'
import { FileActions } from '../../../components/FileActions'
import { MarkdownView } from '../../../components/MarkdownView'
import { MonacoCodeEditor } from '../../../components/MonacoCodeEditor'
import { MonacoDiffView } from '../../../components/MonacoDiffView'
import { formatFileSize, formatFullTime } from '../../../lib/format'
import { AgentBadge } from './SkillListSidebar'
import { OverrideConfirmModal } from './OverrideConfirmModal'

interface SkillDetailPaneProps {
  skill: AggregatedSkill | InstalledSkill | null
  activeAgentId: string | null
  files: SkillFileEntry[]
  loadingFiles: boolean
  onSelectAgent: (agentId: string) => void
  onInstallToOtherAgents: () => void
  onDeleteSkill: () => void
  onRevealInFolder?: (path: string) => void
  onOpenGitHubModal: () => void
  onOpenLocalModal?: () => void
  onRefresh?: () => void
  onOverrideStatusChange?: (skillId: string, agentId: string, isOverridden: boolean) => void
}

export function SkillDetailPane({
  skill,
  activeAgentId,
  files,
  loadingFiles,
  onSelectAgent,
  onInstallToOtherAgents,
  onDeleteSkill,
  onOpenGitHubModal,
  onOpenLocalModal,
  onRefresh,
  onOverrideStatusChange
}: SkillDetailPaneProps) {
  const [activeTab, setActiveTab] = useState<'doc' | 'files'>('doc')

  // 调试覆写状态
  const [overrideStatus, setOverrideStatus] = useState<SkillOverrideStatus | null>(null)
  const [isOverrideMode, setIsOverrideMode] = useState(false)
  const [isDiffView, setIsDiffView] = useState(false)
  const [activeFile, setActiveFile] = useState('SKILL.md')
  const [editorContent, setEditorContent] = useState('')
  const [lastSavedContent, setLastSavedContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [loadingContent, setLoadingContent] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmModal, setConfirmModal] = useState<'revert' | 'commit' | null>(null)

  // 区分 AggregatedSkill 与单项 InstalledSkill
  const isAggregated = skill && 'agents' in skill
  const agentsList = useMemo(() => {
    if (!skill) return []
    if ('agents' in skill) {
      return (skill as AggregatedSkill).agents
    }
    return [
      {
        agentId: (skill as InstalledSkill).agentId,
        agentLabel: (skill as InstalledSkill).agentLabel,
        path: (skill as InstalledSkill).path,
        updatedAt: (skill as InstalledSkill).updatedAt
      }
    ]
  }, [skill])

  const currentActiveAgent =
    agentsList.find((a) => a.agentId === activeAgentId) || agentsList[0]
  const currentActiveAgentId = currentActiveAgent?.agentId
  const activeSkillId = skill?.id

  // 仅在真实切换选中的技能或 Agent 时，重置视图状态并读取覆写状态（避免死循环与频繁闪烁）
  useEffect(() => {
    if (!activeSkillId || !currentActiveAgentId) {
      setOverrideStatus(null)
      setIsOverrideMode(false)
      setIsDiffView(false)
      setActiveFile('SKILL.md')
      return
    }

    let isMounted = true
    setIsOverrideMode(false)
    setIsDiffView(false)
    setActiveFile('SKILL.md')
    setConfirmModal(null)

    void getSkillOverrideStatus(currentActiveAgentId, activeSkillId)
      .then((status) => {
        if (isMounted) {
          setOverrideStatus(status)
          onOverrideStatusChange?.(activeSkillId, currentActiveAgentId, status.isOverridden)
        }
      })
      .catch((err) => {
        console.warn('获取覆写状态失败:', err)
      })

    return () => {
      isMounted = false
    }
  }, [activeSkillId, currentActiveAgentId, onOverrideStatusChange])

  // 读取正在编辑的文件及其 Diff 原版
  const loadFileContent = useCallback(
    async (filePath: string) => {
      if (!currentActiveAgentId || !activeSkillId) return
      setLoadingContent(true)
      try {
        const [content, diff] = await Promise.all([
          readSkillFile(currentActiveAgentId, activeSkillId, filePath),
          getSkillOverrideDiff(currentActiveAgentId, activeSkillId, filePath)
        ])
        setEditorContent(content)
        setLastSavedContent(content)
        setOriginalContent(diff.originalContent)
      } catch (err) {
        console.warn('读取文件或 Diff 失败:', err)
      } finally {
        setLoadingContent(false)
      }
    },
    [currentActiveAgentId, activeSkillId]
  )

  useEffect(() => {
    if (isOverrideMode && activeFile) {
      void loadFileContent(activeFile)
    }
  }, [isOverrideMode, activeFile, loadFileContent])

  const isDirty = editorContent !== lastSavedContent

  // 保存当前编辑的文件
  const handleSave = useCallback(async () => {
    if (!currentActiveAgentId || !activeSkillId || saving) return
    setSaving(true)
    try {
      await saveSkillOverrideFile({
        agentId: currentActiveAgentId,
        skillId: activeSkillId,
        relativePath: activeFile,
        content: editorContent
      })
      setLastSavedContent(editorContent)
      const [newStatus, diff] = await Promise.all([
        getSkillOverrideStatus(currentActiveAgentId, activeSkillId),
        getSkillOverrideDiff(currentActiveAgentId, activeSkillId, activeFile)
      ])
      setOverrideStatus(newStatus)
      setOriginalContent(diff.originalContent)
      onOverrideStatusChange?.(activeSkillId, currentActiveAgentId, newStatus.isOverridden)
    } catch (err) {
      console.error('保存覆写文件失败:', err)
    } finally {
      setSaving(false)
    }
  }, [currentActiveAgentId, activeSkillId, saving, activeFile, editorContent, onOverrideStatusChange])

  // 开启调试覆写
  const handleEnableOverride = async () => {
    if (!currentActiveAgentId || !activeSkillId) return
    try {
      const status = await enableSkillOverride(currentActiveAgentId, activeSkillId)
      setOverrideStatus(status)
      onOverrideStatusChange?.(activeSkillId, currentActiveAgentId, true)
      setIsOverrideMode(true)
      setIsDiffView(false)
      setActiveTab('doc')
      setActiveFile('SKILL.md')
    } catch (err) {
      console.error('开启调试覆写失败:', err)
    }
  }

  // 从文件列表点击编辑
  const handleEditFile = async (filePath: string) => {
    if (!currentActiveAgentId || !activeSkillId) return
    if (!overrideStatus?.isOverridden) {
      try {
        const status = await enableSkillOverride(currentActiveAgentId, activeSkillId)
        setOverrideStatus(status)
        onOverrideStatusChange?.(activeSkillId, currentActiveAgentId, true)
      } catch (err) {
        console.error('开启调试覆写失败:', err)
        return
      }
    }
    setActiveFile(filePath)
    setIsOverrideMode(true)
    setIsDiffView(false)
    setActiveTab('doc')
  }

  // 确认还原原版
  const handleExecuteRevert = async () => {
    if (!currentActiveAgentId || !activeSkillId) return
    await revertSkillOverride(currentActiveAgentId, activeSkillId)
    setConfirmModal(null)
    setIsOverrideMode(false)
    setIsDiffView(false)
    setOverrideStatus({ isOverridden: false, changedFiles: [] })
    onOverrideStatusChange?.(activeSkillId, currentActiveAgentId, false)
    onRefresh?.()
  }

  // 确认固化正式版
  const handleExecuteCommit = async () => {
    if (!currentActiveAgentId || !activeSkillId) return
    await commitSkillOverride(currentActiveAgentId, activeSkillId)
    setConfirmModal(null)
    setIsOverrideMode(false)
    setIsDiffView(false)
    setOverrideStatus({ isOverridden: false, changedFiles: [] })
    onOverrideStatusChange?.(activeSkillId, currentActiveAgentId, false)
    onRefresh?.()
  }

  if (!skill) {
    return (
      <section className="session-pane skills-detail-pane">
        <div className="empty-hero skills-empty-hero">
          <div className="skills-empty-icon">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none">
              <path
                d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="empty-title">Skill 技能管理</p>
          <p className="empty-copy">
            从左侧选择一个技能查看详情与文档，或从本地文件夹/ZIP、GitHub 仓库一键安装技能到您的 Agent。
          </p>
          <div className="skills-empty-actions">
            <button
              type="button"
              className="dialog-btn dialog-btn-primary skills-empty-action-btn"
              onClick={onOpenLocalModal}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                <path d="M1.5 3A1.5 1.5 0 0 1 3 1.5h3.293a1.5 1.5 0 0 1 1.06.44l1.414 1.414A1.5 1.5 0 0 0 9.828 4H13A1.5 1.5 0 0 1 14.5 5.5v7.5a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 13V3z" />
              </svg>
              <span>从本地导入技能 (文件夹 / ZIP)</span>
            </button>
            <button
              type="button"
              className="dialog-btn dialog-btn-secondary skills-empty-action-btn"
              onClick={onOpenGitHubModal}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              <span>从 GitHub 安装技能</span>
            </button>
          </div>
        </div>
      </section>
    )
  }

  const docText = skill.skillMdContent || ''
  const isOverridden = Boolean(overrideStatus?.isOverridden)
  const changedFiles = overrideStatus?.changedFiles || []

  // 可编辑的文件列表 (剔除目录)
  const editableFiles = files.filter((f) => !f.isDirectory)

  return (
    <section className="session-pane skills-detail-pane">
      {/* 技能顶部信息栏 */}
      <header className="skills-detail-header">
        <div className="skills-header-top-row">
          <div className="skills-title-row">
            <h1 className="skills-detail-title">{skill.name}</h1>
            {skill.version && <span className="skills-detail-version">v{skill.version}</span>}
            {isOverridden && (
              <span className="skill-override-badge" title="当前 Agent 处于本地调试覆写模式 (Chrome DevTools Overrides)">
                <span className="devtools-purple-dot" />
                调试覆写中
              </span>
            )}
            {skill.author && <span className="skills-detail-author">by {skill.author}</span>}
          </div>

          {/* 右上角操作按钮 */}
          <div className="skills-detail-actions">
            {!isOverridden ? (
              <button
                type="button"
                className="btn-action btn-action-override"
                onClick={handleEnableOverride}
                title="类似 Chrome DevTools 的源码本地覆写调试能力，创建基准快照并在应用内实时修改调试"
              >
                <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M10.5 2.5l3 3L4.5 14.5H1.5v-3L10.5 2.5z" />
                </svg>
                <span>开启调试覆写</span>
              </button>
            ) : (
              <div className="actions-subgroup override-subgroup">
                <button
                  type="button"
                  className={`btn-action btn-action-override ${isOverrideMode && !isDiffView ? 'is-active' : ''}`}
                  onClick={() => {
                    setIsOverrideMode(true)
                    setIsDiffView(false)
                    setActiveTab('doc')
                  }}
                  title="在内置编辑器中修改技能代码"
                >
                  <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M10.5 2.5l3 3L4.5 14.5H1.5v-3L10.5 2.5z" />
                  </svg>
                  <span>编辑源码</span>
                </button>
                <button
                  type="button"
                  className={`btn-action ${isOverrideMode && isDiffView ? 'is-active' : ''}`}
                  onClick={() => {
                    setIsOverrideMode(true)
                    setIsDiffView(true)
                    setActiveTab('doc')
                  }}
                  title="对比当前修改与初始原版的差异"
                >
                  <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M5 2v12M11 2v12M2 5l3-3 3 3M8 11l3 3 3-3" />
                  </svg>
                  <span>查看 Diff</span>
                </button>
                <button
                  type="button"
                  className="btn-action-subtle"
                  onClick={() => setConfirmModal('revert')}
                  title="放弃所有修改并还原回原版快照"
                >
                  <span>还原原版</span>
                </button>
                <button
                  type="button"
                  className="btn-action-subtle"
                  onClick={() => setConfirmModal('commit')}
                  title="将当前修改固化为正式版并清除快照"
                >
                  <span>固化正式版</span>
                </button>
              </div>
            )}

            <div className="actions-divider" />

            <div className="actions-subgroup general-subgroup">
              <button
                type="button"
                className="btn-action"
                onClick={onInstallToOtherAgents}
                title="将此技能复制安装到其他 Agent"
              >
                <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M13.4 8a5.4 5.4 0 1 1-1.8-4.02M13.6 2.2v2.9h-2.9" />
                </svg>
                <span>安装到其他 Agent</span>
              </button>
              <button
                type="button"
                className="btn-action-danger"
                onClick={onDeleteSkill}
                title="从本地 Agent 移除此技能"
              >
                <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <path d="M2.5 4h11M5.5 4V2.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5V4M4 4l.8 9.2a1.2 1.2 0 0 0 1.2 1.1h4a1.2 1.2 0 0 0 1.2-1.1L12 4M6.5 6.5v5M9.5 6.5v5" />
                </svg>
                <span>删除</span>
              </button>
            </div>
          </div>
        </div>

        {(() => {
          const cleanDesc =
            skill.description &&
            skill.description.trim() !== '>' &&
            skill.description.trim() !== '|'
              ? skill.description.trim()
              : ''
          return cleanDesc ? <p className="skills-detail-desc">{cleanDesc}</p> : null
        })()}

        {/* 归属 Agent 与路径元信息行 */}
        <div className="skills-header-meta-row">
          <div className="skills-installed-agents-row">
            <span className="agents-row-label">已安装至：</span>
            <div className="agents-badges-group">
              {agentsList.map((a) => {
                const isCurrent = currentActiveAgent?.agentId === a.agentId
                return (
                  <button
                    key={a.agentId}
                    type="button"
                    className={`agent-badge-select-btn ${isCurrent ? 'is-active' : ''}`}
                    onClick={() => onSelectAgent(a.agentId)}
                    title={`查看在 ${a.agentLabel} 中的安装详情`}
                  >
                    <AgentBadge agentId={a.agentId} label={a.agentLabel} />
                  </button>
                )
              })}
            </div>
          </div>

          {currentActiveAgent && (
            <div className="skills-path-row">
              <span className="path-label">路径</span>
              <code className="path-code" title={currentActiveAgent.path}>
                {currentActiveAgent.path}
              </code>
              <FileActions path={currentActiveAgent.path} />
              <span className="skills-updated-time">
                更新于 {formatFullTime(currentActiveAgent.updatedAt)}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* 标签栏 */}
      <div className="skills-detail-tabs">
        <button
          type="button"
          className={`detail-tab ${activeTab === 'doc' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('doc')}
        >
          {isOverrideMode ? `源码编辑 (${activeFile})` : 'SKILL.md 文档'}
        </button>
        <button
          type="button"
          className={`detail-tab ${activeTab === 'files' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('files')}
        >
          文件列表 {files.length > 0 ? `(${files.length})` : ''}
          {changedFiles.length > 0 && (
            <span className="tab-changed-count">{changedFiles.length}</span>
          )}
        </button>
      </div>

      {/* 标签正文内容区 */}
      <div className="skills-detail-body">
        {activeTab === 'doc' ? (
          isOverrideMode ? (
            // 编辑 / Diff 模式
            <div className="skills-editor-wrapper">
              <div className="skills-editor-subbar">
                <div className="editor-subbar-left">
                  {/* 文件切换快捷选择 */}
                  <div className="editor-file-selector">
                    <span className="editor-file-label">当前文件:</span>
                    <select
                      className="editor-file-select"
                      value={activeFile}
                      onChange={(e) => setActiveFile(e.target.value)}
                    >
                      {editableFiles.length > 0 ? (
                        editableFiles.map((f) => {
                          const isChanged = changedFiles.includes(f.relativePath)
                          return (
                            <option key={f.relativePath} value={f.relativePath}>
                              {f.relativePath} {isChanged ? '● [已修改]' : ''}
                            </option>
                          )
                        })
                      ) : (
                        <option value="SKILL.md">SKILL.md</option>
                      )}
                    </select>
                  </div>

                  {/* 状态指示器 */}
                  {isDirty ? (
                    <span className="dirty-indicator is-dirty" title="有未保存的改动，按 ⌘S 保存生效">
                      ● 未保存
                    </span>
                  ) : (
                    <span className="dirty-indicator is-clean" title="当前已保存，Agent 运行时已生效">
                      ✓ 已生效
                    </span>
                  )}
                </div>

                <div className="editor-subbar-right">
                  {/* 编辑 / Diff 切换 */}
                  <div className="skills-view-toggle">
                    <button
                      type="button"
                      className={`toggle-btn ${!isDiffView ? 'is-active' : ''}`}
                      onClick={() => setIsDiffView(false)}
                    >
                      代码编辑
                    </button>
                    <button
                      type="button"
                      className={`toggle-btn ${isDiffView ? 'is-active' : ''}`}
                      onClick={() => setIsDiffView(true)}
                    >
                      Diff 对比
                    </button>
                  </div>

                  {/* 保存按钮 */}
                  <button
                    type="button"
                    className="editor-save-btn"
                    onClick={handleSave}
                    disabled={!isDirty || saving}
                    title="保存覆写内容并立即生效 (快捷键 ⌘S)"
                  >
                    {saving ? '保存中…' : '保存 (⌘S)'}
                  </button>

                  {/* 退出编辑 */}
                  <button
                    type="button"
                    className="icon-btn"
                    title="退出编辑模式（保留覆写状态）"
                    aria-label="退出编辑"
                    onClick={() => setIsOverrideMode(false)}
                  >
                    <svg className="icon-16" viewBox="0 0 16 16" aria-hidden="true">
                      <path
                        d="M4 4l8 8M12 4l-8 8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="skills-editor-canvas">
                {loadingContent ? (
                  <div className="skills-empty-inline">正在加载文件内容…</div>
                ) : isDiffView ? (
                  <MonacoDiffView
                    original={originalContent}
                    modified={editorContent}
                    path={activeFile}
                    onChange={(val) => setEditorContent(val)}
                    onSave={handleSave}
                  />
                ) : (
                  <MonacoCodeEditor
                    value={editorContent}
                    path={activeFile}
                    onChange={(val) => setEditorContent(val)}
                    onSave={handleSave}
                  />
                )}
              </div>
            </div>
          ) : (
            // 正常预览模式
            <div className="skills-doc-scroll">
              {isOverridden && (
                <div className="skills-override-banner">
                  <div className="banner-left">
                    <span className="banner-icon">
                      <span className="devtools-purple-dot" />
                    </span>
                    <div className="banner-text">
                      <p className="banner-title">
                        该技能当前处于本地调试覆写模式
                        {changedFiles.length > 0 ? (
                          <span className="banner-badge-count">已修改 {changedFiles.length} 个文件</span>
                        ) : (
                          <span className="banner-badge-clean">快照基准已建立</span>
                        )}
                      </p>
                      <p className="banner-desc">
                        当前展示为已覆写生效的内容，任何编辑将即时同步至 Agent 运行时。
                      </p>
                    </div>
                  </div>
                  <div className="banner-actions">
                    <button
                      type="button"
                      className="banner-action-btn banner-btn-edit"
                      onClick={() => {
                        setIsOverrideMode(true)
                        setIsDiffView(false)
                        setActiveFile('SKILL.md')
                      }}
                    >
                      <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M10.5 2.5l3 3L4.5 14.5H1.5v-3L10.5 2.5z" />
                      </svg>
                      <span>编辑源码</span>
                    </button>
                    <button
                      type="button"
                      className="banner-action-btn banner-btn-diff"
                      onClick={() => {
                        setIsOverrideMode(true)
                        setIsDiffView(true)
                        setActiveFile('SKILL.md')
                      }}
                    >
                      <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M5 2v12M11 2v12M2 5l3-3 3 3M8 11l3 3 3-3" />
                      </svg>
                      <span>查看 Diff</span>
                    </button>
                  </div>
                </div>
              )}

              {docText ? (
                <div className="skills-markdown-wrap">
                  <MarkdownView text={docText} />
                </div>
              ) : (
                <div className="skills-empty-doc">
                  <p className="empty-copy">该 Skill 未包含 SKILL.md 或 README.md 说明文档</p>
                </div>
              )}
            </div>
          )
        ) : (
          <div className="skills-files-scroll">
            {loadingFiles ? (
              <div className="skills-empty-inline">正在加载文件清单…</div>
            ) : files.length === 0 ? (
              <div className="skills-empty-inline">暂未获取到文件列表</div>
            ) : (
              <div className="skills-files-table-wrap">
                <table className="skills-files-table">
                  <thead>
                    <tr>
                      <th>文件名</th>
                      <th>相对路径</th>
                      {isOverridden && <th style={{ width: 100 }}>调试状态</th>}
                      <th>大小</th>
                      <th style={{ width: 110, textAlign: 'center' }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((file) => {
                      const isChanged = changedFiles.includes(file.relativePath)
                      return (
                        <tr key={file.path} className={isChanged ? 'row-is-changed' : ''}>
                          <td className="file-name-cell">
                            <span className="file-type-icon">{file.isDirectory ? '📁' : '📄'}</span>
                            <span>{file.name}</span>
                          </td>
                          <td className="file-relpath-cell">{file.relativePath}</td>
                          {isOverridden && (
                            <td className="file-status-cell">
                              {isChanged ? (
                                <span className="file-changed-tag" title="此文件与快照基准相比已发生修改">
                                  已修改
                                </span>
                              ) : (
                                <span className="file-unchanged-tag">未变更</span>
                              )}
                            </td>
                          )}
                          <td className="file-size-cell">
                            {file.isDirectory ? '-' : formatFileSize(file.size)}
                          </td>
                          <td className="file-actions-cell" style={{ textAlign: 'center' }}>
                            <div className="file-cell-actions">
                              {!file.isDirectory && (
                                <button
                                  type="button"
                                  className="icon-btn edit-file-btn"
                                  title="在应用内调试编辑/覆写此文件"
                                  aria-label={`编辑 ${file.name}`}
                                  onClick={() => handleEditFile(file.relativePath)}
                                >
                                  <svg className="icon-14" viewBox="0 0 16 16" aria-hidden="true">
                                    <path
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.4"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M10.5 2.5l3 3L4.5 14.5H1.5v-3L10.5 2.5z"
                                    />
                                  </svg>
                                </button>
                              )}
                              <FileActions path={file.path} />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 还原 / 固化确认弹窗 */}
      {confirmModal && currentActiveAgent && (
        <OverrideConfirmModal
          isOpen={true}
          type={confirmModal}
          skillName={skill.name}
          agentLabel={currentActiveAgent.agentLabel}
          changedCount={changedFiles.length}
          onClose={() => setConfirmModal(null)}
          onConfirm={confirmModal === 'revert' ? handleExecuteRevert : handleExecuteCommit}
        />
      )}
    </section>
  )
}
