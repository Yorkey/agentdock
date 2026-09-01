import { useCallback, useEffect, useState } from 'react'
import type { WorkbenchContribution } from '@agentdock/core'
import { listActivities } from './api'
import { HoverTipProvider } from './components/HoverTip'
import { applyTheme, loadThemePref, nextThemePref, saveThemePref } from './lib/theme'
import { ActivityBar } from './workbench/ActivityBar'
import { FALLBACK_ACTIVITIES, loadActivityId, saveActivityId } from './workbench/activity'
import { useWorkbenchShortcuts } from './workbench/shortcuts'
import { MODULE_VIEWS, UnknownModule } from './workbench/views'

export default function App() {
  const [activities, setActivities] = useState<WorkbenchContribution[]>(FALLBACK_ACTIVITIES)
  const [activityId, setActivityId] = useState(loadActivityId)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [theme, setTheme] = useState(loadThemePref)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    let cancelled = false
    void listActivities()
      .then((rows) => {
        if (cancelled || rows.length === 0) return
        setActivities(rows)
        setActivityId((current) => {
          if (rows.some((row) => row.id === current)) return current
          const next = rows[0]?.id ?? 'chats'
          saveActivityId(next)
          return next
        })
      })
      .catch(() => {
        // preload 不可用时沿用内置列表
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selectActivity = (id: string) => {
    if (id === activityId) {
      setSidebarOpen((open) => !open)
      return
    }
    setActivityId(id)
    setSidebarOpen(true)
    saveActivityId(id)
  }

  const cycleTheme = () => {
    setTheme((current) => {
      const next = nextThemePref(current)
      saveThemePref(next)
      return next
    })
  }

  const selectByIndex = useCallback(
    (index: number) => {
      const target = activities[index]
      if (!target || target.id === activityId) return
      setActivityId(target.id)
      setSidebarOpen(true)
      saveActivityId(target.id)
    },
    [activities, activityId]
  )

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((open) => !open)
  }, [])

  useWorkbenchShortcuts({ onSelectIndex: selectByIndex, onToggleSidebar: toggleSidebar })

  return (
    <HoverTipProvider>
      <div className="app">
        <div className={sidebarOpen ? 'shell' : 'shell is-sidebar-collapsed'}>
          <ActivityBar
            activities={activities}
            activeId={activityId}
            theme={theme}
            onSelect={selectActivity}
            onCycleTheme={cycleTheme}
          />
          <div className="workbench-body">
            {activities.map((item) => {
              const View = MODULE_VIEWS[item.id] ?? UnknownModule
              return <View key={item.id} hidden={item.id !== activityId} contribution={item} />
            })}
          </div>
        </div>
      </div>
    </HoverTipProvider>
  )
}
