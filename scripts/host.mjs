import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
export const sha = '687f282e8625c6b8d11ff58211a90524be2e4317'
export const tag = 'dsh-v0.2.1-rc.2'
export const directory = resolve(process.env.DFA_HOST || 'work/host')
export function run(program, args, cwd = process.cwd()) {
  const result = spawnSync(program, args, { cwd, stdio: 'inherit', env: { ...process.env, CI: 'true' } })
  if (result.status !== 0) throw new Error(`${program} failed (${result.status})`)
}
export function checkHost() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' })
  if (result.status || result.stdout.trim() !== sha) throw new Error('Run npm run setup:host for the pinned official source')
  run('git', ['diff', '--exit-code'], directory)
  run('git', ['diff', '--cached', '--exit-code'], directory)
}
