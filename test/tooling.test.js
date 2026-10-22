import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const windows = process.platform === 'win32'
const run = (...args) => spawnSync('pwsh', ['-NoProfile', ...args], { encoding: 'utf8', windowsHide: true, timeout: 15000 })
const literal = value => "'" + value.replaceAll("'", "''") + "'"

test('installer CheckOnly does not mutate a profile and launcher refuses the production home', { skip: !windows }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dfa-tooling-'))
  try {
    const check = run('-File', path.join(project, 'scripts/reinstall.ps1'), '-CheckOnly', '-DshCli', process.execPath, '-DshHome', directory)
    assert.equal(check.status, 0, check.stderr)
    assert.equal(fs.readdirSync(directory).length, 0)
    const refused = run('-File', path.join(project, 'test-e2e/launch.ps1'), '-CheckOnly', '-DshCli', process.execPath,
      '-DshHome', path.join(process.env.USERPROFILE, '.dsh'))
    assert.notEqual(refused.status, 0)
    assert.match(refused.stderr, /separate DFA_HOME/)
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('scratch Stop rejects a matching PID/time with an unrelated command line', { skip: !windows }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dfa-owner-'))
  fs.copyFileSync(path.join(project, 'test-e2e/launch.ps1'), path.join(directory, 'launch.ps1'))
  fs.mkdirSync(path.join(directory, 'run'))
  try {
    const script = `
      $ErrorActionPreference = 'Stop'
      $child = Start-Process -FilePath ${literal(process.execPath)} -ArgumentList @('-e','"setTimeout(()=>{},30000)"') -WindowStyle Hidden -PassThru
      try {
        @{launcherPid=$child.Id; startTicks=$child.StartTime.ToUniversalTime().Ticks.ToString()} | ConvertTo-Json | Set-Content -LiteralPath ${literal(path.join(directory, 'run/instance.json'))}
        $refused = $false
        try { & ${literal(path.join(directory, 'launch.ps1'))} -Stop } catch { $refused = $_.Exception.Message -like '*identity changed*' }
        $child.Refresh()
        if (-not $refused -or $child.HasExited) { throw 'Unrelated process was not preserved' }
      } finally { if (-not $child.HasExited) { Stop-Process -Id $child.Id -Force } }
    `
    const result = run('-Command', script)
    assert.equal(result.status, 0, result.stderr)
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})
