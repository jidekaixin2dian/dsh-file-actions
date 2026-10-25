import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requiredChecks, validateSource, validateChecks, validateAsset } from '../scripts/release-preflight.mjs'

test('release source must be the version tag on main', () => {
  const valid = { tag: 'v0.1.15', version: '0.1.15', head: 'abc', tagged: 'abc', onMain: true,
    workflowRef: 'refs/tags/v0.1.15', workflowSha: 'abc' }
  validateSource(valid)
  for (const change of [{ tag: 'main' }, { version: '0.1.14' }, { tagged: 'other' }, { onMain: false },
    { workflowRef: 'refs/heads/main' }, { workflowSha: 'other' }]) {
    assert.throws(() => validateSource({ ...valid, ...change }))
  }
})

test('all four checks must succeed, including their latest attempt', () => {
  const checks = requiredChecks.map((name, id) => ({ name, id, head_sha: 'abc', app: { slug: 'github-actions' }, status: 'completed', conclusion: 'success' }))
  validateChecks(checks, 'abc')
  assert.throws(() => validateChecks(checks.slice(1), 'abc'))
  assert.throws(() => validateChecks(checks, 'other'))
  assert.throws(() => validateChecks([...checks, { ...checks[0], id: 99, conclusion: 'failure' }], 'abc'))
  assert.throws(() => validateChecks(checks.map(check => ({ ...check, app: { slug: 'other' } })), 'abc'))
})

test('release archive selection rejects drafts, mismatched tags, and ambiguous archives', () => {
  const release = { draft: false, tag_name: 'v0.1.15', assets: [{ name: 'dsh-file-actions.tgz' }] }
  validateAsset(release, 'v0.1.15')
  for (const change of [{ draft: true }, { tag_name: 'v0.1.14' }, { assets: [] },
    { assets: [{ name: 'dsh-file-actions.tgz' }, { name: 'extra.tgz' }] }]) {
    assert.throws(() => validateAsset({ ...release, ...change }, 'v0.1.15'))
  }
})
