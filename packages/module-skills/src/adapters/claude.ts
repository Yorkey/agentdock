import { homedir } from 'node:os'
import { join } from 'node:path'
import { BaseSkillAgentAdapter } from './base.ts'

export class ClaudeCodeSkillAdapter extends BaseSkillAgentAdapter {
  id = 'claude-code'
  label = 'Claude Code'

  constructor(customDir?: string, commonDirs?: string[]) {
    super(
      customDir || join(homedir(), '.claude', 'skills'),
      commonDirs || [join(homedir(), '.agents', 'skills')]
    )
  }
}
