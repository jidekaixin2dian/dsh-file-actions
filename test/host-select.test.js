// scripts/host.mjs resolves the pinned host at import time, so every case
// re-imports it with a cache-busting query to get a fresh module instance.
import { test } from 'node:test'
import assert from 'node:assert/strict'

test('an unsupported DFA_HOST_VERSION names the requested host', async () => {
  process.env.DFA_HOST_VERSION = '0.2.1-rc.9'
  process.env.DFA_HOST = 'work/hosts/does-not-exist'
  await assert.rejects(import(`../scripts/host.mjs?case=unsupported`), /Unsupported fixed host: 0\.2\.1-rc\.9/)
})

test('a missing host checkout asks for setup:host instead of crashing', async () => {
  delete process.env.DFA_HOST_VERSION
  process.env.DFA_HOST = 'work/hosts/does-not-exist'
  const host = await import(`../scripts/host.mjs?case=missing`)
  assert.equal(host.version, 'rc.5')
  assert.equal(host.tag, 'dsh-v0.2.1-rc.5')
  assert.throws(() => host.checkHost(), /Run npm run setup:host/)
})
