import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const repository = 'jidekaixin2dian/dsh-file-actions'

export function validateOwnerPullRequest(pr, actor) {
  const [owner] = repository.split('/')
  assert.equal(actor, owner, 'Only the repository owner may use this helper')
  assert.equal(pr.author?.login, owner, 'External and bot PRs require a maintainer decision')
  assert.equal(pr.headRepositoryOwner?.login, owner, 'Fork PRs cannot opt in here')
  assert.equal(pr.headRepository?.nameWithOwner, repository, 'The PR must use a branch in this repository')
  assert.equal(pr.isCrossRepository, false, 'Fork PRs cannot opt in here')
  assert.equal(pr.baseRefName, 'main', 'Only PRs into main are supported')
  assert.equal(pr.state, 'OPEN', 'The PR must be open')
  assert.equal(pr.isDraft, false, 'A draft must be reviewed and marked ready first')
  assert.ok(Number.isSafeInteger(pr.number) && pr.number > 0, 'Invalid PR number')
  assert.match(pr.headRefOid || '', /^[0-9a-f]{40}$/, 'Missing exact PR head commit')
}

function main() {
  assert.match(process.argv[2] || '', /^[1-9]\d*$/, 'Usage: node scripts/enable-owner-auto-merge.mjs <PR number>')
  const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim()
  const actor = gh('api', 'user', '--jq', '.login')
  const pr = JSON.parse(gh('pr', 'view', process.argv[2], '--repo', repository, '--json',
    'number,author,headRepositoryOwner,headRepository,isCrossRepository,baseRefName,headRefOid,state,isDraft'))
  assert.equal(pr.number, Number(process.argv[2]))
  validateOwnerPullRequest(pr, actor)
  // Native opt-in applies to this one PR. No workflow enrolls all green PRs,
  // no review/check bypass is used, and the inspected head must still match.
  gh('pr', 'merge', String(pr.number), '--repo', repository, '--auto', '--squash', '--match-head-commit', pr.headRefOid)
  console.log(`Requested native auto-merge for owner PR #${pr.number}; required checks stay enforced.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
