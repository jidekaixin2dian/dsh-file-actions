import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateOwnerPullRequest } from '../scripts/enable-owner-auto-merge.mjs'

const owner = 'jidekaixin2dian'
const valid = () => ({ number: 8, author: { login: owner }, headRepositoryOwner: { login: owner },
  headRepository: { name: 'dsh-file-actions', nameWithOwner: 'jidekaixin2dian/dsh-file-actions' },
  isCrossRepository: false, baseRefName: 'main', state: 'OPEN',
  isDraft: false, headRefOid: 'a'.repeat(40) })

test('explicit auto-merge opt-in accepts the owner PR in the original repository', () => {
  validateOwnerPullRequest(valid(), owner)
})

test('external and bot PRs cannot opt in even when their checks would pass', () => {
  for (const author of ['contributor', 'dependabot[bot]']) {
    assert.throws(() => validateOwnerPullRequest({ ...valid(), author: { login: author } }, owner))
  }
  assert.throws(() => validateOwnerPullRequest(valid(), 'contributor'))
})

test('fork and other-repository branches cannot opt in', () => {
  for (const change of [{ headRepositoryOwner: { login: 'contributor' } },
    { headRepository: { name: 'another-repo', nameWithOwner: 'jidekaixin2dian/another-repo' } },
    { isCrossRepository: true }]) {
    assert.throws(() => validateOwnerPullRequest({ ...valid(), ...change }, owner))
  }
})

test('draft, closed, wrong-base and missing-head PRs fail closed', () => {
  for (const change of [{ isDraft: true }, { state: 'CLOSED' }, { baseRefName: 'release' },
    { headRefOid: '' }, { number: 0 }]) {
    assert.throws(() => validateOwnerPullRequest({ ...valid(), ...change }, owner))
  }
})
