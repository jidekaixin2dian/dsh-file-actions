# File Actions · 文件与链接操作

**从聊天里的文件引用，直接到你要做的操作。**

[English](README.en.md) · [插件市场](https://awesome-dsh-plugin.com/p/jidekaixin2dian/dsh-file-actions/) · [下载](https://github.com/jidekaixin2dian/dsh-file-actions/releases/latest) · [更新记录](CHANGELOG.md)

右键文件名或链接，即可打开、选择应用、定位、复制与另存。支持聊天引用、交付卡片、工具结果，以及提供文件路径的侧栏。

![文件右键菜单外观示例](assets/preview-glass.png)

| 想做什么 | 可以怎么做 |
|---|---|
| 接着编辑文件 | 用默认应用打开，或搜索「打开方式」并收藏首选应用 |
| 找到文件与引用 | 在文件管理器定位，复制绝对 / 相对路径、文件名或带行号引用 |
| 查看与带走内容 | 预览支持的文档、图片或媒体；复制文本；另存为本地文件 |
| 分享链接 | 打开网页，复制链接、链接文字或 Markdown |

## 安装与更新

需要 **DSH >=0.2.1-rc.2、Node >=24**；持续验证 DSH rc.2 / rc.3 / rc.4。

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

键盘：`Shift+F10` 打开菜单，`↑ ↓` 移动，`→` 进入子菜单，`Enter` 执行，`Esc` 关闭。`Shift+右键` 优先交给页面原有菜单。

更新由市场检查并在你点击后安装，不会静默后台升级；需要时按提示重启 DSH。

## 使用边界

- 打开与定位沿用 DSH 官方接口和路径授权；应用列表取决于系统关联。失效关联可能导致列表不可用，插件不会修改注册表。
- 复制内容仅支持 **有效 UTF-8、最大 2 MiB**。工作区外复制需要明确确认；确认不可用时取消读取。
- 另存为和浏览器预览最多读取 **64 MiB**，分块内容不一致时中止；不是文件系统原子快照。
- HTML / SVG 默认静态预览并阻止脚本和外部资源。仅在信任文件后启用脚本与联网；预览仍与 DSH 页面隔离。相对资源可能不可用，点击文件内链接属于主动导航。
- 编辑器打开暂不跳到行列位置；另存为使用浏览器下载行为。插件用于 DSH 图形 / Web 界面，终端界面不适用。

<details>
<summary>常见问题</summary>

**为什么还是原生右键菜单？** 普通文字、输入框，以及尚未验证的疑似路径保留原生菜单。明确引用验证失败时会显示原因与重试入口。

**找不到「打开方式」？** 查询为空或失败时会隐藏关联行，下次右键重试。系统损坏的应用关联需要在系统或宿主侧处理。

**预览没有打开？** 检查浏览器是否拦截了弹窗。

</details>

[开发与验证](https://github.com/jidekaixin2dian/dsh-file-actions/blob/main/docs/development.md) · [安全说明](SECURITY.md) · [反馈问题](https://github.com/jidekaixin2dian/dsh-file-actions/issues)

MIT · 独立社区插件，与 DeepSeek 官方无隶属关系。
