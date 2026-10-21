# Handoff — dsh-file-actions

> 交接时间：2026-10-21（Asia/Shanghai）
> 目录：`D:\dsh\plugin\dsh-file-actions`（唯一源码目录）
> 包名 `@jidekaixin2dian/dsh-file-actions` `0.1.0`，MIT，未发布。
> 目标：在 DSH 聊天里右键蓝色文件名 → Codex 风格文件菜单。

读完 §0–§2 就能开工；§3 结构、§4 实现要点、§5 开发循环、§6 验证现状、§7 待办。

---

## 0. 30 秒概览

一个 npm 包、两半：

- `lib/client.js`（**全部逻辑**）：浏览器 bundle，document 捕获阶段监听 `contextmenu`，把被点节点解析成真实 Host 路径，用自绘菜单替换 Chromium 原生链接菜单。
- `lib/index.js`：空宿主半，只为让 `cordis.patch.yml` 的 bundle 行能挂上。

动作全部复用 DSH 已发布的 Remote，**不自己拼命令行、不碰 fs**：

| 动作 | 调用 |
|---|---|
| 打开 / 在编辑器中打开 / 打开方式 | `session.openWorkspacePath({ path, application? })` |
| 在资源管理器中显示 | `session.openWorkspacePath({ path, action: 'reveal' })` |
| 关联应用列表（含图标） | `session.workspacePathApplications({ path })` |
| 复制文件内容 / 另存为 / 在浏览器中打开 | `workspaceFiles.readBytes(sessionId, path, {})` |

所有 Remote 返回 `{ ok, value }` 信封，统一 `unwrap()`。

---

## 1. 立刻验证环境（复制即用）

```powershell
$node = "C:\Users\Aether\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
cd D:\dsh\plugin\dsh-file-actions
& $node --test                      # 17 个单测，全绿
& $node --check lib\client.js
```

真机（scratch profile，不动 desktop）：

```powershell
cd test-e2e
pwsh -File .\start-instance.ps1      # 建 dfa-check profile + 装插件 + 起 5499，写 token.txt
node .\self-check.mjs                # headless Chromium/CDP 断言，21/21
node .\shoot.mjs                     # 出截图到 run/
pwsh -File .\start-instance.ps1 -Stop
```

---

## 2. 当前状态（事实表）

| 项 | 值 |
|---|---|
| 版本 | `0.1.0` |
| 单测 | 17 个全过（`node --test`） |
| 真机 self-check | 21/21（scratch profile `dfa-check`，headless Chromium 153 + CDP） |
| 真机 verify（队友） | 9 PASS / 0 FAIL / 1 SKIP（`test-e2e/verify.mjs`，真鼠标右键右侧文件树行 → 菜单 7 项 → 复制路径 → 剪贴板拿到绝对路径） |
| 已验证动作 | 复制路径（真实点击 → toast）；菜单开合、类型分类、异步关联应用 |
| 已验证载体 | title（交付卡片/文档预览头）、`data-files-path`（文件树）、anchor title、裸文本 token |
| 真实 DOM 依据 | `test-e2e/ground-truth.json`（队友用真机 CDP + 真鼠标右键采集） |
| 未在真机点过的动作 | 打开文件 / 在资源管理器中显示 / 另存为 / 在浏览器中打开（会弹外部程序或保存对话框，故意不自动点） |
| 安装到 desktop | **未做**：宿主运行时会拒绝写 profile，且换 bundle 必须重开桌面端；留命令给用户 |
| 依赖 | 无运行时依赖；`dsh.client.inject` 声明三个 `@deepseek-ai/dsh-api-*` 包 |

---

## 3. 目录结构

```
dsh-file-actions/
├─ package.json            # dsh.bundle.patch + dsh.client（platform/immediately/inject）
├─ cordis.patch.yml        # 一行 insert，挂宿主半
├─ icon.svg
├─ lib/
│  ├─ index.js             # 宿主半：空 apply
│  └─ client.js            # 全部逻辑（~1300 行）
├─ test/client.test.js     # 17 个单测（vm 里跑 bundle，读 __internals）
├─ test-e2e/
│  ├─ start-instance.ps1   # 建/装/起 scratch 实例
│  ├─ self-check.mjs       # 真机断言（21 项）
│  ├─ shoot.mjs            # 截图
│  ├─ ground-truth.json    # 真实 DOM 载体与祖先链（队友采集）
│  ├─ verify.mjs           # 队友的端到端脚本（装插件→重启→断言→剪贴板）
│  └─ run/                 # 截图与日志（可删）
├─ assets/                 # README 截图
├─ scripts/reinstall.ps1   # 装进 profile + 补 dsh.profile.bundles
└─ README.md / README.en.md / AGENTS.md
```

---

## 4. 实现要点（改代码前必读）

### 4.1 识别链（`candidateFromEvent`，按可靠性排序）

1. `data-file-actions-path` / `data-files-path` / `data-review-file` 属性。
   - 文件树真实值：`D:\dsh\plugin/_scratch/asar.mjs`（**混用分隔符、已是绝对路径**，不要再拼 root）。
2. `[data-presented-file]` 内的 `[title]`（交付卡片，title 是绝对路径）。
3. 祖先 5 层内的 `title`（inline-code 链接、文档预览头 `span[data-textpreview-path]`）。
4. `a[href]` 的 `file://` 或纯路径 href。
5. **元素自身 textContent 整段像路径**（工具行 `[data-tool] button[class*="fileLink"]`，无 title、文本是相对路径）。
6. `caretRangeFromPoint` 取光标处 token（行内 code 兜底）。

候选必须过 `workspaceFiles.stat`（文件）或 `list`（目录）才弹菜单；失败就放行原生菜单。可编辑区域与真正网页链接不拦截。

> 当前 DSH（0.2.1-rc.2）里 assistant 正文的行内 code **不是 `<a>`、没有 title**，只能靠 5/6 兜底；`dsh-host-open-in-app` 这种目录名不含 `/` 也没有已知扩展名，`looksLikePath` 会拒绝，不会误伤。

### 4.2 菜单模型与渲染分离

`buildMenuModel()` 是纯函数（有单测），产出 `{ title, meta, sections: [[item]] }`；`FileMenu` 只负责 DOM、定位、键盘、子菜单。**新增行改 `buildMenuModel` + 单测**，别在渲染层加条件。

行集合按类型收敛（`classify()`）：

| 类型 | 行 |
|---|---|
| text / markdown / html / svg | 打开、在 X 中打开、打开方式、[浏览器]、资源管理器、复制路径、复制相对路径、复制文件内容、另存为 |
| image / pdf | 同上，但无复制内容（pdf 保留浏览器打开） |
| office / archive / binary | 打开、打开方式、资源管理器、复制路径、另存为 |
| 目录 | 打开文件夹、资源管理器、复制路径、复制相对路径 |

### 4.3 关联应用是**异步**的（关键体验点）

`session.workspacePathApplications` 在 Windows 上要起 PowerShell 查 Shell 关联，冷启动 2–4 秒。所以：

1. 菜单**立即**用 `apps: []` 打开（秒开）；
2. `enrich()` 异步取关联应用，回来后 `menu.setModel(...)` **原地重绘**；
3. 结果按扩展名缓存（`appsCache`），同类型第二次是 0ms。

不要把 `applications` 放回 `openAt` 的同步路径，否则右键要等几秒才出菜单。

### 4.4 调试钩子

- `window.__dfaDebug`：最近一次右键的 stage/path/session/probe，排查"为什么没弹菜单"第一现场。
- `<html data-dfa-ready="1">`：`install()` 设、disposer 删，e2e 用它等就绪，别用 sleep 猜。

### 4.5 踩过的坑

- **cordis 客户端上下文对未 inject 的子服务直接抛错**：`ctx.remote.session` 必须把 `remote.session` 写进 `inject`，否则整个插件激活失败，页面顶部显示 "Failed to load plugins"。
- 插件激活失败时 loader 只报一行 `failed`，没有堆栈 → `apply` 外面套了 try/catch 先 `console.error` 再抛。
- client bundle 是**经典脚本**：只能 `window.__ModuleLoader__.load({ id, factory })`，不能写 `export`。
- 桌面端没有 `Ctrl+R`；换 bundle 必须重开应用。scratch 实例用 `dsh --profile <p> --port <p> --no-open`（注意 `--port` 属于 app 参数，不能写 `dsh web --profile x`）。
- headless 验证时 Chrome 复用 profile 会命中旧 bundle 缓存（rev 相同）→ 每次删 user-data-dir 或 `Network.setCacheDisabled`。

---

## 5. 开发循环

```powershell
# 1. 改源码
# 2. 语法 + 单测
& $node --check lib\client.js; & $node --test
# 3. 同步进 scratch profile（已装时直接拷贝，不必 pnpm add）
Copy-Item "D:\dsh\plugin\dsh-file-actions\lib\*" `
  "C:\Users\Aether\.dsh\profiles\dfa-check\node_modules\@jidekaixin2dian\dsh-file-actions\lib\" -Force -Recurse
# 4. 重启实例（换 bundle 必须重启宿主，浏览器缓存也要清）
cd test-e2e; pwsh -File .\start-instance.ps1 -Stop; pwsh -File .\start-instance.ps1 -NoInstall
node .\self-check.mjs
```

装进 desktop（用户可见动作，需先退出桌面端）：

```powershell
pwsh -File .\scripts\reinstall.ps1 -Profile desktop
```

---

## 6. 验证现状（区分静态 / 真机）

| 项 | 结果 |
|---|---|
| `node --check` | 通过 |
| `node --test` | 17/17 |
| 组合层 `dsh --dump-config` | 含 `id: dsh-file-actions` 行 |
| boot graph | 含 `@jidekaixin2dian/dsh-file-actions/client.js` |
| 真机 self-check | 21/21（激活、就绪标记、四种载体、类型分类、异步关联行、复制路径 toast、无效路径不劫持） |
| 截图 | `assets/menu-dark.png`、`assets/open-with-dark.png`、`assets/menu-light.png`（真实主题） |
| 未验证 | 打开/资源管理器/另存为/浏览器打开的真实外部副作用；真实交付卡片与工具行右键（见 §4.6） |

### 4.6 工具行/交付卡片的 DOM 坑（队友实测）

- **展开后的 step body 在 `[hidden]` 容器里**：`getBoundingClientRect()` 有坐标，但 `checkVisibility()===false`、`elementFromPoint()` 永远命中不到，真实鼠标右键点不进去。这是 DSH 的折叠实现，不是插件问题；`verify.mjs` 因此回退到右侧文件树行。
- 展开 step group 只能点 `aria-expanded="false"` 的行，点已展开的会把它折回 `[hidden]`。
- 交付/改动文件卡片（`[data-presented-file]` / `[data-changed-files]` / `[data-review-file]`）需要一轮**成功结束且写文件**的 turn 才会渲染（`deliverables/presented` 事件）；本机现有会话都以 turn-error 结束，所以恒为 0，只能在下次有成功 turn 后重跑 `node probe.mjs` 补验。

---

## 7. 市场接入（2026-10-22 完成）

| 项 | 值 |
|---|---|
| 公开仓库 | https://github.com/jidekaixin2dian/dsh-file-actions（2026-10-21T17:17:41Z 创建，topics：`dsh-plugin` `deepseek-harness` `context-menu` `dsh`） |
| Release | `v0.1.0`，资产 **`dsh-file-actions.tgz`**（234,201 B，版本无关命名，`releases/latest/download/` 可长期解析） |
| 条目 | `submission/jidekaixin2dian__dsh-file-actions.yml`（`category: ui`，`tarball` 指向上面那个 latest URL） |
| PR | https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/8534（fork 分支 `jidekaixin2dian:add-dsh-file-actions`） |
| 本地预检 | `generate-readme.mjs` → 两份 README 各 +1 行；`check-submission.mjs --base origin/main` → **唯一失败是仓库年龄 0.0 天**，manifest/归档检查都过 |
| 门禁 | 仓库满 1 天即 `2026-10-22T17:17:41Z`（+08 2026-10-23 01:17）后自动转绿，`regate.yml` 约 6h 重跑一次 |
| 市场安装路径 | 已在干净 profile `dfa-market` 里用 `pnpm add <release tarball URL>` 实测装成功 |

本地跑市场预检（不要提交 README 改动，合并时由上游生成）：

```powershell
# 市场仓克隆：C:\Users\Aether\Documents\deepseek-harness\default-workspace\work\refs\awesome-dsh-plugin
# npm ci 在本机会被 EALLOWREMOTE 拒绝，改用临时依赖目录做 junction：
#   D:\dsh\plugin\_scratch\market-deps  (pnpm add js-yaml marked semver)
#   New-Item -ItemType Junction -Path <clone>\node_modules -Target D:\dsh\plugin\_scratch\market-deps\node_modules
$env:GITHUB_TOKEN = gh auth token
node scripts/generate-readme.mjs
node scripts/check-submission.mjs --base origin/main
```

---

## 8. 待办

1. 用 `test-e2e/verify.mjs` 在真实会话里右键**工具行文件链接**与**交付卡片**（需要一轮成功 turn 产生 `presented` 事件）。
2. 手动点一次"在资源管理器中显示 / 另存为 / 在浏览器中打开"，确认外部程序行为。
3. 等 PR #8534 门禁转绿后跟进维护者意见；合并后市场 UI 才会出现条目。
4. 可选：菜单打开时把行内 code 链接临时加个下划线/背景提示（当前依赖原生样式，没有视觉暗示）。
