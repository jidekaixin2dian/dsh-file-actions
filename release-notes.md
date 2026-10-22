## 本次更新

修掉与 Toolgate 同时安装时的启动报错，并把 GitHub 链接也接进同一个右键菜单。

### 新增

- GitHub 等网页链接右键给「打开链接 / 复制链接 / 复制链接文字」，和文件引用是同一套菜单。

### 修复

- 两个插件同时安装时 DSH 启动失败：它们的浏览器脚本都在顶层声明 `const factory`，合并加载时重名冲突。现在各自隔离作用域，并加了重复加载的回归测试。
- 一并带上 0.1.6 的未发布修复：HTML/SVG 预览放进独立来源的 sandbox 帧；资源地址优先于子元素提示；切换点击时取消过期菜单；缩略图按会话/路径/版本缓存并在卸载时回收。

### 验证

- 单测 42/42
- 宿主集成 1/1（真实 WorkspaceFiles + 浏览器）
- 打包检查通过（15 个文件，隔离安装）
- 浏览器断言 44/44（DSH 0.2.1-rc.2）

安装：

```powershell
dsh plugin --profile desktop add https://github.com/jidekaixin2dian/dsh-file-actions/releases/latest/download/dsh-file-actions.tgz
```
