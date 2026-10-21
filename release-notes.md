## dsh-file-actions v0.1.1

A review pass over v0.1.0. The visible fixes:

- **Copy file contents works again.** v0.1.0 asked the Host for 2 MB + 1 byte, which its own window cap rejects — every copy failed with "read failed". It now asks for exactly the cap and reads `eof` to detect an oversized file, and refuses from the stat size before anything crosses the wire.
- **The menu no longer closes itself** when it takes focus (a descendant `blur` reached the window capture listener), and it **follows the anchor row when the transcript scrolls** instead of vanishing mid-stream.
- **A right-click on the menu no longer stacks a second menu**, and prose that merely contains a slash (`2026/10/22 12:00`, `2/3 files`) no longer swallows Chromium's own menu.
- **Extension-less repository files are text again**: Dockerfile, Makefile, LICENSE, `.gitignore`, `.env.local` get "copy file contents".
- **Keyboard reaches the submenu**: ArrowRight opens 打开方式 with a focused row; ArrowUp/Down, Enter and Escape stay inside it.
- **Open in browser** opens the window inside the click gesture, so the popup blocker leaves it alone.
- Paths outside the session workspace are labelled 工作区外 / Outside workspace in the header.
- Empty association answers are no longer cached, so a missing 打开方式 retries on the next right-click.

Verification: 28 unit tests, 27 real-app assertions on DSH 0.2.1-rc.2 (headless Chromium/CDP), plus a genuine mouse right-click run.
