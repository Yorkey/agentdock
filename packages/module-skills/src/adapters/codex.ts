import { homedir } from 'node:os'
import { join } from 'node:path'
import { BaseSkillAgentAdapter } from './base.ts'

export class CodexSkillAdapter extends BaseSkillAgentAdapter {
  id = 'codex'
  label = 'Codex'

  constructor(customDir?: string, commonDirs?: string[]) {
    super(
      customDir || join(homedir(), '.codex', 'skills'),
      commonDirs || [join(homedir(), '.agents', 'skills')]
    )
  }
}
