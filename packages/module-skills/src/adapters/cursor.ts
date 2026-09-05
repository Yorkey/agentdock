import { homedir } from 'node:os'
import { join } from 'node:path'
import { BaseSkillAgentAdapter } from './base.ts'

export class CursorSkillAdapter extends BaseSkillAgentAdapter {
  id = 'cursor'
  label = 'Cursor'

  constructor(customDir?: string, commonDirs?: string[]) {
    super(
      customDir || join(homedir(), '.cursor', 'skills'),
      commonDirs || [join(homedir(), '.agents', 'skills')]
    )
  }
}
