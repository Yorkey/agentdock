import { useEffect, useState } from 'react'
import type { WorkbenchContribution } from '@chats/core'
import { listActivities } from './api'
import { ActivityBar } from './workbench/ActivityBar'
import { FALLBACK_ACTIVITIES, loadActivityId, saveActivityId } from './workbench/activity'
import { MODULE_VIEWS, UnknownModule } from './workbench/views'

export default function App() {
  const [activities, setActivities] = useState<WorkbenchContribution[]>(FALLBACK_ACTIVITIES)
  const [activityId, setActivityId] = useState(loadActivityId)
  const [sidebarOpen, setSidebarOpen] = useState(true)

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

  return (
    <div className="app">
      <div className={sidebarOpen ? 'shell' : 'shell is-sidebar-collapsed'}>
        <ActivityBar activities={activities} activeId={activityId} onSelect={selectActivity} />
        <div className="workbench-body">
          {activities.map((item) => {
            const View = MODULE_VIEWS[item.id] ?? UnknownModule
            return <View key={item.id} hidden={item.id !== activityId} contribution={item} />
          })}
        </div>
      </div>
    </div>
  )
}
