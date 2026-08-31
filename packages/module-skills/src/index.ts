import type { Context } from 'cordis'
import type {} from '@chats/plugin-workbench'

// TODO: 扫描本机 Agent skill 目录、安装与启用。当前只注册工作台入口。
const plugin = {
  name: 'module-skills',
  inject: ['workbench'],
  apply(ctx: Context) {
    ctx.workbench.register({
      id: 'skills',
      title: 'Skills',
      icon: 'skills',
      order: 10
    })
  }
}

export default plugin
