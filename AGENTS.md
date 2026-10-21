# dsh-file-actions

给 DeepSeek Harness（DSH）桌面端写的社区插件：聊天里右键蓝色文件名 → 打开 / 打开方式 / 资源管理器 / 复制路径 / 复制内容 / 另存为，对齐 Codex 的文件引用菜单。
包名 `@jidekaixin2dian/dsh-file-actions`，当前 `0.1.0`。

**开工前先读 [`HANDOFF.md`](HANDOFF.md)**：架构、开发循环、验证现状、待办都在里面。

## 硬约束（会踩坑的那种）

- **纯客户端插件。** 全部逻辑在 `lib/client.js`（浏览器 bundle），`lib/index.js` 是空宿主半，只为挂 bundle 行。不要把动作改成宿主命令：打开/打开方式/资源管理器必须走 Session Remote，读写内容必须走 `workspaceFiles`，否则绕过 DSH 的路径授权。
- **profile 里装的是实目录副本，不是软链。** 改源码必须退出 DSH → 重装 → 重开。
- **桌面端没有 `Ctrl+R`。** 换 client bundle 只能重开应用（或托盘重启）。
- **不要在 App 运行时改 desktop profile。** 宿主独占写 profile 的 `package.json`；验证请用 scratch profile（`dfa-e2e`）。
- 不要动用户的 `~/.dsh/profiles/desktop` 之外的配置，也不要在运行中的桌面端上 `-Force` 重装。

## 命令速查

```powershell
$node = "C:\Users\Aether\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
$pnpm = "C:\Users\Aether\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.cjs"

cd D:\dsh\plugin\dsh-file-actions
& $node --test                     # 17 个单测
& $node --check lib\client.js      # 语法检查
& $node $pnpm pack                 # 出 tgz（gitignored）
pwsh -File .\scripts\reinstall.ps1 -Profile dfa-e2e   # 装进 scratch profile
```

## 代码约定

- **零构建、纯 JS。** client 半是 `factory(require)` 形态的经典脚本，只能通过 `window.__ModuleLoader__.load({ id, factory })` 注册；不要写 ESM `export`/`import`，不要引入 React（菜单是手写 DOM）。
- **能纯函数就纯函数。** 路径解析、类型分类、菜单模型都在 `buildMenuModel` 等纯函数里，通过 `module.exports.__internals` 暴露给 `node --test`。
- **所有 Remote 调用返回 `{ ok, value }` 信封**，统一用 `unwrap()` 解包；不要假设直接拿到值。
- 每个源码/测试文件 < 1500 行（`lib/client.js` 当前约 1300 行，单文件 bundle 是有意的：loader 支持 `require.async` 拆分，但需要构建链，本项目坚持零构建）。
- 注释只写「为什么」，不写「是什么」。
- UI 文案中英双份（`ZH` / `EN`），按 `ctx.locale` 或 `navigator.language` 选择。

## 验证门槛

| 改了什么 | 至少要做到 |
|---|---|
| 纯函数（路径/分类/菜单模型） | `node --test` 全绿，新增行为补用例 |
| 识别逻辑（`candidateFromEvent`） | 单测 + scratch profile 真机右键四种载体 |
| 动作（打开/复制/另存为） | scratch profile 真机走一遍，确认没有报错 toast |
| `package.json` / `cordis.patch.yml` | 重装后启动日志无 composition 报错，`/plugins` 能取到 bundle |

只跑单测不能证明 client 半可用——它只在真机加载。

## 相关路径

- 插件源码：`D:\dsh\plugin\dsh-file-actions`
- scratch profile：`C:\Users\Aether\.dsh\profiles\dfa-e2e`
- 桌面 profile：`C:\Users\Aether\.dsh\profiles\desktop`
- DSH CLI：`C:\Users\Aether\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd`
- 参考实现（只读）：`D:\dsh\plugin\_scratch\asar-x\dsh\node_modules\@deepseek-ai\dsh-client-ui-open-in-app`
