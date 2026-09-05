import { useEffect, useMemo, useRef, useState } from 'react'
import type { AggregatedSkill, InstalledSkill, SkillAgentInfo } from '@agentdock/core'
import { formatCount, formatRelativeTime } from '../../../lib/format'

interface SkillListSidebarProps {
  agents: SkillAgentInfo[]
  installedSkills: InstalledSkill[]
  aggregatedSkills: AggregatedSkill[]
  selectedSkillId: string | null
  selectedAgentId: string | null
  viewMode: 'grouped' | 'flat'
  loading: boolean
  onSelect: (skillId: string, agentId?: string) => void
  onChangeViewMode: (mode: 'grouped' | 'flat') => void
  onOpenGitHubModal: () => void
  onOpenLocalModal: () => void
  onRefresh: () => void
}

export function SkillListSidebar({
  agents,
  installedSkills,
  aggregatedSkills,
  selectedSkillId,
  selectedAgentId,
  viewMode,
  loading,
  onSelect,
  onChangeViewMode,
  onOpenGitHubModal,
  onOpenLocalModal,
  onRefresh
}: SkillListSidebarProps) {
  const [query, setQuery] = useState('')
  const [collapsedAgents, setCollapsedAgents] = useState<Record<string, boolean>>({})
  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  const handleMouseEnter = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    setIsImportMenuOpen(true)
  }

  const handleMouseLeave = () => {
    closeTimerRef.current = setTimeout(() => {
      setIsImportMenuOpen(false)
    }, 220)
  }

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current)
      }
    }
  }, [])

  // 点击外部或按 Esc 关闭菜单
  useEffect(() => {
    if (!isImportMenuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsImportMenuOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsImportMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isImportMenuOpen])

  const toggleAgentCollapse = (agentId: string) => {
    setCollapsedAgents((prev) => ({ ...prev, [agentId]: !prev[agentId] }))
  }

  // 过滤后的技能
  const filteredAggregated = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return aggregatedSkills
    return aggregatedSkills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.agents.some((a) => a.agentLabel.toLowerCase().includes(q))
    )
  }, [aggregatedSkills, query])

  const filteredInstalledByAgent = useMemo(() => {
    const q = query.trim().toLowerCase()
    const map = new Map<string, InstalledSkill[]>()
    for (const agent of agents) {
      map.set(agent.id, [])
    }
    for (const skill of installedSkills) {
      if (
        !q ||
        skill.name.toLowerCase().includes(q) ||
        skill.id.toLowerCase().includes(q) ||
        skill.description.toLowerCase().includes(q)
      ) {
        const list = map.get(skill.agentId) || []
        list.push(skill)
        map.set(skill.agentId, list)
      }
    }
    return map
  }, [agents, installedSkills, query])

  const totalSkillsCount = aggregatedSkills.length

  return (
    <aside className="sidebar skills-sidebar" aria-label="Skill 列表">
      <div className="skills-sidebar-head">
        <div className="skills-head-title-row">
          <div className="brand-mark">
            Skills <span className="skills-count-pill">{formatCount(totalSkillsCount)}</span>
          </div>
          <div className="skills-head-actions">
            <button
              type="button"
              className="icon-btn"
              title="刷新技能"
              aria-label="刷新技能"
              disabled={loading}
              onClick={onRefresh}
            >
              <svg className="icon-16" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  d="M13.4 8a5.4 5.4 0 1 1-1.8-4.02M13.6 2.2v2.9h-2.9"
                />
              </svg>
            </button>
            <div
              ref={dropdownRef}
              className="skills-import-dropdown-container"
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <button
                type="button"
                className={`icon-btn skills-import-trigger-btn ${isImportMenuOpen ? 'is-active' : ''}`}
                title="导入或安装新技能"
                aria-label="导入或安装新技能"
                aria-haspopup="menu"
                aria-expanded={isImportMenuOpen}
                onClick={() => setIsImportMenuOpen((prev) => !prev)}
              >
                <svg className="icon-16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 2v7.5M4.75 6.75L8 10l3.25-3.25M2.5 12.5h11" />
                </svg>
              </button>

              {isImportMenuOpen && (
                <div className="skills-import-menu" role="menu">
                  <button
                    type="button"
                    className="skills-import-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setIsImportMenuOpen(false)
                      onOpenLocalModal()
                    }}
                  >
                    <div className="menu-item-icon">
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                        <path d="M1.5 3A1.5 1.5 0 0 1 3 1.5h3.293a1.5 1.5 0 0 1 1.06.44l1.414 1.414A1.5 1.5 0 0 0 9.828 4H13A1.5 1.5 0 0 1 14.5 5.5v7.5a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 13V3z" />
                      </svg>
                    </div>
                    <div className="menu-item-text">
                      <span className="menu-item-title">本地导入</span>
                      <span className="menu-item-desc">文件夹或 .zip 压缩包</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="skills-import-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setIsImportMenuOpen(false)
                      onOpenGitHubModal()
                    }}
                  >
                    <div className="menu-item-icon">
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                      </svg>
                    </div>
                    <div className="menu-item-text">
                      <span className="menu-item-title">GitHub 安装</span>
                      <span className="menu-item-desc">输入仓库或子目录链接</span>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 模式切换器 */}
        <div className="skills-mode-segmented">
          <button
            type="button"
            className={`segmented-tab ${viewMode === 'grouped' ? 'is-active' : ''}`}
            onClick={() => onChangeViewMode('grouped')}
          >
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" className="seg-icon">
              <path
                d="M3 4h10M3 8h10M3 12h10"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
            按 Agent 分组
          </button>
          <button
            type="button"
            className={`segmented-tab ${viewMode === 'flat' ? 'is-active' : ''}`}
            onClick={() => onChangeViewMode('flat')}
          >
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" className="seg-icon">
              <path
                d="M2.5 3.5h4v4h-4zm7 0h4v4h-4zm-7 7h4v4h-4zm7 0h4v4h-4z"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
            </svg>
            平铺视图
          </button>
        </div>

        {/* 搜索框：与对话模块 WorkspaceSidebar 保持完全一致的交互与样式 */}
        <div className="search-field">
          <svg className="search-icon" viewBox="0 0 16 16" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              d="M10.6 10.6 14 14M11.8 7.2a4.6 4.6 0 1 1-9.2 0 4.6 4.6 0 0 1 9.2 0Z"
            />
          </svg>
          <input
            type="search"
            className="sidebar-search"
            placeholder="搜索技能名称或描述"
            aria-label="搜索技能"
            value={query}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                e.preventDefault()
                setQuery('')
              }
            }}
          />
          {query ? (
            <button
              type="button"
              className="search-clear"
              aria-label="清除搜索"
              onClick={() => setQuery('')}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  d="M4.8 4.8l6.4 6.4M11.2 4.8l-6.4 6.4"
                />
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      {/* 技能列表区 */}
      <div className="sidebar-scroll skills-list-scroll">
        {loading && totalSkillsCount === 0 ? (
          <div className="skills-empty-inline">正在加载 Skills…</div>
        ) : viewMode === 'grouped' ? (
          // 按 Agent 分组视图
          <div className="skills-grouped-wrap">
            {agents.map((agent) => {
              const skills = filteredInstalledByAgent.get(agent.id) || []
              const isCollapsed = Boolean(collapsedAgents[agent.id])
              return (
                <div key={agent.id} className="skills-agent-section">
                  <button
                    type="button"
                    className="skills-agent-header"
                    onClick={() => toggleAgentCollapse(agent.id)}
                  >
                    <svg
                      className={`icon-16 collapse-chevron-icon ${isCollapsed ? 'is-collapsed' : ''}`}
                      viewBox="0 0 16 16"
                      aria-hidden="true"
                    >
                      <path
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 6l4 4 4-4"
                      />
                    </svg>
                    <AgentBadge agentId={agent.id} label={agent.label} />
                    <span className="agent-skill-count">{formatCount(skills.length)}</span>
                  </button>
                  {!isCollapsed && (
                    <div className="skills-agent-items">
                      {skills.length === 0 ? (
                        <div className="skills-empty-agent-item">暂无技能</div>
                      ) : (
                        skills.map((skill) => {
                          const isSelected =
                            selectedSkillId === skill.id && selectedAgentId === skill.agentId
                          return (
                            <button
                              key={`${skill.agentId}:${skill.id}`}
                              type="button"
                              className={`skills-item-btn ${isSelected ? 'is-selected' : ''}`}
                              onClick={() => onSelect(skill.id, skill.agentId)}
                            >
                              <div className="skills-item-head">
                                <span className="skills-item-name">{skill.name}</span>
                                <span className="skills-item-head-right">
                                  {skill.isOverridden && (
                                    <span className="devtools-override-pill" title="本地调试覆写中">
                                      <span className="devtools-purple-dot-sm" />
                                      <span>覆写中</span>
                                    </span>
                                  )}
                                  {skill.version && (
                                    <span className="skills-item-version">v{skill.version}</span>
                                  )}
                                </span>
                              </div>
                              {skill.description && (
                                <p className="skills-item-desc">{skill.description}</p>
                              )}
                              <div className="skills-item-meta">
                                <span className="skills-item-time">
                                  {formatRelativeTime(skill.updatedAt)}
                                </span>
                                {skill.hasSkillMd && (
                                  <span className="skills-has-doc-pill">SKILL.md</span>
                                )}
                              </div>
                            </button>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          // 平铺聚合视图
          <div className="skills-flat-wrap">
            {filteredAggregated.length === 0 ? (
              <div className="skills-empty-inline">
                {query ? '未搜索到匹配技能' : '当前暂无已安装技能'}
              </div>
            ) : (
              filteredAggregated.map((skill) => {
                const isSelected = selectedSkillId === skill.id
                return (
                  <button
                    key={skill.id}
                    type="button"
                    className={`skills-item-btn flat-item ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => onSelect(skill.id)}
                  >
                    <div className="skills-item-head">
                      <span className="skills-item-name">{skill.name}</span>
                      <span className="skills-item-head-right">
                        {skill.isOverridden && (
                          <span className="devtools-override-pill" title="本地调试覆写中">
                            <span className="devtools-purple-dot-sm" />
                            <span>覆写中</span>
                          </span>
                        )}
                        {skill.version && (
                          <span className="skills-item-version">v{skill.version}</span>
                        )}
                      </span>
                    </div>
                    {skill.description && (
                      <p className="skills-item-desc">{skill.description}</p>
                    )}
                    {(() => {
                      const visibleAgents = skill.agents.filter((a) => a.agentId !== 'common')
                      if (visibleAgents.length === 0 && !skill.hasSkillMd) return null
                      return (
                        <div className="skills-flat-badges">
                          {visibleAgents.map((a) => (
                            <AgentBadge key={a.agentId} agentId={a.agentId} label={a.agentLabel} />
                          ))}
                          {skill.hasSkillMd && <span className="skills-has-doc-pill">SKILL.md</span>}
                        </div>
                      )
                    })()}
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>
    </aside>
  )
}

export function AgentBadge({ agentId, label }: { agentId: string; label: string }) {
  let badgeClass = 'badge-generic'
  if (agentId === 'claude-code' || agentId === 'claude') badgeClass = 'badge-claude'
  else if (agentId === 'cursor') badgeClass = 'badge-cursor'
  else if (agentId === 'codex') badgeClass = 'badge-codex'
  else if (agentId === 'common') badgeClass = 'badge-common'

  return <span className={`agent-badge ${badgeClass}`}>{label}</span>
}
