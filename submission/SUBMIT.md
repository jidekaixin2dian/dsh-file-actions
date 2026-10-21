# Market submission — dsh-file-actions

- Plugin repo: https://github.com/jidekaixin2dian/dsh-file-actions
- Entry file: [`jidekaixin2dian__dsh-file-actions.yml`](jidekaixin2dian__dsh-file-actions.yml)
- Target list: https://github.com/awesome-dsh-plugin/awesome-dsh-plugin
- Fork: https://github.com/jidekaixin2dian/awesome-dsh-plugin (`add-dsh-file-actions`)
- Release: https://github.com/jidekaixin2dian/dsh-file-actions/releases/tag/v0.1.0 — asset `dsh-file-actions.tgz` (234,201 B, sha256 `68732a40…`)

## Gate

- Repo created `2026-10-21T17:17:41Z`; the one-day age gate opens `2026-10-22T17:17:41Z` = **2026-10-23 01:17 (+08)**.
- CI (`scripts/check-submission.mjs`) checks: `dsh.bundle` in `package.json`, repo age ≥ 1 day, repo exists and is not archived, not the harness itself, at most 3 entries per PR.
- Opening the PR before the gate is not fatal: the age failure is reported explicitly and `regate.yml` re-runs it roughly every 6 h, so it clears itself.

## Pre-flight (all true)

- [x] `package.json` declares `dsh.bundle.patch`; root `cordis.patch.yml` exists and inserts the row.
- [x] Repo topic `dsh-plugin` present (plus `deepseek-harness`, `context-menu`, `dsh`).
- [x] Entry filename `jidekaixin2dian__dsh-file-actions.yml`; `url` and `name` match the repo exactly.
- [x] `category: ui` — the plugin adds a UI affordance to existing surfaces; it ships no tools, models or data.
- [x] `description.en` is one sentence, ends with a period, contains no `: ` and no superlatives; `zh` provided and equivalent.
- [x] `tarball:` asset is version-free (`dsh-file-actions.tgz`) behind `releases/latest/download/`, so it keeps resolving after the next release.
- [x] Real code, real tests (17 unit + 21 real-app assertions + a genuine right-click run).
- [x] No `npm:` key in the entry (rejected; npm mapping is read from the registry).

## Steps

```powershell
$env:Path += ";C:\Program Files\GitHub CLI"
cd C:\Users\Aether\Documents\deepseek-harness\default-workspace\work\refs\awesome-dsh-plugin
git fetch origin
git checkout -B add-dsh-file-actions origin/main
Copy-Item D:\dsh\plugin\dsh-file-actions\submission\jidekaixin2dian__dsh-file-actions.yml `
  data\plugins\jidekaixin2dian__dsh-file-actions.yml -Force
git add data/plugins/jidekaixin2dian__dsh-file-actions.yml
git commit -m "Add jidekaixin2dian/dsh-file-actions"
git push --force-with-lease fork add-dsh-file-actions
gh pr create --repo awesome-dsh-plugin/awesome-dsh-plugin `
  --head jidekaixin2dian:add-dsh-file-actions --base main `
  --title "Add jidekaixin2dian/dsh-file-actions" `
  --body-file D:\dsh\plugin\dsh-file-actions\submission\PR-BODY.md
```

## After the PR

- Watch `PR check` (fork-safe) and `Submission gate` (runs via `workflow_run` with a token). Green CI is the precondition; a maintainer still reads the repo.
- If the only failure is repo age, do nothing: the gate re-runs itself and clears about 6 h after the repo turns one day old.
- Answer maintainer questions as PR comments and push fixes to the same branch (no new PR).
- Listing does not depend on npm; if they ask for it, publish `@jidekaixin2dian/dsh-file-actions` after `npm login`.
