import type { Context } from 'cordis'
import type {} from '@agentdock/plugin-workbench'

const plugin = {
  name: 'module-chats',
  inject: ['workbench'],
  apply(ctx: Context) {
    ctx.workbench.register({
      id: 'chats',
      title: '对话',
      icon: 'chats',
      order: 0
    })
  }
}

export default plugin
