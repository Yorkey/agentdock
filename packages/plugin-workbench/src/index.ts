import { Service, type Context } from 'cordis'
import type { WorkbenchContribution } from '@agentdock/core'

export class WorkbenchRegistry extends Service {
  static provide = 'workbench'
  static name = 'workbench'

  items: WorkbenchContribution[]

  constructor(ctx: Context) {
    super(ctx, 'workbench')
    this.items = []
  }

  register(contribution: WorkbenchContribution) {
    return this.ctx.effect(() => {
      this.items.push(contribution)
      return () => {
        this.items = this.items.filter((item) => item !== contribution)
      }
    })
  }

  list(): WorkbenchContribution[] {
    return this.items.slice().sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
  }
}

declare module 'cordis' {
  interface Context {
    workbench: WorkbenchRegistry
  }
}

export default WorkbenchRegistry
