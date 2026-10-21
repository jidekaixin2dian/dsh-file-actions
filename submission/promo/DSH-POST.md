# dsh-file-actions：给聊天里的每个文件名加一个 Codex 风格右键菜单

在 DSH 聊天里，文件名随处可见——工具行、交付卡片、改动文件列表、右侧文件树、正文里的行内代码。以前右键它们只会弹出浏览器那套「新标签页 / 复制链接」，对本地文件毫无意义。

**dsh-file-actions** 把这些引用变成可操作的文件：右键即可打开、用关联应用打开、在资源管理器中定位、复制路径或内容、另存为。

![文件右键菜单](https://github.com/jidekaixin2dian/dsh-file-actions/raw/main/assets/preview-dark.png)

## 能做什么

| 菜单项 | 说明 |
|---|---|
| 打开文件 / 打开文件夹 | 系统默认应用 |
| 在 VS Code 中打开 | 自动识别 VS Code / Cursor / Windsurf / Zed / JetBrains 等 |
| 打开方式 ▸ | 系统关联应用，带真实图标、默认标记与**搜索框** |
| 在浏览器中打开 | HTML / SVG / PDF / 图片 / Markdown |
| 在资源管理器中显示 | 定位并选中 |
| 复制路径 / 复制相对路径 | 绝对路径 / 相对会话工作区 |
| 复制文件内容 | 文本，上限 2 MB，超限直接提示改用「另存为」 |
| 另存为… | 浏览器下载对话框 |

按类型收敛：图片/PDF 没有「复制文件内容」，Office/压缩包/二进制只有外部动作，目录没有「另存为」。

## 三个细节

**文件身份头部**：按类型着色的字形块 + 文件名 + 工作区相对路径 + 大小；工作区外的文件显示绝对路径并标「工作区外」。同名文件不会认错。

![打开方式子菜单](https://github.com/jidekaixin2dian/dsh-file-actions/raw/main/assets/preview-open-with.png)

**「打开方式」可搜索**：应用超过 7 个时出现过滤框，输入即筛，↑↓ 选、Enter 打开、Esc 先清空再关闭；列表滚动时上下边缘渐隐。

![搜索过滤](https://github.com/jidekaixin2dian/dsh-file-actions/raw/main/assets/preview-search.png)

**图片直接出缩略图**：图片和 SVG 会在头部上方显示真实预览，走同一条已授权的读取路由，并按路径缓存。

![图片缩略图](https://github.com/jidekaixin2dian/dsh-file-actions/raw/main/assets/preview-image.png)

键盘也能用：`Shift+F10` 或菜单键打开，`↑ ↓ Home End` 移动，`→` 进子菜单，`Enter` 执行，`Esc` 关闭；键盘打开时底部会显示这三条提示。

## 怎么做的（以及为什么不需要宿主半）

插件是**纯客户端**的：打开与定位走 DSH 已发布的 `session.openWorkspacePath`，关联应用走 `session.workspacePathApplications`，读内容与另存为走 `workspaceFiles.readBytes`。它不拼命令行、不直接碰文件系统，也没有放宽任何路径授权——候选路径必须先通过宿主自己的 `stat`/`list` 验证才会弹菜单。宿主半只有一个空的 `apply()`，用来挂载 bundle 行。

一个实现上的取舍：系统关联查询在 Windows 上要起 PowerShell，冷启动 2–4 秒。所以菜单是**先秒开、关联行随后补入**，并按扩展名缓存 10 分钟，而不是让右键等几秒。

## 安装

```powershell
# 先完全退出 DSH 桌面端，再安装并重开
dsh plugin --profile desktop add @jidekaixin2dian/dsh-file-actions
```

也可以直接装 release 里的 tarball：

```powershell
dsh plugin --profile desktop add https://github.com/jidekaixin2dian/dsh-file-actions/releases/latest/download/dsh-file-actions.tgz
```

## 验证与限制

- 30 个单测 + 39 项真机断言（scratch profile + headless Chromium/CDP），另有真鼠标右键的端到端脚本；截图、DOM ground truth 和验证报告都在仓库 `test-e2e/`。
- 不是原生菜单：不跟随系统菜单的字体缩放与动画。
- 「打开方式」列表来自系统文件关联，未注册关联的程序不会出现。
- 另存为走浏览器下载，不提供「另存到指定目录」的原生对话框。
- 读取允许会话工作区之外的路径（DSH 本身如此），菜单头会标注但不阻止——路径就明写在菜单上。
- 仅 Web 面；TUI 没有可右键的 DOM。

已向 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/8534) 提交收录（等待仓库满 1 天的门禁），仓库根目录的 `screenshots.json` 供市场卡片取预览图。

---

## English summary

**dsh-file-actions** turns every file reference in the DSH chat into an actionable file: right-click to open it, open it with an associated application (with search when the list is long), reveal it, copy its path or contents, or save it. It reproduces the file-reference menu of Codex's desktop app — which is closed source, so this is behaviour-compatible rather than ported.

It is a single client half: opening and revealing go through the shipped Session Remote, contents and save-as through `workspaceFiles.readBytes`. No host command, no widened path authorization — every candidate is validated by the host's own `stat`/`list` first. 30 unit tests, 39 real-app assertions on DSH 0.2.1-rc.2.

```powershell
dsh plugin --profile desktop add @jidekaixin2dian/dsh-file-actions
```
