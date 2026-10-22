import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const npm = process.env.npm_execpath
assert.ok(npm?.endsWith('npm-cli.js'), 'Use npm run pack:check')
const output = path.resolve('work/packages')
fs.mkdirSync(output, { recursive: true })
const result = spawnSync(process.execPath, [npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', output], { encoding: 'utf8' })
assert.equal(result.status, 0, result.stderr)
const parsed = JSON.parse(result.stdout)
const packed = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0]
const required = ['package.json','lib/index.js','lib/client.js','cordis.patch.yml','icon.svg','README.md','README.en.md','CHANGELOG.md','LICENSE','SECURITY.md','locale/en.json','locale/zh.json']
for (const file of required) assert.ok(packed.files.some(entry => entry.path === file), file)
assert.ok(packed.files.every(entry => required.includes(entry.path) || /^assets\/preview-[\w-]+\.png$/.test(entry.path)))
const archive = path.join(output, packed.filename)
fs.writeFileSync(path.join(output, 'audit.json'), JSON.stringify({ filename: packed.filename, bytes: packed.size,
  sha256: createHash('sha256').update(fs.readFileSync(archive)).digest('hex'), files: packed.files.map(entry => entry.path) }, null, 2) + '\n')
const profile = fs.mkdtempSync(path.join(output, 'install-'))
fs.writeFileSync(path.join(profile, 'package.json'), '{"private":true}')
const installed = spawnSync(process.execPath, [npm, 'install', '--omit=dev', '--ignore-scripts', '--registry=https://registry.npmjs.org', archive], { cwd: profile, encoding: 'utf8' })
assert.equal(installed.status, 0, installed.stderr)
const directory = path.join(profile, 'node_modules/@jidekaixin2dian/dsh-file-actions')
for (const entry of packed.files) assert.deepEqual(fs.readFileSync(path.join(directory, entry.path)), fs.readFileSync(entry.path))
assert.equal(fs.existsSync(path.join(profile, 'node_modules/@deepseek-ai')), false)
console.log(`Whitelist and real isolated archive install passed (${packed.files.length} files).`)
