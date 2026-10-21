# dsh-file-actions · 按「插件市场」方式安装验证

**目的**：证明插件能从 market entry 里写的 **release tarball URL** 装进一个全新 profile，并且装完就能用 ——
和用户从插件市场点「安装」拿到的是同一份东西。

**结论：通过。** 远程 tarball 直接装成功（不需要 curl 回退），4 项确认全过，`self-check.mjs` **21/21**。

**环境**：Windows · PowerShell 7.6.6 · node v24.21.0 · pnpm 11.28.5 ·
DSH CLI `C:\Users\Aether\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd`

**隔离**：全新 scratch profile `C:\Users\Aether\.dsh\profiles\dfa-market`，端口 5501。
`desktop`（PID 87292，GUI 7613）和 `dfa-check` 全程未读写、未重启。

**被测 URL**（= market entry `submission/jidekaixin2dian__dsh-file-actions.yml` 的 `tarball:`）：

```
https://github.com/jidekaixin2dian/dsh-file-actions/releases/latest/download/dsh-file-actions.tgz
```

HEAD 校验：`200`，`Content-Length: 234201`（与预期的 234,201 B 一致），302 到
`release-assets.githubusercontent.com`。

---

## 1. 安装命令（实际生效的那条）

profile 是手写的 4 个文件（`cordis.yml` / `cordis.patch.yml` / `pnpm-workspace.yaml` /
`package.json`，`dsh.profile.bundles` = `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、
`@jidekaixin2dian/dsh-file-actions`），`dependencies` 留空，然后：

```powershell
$node = 'C:\Users\Aether\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
$pnpm = 'C:\Users\Aether\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.cjs'
$url  = 'https://github.com/jidekaixin2dian/dsh-file-actions/releases/latest/download/dsh-file-actions.tgz'

Push-Location 'C:\Users\Aether\.dsh\profiles\dfa-market'
& $node $pnpm add $url
```

输出（exit 0）：

```
Progress: resolved 0, reused 0, downloaded 1, added 0
Packages: +1
+
dependencies:
+ @jidekaixin2dian/dsh-file-actions 0.1.0
Done in 5.1s using pnpm v11.28.5
```

**pnpm 没有拒绝远程 tarball**，所以 `curl -L` + `pnpm add file:...` 的回退路径没有使用。
profile 的 `package.json` 被 pnpm 写成：

```json
"@jidekaixin2dian/dsh-file-actions": "https://github.com/jidekaixin2dian/dsh-file-actions/releases/latest/download/dsh-file-actions.tgz"
```

`pnpm-lock.yaml` 记录了内容哈希（这是「装的是哪一版」的唯一强证据）：

```
resolution: {integrity: sha512-YFWHZsttkTf/S1YnVuH2fifxHuA+Uws/oDajTejisOAV/ijJoMcZe0rkErt5e1Sp5chVtip5IHDxJpK5ShyM4Q==,
             tarball: https://github.com/jidekaixin2dian/dsh-file-actions/releases/latest/download/dsh-file-actions.tgz}
```

落地内容 `node_modules\@jidekaixin2dian\dsh-file-actions\`：`package.json` 0.1.0、`lib/client.js`
50,052 B、`lib/index.js`、`cordis.patch.yml`、`icon.svg`、`LICENSE`、两份 README、`assets/*.png`。
`lib/` 与源码目录 **SHA256 逐个文件一致**（`Compare-Object` 无差异）。

---

## 2. 四项确认

### ① 组合配置含 `id: dsh-file-actions`

`& $dsh --profile dfa-market --dump-config`（exit 0）：

```yaml
# == @jidekaixin2dian/dsh-file-actions
- id: dsh-file-actions
  name: '@jidekaixin2dian/dsh-file-actions'
```

### ② 服务端下发的 boot graph 含 `@jidekaixin2dian/dsh-file-actions/client.js`

启动：`& $dsh --profile dfa-market --port 5501 --no-open`，日志首行
`dsh web: http://127.0.0.1:5501/?token=uOUN…`。

`GET /?token=…`（HTTP 200，37,857 B）注入的 `window.__DSH_BOOT__` 里：

```json
{"id":"@jidekaixin2dian/dsh-file-actions",
 "url":"plugins/??@jidekaixin2dian/dsh-file-actions/client.js&rev=a274e87aa422",
 "rev":"a274e87aa422",
 "inject":["@deepseek-ai/dsh-api-remotes","@deepseek-ai/dsh-api-session-controller","@deepseek-ai/dsh-api-workspace-files"],
 "immediately":true}
```

同一个 bundle 也出现在 application phase 的合并 URL 与 `entries` 数组里。直接取该 URL：
**HTTP 200、`text/javascript; charset=utf-8`、50,142 B**（源码 50,052 B + loader 包装），内容含
`data-dfa-ready` / `data-dfa-menu` 字面量 —— 即市场装的这份 bundle 真的被服务出去了，不是空壳行。

### ③ 页面无 `Failed to load plugins`，且 `<html data-dfa-ready="1">`

CDP 实测（headless Chromium，全新 profile）：

```json
"styleTag": true,            // <style data-plugin-css="dsh-file-actions"> 已注入
"bootFailed": false,         // body.innerText 不含 "Failed to load plugins"
"readyAttr": "1",            // <html lang="zh-CN" data-dfa-ready="1" …>
```

菜单也真的弹出来了（右键 `package.json`，7 项：打开文件 / 在 Visual Studio Code 中打开 /
打开方式 / 在资源管理器中显示 / 复制路径 / 复制文件内容 / 另存为…，标题行 `package.json 文本 · 1.4 KB`）。
截图：`D:\dsh\plugin\_scratch\market-install\run\menu-text-dark.png`（另有两张同目录）。

### ④ `self-check.mjs` 对 5501 的结果

```powershell
cd D:\dsh\plugin\dsh-file-actions\test-e2e
& $node .\self-check.mjs uOUNQsLxn4A1uVKURE3RnA1uh9c1Wek33E5srdNfUDk 5501
```

**`21/21 checks passed`，exit 0。** 覆盖：bundle 激活、无 boot-audit 失败、监听器安装、
四种载体（`title` / `data-files-path` / `a[title]` / 裸文本）各自弹菜单、类型分类（文本/Markdown/网页）、
关联行（`editor`/`openWith`）异步补入、复制路径 toast、动作后菜单关闭、不存在的路径不劫持原生菜单。
完整输出：`D:\dsh\plugin\_scratch\market-install\self-check.txt`。

---

## 3. 与「从本地文件夹安装」的差异

| 维度 | 本地 `file:` 安装（dfa-check） | 市场 tarball 安装（dfa-market） |
|---|---|---|
| 依赖 spec | `file:D:/dsh/plugin/dsh-file-actions` | 完整 https URL |
| 锁定依据 | 目录路径（无内容哈希） | `sha512` integrity + tarball URL |
| 内容来源 | 源码目录（pnpm 按 `pnpm pack` 语义复制，实际只落了 `files` 里列的条目） | GitHub release 资产（经 `release-assets.githubusercontent.com` 302） |
| 网络 | 不需要 | 需要；首次 5.1s，之后走 pnpm store 缓存 |
| 包内 `package.json` | 原样 | npm/pnpm pack 归一化：键序变化、`scripts` 挪到末尾（1,385 B vs 源码 1,386 B，语义无差） |
| 更新语义 | 改源码后重装才生效 | 改源码**完全不**影响该 profile（符合预期：市场装的是发布产物） |

两个值得记的点：

1. **`latest/download` 是可变指针。** 上游重发同一个 asset 名字时 URL 不变、内容会变；本次验证的
   唯一强绑定是 lockfile 里的 `sha512-YFWHZ…`。市场侧若不做「重新解析版本」这一步，用户拿到的就是
   首次解析到的内容。
2. **dfa-check 里缺 `assets/` 是陈旧安装，不是市场 vs 本地的差异。** dfa-check 的插件目录创建于
   2026-10-21 12:51，而源码 `assets/` 创建于 13:38，所以那份副本天然没有截图资产；dfa-market 这次
   装出来的 `assets/` 齐全。

---

## 4. 缺口（明确未覆盖）

1. **没有走插件市场的 UI/安装器本体。** 本 profile 没装 market 应用，验证的是「market entry 里那个
   tarball URL + 同样的 pnpm add」这条路径；市场客户端自己的下载、校验、签名/来源校验没有参与。
2. **`self-check.mjs` 用的是合成载体**（与本地验证同一套 fixture），不是一轮真实 agent 对话里的
   蓝色文件名 —— 这一点与既有 REPORT.md 的边界相同。
3. **只有 `--dump-config` 与运行期 boot graph 两层证据**，没有做「同一 URL 换版本后升级」的回归。
4. **截图脚本用副本**：`shoot.mjs` 的 `OUT` 写死在 `test-e2e\run\`，为遵守「只往 test-e2e 写报告/
   token 文件」的约束，截图用 `_scratch\market-install\shoot-market.mjs`（副本，改了两行）执行，
   产物留在 `_scratch`。`test-e2e` 里除本文件外没有新增文件，`token.txt` 也未改动（token 走 argv）。

---

## 5. 收尾状态

- 5501 实例已停止：`Stop-Process` 掉监听进程（PID 79588，DeepSeek Harness），复验端口无监听。
- profile `dfa-market` **保留**（含 `node_modules` 与 lockfile），可直接复跑：
  `& $dsh --profile dfa-market --port 5501 --no-open`。
- 桌面端 PID 87292 仍在运行，GUI 7613 正常应答（`/` 返回 401 = 需要 token，符合预期）；无残留
  Chromium 进程。
- 证据目录：`D:\dsh\plugin\_scratch\market-install\`
  （`dump-config.txt`、`index.html`、`self-check.txt`、`instance-5501.log`、`run\*.png`）。
