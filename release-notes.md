## 本次更新

菜单在壁纸 + 液态玻璃主题下也能看清。

### 修复

- 菜单底色是半透明的，液态玻璃主题会把壁纸透上来，文字对比度掉得厉害。现在菜单和提示条底下先垫一层接近不透明的底（按主题自身颜色算出来，深色主题垫深色），主题的半透明色盖在上面，玻璃感保留，字始终有底。
- 这层底在打开菜单时按当前主题重新计算，切换主题不需要重开。

### 验证

- 单测 42/42
- 宿主集成 1/1
- 打包检查通过（16 个文件，隔离安装）
- 浏览器断言 45/45（含「菜单底色不透明度 ≥ 0.85」）

安装：

```powershell
dsh plugin --profile desktop add https://github.com/jidekaixin2dian/dsh-file-actions/releases/latest/download/dsh-file-actions.tgz
```
