import { dirname } from 'node:path'
import { homedir } from 'node:os'
import { realpath, stat } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { resolveLocalPath } from './local-path.ts'

export { resolveLocalPath }

export interface RevealDeps {
  home: string
  realpath: (path: string) => Promise<string>
  stat: (path: string) => Promise<unknown>
  reveal: (path: string) => Promise<void>
}

const defaultDeps = (): RevealDeps => ({
  home: homedir(),
  realpath,
  stat,
  reveal: revealWithSystem
})

export async function revealInFolder(
  rawPath: string,
  workspace?: string,
  deps: RevealDeps = defaultDeps()
): Promise<void> {
  const target = resolveLocalPath(rawPath, workspace, deps.home)
  const existing = await nearestExisting(target, deps.stat)
  const real = await deps.realpath(existing).catch(() => existing)
  await deps.reveal(real)
}

export async function nearestExisting(
  path: string,
  statFn: (path: string) => Promise<unknown>
): Promise<string> {
  let current = path
  for (let i = 0; i < 64; i += 1) {
    try {
      await statFn(current)
      return current
    } catch {
      const parent = dirname(current)
      if (parent === current) break
      current = parent
    }
  }
  throw new Error('路径不存在')
}

function revealWithSystem(fullPath: string): Promise<void> {
  if (process.platform === 'darwin') return run('open', ['-R', fullPath])
  if (process.platform === 'win32') return run('explorer', [`/select,${fullPath}`], { ignoreExit: true })
  return run('xdg-open', [dirname(fullPath)], { ignoreExit: true })
}

function run(command: string, args: string[], options?: { ignoreExit?: boolean }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (options?.ignoreExit || code === 0) resolve()
      else reject(new Error('无法打开该路径'))
    })
  })
}
