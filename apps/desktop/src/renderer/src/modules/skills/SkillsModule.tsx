import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  AggregatedSkill,
  InstalledSkill,
  SkillAgentInfo,
  SkillFileEntry
} from '@agentdock/core'
import {
  getSkillDetail,
  listAggregatedSkills,
  listSkillAgents,
  listSkillOverrides,
  listSkills,
  revealInFolder
} from '../../api'
import { PaneError } from '../../workbench/Feedback'
import type { ModuleProps } from '../../workbench/types'
import { DeleteSkillModal } from './components/DeleteSkillModal'
import { ImportFromLocalModal } from './components/ImportFromLocalModal'
import { InstallFromGitHubModal } from './components/InstallFromGitHubModal'
import { InstallToAgentsModal } from './components/InstallToAgentsModal'
import { SkillDetailPane } from './components/SkillDetailPane'
import { SkillListSidebar } from './components/SkillListSidebar'

const STORAGE_VIEW_MODE = 'agentdock.skills.viewMode'

export function SkillsModule({ hidden }: ModuleProps) {
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_VIEW_MODE)
      if (saved === 'flat' || saved === 'grouped') return saved
    } catch {
      // ignore
    }
    return 'grouped'
  })

  const [agents, setAgents] = useState<SkillAgentInfo[]>([])
  const [installedSkills, setInstalledSkills] = useState<InstalledSkill[]>([])
  const [aggregatedSkills, setAggregatedSkills] = useState<AggregatedSkill[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)

  const [files, setFiles] = useState<SkillFileEntry[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)

  // 弹窗状态
  const [isGitHubModalOpen, setIsGitHubModalOpen] = useState(false)
  const [isLocalModalOpen, setIsLocalModalOpen] = useState(false)
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)

  const handleViewModeChange = (mode: 'grouped' | 'flat') => {
    setViewMode(mode)
    try {
      localStorage.setItem(STORAGE_VIEW_MODE, mode)
    } catch {
      // ignore
    }
  }

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [agentList, skillList, aggregatedList, overridesList] = await Promise.all([
        listSkillAgents(),
        listSkills(),
        listAggregatedSkills(),
        listSkillOverrides().catch(() => [])
      ])
      const overrideSet = new Set(
        overridesList.map((o) => `${o.agentId}:${o.skillId}`)
      )
      for (const s of skillList) {
        if (overrideSet.has(`${s.agentId}:${s.id}`)) {
          s.isOverridden = true
        }
      }
      for (const agg of aggregatedList) {
        for (const a of agg.agents) {
          if (overrideSet.has(`${a.agentId}:${agg.id}`)) {
            a.isOverridden = true
            agg.isOverridden = true
          }
        }
        if (agg.agents.some((a) => a.isOverridden)) {
          agg.isOverridden = true
        }
      }
      setAgents(agentList)
      setInstalledSkills(skillList)
      setAggregatedSkills(aggregatedList)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  // 接收详情面板关于当前技能覆写状态变动的即时通知，并即时同步更新侧边栏（幂等更新，避免无意义的重渲染）
  const handleOverrideStatusChange = useCallback(
    (skillId: string, agentId: string, isOverridden: boolean) => {
      setInstalledSkills((prev) => {
        const item = prev.find((s) => s.id === skillId && s.agentId === agentId)
        if (!item || item.isOverridden === isOverridden) return prev
        return prev.map((s) => (s.id === skillId && s.agentId === agentId ? { ...s, isOverridden } : s))
      })
      setAggregatedSkills((prev) => {
        const agg = prev.find((s) => s.id === skillId)
        if (!agg) return prev
        const targetAgent = agg.agents.find((a) => a.agentId === agentId)
        const anyOverridden = agg.agents.some((a) => (a.agentId === agentId ? isOverridden : a.isOverridden))
        if (targetAgent?.isOverridden === isOverridden && agg.isOverridden === anyOverridden) {
          return prev
        }
        return prev.map((item) => {
          if (item.id !== skillId) return item
          const newAgents = item.agents.map((a) =>
            a.agentId === agentId ? { ...a, isOverridden } : a
          )
          return { ...item, agents: newAgents, isOverridden: anyOverridden }
        })
      })
    },
    []
  )

  useEffect(() => {
    void loadData()
  }, [loadData])

  // 当前选中的技能对象
  const activeSkill = useMemo(() => {
    if (!selectedSkillId) return null
    if (viewMode === 'flat') {
      return aggregatedSkills.find((s) => s.id === selectedSkillId) ?? null
    }
    // grouped 模式
    if (selectedAgentId) {
      const direct = installedSkills.find(
        (s) => s.id === selectedSkillId && s.agentId === selectedAgentId
      )
      if (direct) return direct
    }
    return (
      installedSkills.find((s) => s.id === selectedSkillId) ??
      aggregatedSkills.find((s) => s.id === selectedSkillId) ??
      null
    )
  }, [selectedSkillId, selectedAgentId, viewMode, installedSkills, aggregatedSkills])

  // 当前选中技能对应的所有已安装 Agent
  const installedAgentsForActiveSkill = useMemo(() => {
    if (!selectedSkillId) return []
    const matching = installedSkills.filter((s) => s.id === selectedSkillId)
    return matching.map((s) => ({
      agentId: s.agentId,
      agentLabel: s.agentLabel
    }))
  }, [selectedSkillId, installedSkills])

  // 计算当前技能所对应的目标 Agent ID
  const activeSkillId = activeSkill?.id
  const targetAgentId = useMemo(() => {
    if (!activeSkill) return null
    return (
      selectedAgentId ||
      ('agents' in activeSkill
        ? (activeSkill as AggregatedSkill).agents[0]?.agentId
        : (activeSkill as InstalledSkill).agentId) ||
      null
    )
  }, [activeSkill, selectedAgentId])

  // 当选中的技能 ID 或目标 Agent 发生实质改变时，加载文件列表
  useEffect(() => {
    if (!activeSkillId || !targetAgentId) {
      setFiles([])
      return
    }

    let isMounted = true
    setLoadingFiles(true)

    void getSkillDetail(activeSkillId, targetAgentId)
      .then((detail) => {
        if (isMounted && detail) {
          setFiles(detail.files)
        }
      })
      .catch(() => {
        if (isMounted) setFiles([])
      })
      .finally(() => {
        if (isMounted) setLoadingFiles(false)
      })

    return () => {
      isMounted = false
    }
  }, [activeSkillId, targetAgentId])

  const handleSelectSkill = (skillId: string, agentId?: string) => {
    setSelectedSkillId(skillId)
    if (agentId) {
      setSelectedAgentId(agentId)
    } else {
      const agg = aggregatedSkills.find((s) => s.id === skillId)
      setSelectedAgentId(agg?.agents[0]?.agentId ?? null)
    }
  }

  const handleRevealInFolder = (path: string) => {
    void revealInFolder(path).catch((err) => {
      console.warn('定位文件夹失败:', err)
    })
  }

  return (
    <div className={`module-root${hidden ? ' is-hidden' : ''}`} aria-hidden={hidden}>
      {error && <PaneError message={error} onRetry={() => void loadData()} />}
      <div className="module-body skills-module-body">
        <SkillListSidebar
          agents={agents}
          installedSkills={installedSkills}
          aggregatedSkills={aggregatedSkills}
          selectedSkillId={selectedSkillId}
          selectedAgentId={selectedAgentId}
          viewMode={viewMode}
          loading={loading}
          onSelect={handleSelectSkill}
          onChangeViewMode={handleViewModeChange}
          onOpenGitHubModal={() => setIsGitHubModalOpen(true)}
          onOpenLocalModal={() => setIsLocalModalOpen(true)}
          onRefresh={() => void loadData()}
        />

        <SkillDetailPane
          skill={activeSkill}
          activeAgentId={selectedAgentId}
          files={files}
          loadingFiles={loadingFiles}
          onSelectAgent={(agentId) => setSelectedAgentId(agentId)}
          onInstallToOtherAgents={() => setIsSyncModalOpen(true)}
          onDeleteSkill={() => setIsDeleteModalOpen(true)}
          onRevealInFolder={handleRevealInFolder}
          onOpenGitHubModal={() => setIsGitHubModalOpen(true)}
          onOpenLocalModal={() => setIsLocalModalOpen(true)}
          onRefresh={() => void loadData()}
          onOverrideStatusChange={handleOverrideStatusChange}
        />
      </div>

      {/* 从 GitHub 安装弹窗 */}
      <InstallFromGitHubModal
        isOpen={isGitHubModalOpen}
        agents={agents}
        onClose={() => setIsGitHubModalOpen(false)}
        onInstalled={() => void loadData()}
      />

      {/* 从本地文件夹或 ZIP 导入弹窗 */}
      <ImportFromLocalModal
        isOpen={isLocalModalOpen}
        agents={agents}
        onClose={() => setIsLocalModalOpen(false)}
        onInstalled={() => void loadData()}
      />

      {/* 安装到其他 Agent 弹窗 */}
      {activeSkill && (
        <InstallToAgentsModal
          isOpen={isSyncModalOpen}
          skillName={activeSkill.id}
          sourceAgentId={
            selectedAgentId ||
            ('agents' in activeSkill
              ? (activeSkill as AggregatedSkill).agents[0]?.agentId || ''
              : (activeSkill as InstalledSkill).agentId)
          }
          installedAgentIds={installedAgentsForActiveSkill.map((a) => a.agentId)}
          allAgents={agents}
          onClose={() => setIsSyncModalOpen(false)}
          onInstalled={() => void loadData()}
        />
      )}

      {/* 删除 Skill 弹窗 */}
      {activeSkill && (
        <DeleteSkillModal
          isOpen={isDeleteModalOpen}
          skillName={activeSkill.id}
          installedAgents={installedAgentsForActiveSkill}
          defaultAgentId={selectedAgentId}
          onClose={() => setIsDeleteModalOpen(false)}
          onDeleted={() => {
            setSelectedSkillId(null)
            setSelectedAgentId(null)
            void loadData()
          }}
        />
      )}
    </div>
  )
}
