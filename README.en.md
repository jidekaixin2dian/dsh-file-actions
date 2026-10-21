# dsh-file-actions

Right-click file menu for DeepSeek Harness: open, open with, reveal, copy path, copy contents and save as on every file reference in the chat.

Aligned with the file-reference menu of OpenAI Codex's desktop app. Codex's UI is closed source (the official open-source list marks the IDE extension as *Not open source* and does not list the desktop app at all), so this plugin reproduces the observable behaviour instead of porting code.

![File context menu preview (dark)](assets/preview-dark.png)

![Open-with submenu preview](assets/preview-open-with.png)

## What it does

Right-click any blue file name — inline code, delivery cards, changed-file rows, tool-call rows, the right Sidebar file tree, the document preview header:

| Row | Action | Notes |
|---|---|---|
| Open file / Open folder | system default application | via DSH's `session.openWorkspacePath` |
| Open in <editor> | detected editor | VS Code, Cursor, Windsurf, Zed, JetBrains, … |
| Open with ▸ | submenu of OS associations | real application icons and a *default* checkmark |
| Open in browser | HTML / SVG / PDF / images / Markdown | Blob URL, no temp file |
| Reveal in File Explorer | select the file | folder variant for directories |
| Copy path | absolute path | |
| Copy relative path | relative to the session workspace | hidden when the display path is absolute |
| Copy file contents | text to clipboard | binary and >2 MB are refused |
| Save as… | browser download dialog | no disk staging |

The rows narrow by file type: images/PDF have no *Copy file contents*, Office/archive/binary files only get the external actions, directories have no *Save as*.

The header is a file-identity block: a kind-tinted glyph tile, the file name, the workspace-relative path, and the size on the right. A file outside the workspace shows its absolute path and an *Outside workspace* badge. The menu opens before the OS association query answers, and the editor / *Open with* rows drop in afterwards.

The *Open with* submenu carries a sticky count header and a **search box** (once there are more than seven applications), scrolls with faded edges, and **image / SVG files show a thumbnail preview** above the header.

Keyboard: `Shift+F10` or the menu key opens the same menu on the focused element; `↑ ↓ Home End` move, `→` opens the submenu, `←` closes it, `Enter` runs, `Esc` dismisses. A keyboard-opened menu shows those three hints in its footer.

![Application search preview](assets/preview-search.png)

![Image thumbnail preview](assets/preview-image.png)

![File context menu preview (light)](assets/preview-light.png)

## Install

```powershell
# Quit DSH completely first, then reinstall and reopen
dsh plugin --profile desktop add @jidekaixin2dian/dsh-file-actions
```

From source: `pwsh -File .\scripts\reinstall.ps1 -Profile desktop`.

## Why there is no host half

Opening, opening with and revealing reuse the shipped Session Remote (`session.openWorkspacePath`, `session.workspacePathApplications`); contents and save-as reuse `workspaceFiles.readBytes`. Those routes already validate every path against the composed filesystem, so the plugin never builds a command line and never widens an authorization. The host half only mounts the bundle row.

## How it finds the file

1. Structured carriers: `data-files-path`, `data-review-file`, a `[title]` inside `[data-presented-file]`, or any ancestor `title` (inline-code links and the document preview header carry the full path).
2. Links: `file://` or a plain-path `href`.
3. The element's own text: tool rows expose only the relative path as text, with no title.
4. A caret token at the pointer, as the inline-code fallback.

Every candidate must pass `stat` (file) or `list` (directory) before the menu appears; a candidate that fails leaves Chromium's own menu alone. Editable fields and real web links keep the native menu.

The menu appears immediately; the OS association list (a Shell query that costs 2–4 s cold on Windows) is folded in asynchronously and cached per extension.

## Known limitations

- Not a native menu: no system font scaling or menu animation.
- The association list comes from the OS, not from a DSH application catalog; an empty or failed query is not cached, so the next right-click retries.
- Save as uses the browser download dialog with the original file name.
- Copy contents is capped at 2 MB, and a file over the cap is refused from its stat size without crossing the wire.
- "Binary" means "NUL after UTF-8 decoding": UTF-16 text is refused as binary, and a NUL-free binary can be copied as mojibake.
- Reads go through the Host's `workspaceFiles`, which also serves paths **outside** the session workspace. The menu header labels them 工作区外 / Outside workspace, but does not block them — the path is on screen.
- Web surface only; the TUI has no DOM to right-click.

## Verification

- Unit tests: `node --test` (17 cases).
- Composition: `dsh --profile dfa-check --dump-config` lists the row; the boot graph carries `@jidekaixin2dian/dsh-file-actions/client.js`.
- Real app: `test-e2e/` drives a scratch profile through headless Chromium/CDP — 39 assertions (activation, readiness, four carriers, type classification, async association rows, focus into the menu, scroll keeping it open, no stacking on a second right-click, keyboard row walk plus Enter, keyboard-reachable submenu, unknown path left alone).
- Real end-to-end (`test-e2e/verify.mjs`, a genuine mouse right-click on a Sidebar file-tree row): **9 PASS / 0 FAIL** — the menu opens with 7 rows, and 复制路径 leaves the absolute path on the clipboard.
- DOM evidence: `test-e2e/ground-truth.json`, captured with real right-clicks on the running app; full report in `test-e2e/REPORT.md`.

```powershell
cd test-e2e
pwsh -File .\start-instance.ps1   # create the dfa-check profile, install, serve on 5499
node .\self-check.mjs             # 39/39
pwsh -File .\start-instance.ps1 -Stop
```

## Plugin market

Submitted to the dsh-market catalog ([awesome-dsh-plugin PR #8534](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/8534)); the entry file lives in [`submission/`](submission/).

- Repo and release: https://github.com/jidekaixin2dian/dsh-file-actions/releases/latest
- The entry's `tarball` points at `releases/latest/download/dsh-file-actions.tgz` — version-free, so it keeps resolving across releases, and it is exactly what a one-click market install downloads (verified by installing that URL into a clean profile).
- The gate wants a repository at least one day old: it was created 2026-10-21T17:17Z, so CI turns green after 2026-10-22T17:17Z (`regate.yml` re-runs every six hours).
- The market card's preview images come from [screenshots.json](screenshots.json) at the repository root, read by the market build after the entry merges.
- Announcement: [Show Your Plugins! #10576](https://github.com/deepseek-ai/deepseek-harness/discussions/10576).

## License

MIT
