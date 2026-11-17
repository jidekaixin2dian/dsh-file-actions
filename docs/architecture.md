# File Actions 代码地图

客户端保持一个经典 IIFE 脚本 `lib/client.js`，无需构建。宿主半 `lib/index.js` 只声明身份；打开文件和读取内容继续通过宿主 Remote。

```text
candidateFromEvent → locate / probe → VerifiedFileTarget
  → buildMenuModel → FileMenu → dispatch → Remote / WorkspaceFiles
```

| 单元 | 拥有的职责与状态 |
|---|---|
| 引用解析 / requiresVerification | DOM 载体优先级、路径/行号候选；猜测文本先核实再接管右键 |
| createBridge | 宿主信封与能力缺失的适配；不渲染菜单 |
| createMenuSession | 当前菜单、请求代际、选中会话与查找取消；旧操作不能影响新菜单 |
| createApplicationCache | 关联应用预取、请求去重、存储、失效和保存计时器 |
| createPreviewCache | 缩略图读取、解码、字节预算与 URL 回收 |
| FileMenu | 菜单、应用子菜单、定位和输入；将预览交给独立视图 |
| createReferencePreview / createLightbox | 各自的 DOM、键盘和销毁；关闭后把焦点交回菜单 |
| dispatch / readTextTarget / readAllBytes | 用户动作、读取确认与版本检查；分块读取用明确 kind 分支 |
| start | 连接上述单元、设置控制器与页面事件，在卸载时销毁各拥有者 |

ReferenceCandidate 描述载体中的信息，VerifiedFileTarget 携带核实后的 Session、绝对路径和版本。查找结果区分 found、missing、ambiguous、incomplete、cancelled；分块读取区分 ok、changed、too-large、failed。宿主服务返回的原始数据不作为菜单状态传播。

单测按引用、动作、菜单模型、设置与展示分组，共用 `test/helpers/client-bundle.js`。浏览器的确定性 Remote 夹具在 `host-tests/fixtures/menu.ts`；真实 WorkspaceFiles 用例在 runtime.spec.ts。验证命令见 [开发与验证](development.md)。
