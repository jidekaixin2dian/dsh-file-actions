# dsh-file-actions · 真机 e2e 验证报告

**环境**：Windows 11 · DSH 0.2.1-rc.2（`app.asar` 内 `dsh/`）· Chromium 1243（Playwright 缓存，raw CDP 驱动）
**隔离实例**：scratch profile `dfa-e2e`，端口 5497（用户的桌面端 5401 全程未动）
**结论**：插件在真机可用 —— 右键 → 自定义菜单（7 项）→「复制路径」→ 剪贴板拿到绝对路径。

---

## 1. 怎么跑

```powershell
cd D:\dsh\plugin\dsh-file-actions\test-e2e

# 1) 起一个隔离的 DSH 实例（自动建 profile、挑空闲端口、等 HTTP 200）
pwsh -File .\launch.ps1
#    停掉：pwsh -File .\launch.ps1 -Stop

# 2) 采 ground truth（打开真机 UI，逐个载体真右键，dump 祖先链）
node .\probe.mjs                  # 产物：ground-truth.json + run\probe\*.png
node .\probe.mjs --headed         # 想肉眼看
node .\probe.mjs --session 接手原项目 --workspace plugin

# 3) 端到端验证插件（装进 dfa-e2e → 重启 → 右键断言 → 读剪贴板）
node .\verify.mjs                 # 完整（含 pnpm add + bundles 追加）
node .\verify.mjs --no-install    # 只验 UI（快）
```

`node` 用：`C:\Users\Aether\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`

`verify.mjs` 打印 PASS/FAIL/SKIP 并按行退出码：FAIL→1，全 PASS 或含 SKIP→0。
SKIP 表示插件还没装好/不完整（源码缺失、语法不过、profile 不存在），不算失败。

### verify.mjs 最近一次实测

```
PASS  client bundle parses  —  @jidekaixin2dian/dsh-file-actions@0.1.0
PASS  package.json declares dsh.bundle.patch  —  ./cordis.patch.yml
PASS  scratch instance up  —  http://127.0.0.1:5497
PASS  boot graph contains plugin bundle  —  @jidekaixin2dian/dsh-file-actions
PASS  file reference target  —  file tree row
PASS  custom menu appears on right-click  —  7 items, position:fixed, z:2147483000
PASS  menu offers 复制路径  —  打开文件 / 在 Visual Studio Code 中打开 / 打开方式 /
                              在资源管理器中显示 / 复制路径 / 复制文件内容 / 另存为…
PASS  copy-path puts the absolute path on the clipboard  —  D:\dsh\plugin\_scratch\asar.mjs
PASS  no error toast after the action  —  路径已复制
```

---

## 2. 各载体的 ground truth（全部真机 dump，见 `ground-truth.json`）

| 载体 | 选择器 | 绝对路径从哪来 | 右键结果 |
|---|---|---|---|
| 工具调用行（read/write/edit） | `[data-tool] button[class*="fileLink"]` | **只有可见文本**，且是相对路径（`dsh-toolgate\lib\client.js`）；无 `title`、无 `data-*` | 本构建里**不可点**（见 §4） |
| 右侧文件树行 | `[data-files-entry="file"][data-files-path]` | `data-files-path` **本身就是绝对路径**，但混用分隔符：`D:\dsh\plugin/_scratch/asar.mjs`；根在 `[data-files-root]` | ✅ 弹菜单 7 项 |
| 文档预览头 | `span[data-textpreview-path]` | `title` = 绝对路径；父级 `[data-textpreview-url]="dsh-resource://file/session/<sid>/<rel>"` | ✅ 弹菜单 7 项 |
| assistant 正文行内代码 | `[data-chat-flow-kind="assistant-step"] code` | 裸 `<code>`，无 title/data/href，只能靠 `caretRangeFromPoint` 取词 | 点得到；非路径文本（如包名）插件正确不弹 |
| markdown 链接 | `[data-chat-flow-kind="assistant-step"] a[href]` | `href`（`dsh-resource://…`） | 本机会话里 0 个 |
| 交付卡片 / 改动文件卡 | `[data-presented-file]` / `[data-changed-files]` / `[data-review-file]` | 卡片内 `button[title]` = 绝对路径；行上 `data-review-file` | **未验证**（见 §4） |

祖先链实例（工具行）：

```
[data-chat-flow-kind="tool-call"] > [data-chat-call-id] > div[data-tool="read"][data-variant="read"]
  > div[data-disclosure-header] > div[data-disclosure-row][role=button] > span > span > button.pFy1Ka_fileLink
```

文件树行祖先链：

```
div[data-files-state="tree"][data-files-root="D:\dsh\plugin"] > div[data-files-body] > ul
  > li[data-files-entry="directory"][data-files-path] > ul > li[data-files-entry="file"][data-files-path]
```

文档预览头祖先链：

```
div[data-textpreview-state="text"][data-textpreview-url] > div.TdjKvG_header > span[data-textpreview-path][title=<abs>]
```

### 主题变量（`document.documentElement`）

`--dsw-radius-lg: 16px`、`--dsw-radius-sm: 8px`、`--ds-font-family-code: "SF Mono", "JetBrains Mono", …`。
`--dsw-alias-bg-layer-1` / `--dsw-alias-label-primary` / `--dsw-alias-link` 等在 `:root` 上取值为空 —— 它们定义在
主题层（`body[data-ds-dark-theme]` 等）而不是根元素，插件里取色要落在具体元素上或读 `body` 主题属性。

---

## 3. 插件未安装时的原生菜单

DSH 自身**没有** `contextmenu` 处理器（全包 grep `onContextMenu` 无命中）。装插件前跑同一套 probe，
每个载体的 `domAddedAfterRightClick` 都是空数组 → 右键落到 Chromium 原生 OS 菜单（OS 窗口，不在 DOM 里，
截图抓不到）。装插件后同一位置变成 `[data-dfa-menu]`。

---

## 4. 已知缺口（都已在别处证实过，不是猜测）

1. **交付卡片 / 改动文件卡没拿到 ground truth。**
   源码里这两块由 `deliverables/presented` 事件在**一轮成功结束**时渲染。本机所有会话日志（zstd 解压后逐条 grep）
   都不含 `presented` 事件；被观察的会话以 `turn-error` 结束（"DSH 进程在本轮完成前退出"），所以
   `[data-presented-file]` / `[data-changed-files]` / `[data-review-file]` 计数恒为 0。
   要补：在一个能正常跑完的会话里让 agent 写文件（产出一轮 deliverables），再跑 `probe.mjs`。
2. **工具调用行在本构建里点不到（e2e 限制，不是插件 bug）。**
   展开后的 step body 被 DSH 放在 `[hidden]` 容器里：`getBoundingClientRect()` 有真实坐标，但
   `checkVisibility() === false`、`elementFromPoint()` 永远返回不到它。所以真实鼠标右键无法命中；
   `probe.mjs` 会如实记录 `visibility.hiddenAncestor: true`。
   这也是 `verify.mjs` 在真实会话里改用**右侧文件树行**做右键目标的原因（静态、可见、`data-files-path` 即绝对路径）。
3. **正文里的"蓝色文件名"在本构建是深色 `<code>`**：`rgb(15,17,21)` = `--dsw-alias-label-primary`，
   `cursor: auto`，无 title / 无 data / 无 href。用户截图里的蓝色应来自桌面端交付卡片或 `<a>` 形式的链接；
   这个构建里正文行内代码只能走 `caretRangeFromPoint` 文本兜底。
4. **会话是实时流式的时候坐标会漂**：`verify.mjs`/`probe.mjs` 都用
   `findClickable()`（视口内 + `elementFromPoint` 命中自身 + 避开浮动输入框）选目标，并对菜单等待最长 12s
   （插件解析路径走 session remotes，是异步的）。

---

## 5. 目录

```
test-e2e\
  launch.ps1          建/重置 scratch profile、挑空闲端口、分离式启动、等 HTTP 200、-Stop 收尾
  probe.mjs           真机 ground truth 采集（真右键 + 6 层祖先 + 菜单 DOM 观测 + 主题变量）
  verify.mjs          插件 e2e（安装 → 重启 → 右键 → 菜单 → 剪贴板 → PASS/FAIL/SKIP）
  ground-truth.json   probe 的结构化产物
  lib\ws.mjs          手写 RFC6455 WebSocket（环境无 ws / 无 Playwright）
  lib\cdp.mjs         CDP 驱动：launch/attach/eval/真鼠标/键盘/可点中元素筛选/截图
  lib\inspect.mjs     元素祖先 dump、CSS path、shell 就绪等待
  explore\            排查过程中用过的临时脚本（保留作证据，非交付物）
  run\                日志、instance.json、截图（可随时删）
```

## 6. 坑（复现时注意）

- `dsh --profile <name> web --port …` 会报 `too many arguments`；profile 决定 app，正确写法是
  `dsh --profile <name> --port <p> --no-open`。
- 根路径 `/` 拒绝访问，真实 URL 带 `?token=`，要从启动日志里 `dsh web: <url>` 抓。
- 用 `Start-Process` 起服务会让调用方的 stdout 句柄一直开着（harness 会挂住）；
  `launch.ps1` 改用 `Win32_Process.Create` 完全分离 + `.cmd` shim 自己重定向。
- 只 `pnpm add` 不写 `dsh.profile.bundles`，bundle 不会被组合（`verify.mjs` 已自动补这一行）。
- 展开 step group 只能点 `aria-expanded="false"` 的行，点已展开的会把它折叠（body 变 `[hidden]`）。
