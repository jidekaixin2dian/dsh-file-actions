# File Actions · 文件与链接操作

[English](README.en.md)

**0.1.11** 新增 npm 分发，保留 0.1.10 的文件探测反馈、首选应用、菜单稳定性和字号适配。安装包见 [npm](https://www.npmjs.com/package/@jidekaixin2dian/dsh-file-actions) 和 [Release](https://github.com/jidekaixin2dian/dsh-file-actions/releases/latest)，修复记录见[变更记录](CHANGELOG.md)。

右键文件和链接，直接打开、定位、复制或另存。

![文件右键菜单](assets/preview-dark.png)

## 安装

先完全退出 DSH 桌面端，再执行：

```powershell
dsh plugin --profile desktop add @jidekaixin2dian/dsh-file-actions --registry=https://registry.npmjs.org
```

装完重开 DSH 生效。指定官方 npm 源可以避开镜像同步延迟；安装固定版本时，在包名后加 `@0.1.11`。

也可继续通过 GitHub Release 安装：

```powershell
dsh plugin --profile desktop add https://github.com/jidekaixin2dian/dsh-file-actions/releases/latest/download/dsh-file-actions.tgz
```

只下载 npm 安装包、不安装插件：

```powershell
npm pack @jidekaixin2dian/dsh-file-actions --registry=https://registry.npmjs.org
```

普通 `npm install` 不会把插件注册到 DSH；请使用上面的 `dsh plugin` 命令。想跟 main 源码走可以用 `dsh plugin --profile desktop add github:jidekaixin2dian/dsh-file-actions`。

卸载：dsh plugin --profile desktop remove @jidekaixin2dian/dsh-file-actions，然后重开 DSH。

## 怎么用

在聊天里右键这些位置的文件名：

- 正文里的行内代码（蓝色、点线下划线）
- 交付卡片和「已编辑」文件列表
- 工具调用行（读取、写入、编辑）里的文件链接
- 右侧文件树
- 文档预览标题
- GitHub 等网页链接（同一个蓝色样式）

![打开方式](assets/preview-open-with.png)

菜单按文件类型给不同的项：

| 文件 | 能做什么 |
|---|---|
| 代码、文本、配置、字幕 | 打开、在编辑器中打开、打开方式、在资源管理器中显示、复制路径、复制相对路径、复制文件内容、另存为 |
| Markdown、HTML、SVG、PDF、图片 | 同上，多一项「在浏览器中打开」；图片和 SVG 会在菜单里显示缩略图 |
| 视频、音频 | 打开、打开方式、在浏览器中播放（mp4 / mov / webm、mp3 / wav / flac 等）、另存为 |
| Office、压缩包、设计稿、3D、磁盘镜像、二进制 | 打开、打开方式、在资源管理器中显示、复制路径、另存为 |
| 文件夹 | 打开文件夹、在资源管理器中打开、复制路径、复制相对路径 |
| 网页链接 | 打开链接、复制链接、复制链接文字 |

「打开方式」完整保留系统关联应用，按首选、系统默认、编辑器、其他应用排序；超过 7 个会出现搜索框。

点击应用旁的 ☆，将它设为该文件类型的首选；再次点击 ★ 取消。键盘选中应用后也可用 `Shift+Enter` 设置或取消。首选仅保存在当前浏览器中，不修改系统文件关联；若应用不再可用，自动回落到可用编辑器。

明确的文件引用会先显示读取状态，失败时可重试。普通文本中猜测的路径先在悬停或聚焦时验证，验证前保留原生菜单。任何位置按住 `Shift` 再右键，都保留原生菜单。

![搜索应用](assets/preview-search.png)

图片文件的缩略图：

![图片缩略图](assets/preview-image.png)

键盘也能用：`Shift+F10` 或菜单键打开，`↑ ↓` 移动，`→` 进子菜单，`Enter` 执行，`Esc` 关闭。

壁纸 + 液态玻璃主题下也能看清（菜单底下垫了一层接近不透明的底）：

![玻璃主题下的可读性](assets/preview-glass.png)

![浅色主题](assets/preview-light.png)

## 限制

- 不是系统原生菜单；字号跟随页面根字号和页面缩放，不直接读取操作系统的文字大小设置。
- 「打开方式」只列系统已注册的关联应用；首选设置不修改系统默认关联。
- 打开编辑器目前只定位到文件；固定版本宿主的打开接口不支持传入行号和列号。
- 另存为走浏览器的下载对话框，文件名固定为原文件名。
- 复制文件内容上限 2 MiB。另存为和浏览器预览受宿主整文件读取上限约束，DSH 0.2.1-rc.2 默认 32 MiB；更大的文件请使用外部应用。
- HTML/SVG 预览在独立来源的 sandbox iframe 内运行脚本，不能读取 DSH 页面或 Cookie；相邻文件的相对资源、顶层跳转和同源存储可能不可用。
- 只支持网页版界面，终端里的 DSH 没有可右键的元素。

## 常见问题

**右键出现原生菜单？** 普通文字与输入框保留原生菜单。猜测的文件路径需要先在悬停或聚焦时验证；未验证或验证失败时也保留原生菜单。明确文件引用失败时，菜单内会显示原因与重试入口。

**「打开方式」不可用？** 菜单会分别显示正在查询、没有关联应用和查询失败；查询失败可以点击重试。

**「在浏览器中打开」没反应？** 浏览器可能拦了新窗口，允许弹窗后重试。

**怎么指定首选应用？** 在「打开方式」中点击应用旁的 ☆。未指定首选时，快捷打开行采用系统关联里能识别的编辑器；「打开文件」仍按系统默认方式打开。

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

浏览器套件把实际 client bundle 与真实 WorkspaceFiles 接到合成文件引用上，检查会话身份、预览脚本隔离、真实 3 MiB 下载及卸载行为；另用确定性 Remote 响应检查右键回退、首选应用、异步菜单稳定性、搜索和大字号。这不是完整 Desktop 或外部应用启动验收。可选完整 Web 驱动和历史断言计数见 [test-e2e](test-e2e/README.md)。

## 版本

- [最新版本](https://github.com/jidekaixin2dian/dsh-file-actions/releases/latest)
- [讨论帖](https://github.com/deepseek-ai/deepseek-harness/discussions/10576)

## 许可

MIT
