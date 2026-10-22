import fs from 'node:fs'
import { directory, tag, run, checkHost } from './host.mjs'
fs.mkdirSync('work', { recursive: true })
if (!fs.existsSync(directory)) run('git', ['clone', '--filter=blob:none', '--depth', '1', '--branch', tag, 'https://github.com/deepseek-ai/deepseek-harness.git', directory])
checkHost()
const filters = ['@deepseek-ai/dsh-root', '@deepseek-ai/dsh-api-workspace-files...', '@deepseek-ai/dsh-fs-local...']
const args = ['install', '--frozen-lockfile', '--ignore-scripts', ...filters.flatMap(name => ['--filter', name])]
if (process.platform === 'win32') run(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'pnpm.cmd', ...args], directory)
else run('pnpm', args, directory)
