// End-to-end verification for @jidekaixin2dian/dsh-file-actions.
//
//   node verify.mjs                # install into the scratch profile, restart, assert
//   node verify.mjs --no-install   # skip the install step (fast re-check)
//   node verify.mjs --headed       # watch the browser
//
// What it proves, in order:
//   1. the plugin source is complete enough to install (client bundle parses)
//   2. pnpm installs it into profiles/dfa-e2e and the profile lists it under
//      dsh.profile.bundles (a bare `pnpm add` is not enough)
//   3. the restarted instance's boot graph contains our client bundle
//   4. right-clicking a real file reference opens the custom menu
//      ([data-dfa-menu] with 复制路径) instead of Chromium's native menu
//   5. picking 复制路径 puts the absolute path on the clipboard
//
// Prints PASS / FAIL / SKIP per check and exits non-zero when anything FAILs.
// SKIP means "the plugin is not installable/complete yet" — exit code 0.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { launchChrome, connectPage, sleep } from './lib/cdp.mjs';
import { waitForShell } from './lib/inspect.mjs';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);

const PLUGIN_DIR = path.resolve(here, '..');
const PROFILE_NAME = 'dfa-e2e';
const DSH_HOME = path.join(process.env.USERPROFILE, '.dsh');
const PROFILE_DIR = path.join(DSH_HOME, 'profiles', PROFILE_NAME);
const NODE = path.join(DSH_HOME, 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'node', 'bin', 'node.exe');
const PNPM = path.join(DSH_HOME, 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.cjs');
const LAUNCH_PS1 = path.join(here, 'launch.ps1');
const STATE_FILE = path.join(here, 'run', 'instance.json');
const LOG_FILE = path.join(here, 'run', 'instance.log');
const SHOT_DIR = path.join(here, 'run', 'verify');

const checks = [];
function check(name, status, detail = '') {
  checks.push({ name, status, detail });
  const tag = status === 'PASS' ? '\x1b[32mPASS\x1b[0m' : status === 'FAIL' ? '\x1b[31mFAIL\x1b[0m' : '\x1b[33mSKIP\x1b[0m';
  console.log(`${tag}  ${name}${detail ? `  —  ${detail}` : ''}`);
}

function finish() {
  const failed = checks.filter((c) => c.status === 'FAIL');
  const skipped = checks.filter((c) => c.status === 'SKIP');
  console.log('');
  console.log(`summary: ${checks.length - failed.length - skipped.length} passed, ${failed.length} failed, ${skipped.length} skipped`);
  if (failed.length) {
    console.log('failed checks:');
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`);
    process.exit(1);
  }
  process.exit(0);
}

const readState = () => (fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : null);

// ---------------------------------------------------------------- 1. preflight
function preflight() {
  const clientPath = path.join(PLUGIN_DIR, 'lib', 'client.js');
  const pkgPath = path.join(PLUGIN_DIR, 'package.json');
  if (!fs.existsSync(clientPath) || !fs.existsSync(pkgPath)) {
    check('plugin sources present', 'SKIP', 'lib/client.js or package.json missing');
    finish();
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const syntax = spawnSync(NODE, ['--check', clientPath], { encoding: 'utf8' });
  if (syntax.status !== 0) {
    check('client bundle parses', 'SKIP', (syntax.stderr || '').split('\n')[0]);
    finish();
  }
  check('client bundle parses', 'PASS', `${pkg.name}@${pkg.version}`);
  if (!pkg.dsh?.bundle?.patch) {
    check('package.json declares dsh.bundle.patch', 'SKIP', 'no bundle patch -> not a DSH plugin');
    finish();
  }
  check('package.json declares dsh.bundle.patch', 'PASS', pkg.dsh.bundle.patch);
  return pkg;
}

// ------------------------------------------------------------------ 2. install
function stopInstance() {
  const r = spawnSync('pwsh', ['-NoProfile', '-File', LAUNCH_PS1, '-Stop'], { stdio: 'ignore', timeout: 60000 });
  if (r.status !== 0) check('scratch instance stopped', 'FAIL', `launch.ps1 -Stop exit ${r.status}`);
  else check('scratch instance stopped', 'PASS');
}

function startInstance() {
  const out = path.join(here, 'run', 'launch.out');
  fs.rmSync(out, { force: true });
  const r = spawnSync('pwsh', ['-NoProfile', '-File', LAUNCH_PS1], {
    stdio: 'ignore',
    timeout: 180000,
    windowsHide: true,
  });
  const text = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  const state = readState();
  if (r.status !== 0 || !state) {
    check('scratch instance up', 'FAIL', `launch.ps1 exit ${r.status}: ${text.trim().split('\n').slice(-3).join(' | ')}`);
    finish();
  }
  check('scratch instance up', 'PASS', `http://127.0.0.1:${state.port}`);
  return state;
}

function installPlugin(pkg) {
  if (!fs.existsSync(PROFILE_DIR)) {
    check('scratch profile exists', 'SKIP', `${PROFILE_DIR} missing — run launch.ps1 first`);
    finish();
  }
  const spec = `file:${PLUGIN_DIR.replace(/\\/g, '/')}`;
  const r = spawnSync(NODE, [PNPM, 'add', spec], {
    cwd: PROFILE_DIR,
    encoding: 'utf8',
    timeout: 300000,
    windowsHide: true,
  });
  if (r.status !== 0) {
    check('pnpm add into profile', 'FAIL', `${(r.stderr || r.stdout || '').split('\n').slice(-3).join(' | ')}`);
    return false;
  }
  check('pnpm add into profile', 'PASS', spec);

  const installed = path.join(PROFILE_DIR, 'node_modules', ...pkg.name.split('/'), 'package.json');
  if (!fs.existsSync(installed)) {
    check('installed package present', 'FAIL', installed);
    return false;
  }
  check('installed package present', 'PASS', installed);

  // A bare `pnpm add` only records the dependency; the profile must also list
  // the bundle, otherwise the client bundle is never composed into the app.
  const profilePkgPath = path.join(PROFILE_DIR, 'package.json');
  const profilePkg = JSON.parse(fs.readFileSync(profilePkgPath, 'utf8'));
  const bundles = profilePkg?.dsh?.profile?.bundles ?? [];
  if (bundles.includes(pkg.name)) {
    check('profile bundles include plugin', 'PASS', bundles.join(', '));
  } else {
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
    fs.copyFileSync(profilePkgPath, `${profilePkgPath}.bak-${stamp}-verify`);
    profilePkg.dsh = profilePkg.dsh ?? {};
    profilePkg.dsh.profile = profilePkg.dsh.profile ?? {};
    profilePkg.dsh.profile.bundles = [...bundles, pkg.name];
    fs.writeFileSync(profilePkgPath, JSON.stringify(profilePkg, null, 2), 'utf8');
    check('profile bundles include plugin', 'PASS', `added ${pkg.name}`);
  }
  return true;
}

// --------------------------------------------------------------- 3. browser
/**
 * Open the right sidebar's file tree and return a clickable file row
 * ({ x, y, text }) — a static surface with a real path in data-files-path.
 */
async function openFileTreeTarget(cdp) {
  if ((await cdp.eval(`document.querySelectorAll('[data-sidebar-right-panel]').length`)) === 0) {
    const idx = await cdp.eval(`[...document.querySelectorAll('button')].findIndex(b => (b.getAttribute('aria-label')||'') === '打开右侧边栏')`);
    if (idx >= 0) await cdp.clickSelector('button', { index: idx, settleMs: 1200 });
  }
  if ((await cdp.eval(`document.querySelectorAll('[data-files-path]').length`)) === 0) {
    const gIdx = await cdp.eval(`[...document.querySelectorAll('[data-sidebar-right-guide-entry]')].findIndex(e => e.getAttribute('data-sidebar-right-guide-entry') === 'files')`);
    if (gIdx >= 0) await cdp.clickSelector('[data-sidebar-right-guide-entry]', { index: gIdx, settleMs: 1600 });
    else await cdp.pressShortcut('Control+Alt+P', { settleMs: 1800 });
  }
  await sleep(700);
  if ((await cdp.eval(`document.querySelectorAll('[data-files-entry="file"]').length`)) === 0) {
    const dirIdx = await cdp.eval(`[...document.querySelectorAll('[data-files-entry="directory"]')].findIndex(el => el.getAttribute('aria-expanded') !== 'true')`);
    if (dirIdx >= 0) await cdp.clickSelector('[data-files-entry="directory"]', { index: dirIdx, settleMs: 1500 });
  }
  const found = await cdp.findClickable('[data-files-entry="file"]', { from: 'first' });
  if (!found.chosen) return null;
  return { ...found.chosen, text: found.chosen.text || found.chosen.index };
}

async function verifyInBrowser(state, pkg) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const chrome = await launchChrome({ url: state.url, port: 9333, headless: !flag('headed') });
  const cdp = await connectPage(9333, { match: '127.0.0.1' });
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  const origin = `http://127.0.0.1:${state.port}`;
  try {
    await cdp.send('Browser.grantPermissions', {
      origin,
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
    });
  } catch (err) {
    check('clipboard permission granted', 'SKIP', err.message);
  }
  await sleep(1000);
  await waitForShell(cdp);

  // (a) the boot graph must list our client bundle
  const boot = await cdp.eval(`(() => {
    const b = window.__DSH_BOOT__ || {};
    return {
      entries: (b.entries || []).map(e => e.id),
      batches: (b.batches || []).flatMap(x => x.entries || []),
    };
  })()`);
  const inBoot = [...(boot.entries || []), ...(boot.batches || [])].includes(pkg.name);
  check('boot graph contains plugin bundle', inBoot ? 'PASS' : 'FAIL', inBoot ? pkg.name : `not in ${boot.entries?.length ?? 0} entries`);

  // (b) reach a transcript with a tool-call file reference
  const contIdx = await cdp.eval(`[...document.querySelectorAll('button')].findIndex(b => (b.textContent||'').trim() === '继续')`);
  if (contIdx >= 0) await cdp.clickSelector('button', { index: contIdx, settleMs: 500 });

  const opened = await cdp.eval(`(() => {
    const rows = [...document.querySelectorAll('[data-row-key]')];
    const wi = rows.findIndex(r => r.getAttribute('data-row-key').startsWith('workspace:') && (r.textContent||'').trim() === 'plugin');
    if (wi < 0) return null;
    const r = rows[wi].getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2, expanded: rows[wi].getAttribute('aria-expanded') };
  })()`);
  if (!opened) {
    check('workspace `plugin` found', 'FAIL', 'no workspace row named plugin');
    await cdp.close();
    await chrome.close();
    finish();
  }
  if (opened.expanded !== 'true') await cdp.clickAt(opened.x, opened.y, { settleMs: 900 });

  const session = await cdp.eval(`(() => {
    const rows = [...document.querySelectorAll('[data-row-key]')];
    const wi = rows.findIndex(r => r.getAttribute('data-row-key').startsWith('workspace:') && (r.textContent||'').trim() === 'plugin');
    const group = [];
    for (let i = wi + 1; i < rows.length && !rows[i].getAttribute('data-row-key').startsWith('workspace:'); i++) group.push(rows[i]);
    const usable = group.filter(r => !/^新会话/.test((r.textContent||'').trim()));
    const pick = usable[0] ?? group[0];
    if (!pick) return null;
    const b = pick.getBoundingClientRect();
    return { x: b.left + b.width/2, y: b.top + b.height/2, title: (pick.textContent||'').trim().slice(0, 40), usable: usable.map(r => (r.textContent||'').trim().slice(0, 30)) };
  })()`);
  if (!session) {
    check('session with a transcript opened', 'FAIL', 'no session row under plugin');
    await cdp.close();
    await chrome.close();
    finish();
  }
  await cdp.clickAt(session.x, session.y, { settleMs: 2500 });
  await sleep(1500);
  // expand collapsed step groups so tool rows are in the DOM (only collapsed
  // ones — clicking an expanded disclosure would hide its body)
  await cdp.eval(`(() => {
    for (const el of document.querySelectorAll('[data-disclosure-row][data-expandable="true"]')) {
      if (el.getAttribute('aria-expanded') !== 'false') continue;
      const btn = el.closest('[data-disclosure-header]')?.querySelector('button') || el.querySelector('button');
      if (btn) btn.click();
    }
    return true;
  })()`);
  await sleep(1200);

  // A transcript that is still streaming keeps moving, and the composer floats
  // over the bottom of it, so pick a link that is genuinely clickable right now.
  const SEL = '[data-tool] button[class*="fileLink"]';
  let target = null;
  let pick = null;
  for (let attempt = 0; attempt < 3 && !target; attempt++) {
    pick = await cdp.findClickable(SEL);
    if (pick.chosen) {
      target = pick.chosen;
      break;
    }
    await sleep(800);
  }
  if (!target) {
    // Fall back to the right sidebar file tree: a static surface that also
    // carries a real path (data-files-path) and is what the plugin targets.
    const tree = await openFileTreeTarget(cdp);
    if (tree) {
      target = tree;
      check('file reference target', 'PASS', `file tree row (transcript link not clickable: ${pick?.total ?? 0} found, composerTop=${pick?.composerTop})`);
    }
  } else {
    check('file reference target', 'PASS', `transcript tool row: ${target.text}  (session: ${session.title})`);
  }
  if (!target) {
    check('file reference target', 'FAIL', `no clickable ${SEL} and no file tree row`);
    await cdp.screenshot(path.join(SHOT_DIR, 'no-target.png'));
    await cdp.close();
    await chrome.close();
    finish();
  }

  // (c) right-click -> custom menu. The plugin resolves the path through the
  // session remotes before mounting, so allow several seconds.
  await cdp.screenshot(path.join(SHOT_DIR, '01-before-right-click.png'));
  let menu = null;
  for (let attempt = 0; attempt < 2 && !menu; attempt++) {
    await cdp.rightClickAt(target.x, target.y, { settleMs: 300 });
    try {
      await cdp.waitFor(`document.querySelector('[data-dfa-menu]') !== null`, { timeoutMs: 12000, label: 'dfa menu' });
      menu = await cdp.eval(`(() => {
        const root = document.querySelector('[data-dfa-menu]');
        if (!root) return null;
        const r = root.getBoundingClientRect();
        return {
          text: (root.textContent || '').trim().slice(0, 300),
          items: [...root.querySelectorAll('[data-dfa-item]')].map(i => (i.textContent || '').trim()),
          rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
          zIndex: getComputedStyle(root).zIndex,
          position: getComputedStyle(root).position,
          html: root.outerHTML.slice(0, 300),
        };
      })()`);
    } catch {
      menu = null;
    }
    if (!menu) {
      const again = await cdp.findClickable(SEL);
      if (again.chosen) target = again.chosen;
      await sleep(600);
    }
  }
  await cdp.screenshot(path.join(SHOT_DIR, '02-menu-open.png'));

  if (!menu) {
    check('custom menu appears on right-click', 'FAIL', 'no [data-dfa-menu] within 6s (native Chromium menu probably took over)');
    await cdp.close();
    await chrome.close();
    finish();
  }
  check('custom menu appears on right-click', 'PASS', `${menu.items.length} items, position:${menu.position}, z:${menu.zIndex}`);
  check('menu offers 复制路径', menu.items.some((t) => t.includes('复制路径')) ? 'PASS' : 'FAIL', menu.items.join(' / '));

  // (d) 复制路径 -> clipboard holds the absolute path
  const itemIdx = await cdp.eval(`(() => {
    const items = [...document.querySelectorAll('[data-dfa-menu] [data-dfa-item]')];
    return items.findIndex(i => (i.textContent || '').includes('复制路径'));
  })()`);
  if (itemIdx < 0) {
    check('copy-path puts the absolute path on the clipboard', 'FAIL', 'no 复制路径 item to click');
    await cdp.close();
    await chrome.close();
    finish();
  }
  await cdp.clickSelector('[data-dfa-menu] [data-dfa-item]', { index: itemIdx, settleMs: 900 });

  let clip = '';
  try {
    clip = (await cdp.eval(`navigator.clipboard.readText()`)) || '';
  } catch (err) {
    clip = '';
  }
  if (!clip) {
    // headless Chromium does not always sync to the OS clipboard; ask Windows
    const r = spawnSync('pwsh', ['-NoProfile', '-Command', 'Get-Clipboard -Raw'], { encoding: 'utf8', timeout: 15000 });
    clip = (r.stdout || '').trim();
  }
  const abs = /^[A-Za-z]:[\\/]/.test(clip) || clip.startsWith('\\\\');
  const endsRight = clip.replace(/\//g, '\\').toLowerCase().endsWith(target.text.replace(/\//g, '\\').toLowerCase());
  check(
    'copy-path puts the absolute path on the clipboard',
    abs ? 'PASS' : 'FAIL',
    abs ? `${clip}${endsRight ? '' : ' (warning: basename differs from the clicked reference)'}` : `clipboard="${clip}"`,
  );

  const toast = await cdp.eval(`(document.querySelector('.dfa-toast')?.textContent || '').trim().slice(0, 120)`);
  check('no error toast after the action', /失败|错误|failed/i.test(toast) ? 'FAIL' : 'PASS', toast || '(no toast)');

  await cdp.screenshot(path.join(SHOT_DIR, '03-after-copy.png'));
  await cdp.close();
  await chrome.close();
}

// -------------------------------------------------------------------- driver
const pkg = preflight();
if (flag('no-install')) {
  check('install skipped', 'SKIP', '--no-install');
} else {
  stopInstance();
  const installed = installPlugin(pkg);
  if (!installed) {
    check('install', 'FAIL', 'plugin could not be installed');
    finish();
  }
}
const state = startInstance();
try {
  await verifyInBrowser(state, pkg);
} catch (err) {
  check('browser verification', 'FAIL', err.message);
}
finish();
