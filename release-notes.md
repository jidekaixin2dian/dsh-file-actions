# 历史发布说明：v0.1.5

本文保留当时的发布记录。当前 main 的待发布修复见 [CHANGELOG.md](CHANGELOG.md)。原记录的 41 项来自隔离 DSH Web + headless Chromium 的合成引用检查，不是完整 Desktop 或所有外部应用动作验收；旧附件未被替换，仍缺少预览隔离修复。

## 本次更新

修掉「蓝色文件名右键没反应」的两类情况，并补齐文件类型。

### 修复

- 聊天、文件树、交付表里的文件链接是 `dsh-resource://` 地址，之前被当成普通网页链接，右键只弹浏览器菜单。现在能解析出文件路径。
- 交付表格里的文件名常带图标前缀（`📄发布文案.md`），整段文字对不上路径，右键同样没反应。现在会先去掉前缀再识别。

### 新增

- 字幕按文本处理：`.srt`、`.ass`、`.ssa`、`.vtt`、`.lrc`、`.sbv` 可以复制内容。
- 视频和音频单独处理：`.mp4`、`.mov`、`.webm`、`.mp3`、`.wav`、`.flac` 等可以在浏览器里播放；`.mkv`、`.avi` 等只给外部动作。
- 扩展名表补齐：notebook、LaTeX、着色器、设计稿（`.psd`、`.ai`、`.fig`、`.sketch`、`.blend`、`.fbx`、`.glb`）、磁盘镜像、字体、相机 RAW 等，不再被忽略。

### 验证

- 单测 34/34
- 真机 41/41（DSH 0.2.1-rc.2，headless Chromium）

安装：

```powershell
dsh plugin --profile desktop add https://github.com/jidekaixin2dian/dsh-file-actions/releases/latest/download/dsh-file-actions.tgz
```
