## dsh-file-actions v0.1.2

A UI pass over the menu.

- **Header = file identity**: a 28px glyph tile tinted by file kind, the file name, the workspace-relative path in monospace, and the size on the right. Files outside the workspace show their absolute path and an *Outside workspace* badge.
- **Tighter rhythm**: 30px rows, 16px icons, a hairline under the header, separators that stay visible in the light theme too.
- **Submenu**: sticky "Open with · N apps" header, the default application marked with a *Default* badge instead of a bare checkmark, and a scrollable list.
- **Keyboard**: the focused row gets a 1.5px inset ring only when the menu was opened from the keyboard, and a footer shows ↑↓ / Enter / Esc hints.
- **Motion**: a 90ms fade-and-lift on open, disabled under `prefers-reduced-motion`.
- `aria-activedescendant` now follows the focused row in both the menu and the submenu.

Verification: 30 unit tests, 30 real-app assertions on DSH 0.2.1-rc.2.
