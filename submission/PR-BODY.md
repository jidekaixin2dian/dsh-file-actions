## What this adds

`dsh-file-actions` — a right-click menu for every file reference in the chat.

Right-clicking a file name (inline code, delivery card, changed-file row, tool-call row, the right Sidebar file tree, or the document preview header) replaces Chromium's link menu with one that acts on the file:

- Open / open folder with the system default application
- Open in the detected editor (VS Code, Cursor, Windsurf, Zed, JetBrains, …)
- Open with ▸ — the OS associations, with their real icons and the default marked
- Open in the browser for HTML / SVG / PDF / images / Markdown
- Reveal in the file manager
- Copy path / copy relative path
- Copy file contents (text, capped at 2 MB)
- Save as…

Rows narrow by file type: images and PDFs have no copy-contents, Office/archive/binary files only get the external actions, folders have no save-as. `Shift+F10` opens the same menu from the keyboard.

## How it is built

A single client half. Opening and revealing go through the shipped Session Remote (`session.openWorkspacePath`, `session.workspacePathApplications`); contents and save-as go through `workspaceFiles.readBytes`. The plugin builds no command line and widens no path authorization — every candidate path is validated by the host's own `stat`/`list` before the menu appears, and a path that fails validation opens no menu at all (a structured carrier reports "file not found"; a bare text guess stays silent, which is why text candidates must look like a real file). `package.json` declares `dsh.bundle` plus a root `cordis.patch.yml`; the host half is an empty `apply()` that only mounts the bundle row.

## Checks run before submitting

- 30 unit tests (`node --test`) over path parsing, file classification, menu generation, the Remote result envelope, the copy-window cap and the workspace containment check.
- 30 assertions against a real DSH instance (0.2.1-rc.2) driven through headless Chromium/CDP on a scratch profile: activation, readiness, four detection carriers, type classification, the asynchronous association rows, the copy-path toast, and an unknown path opening no menu.
- A genuine mouse right-click run (`test-e2e/verify.mjs`): menu opens with 7 rows, 复制路径 puts the absolute path on the clipboard.
- The keyboard path (Shift+F10, arrow keys, Enter, Escape) and the open-with submenu are covered by the same driver.
- `dsh --profile <scratch> --dump-config` composes the row; the boot graph serves `@jidekaixin2dian/dsh-file-actions/client.js`.

The release is v0.1.2 — a review pass fixed a copy-contents regression, the menu closing on focus/scroll and extension-less files being treated as binary, and a UI pass gave the menu a file-identity header, tighter rows and keyboard hints.

The repo declares `dsh.bundle.patch`, carries the `dsh-plugin` topic, and the release asset `dsh-file-actions.tgz` is version-free so `releases/latest/download/` keeps resolving.

One note on timing: the repository was created 2026-10-21T17:17Z, so the one-day age gate opens 2026-10-22T17:17Z. Happy to let the gate re-run rather than have it reviewed early.
