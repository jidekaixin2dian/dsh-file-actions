import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
const hosts = {
  'rc.2': '687f282e8625c6b8d11ff58211a90524be2e4317',
  'rc.3': '1f81c047fc48fa190a683e469daa699857e9afe8',
  'rc.4': '504a01a9578abc2c6f1fb896b1dc322c9fe24f66',
}
export const version = process.env.DFA_HOST_VERSION || 'rc.4'
export const sha = hosts[version]
if (!sha) throw new Error(`Unsupported fixed host: ${version}`)
export const tag = `dsh-v0.2.1-${version}`
export const directory = resolve(process.env.DFA_HOST || `work/hosts/${version.replace('.', '')}`)
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
