## dsh-file-actions v0.1.0

Codex-style right-click file menu for DeepSeek Harness.

Right-click any file reference in the chat — inline code, delivery cards, changed-file rows, tool-call rows, the right Sidebar file tree, the document preview header:

- 打开文件 / 打开文件夹
- 在 VS Code（或检测到的编辑器）中打开
- 打开方式 ▸ 系统关联应用，带真实图标与默认勾选
- 在浏览器中打开（HTML / SVG / PDF / 图片 / Markdown）
- 在资源管理器中显示
- 复制路径 / 复制相对路径
- 复制文件内容（文本，上限 2 MB）
- 另存为…

Client-only: opening and revealing go through DSH's `session.openWorkspacePath`, associations through `session.workspacePathApplications`, contents and save-as through `workspaceFiles.readBytes`. No host command, no widened path authorization.

Verified: 17 unit tests, 21 real-app assertions (headless Chromium/CDP), and a genuine mouse right-click run (9 PASS) on DSH 0.2.1-rc.2.
