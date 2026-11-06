# 文件与链接操作 · File Actions

**代码引用连同来源一起带走，交付文件右键就能接着用。**

[English](README.en.md) · [npm · 0.1.20](https://www.npmjs.com/package/@jidekaixin2dian/dsh-file-actions/v/0.1.20) · [插件市场](https://awesome-dsh-plugin.com/p/jidekaixin2dian/dsh-file-actions/) · [下载](https://github.com/jidekaixin2dian/dsh-file-actions/releases/latest) · [更新记录](CHANGELOG.md)

File Actions 为 DeepSeek Harness（DSH）里的文件引用提供右键菜单。从代码行号、交付卡片或图片进入，直接查看上下文、选择应用、预览、定位和复制。

| 你想接着做什么 | File Actions 提供什么 |
|---|---|
| 看清 Agent 引用的代码 | 只读预览引用行和前后文，高亮所引用的范围 |
| 把引用交给别人或另一个会话 | 一次复制引用正文、文件路径和行号 |
| 继续编辑交付文件 | 搜索「打开方式」，按文件类型记住首选应用 |
| 先看看图片和视频 | 菜单缩略图、图片放大、支持格式的浏览器预览 |

## 看上下文，也带走来源

右键 `src/app.ts:42:7` 或 `notes.md#L42-L48`，选择「查看引用上下文」。看懂以后，用「复制片段及来源」带走引用行、相对路径和行号；也可以只复制引用行。

![引用上下文与带来源复制](assets/preview-reference.jpg)

## 交付文件直接接着用

在对话文件引用或「已编辑」变更卡片上右键，选择应用、在文件管理器中定位，或复制路径、文件名与内容。「打开方式」可以搜索系统关联应用，并按文件类型收藏首选。

![交付文件菜单与首选应用](assets/preview-apps.jpg)

## 图片和视频，先看再处理

图片引用可以显示缩略图并放大查看；视频引用可以提取预览帧。需要继续查看时，用「在浏览器中打开」预览支持的文档、图片或媒体，也可另存到本地。

![图片预览和文件操作](assets/preview-media.jpg)

## 按习惯调整菜单

在「设置 → 文件操作」切换完整或精简菜单，调整引用前后文行数，管理首选应用和关联应用缓存。键盘也能操作：`Shift+F10` 打开，方向键选择，`Enter` 执行。

![文件操作设置](assets/preview-settings.jpg)

## 安装与更新

需要 **DSH >=0.2.1-rc.2、Node >=24**；持续验证 DSH rc.2 / rc.3 / rc.4 / rc.5 / 0.2.2-alpha.3 / 0.2.2-rc.1。

在插件市场搜索 **dsh-file-actions**，确认作者为 **jidekaixin2dian** 后安装；已有用户在「已安装」中检查更新。市场数据与 npm 镜像可能有同步延迟。

也可完全退出 DSH 后，使用同一条 CLI 命令安装或更新：

```powershell
dsh plugin --profile desktop add @jidekaixin2dian/dsh-file-actions --registry=https://registry.npmjs.org
```

重新打开 DSH 生效。离线包可从 [Release](https://github.com/jidekaixin2dian/dsh-file-actions/releases/latest) 下载；普通 `npm install` 不会把插件注册进 DSH。

<details>
<summary>其他安装方式与卸载</summary>

GitHub Release 安装：

```powershell
dsh plugin --profile desktop add https://github.com/jidekaixin2dian/dsh-file-actions/releases/latest/download/dsh-file-actions.tgz
```

卸载后重新打开 DSH：

```powershell
dsh plugin --profile desktop remove @jidekaixin2dian/dsh-file-actions
```

</details>

## 用起来

1. 在聊天文件名、文件卡片或文件树上右键。明确引用可直接操作，普通文字里的疑似路径会先验证。
2. 选择「打开方式」可搜索应用，点击星标保存当前文件类型的首选；不会改变系统默认应用。
3. 图片支持缩略图与放大预览；支持的文档、音视频可在浏览器中查看。
4. 对 `src/app.ts:42:7` 或 `notes.md#L42-L48` 这类文本引用，可选「复制引用行」复制该行或该段，不必复制整个文件。行号超出当前文件范围时会提示，不会改为复制全文。
5. 选择「查看引用上下文」，在只读预览中查看行号、高亮引用行及少量前后文；「复制片段及来源」一次带走相对路径、行号与引用正文，不包含额外上下文。长行或较大引用会在预览中缩短显示，复制保留完整引用行。

引用行复制和上下文预览仅在引用仍保留行号时出现；宿主若把链接渲染为仅暴露路径的按钮，插件无法恢复已隐藏的行号。

键盘：`Shift+F10` 打开菜单，`↑ ↓` 移动，`→` 进入子菜单，`Enter` 执行，`Esc` 关闭。`Shift+右键` 优先交给页面原有菜单。

更新由市场检查并在你点击后安装，不会静默后台升级；需要时按提示重启 DSH。

## 设置

在 DSH 设置侧栏打开 **文件操作**（英文界面为 **File Actions**）；页面保留完整中英文名称：

- **菜单显示**：默认完整菜单；精简模式保留常用打开、定位、引用预览、复制和另存操作。
- **引用前后文**：前后各 4 / 8 / 16 行，默认各 8 行；不改变引用正文的复制范围。
- **首选应用**：查看已设置的文件类型，单独取消或全部清除；选择新首选仍在文件的「打开方式」菜单中完成。
- **关联应用缓存**：安装或卸载应用后可清除缓存，下次右键重新查询；保留首选应用。

修改立即生效，并保留在当前浏览器或 Desktop 客户端。恢复菜单与预览默认设置不会清除首选应用；这些偏好不会修改系统默认应用，也不会自动同步到其他客户端。

页尾的「项目与反馈」可打开本插件的 GitHub 项目或新建反馈；欢迎提出问题和改进想法。

## 使用边界

- 打开与定位沿用 DSH 官方接口和路径授权；应用列表取决于系统关联。失效关联可能导致列表不可用，插件不会修改注册表。
- 复制内容与引用行仅支持 **有效 UTF-8、文件最大 2 MiB**。引用行按整行复制，保留所选行之间的原始换行；列号不裁剪内容。工作区外复制或引用上下文预览需要先明确确认；确认不可用时取消读取。
- 另存为和浏览器预览最多读取 **64 MiB**，分块内容不一致时中止；不是文件系统原子快照。
- HTML / SVG 默认静态预览并阻止脚本和外部资源。仅在信任文件后启用脚本与联网；预览仍与 DSH 页面隔离。相对资源可能不可用，点击文件内链接属于主动导航。
- 编辑器打开暂不跳到行列位置；另存为使用浏览器下载行为。插件用于 DSH 图形 / Web 界面，终端界面不适用。

<details>
<summary>常见问题</summary>

**为什么还是原生右键菜单？** 普通文字、输入框，以及尚未验证的疑似路径保留原生菜单。明确引用验证失败时会显示原因与重试入口。

**找不到「打开方式」？** 查询为空或失败时会隐藏关联行，下次右键重试。系统损坏的应用关联需要在系统或宿主侧处理。

**预览没有打开？** 检查浏览器是否拦截了弹窗。

</details>

## 下载情况

| GitHub 安装包 | npm | 合计 |
|---:|---:|---:|
| [623](https://api.github.com/repos/jidekaixin2dian/dsh-file-actions/releases?per_page=100) | [2,255](https://api.npmjs.org/downloads/point/2026-10-23:2026-11-04/@jidekaixin2dian%2Fdsh-file-actions) | **2,878 次** |

统计于 2026-11-06；npm 数据截至 2026-11-04。GitHub 仅计安装包，npm 排除 `0.0.0-stage`。下载包含重复安装与自动化请求，不是独立用户数。

[开发与验证](https://github.com/jidekaixin2dian/dsh-file-actions/blob/main/docs/development.md) · [安全说明](SECURITY.md) · [反馈问题](https://github.com/jidekaixin2dian/dsh-file-actions/issues)

MIT · 独立社区插件，与 DeepSeek 官方无隶属关系。
