import type { ComponentType } from 'react'
import { ChatsModule } from '../modules/chats/ChatsModule'
import { SkillsModule } from '../modules/skills/SkillsModule'
import type { ModuleProps } from './types'

export type { ModuleProps } from './types'

export const MODULE_VIEWS: Record<string, ComponentType<ModuleProps>> = {
  chats: ChatsModule,
  skills: SkillsModule
}

export function UnknownModule({ hidden, contribution }: ModuleProps) {
  return (
    <div className={`module-root${hidden ? ' is-hidden' : ''}`} aria-hidden={hidden}>
      <div className="module-body">
        <aside className="sidebar" aria-label={contribution.title}>
          <div className="sidebar-brand">
            <div className="brand-mark">{contribution.title}</div>
          </div>
          <div className="sidebar-scroll">
            <div className="empty-inline">暂无内容</div>
          </div>
        </aside>
        <section className="session-pane">
          <div className="empty-hero">
            <p className="empty-title">未实现</p>
            <p className="empty-copy">模块 {contribution.id} 已注册，渲染视图尚未接入</p>
          </div>
        </section>
      </div>
    </div>
  )
}
