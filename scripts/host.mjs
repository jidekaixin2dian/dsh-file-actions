import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
const hosts = {
  'rc.2': { tag: 'dsh-v0.2.1-rc.2', sha: '687f282e8625c6b8d11ff58211a90524be2e4317', dir: 'rc2' },
  'rc.3': { tag: 'dsh-v0.2.1-rc.3', sha: '1f81c047fc48fa190a683e469daa699857e9afe8', dir: 'rc3' },
  'rc.4': { tag: 'dsh-v0.2.1-rc.4', sha: '504a01a9578abc2c6f1fb896b1dc322c9fe24f66', dir: 'rc4' },
  'rc.5': { tag: 'dsh-v0.2.1-rc.5', sha: 'b830ec950faba0a46dda564be3e2d854afed94f1', dir: 'rc5' },
  // 0.2.2-alpha.x moved off the 0.2.1 tag scheme. Compared with rc.5 its
  // plugin-bound packages are source-identical (dsh-v0.2.1-rc.5...alpha.3 only
  // touches .agents notes), so the same filters and specs keep applying.
  '0.2.2-alpha.3': { tag: 'dsh-v0.2.2-alpha.3', sha: '05b1cae8db6e674c5685101494d4eec24652424a', dir: '022-alpha3' },
}
export const version = process.env.DFA_HOST_VERSION || 'rc.5'
const selected = hosts[version]
if (!selected) throw new Error(`Unsupported fixed host: ${version}`)
export const sha = selected.sha
export const tag = selected.tag
export const directory = resolve(process.env.DFA_HOST || `work/hosts/${selected.dir}`)
export function run(program, args, cwd = process.cwd()) {
  const result = spawnSync(program, args, { cwd, stdio: 'inherit', env: { ...process.env, CI: 'true' } })
  if (result.status !== 0) throw new Error(`${program} failed (${result.status})`)
}
export function checkHost() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' })
  // A missing checkout fails to spawn at all: report the setup step, not a
  // TypeError about reading properties of undefined.
  if (result.error || result.status || result.stdout?.trim() !== sha) {
    throw new Error('Run npm run setup:host for the pinned official source')
  }
  run('git', ['diff', '--exit-code'], directory)
  run('git', ['diff', '--cached', '--exit-code'], directory)
}
