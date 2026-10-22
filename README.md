# dsh-file-actions

[English](README.en.md)

`main` 包含 **0.1.6 待发布**修复。已发布的 0.1.5 及更早版本尚未隔离 HTML/SVG 预览与 DSH 页面；新包发布前请使用下方 GitHub 源码安装方式。见[安全说明](SECURITY.md)和[变更记录](CHANGELOG.md)。

在 DSH 聊天里右键文件名，直接打开、用别的应用打开、在资源管理器里定位、复制路径或内容、另存为。

对齐 Codex 桌面端的文件引用菜单。Codex 的界面没有开源，这里是按它的行为重做的，不是移植代码。

![文件右键菜单](assets/preview-dark.png)

## 安装

先完全退出 DSH 桌面端，再执行：

```powershell
dsh plugin --profile desktop add github:jidekaixin2dian/dsh-file-actions
```

装完重开 DSH 生效。未发布 npm。上述命令安装当前 GitHub 源码；历史安装包保留在 Release 页面。

卸载：dsh plugin --profile desktop remove @jidekaixin2dian/dsh-file-actions，然后重开 DSH。

## 怎么用

在聊天里右键这些位置的文件名：

- 正文里的行内代码（蓝色、点线下划线）
- 交付卡片和「已编辑」文件列表
- 工具调用行（读取、写入、编辑）里的文件链接
- 右侧文件树
- 文档预览标题

![打开方式](assets/preview-open-with.png)

菜单按文件类型给不同的项：

| 文件 | 能做什么 |
|---|---|
| 代码、文本、配置、字幕 | 打开、在编辑器中打开、打开方式、在资源管理器中显示、复制路径、复制相对路径、复制文件内容、另存为 |
| Markdown、HTML、SVG、PDF、图片 | 同上，多一项「在浏览器中打开」；图片和 SVG 会在菜单里显示缩略图 |
| 视频、音频 | 打开、打开方式、在浏览器中播放（mp4 / mov / webm、mp3 / wav / flac 等）、另存为 |
| Office、压缩包、设计稿、3D、磁盘镜像、二进制 | 打开、打开方式、在资源管理器中显示、复制路径、另存为 |
| 文件夹 | 打开文件夹、在资源管理器中打开、复制路径、复制相对路径 |

「打开方式」列出系统里注册的应用，带真实图标；应用超过 7 个会出现搜索框。

![搜索应用](assets/preview-search.png)

图片文件的缩略图：

![图片缩略图](assets/preview-image.png)

键盘也能用：`Shift+F10` 或菜单键打开，`↑ ↓` 移动，`→` 进子菜单，`Enter` 执行，`Esc` 关闭。

![浅色主题](assets/preview-light.png)

## 限制

- 不是系统原生菜单，不跟随系统的字体缩放。
- 「打开方式」只列系统已注册的关联应用。
- 另存为走浏览器的下载对话框，文件名固定为原文件名。
- 复制文件内容上限 2 MiB。另存为和浏览器预览受宿主整文件读取上限约束，DSH 0.2.1-rc.2 默认 32 MiB；更大的文件请使用外部应用。
- HTML/SVG 预览在独立来源的 sandbox iframe 内运行脚本，不能读取 DSH 页面或 Cookie；相邻文件的相对资源、顶层跳转和同源存储可能不可用。
- 只支持网页版界面，终端里的 DSH 没有可右键的元素。

## 常见问题

**右键没有反应？** 光标下的文字要对得上一个真实文件。普通文字、输入框里的内容、网页链接都保留系统菜单。

**菜单里没有「打开方式」？** 系统没有为这个扩展名注册关联应用，或者关联查询还没返回——菜单会先出现，应用列表随后补上。

**「在浏览器中打开」没反应？** 浏览器可能拦了新窗口，允许弹窗后重试。

**「在编辑器中打开」打开的不是我想用的编辑器？** 它取的是系统关联里第一个能认出来的编辑器，其余都在「打开方式」里。

## 开发与验证

需要 Node >=24、Git、pnpm：

```sh
npm ci --ignore-scripts
npm test
npm run setup:host
npm run test:host
npm run pack:check
```

固定宿主为 DSH **0.2.1-rc.2**（`687f282e8625c6b8d11ff58211a90524be2e4317`）。`DFA_HOST` 可复用相同 commit 的干净 checkout。Windows 使用 headless Edge；Linux 先运行 `npx --no-install playwright install --with-deps chromium`。CI 同时覆盖两种系统。插件仍无运行时依赖、无构建步骤。

浏览器套件把实际 client bundle 与真实 WorkspaceFiles 接到合成文件引用上，检查会话身份、预览脚本隔离、真实 3 MiB 下载及卸载行为；这不是完整 Desktop 或外部应用启动验收。可选完整 Web 驱动和历史断言计数见 [test-e2e](test-e2e/README.md)。

## 版本

- [最新版本](https://github.com/jidekaixin2dian/dsh-file-actions/releases/latest)
- [讨论帖](https://github.com/deepseek-ai/deepseek-harness/discussions/10576)

## 许可

MIT
