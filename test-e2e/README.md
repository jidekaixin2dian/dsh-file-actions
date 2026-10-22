# Optional full-Web smoke checks

The reproducible automated suite is `npm run setup:host` then `npm run test:host`.
It mounts the pinned official WorkspaceFiles implementation, serves synthetic
references and file data to the actual client bundle, and drives a real browser.
This verifies the plugin and host contract, not the entire Desktop shell.

The older CDP drivers in this directory are optional manual checks of a full DSH
Web installation. Set `DFA_DSH_CLI` to the official CLI and `DFA_HOME` to an
already provisioned, separate DSH home with a Web profile named `dfa-e2e`.
The launcher defaults to `<repo>/work/desktop-e2e-home`, refuses `~/.dsh`, and
never copies or overwrites personal profile configuration.

```powershell
pwsh -File scripts/reinstall.ps1 -Profile dfa-e2e -DshHome $env:DFA_HOME
pwsh -File test-e2e/launch.ps1 -CheckOnly
pwsh -File test-e2e/launch.ps1
node test-e2e/self-check.mjs
pwsh -File test-e2e/launch.ps1 -Stop
```

Choose another `-Port` if it is occupied. Stop validates the stored launcher's PID,
creation time and command line; it never terminates a process merely because it
owns a port. A missing fixture or required skipped check is a failure, not a
successful full-app verification. Use `DFA_CHROME` for a custom browser executable.

Historical release counts (including the 41 assertions for 0.1.5) describe the
original headless Web run with injected file-reference carriers. They are not a
claim that every native application action was exercised, or a new Desktop test.
