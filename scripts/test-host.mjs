import fs from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { directory, checkHost, sha } from './host.mjs'
checkHost()
fs.mkdirSync('work/results', { recursive: true })
const results = resolve(process.env.DFA_RESULTS || 'work/results')
fs.mkdirSync(results, { recursive: true })
const home = fs.mkdtempSync(resolve('work/test-home-'))
fs.mkdirSync(join(directory, 'scratch-file-actions'), { recursive: true })
const config = join('scratch-file-actions', home.split(/[\\/]/).at(-1) + '.config.ts')
fs.copyFileSync('host-tests/vitest.config.ts', join(directory, config))
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', config, '--reporter=default', '--reporter=json', `--outputFile=${join(results, 'host.json')}`, ...process.argv.slice(2)], {
  cwd: directory, encoding: 'utf8', env: { ...process.env, DFA_PROJECT: process.cwd(), DSH_HOME: home, DSH_AGENTS_HOME: join(home, 'agents'), DSH_TELEMETRY_DISABLED: '1', DEEPSEEK_API_KEY: '' },
})
const log = (result.stdout || '') + (result.stderr || '')
fs.writeFileSync(join(results, 'host.log'), log)
fs.writeFileSync(join(results, 'environment.json'), JSON.stringify({ host: sha, node: process.version, platform: process.platform, exitCode: result.status, isolatedHome: home }, null, 2))
process.stdout.write(log)
process.exitCode = result.status ?? 1
