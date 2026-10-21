## dsh-file-actions v0.1.3

Three things the menu was missing once the list got long:

- **Search in "Open with"** — the association submenu grows a filter box as soon as it has more than seven applications. Type to narrow, ↑↓ to move, Enter to launch, Escape clears the filter before it closes the submenu.
- **Scroll fades** — a clipped list now fades at its edges instead of stopping mid-row, so it reads as scrollable.
- **Image thumbnails** — right-click an image (or an SVG) and the menu shows a real preview above the file header, loaded through the same `workspaceFiles.readBytes` route and cached per path.

Also in this release: `screenshots.json` at the repository root, which is what the dsh-market card actually reads for its preview strip.

Verification: 30 unit tests, 39 real-app assertions on DSH 0.2.1-rc.2.
