## 本次更新

插件面板里的名字和简介改成中文。

### 修复

- 插件卡片和详情页之前显示的是 package.json 里的英文描述。现在提供 `locale/zh.json` 与 `locale/en.json` 的 `meta.title` / `meta.description`，中文界面显示「文件右键菜单」和中文简介，英文界面显示英文。
- 打包白名单与隔离安装检查同步覆盖新增的 locale 文件。

### 验证

- 单测 42/42
- 打包检查通过（18 个文件，含 locale）
- 宿主集成 1/1

安装：

```powershell
dsh plugin --profile desktop add https://github.com/jidekaixin2dian/dsh-file-actions/releases/latest/download/dsh-file-actions.tgz
```
