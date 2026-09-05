import { homedir } from 'node:os'
import { join } from 'node:path'
import { BaseSkillAgentAdapter } from './base.ts'

export class CommonSkillAdapter extends BaseSkillAgentAdapter {
  id = 'common'
  label = '通用'
  icon = 'layers'

  constructor(customDir?: string) {
    super(customDir || join(homedir(), '.agents', 'skills'), [])
  }
}
