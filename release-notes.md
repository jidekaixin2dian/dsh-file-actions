## 本次更新

菜单图标整套重画，Shift + 右键不再是死路。

### 变化

- 所有菜单图标统一到 24 格、同一描边粗细、圆角端点：打开、编辑器、打开方式、资源管理器、复制路径、复制文件名、复制文件内容、另存为，以及网页链接的打开链接、复制链接、复制链接文字、复制为 Markdown。
- 头部文件块改成渐变底 + 内描边，图标略放大，浅色与深色主题下都更清楚。
- Shift + 右键先交给页面处理；DSH 桌面端本身没有系统右键菜单，没人接管时回退到插件菜单。之前按下去什么都不出，现在不会了。

### 验证

- 单测 51/51（含图标齐全性、链接菜单字形断言）
- 宿主/浏览器检查 5/5（含 Shift 回退与「页面已处理则不接管」两条）
- 真机浏览器断言 52/52
- 19 文件打包白名单与隔离安装通过

安装：

```powershell
dsh plugin --profile desktop add https://github.com/jidekaixin2dian/dsh-file-actions/releases/latest/download/dsh-file-actions.tgz
```
