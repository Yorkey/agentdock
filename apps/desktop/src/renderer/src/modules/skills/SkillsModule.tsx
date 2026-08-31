import type { ModuleProps } from '../../workbench/types'

export function SkillsModule({ hidden }: ModuleProps) {
  return (
    <div className={`module-root${hidden ? ' is-hidden' : ''}`} aria-hidden={hidden}>
      <div className="module-body">
        <aside className="sidebar" aria-label="Skills">
          <div className="sidebar-brand">
            <div className="brand-mark">Skills</div>
          </div>
          <div className="sidebar-scroll">
            <div className="empty-inline">暂无 Skill</div>
          </div>
        </aside>
        <section className="session-pane">
          <div className="empty-hero">
            <p className="empty-title">Skill 管理</p>
            <p className="empty-copy">尚未实现。后续会扫描本机 Agent skill 目录，并在左侧列出可启用的 skill。</p>
          </div>
        </section>
      </div>
    </div>
  )
}
