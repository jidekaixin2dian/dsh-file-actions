# dsh-file-actions

Right-click a file name in the DSH chat to open it, open it with another application, reveal it in the file manager, copy its path or contents, or save it.

Aligned with the file-reference menu of Codex's desktop app. Codex's UI is not open source, so this is built to behave the same way rather than ported from it.

![File context menu](assets/preview-dark.png)

## Install

Quit the DSH desktop app completely, then run:

```powershell
dsh plugin --profile desktop add https://github.com/jidekaixin2dian/dsh-file-actions/releases/latest/download/dsh-file-actions.tgz
```

Reopen DSH and it is active. It is not on npm; the release tarball above is the only distribution.

## Using it

Right-click a file name in any of these places:

- inline code in the transcript (blue, dotted underline)
- delivery cards and the changed-files list
- file links in tool-call rows (read, write, edit)
- the right Sidebar file tree
- the document preview title

![Open with](assets/preview-open-with.png)

The rows follow the file type:

| File | What you get |
|---|---|
| Code, text, config, subtitles | open, open in editor, open with, reveal, copy path, copy relative path, copy contents, save as |
| Markdown, HTML, SVG, PDF, images | the same plus *Open in browser*; images and SVG also show a thumbnail |
| Video, audio | open, open with, play in browser (mp4 / mov / webm, mp3 / wav / flac …), save as |
| Office, archives, design files, 3D, disk images, binaries | open, open with, reveal, copy path, save as |
| Folders | open folder, reveal, copy path, copy relative path |

*Open with* lists the applications registered on your system, with their real icons; once there are more than seven, a search box appears.

![Search applications](assets/preview-search.png)

Image files get a thumbnail:

![Image thumbnail](assets/preview-image.png)

Keyboard works too: `Shift+F10` or the menu key opens the same menu, `↑ ↓` move, `→` enters the submenu, `Enter` runs, `Esc` closes.

![Light theme](assets/preview-light.png)

## Limitations

- Not a native menu, so it does not follow the system's font scaling.
- *Open with* only lists applications the system has registered for the extension.
- Save as uses the browser's download dialog with the original file name.
- Copy contents is capped at 2 MB; use save as for bigger files.
- Web UI only — the terminal build has nothing to right-click.

## FAQ

**Nothing happens on right-click?** The text under the cursor has to match a real file. Plain prose, editable fields and web links keep the system menu.

**No *Open with* row?** The system has no registered handler for that extension, or the association query has not answered yet — the menu appears first and the application rows drop in afterwards.

**Nothing opens in the browser?** The popup may have been blocked; allow popups and retry.

**The editor it picked is not the one I want?** It takes the first recognised editor among the system associations; the rest are in *Open with*.

## Releases

- [Latest release](https://github.com/jidekaixin2dian/dsh-file-actions/releases/latest)
- [Announcement](https://github.com/deepseek-ai/deepseek-harness/discussions/10576)

## License

MIT
