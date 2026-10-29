# File Actions

**Turn a file reference in your conversation into the next action.**

[中文](README.md) · [Marketplace](https://awesome-dsh-plugin.com/p/jidekaixin2dian/dsh-file-actions/) · [Download](https://github.com/jidekaixin2dian/dsh-file-actions/releases/latest) · [Changelog](CHANGELOG.md)

Right-click a file or link to open it, choose an application, reveal it, copy it or save it. Works with chat references, delivery cards, tool results and sidebars that expose file paths.

![File menu appearance example](assets/preview-glass.png)

| Your next step | Available actions |
|---|---|
| Keep editing | Open with the default app, search applications, save a preference per file type |
| Locate and reference | Reveal in the file manager; copy paths, names or references with line numbers |
| View and export | Preview supported documents and media, copy text, save a local file |
| Share a link | Open, copy the URL or text, copy as Markdown |

## Install and update

Requires **DSH >=0.2.1-rc.2 and Node >=24**. CI verifies DSH rc.2 / rc.3 / rc.4.

Search for **dsh-file-actions** in the marketplace and verify author **jidekaixin2dian**. Existing users can check updates under installed plugins. Catalog and registry mirrors may take time to refresh.

Alternatively, quit DSH completely and use the same command for installation or updates:

```powershell
dsh plugin --profile desktop add @jidekaixin2dian/dsh-file-actions --registry=https://registry.npmjs.org
```

Reopen DSH. Downloadable archives are available in [Releases](https://github.com/jidekaixin2dian/dsh-file-actions/releases/latest). A plain `npm install` does not register the plugin with DSH.

<details>
<summary>Alternative installation and removal</summary>

```powershell
dsh plugin --profile desktop add https://github.com/jidekaixin2dian/dsh-file-actions/releases/latest/download/dsh-file-actions.tgz
```

Remove, then reopen DSH:

```powershell
dsh plugin --profile desktop remove @jidekaixin2dian/dsh-file-actions
```

</details>

## Use

1. Right-click a file reference, delivery card or file tree. Explicit references open directly; guessed text paths are verified first.
2. Search **Open with** and star an application to remember it for that file type. OS defaults stay unchanged.
3. Enlarge image thumbnails or view supported documents, audio and video in the browser.
4. For text references such as `src/app.ts:42:7` or `notes.md#L42-L48`, choose **Copy referenced lines** to copy that line or range. Locations beyond the current file show an error instead of copying the whole file.

The option appears only when the reference retains its line numbers. If the host renders a link as a button exposing only its path, hidden line information cannot be recovered.

Keyboard: `Shift+F10` opens the menu, `↑ ↓` move, `→` enters a submenu, `Enter` runs and `Esc` closes. `Shift+right-click` gives the page's own handler priority.

The marketplace checks versions and installs after your click; it does not silently upgrade in the background. Restart DSH when requested.

## Boundaries

- File operations use official DSH APIs and path authorization. Application lists depend on system associations; the plugin does not repair registry entries.
- Copying contents or referenced lines requires **valid UTF-8 and a file no larger than 2 MiB**. Referenced lines are copied in full, retaining internal line endings; column numbers do not trim the text. Copies outside the workspace require explicit confirmation; unavailable confirmation cancels the read.
- Save and browser previews read up to **64 MiB** and stop on inconsistent chunks. This is not an atomic filesystem snapshot.
- HTML / SVG previews block scripts and external resources by default. Enable scripts and networking only for a trusted file; the preview remains isolated from DSH. Relative assets may not work. Clicking a document link is an explicit navigation.
- Editor actions do not jump to line/column positions. Save uses browser download behavior. The plugin needs the graphical / Web UI.

<details>
<summary>FAQ</summary>

**Why the native menu?** Plain text, editable fields and unverified guessed paths retain it. Failed explicit references show a reason and retry action.

**Where is Open with?** Empty or failed queries hide those rows; right-click again to retry. Broken associations need a system or host fix.

**No preview window?** Check whether the browser blocked a popup.

</details>

[Development and verification](https://github.com/jidekaixin2dian/dsh-file-actions/blob/main/docs/development.md) · [Security](SECURITY.md) · [Issues](https://github.com/jidekaixin2dian/dsh-file-actions/issues)

MIT · Independent community plugin, not affiliated with DeepSeek.
