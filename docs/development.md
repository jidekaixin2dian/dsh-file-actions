# 开发与验证



需要 Node >=24、Git、pnpm：

```sh
npm ci --ignore-scripts
npm test
npm run setup:host
npm run test:host
npm run pack:check
```

默认固定宿主为 DSH **0.2.1-rc.4**（`504a01a9578abc2c6f1fb896b1dc322c9fe24f66`）；`DFA_HOST_VERSION=rc.2` 可验证最低支持版本（`687f282e8625c6b8d11ff58211a90524be2e4317`）。`DFA_HOST` 可复用对应 commit 的干净 checkout。Windows 使用 headless Edge；Linux 先运行 `npx --no-install playwright install --with-deps chromium`。CI 在两种系统中分别覆盖 rc.2/rc.3/rc.4。插件仍无运行时依赖、无构建步骤。

浏览器套件把实际 client bundle 与真实 WorkspaceFiles 接到合成文件引用上，检查会话身份、预览脚本隔离、真实 3 MiB 下载及卸载行为；另用确定性 Remote 响应检查右键回退、首选应用、异步菜单稳定性、搜索和大字号。这不是完整 Desktop 或外部应用启动验收。可选完整 Web 驱动和历史断言计数见 [test-e2e](../test-e2e/README.md)。

一批修改走一个 PR。完整 CI 仅在面向 main 的 PR 和 main 提交运行；同一 PR 的新提交会取消过期检查，tag 不重复运行整套测试，Release 仍执行归档完整性校验。

自动合并是逐个 PR 明确开启的选项，不会因为贡献者的检查通过就自动合并。维护者审核后，可运行 `node scripts/enable-owner-auto-merge.mjs <PR编号>`，它只接受仓库所有者本人创建的同仓库、非草稿 PR，等待保护规则满足后 squash 合并。外部和 bot PR 保留人工审核及合并决定；辅助脚本不绕过四项必需检查，也不自动发布版本。


---

## English



Node >=24, Git and pnpm:

```sh
npm ci --ignore-scripts
npm test
npm run setup:host
npm run test:host
npm run pack:check
```

The default pinned host is DSH **0.2.1-rc.4** (`504a01a9578abc2c6f1fb896b1dc322c9fe24f66`). Set `DFA_HOST_VERSION=rc.2` to verify the minimum supported host (`687f282e8625c6b8d11ff58211a90524be2e4317`). `DFA_HOST` can reuse the matching clean checkout. Windows uses headless Edge; Linux needs `npx --no-install playwright install --with-deps chromium`. CI covers rc.2/rc.3/rc.4 on both systems. The plugin still has no runtime dependencies or build step.

The browser suite uses the actual client bundle and real WorkspaceFiles over synthetic references. It checks Session identity, sandboxed script isolation, a real 3 MiB download and unload behavior. A separate browser suite uses deterministic Remote responses for native-menu fallback, preferences, asynchronous stability, search and large text. This is not a complete Desktop or OS application-launch test. Optional full-Web drivers and historical assertion counts are documented in [test-e2e](../test-e2e/README.md).

Use one PR per change set. Full CI runs for PRs targeting main and pushes to main. New commits cancel obsolete checks for the same PR; tags do not repeat the full suite, while Releases retain archive integrity checks.

Auto-merge requires explicit opt-in for each PR; passing contributor checks never opts it in automatically. After review, the owner can run `node scripts/enable-owner-auto-merge.mjs <PR number>` for an owner-authored, same-repository, non-draft PR. External and bot PRs retain a manual maintainer decision. This helper preserves all four required checks and does not publish releases.


## npm 发布

仅在已获发布授权后操作。新 tag 必须位于 main，完整 CI 成功，GitHub Release 归档与 tag 一致；然后从相同 tag 调度 `npm-publish.yml` 并填入相同版本 tag，直接发布校验后的 GitHub 归档。首次创建 npm 包需要浏览器登录与 2FA；包建立后配置该仓库的 Trusted Publisher（仅 `npm-publish.yml`），后续发布不保存长期 token。更新检测与一键安装由市场/官方安装器完成，插件不另写自更新器。
