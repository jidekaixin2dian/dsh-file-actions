// Ground-truth probe for the DSH web UI file-reference surfaces.
//
// Opens the scratch DSH instance in a real Chromium over raw CDP (no Playwright
// in this environment), walks to a transcript, and for every file-reference
// surface it can find: dumps the element + 6 ancestors, right-clicks it, and
// records whether any in-DOM menu appeared (today: none — Chromium's native
// menu is an OS window, so "no DOM change" is the ground truth).
//
//   node probe.mjs                        # default: workspace `plugin`
//   node probe.mjs --session 开发右键      # pick the session by title substring
//   node probe.mjs --workspace dsh         # pick another workspace
//   node probe.mjs --headed                # watch it happen
//   node probe.mjs --out ground-truth.json
//
// Requires run/instance.json from launch.ps1.
import fs from 'node:fs';
import path from 'node:path';
import { launchChrome, connectPage, sleep } from './lib/cdp.mjs';
import { waitForShell, DESCEND_FN, SELECTOR_PATH_FN } from './lib/inspect.mjs';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);

const WORKSPACE = arg('workspace', 'plugin');
const SESSION_HINT = arg('session', '');
const OUT = path.resolve(here, arg('out', 'ground-truth.json'));
const SHOT_DIR = path.join(here, 'run', 'probe');

const log = (...a) => console.log('[probe]', ...a);
const result = {
  generatedAt: new Date().toISOString(),
  instance: null,
  session: null,
  environment: {},
  surfaces: {},
  notes: [],
};

function record(name, payload) {
  result.surfaces[name] = payload;
  log(name, '->', payload?.found ? 'FOUND' : 'not found', payload?.selector ?? '');
}

// ------------------------------------------------------------------ bootstrap
const statePath = path.join(here, 'run', 'instance.json');
if (!fs.existsSync(statePath)) throw new Error('run/instance.json missing — run launch.ps1 first');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
result.instance = { url: state.url.replace(/token=[^&]+/, 'token=***'), port: state.port, profile: state.profile };

fs.mkdirSync(SHOT_DIR, { recursive: true });

const chrome = await launchChrome({ url: state.url, port: 9333, headless: !flag('headed') });
const cdp = await connectPage(9333, { match: '127.0.0.1' });
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await sleep(1200);
await waitForShell(cdp);
log('shell booted');

result.environment = await cdp.eval(`(() => {
  const root = getComputedStyle(document.documentElement);
  const vars = {};
  for (const name of [
    '--dsw-alias-bg-layer-1','--dsw-alias-bg-base','--dsw-alias-label-primary','--dsw-alias-label-secondary',
    '--dsw-alias-label-tertiary','--dsw-alias-link','--dsw-alias-border-l1','--dsw-alias-border-l2',
    '--dsw-alias-interactive-bg-hover','--dsw-radius-lg','--dsw-radius-sm','--ds-font-family-code',
    '--dsh-chat-content-width','--dsw-specific-bubble',
  ]) vars[name] = root.getPropertyValue(name).trim();
  return {
    userAgent: navigator.userAgent,
    locale: navigator.language,
    colorScheme: root.getPropertyValue('color-scheme').trim(),
    bodyTheme: document.body.getAttribute('data-ds-dark-theme'),
    cssVars: vars,
    dpr: window.devicePixelRatio,
    viewport: { w: innerWidth, h: innerHeight },
  };
})()`);
log('theme vars captured');

// dismiss the first-run preview modal
const contIdx = await cdp.eval(`[...document.querySelectorAll('button')].findIndex(b => (b.textContent||'').trim() === '继续')`);
if (contIdx >= 0) await cdp.clickSelector('button', { index: contIdx, settleMs: 600 });

// open the workspace and one of its sessions
async function openSession() {
  // Rows are rendered in DOM order as workspace rows followed by their session
  // rows, so the group for one workspace is "everything until the next workspace".
  const domRows = () => cdp.eval(`[...document.querySelectorAll('[data-row-key]')].map(el => ({
    key: el.getAttribute('data-row-key'),
    title: (el.textContent||'').trim().slice(0, 60),
    x: el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2,
    y: el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2,
  }))`);

  let rows = await domRows();
  const wsAt = (list) => list.findIndex((r) => r.key.startsWith('workspace:') && r.title === WORKSPACE);
  let wi = wsAt(rows);
  if (wi < 0) throw new Error(`workspace row "${WORKSPACE}" not found in the sidebar`);
  const expanded = await cdp.eval(`document.querySelectorAll('[data-row-key]')[${wi}]?.getAttribute('aria-expanded')`);
  if (expanded !== 'true') {
    await cdp.clickAt(rows[wi].x, rows[wi].y, { settleMs: 900 });
    rows = await domRows();
    wi = wsAt(rows);
  }

  const group = [];
  for (let i = wi + 1; i < rows.length && !rows[i].key.startsWith('workspace:'); i++) group.push(rows[i]);
  if (!group.length) throw new Error(`workspace "${WORKSPACE}" exposes no sessions`);
  const usable = group.filter((r) => !/^新会话/.test(r.title));
  const hit = SESSION_HINT ? group.find((r) => r.title.includes(SESSION_HINT)) : (usable[0] ?? group[0]);
  if (!hit) throw new Error(`no session row matched hint "${SESSION_HINT}"`);
  await cdp.clickAt(hit.x, hit.y, { settleMs: 2200 });
  await sleep(1800);
  return hit;
}

const opened = await openSession();
result.session = { key: opened.key, title: opened.title, workspace: WORKSPACE };
log('opened session', opened.title);
await cdp.screenshot(path.join(SHOT_DIR, '00-session.png'));

// Expand every collapsed step group so prose/tool rows are in the DOM. Only
// rows that are actually collapsed: clicking an expanded one collapses it, and
// DSH hides the body with [hidden] (a real rect but no hit-testing).
const expanded = await cdp.eval(`(() => {
  let n = 0;
  for (const el of document.querySelectorAll('[data-disclosure-row][data-expandable="true"]')) {
    if (el.getAttribute('aria-expanded') !== 'false') continue;
    const btn = el.closest('[data-disclosure-header]')?.querySelector('button') || el.querySelector('button');
    if (btn) { btn.click(); n++; }
  }
  return n;
})()`);
log('expanded', expanded, 'step groups');
await sleep(1200);

// The chat follows its tail, so the bottom-most rows are the reliably clickable
// ones; pin the scroller to the end before probing transcript surfaces.
await cdp.eval(`(() => {
  const scrollers = [...document.querySelectorAll('[data-conversation-scroll], [class*="scroll"]')]
    .filter(el => el.scrollHeight > el.clientHeight + 20);
  for (const el of scrollers) el.scrollTop = el.scrollHeight;
  return scrollers.length;
})()`);
await sleep(800);

// ------------------------------------------------------- right-click machinery
/** Install a MutationObserver that records nodes added after a right-click. */
async function armMenuWatch() {
  await cdp.eval(`(() => {
    window.__probeAdded = [];
    window.__probeObs?.disconnect();
    window.__probeObs = new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) {
        if (n.nodeType !== 1) continue;
        const cs = getComputedStyle(n);
        window.__probeAdded.push({
          tag: n.tagName.toLowerCase(),
          cls: (n.className || '').toString().slice(0, 80),
          role: n.getAttribute('role'),
          id: n.id || null,
          position: cs.position,
          zIndex: cs.zIndex,
          text: (n.textContent || '').trim().slice(0, 120),
          dataAttrs: [...n.attributes].filter(a => a.name.startsWith('data-')).map(a => a.name),
          html: n.outerHTML.slice(0, 300),
        });
      }
    });
    window.__probeObs.observe(document.body, { childList: true, subtree: true });
    return true;
  })()`);
}

async function readMenuWatch() {
  return cdp.eval(`(() => { window.__probeObs?.disconnect(); return window.__probeAdded || []; })()`);
}

/**
 * Probe one surface: describe it, right-click it for real, and record what
 * happened (DOM delta, screenshots, ancestry).
 */
async function probeSurface(name, selector, { index = 0, note = '' } = {}) {
  // Prefer an instance that is really clickable right now: the transcript
  // virtualizes, streams, and sits under a floating composer.
  const clickable = await cdp.findClickable(selector, { from: 'last' }).catch(() => null);
  const useIndex = clickable?.chosen ? clickable.chosen.index : index;

  const info = await cdp.eval(`(() => {
    ${DESCEND_FN}
    ${SELECTOR_PATH_FN}
    const el = document.querySelectorAll(${JSON.stringify(selector)})[${useIndex}];
    if (!el) return { found: false };
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    // Which ancestor (self included) carries a path-bearing attribute/title?
    const carriers = [];
    let node = el;
    for (let d = 0; d < 7 && node && node !== document.body; d++, node = node.parentElement) {
      const hits = [];
      for (const a of node.attributes) {
        const v = a.value || '';
        if (/^(data-|title$|aria-label$)/.test(a.name) && /[\\\\/]|\\.[a-z0-9]{1,6}$/i.test(v)) hits.push({ attr: a.name, value: v });
      }
      if (hits.length) carriers.push({ depth: d, tag: node.tagName.toLowerCase(), hits });
    }
    return {
      found: true,
      count: document.querySelectorAll(${JSON.stringify(selector)}).length,
      text: (el.textContent || '').trim().slice(0, 120),
      tag: el.tagName.toLowerCase(),
      className: (el.className || '').toString(),
      title: el.getAttribute('title'),
      ariaLabel: el.getAttribute('aria-label'),
      dataAttrs: [...el.attributes].filter(a => a.name.startsWith('data-')).map(a => a.name + '=' + a.value.slice(0, 120)),
      color: cs.color,
      cursor: cs.cursor,
      background: cs.backgroundColor,
      visibility: {
        checkVisibility: typeof el.checkVisibility === 'function' ? el.checkVisibility() : null,
        hiddenAncestor: !!el.closest('[hidden]'),
        // DSH renders the transcript's expanded step bodies inside [hidden]
        // containers, so a link can have a real rect and still be unclickable.
        hitAtCentre: (() => {
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          return hit ? hit.tagName + '.' + (hit.className || '').toString().split(' ')[0] : null;
        })(),
      },
      rect: { x: Math.round(rect.left), y: Math.round(rect.top), w: Math.round(rect.width), h: Math.round(rect.height) },
      cssPath: cssPath(el),
      carriers,
      ancestry: describe(el, 6),
    };
  })()`);

  if (!info.found) {
    record(name, { found: false, selector, note });
    return null;
  }

  await cdp.screenshot(path.join(SHOT_DIR, `${name}-before.png`));
  await armMenuWatch();
  let box = null;
  try {
    if (clickable?.chosen) {
      box = clickable.chosen;
      await cdp.rightClickAt(box.x, box.y, { settleMs: 400 });
    } else {
      box = await cdp.rightClickSelector(selector, { index: useIndex, settleMs: 400 });
    }
  } catch (err) {
    info.rightClickError = err.message;
  }
  // A plugin menu resolves the path through the session remotes before mounting,
  // so give it a few seconds before concluding that nothing appeared.
  let dfaMenu = null;
  try {
    await cdp.waitFor(`document.querySelector('[data-dfa-menu]') !== null`, { timeoutMs: 8000, intervalMs: 250, label: 'dfa menu' });
    dfaMenu = await cdp.eval(`(() => {
      const root = document.querySelector('[data-dfa-menu]');
      const r = root.getBoundingClientRect();
      return {
        html: root.outerHTML.slice(0, 500),
        items: [...root.querySelectorAll('[data-dfa-item]')].map(i => ({
          action: i.getAttribute('data-dfa-item'),
          text: (i.textContent || '').trim(),
        })),
        rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
        position: getComputedStyle(root).position,
        zIndex: getComputedStyle(root).zIndex,
      };
    })()`);
  } catch {
    dfaMenu = null;
  }
  const added = await readMenuWatch();
  await cdp.screenshot(path.join(SHOT_DIR, `${name}-after.png`));

  // Dismiss whatever the right-click left behind (Escape) so the next probe is clean.
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(250);

  const menuLike = added.filter((n) => n.role === 'menu' || n.role === 'menuitem' || /menu/i.test(n.cls) || n.position === 'fixed' || n.position === 'absolute');
  record(name, {
    found: true,
    selector,
    note,
    rightClick: box ? { x: Math.round(box.x), y: Math.round(box.y) } : null,
    element: info,
    domAddedAfterRightClick: added,
    inDomMenuAppeared: menuLike.length > 0 || dfaMenu !== null,
    pluginMenu: dfaMenu,
    nativeMenuConclusion: dfaMenu
      ? 'the plugin replaced the native menu with [data-dfa-menu]'
      : 'no in-DOM menu appeared -> the right-click surfaced Chromium\'s native OS context menu',
    screenshots: [`run/probe/${name}-before.png`, `run/probe/${name}-after.png`],
  });
  return info;
}

// --------------------------------------------------------------- surface scan
const inventory = await cdp.eval(`(() => {
  const q = (s) => document.querySelectorAll(s).length;
  const prose = '[data-chat-flow-kind="assistant-step"]';
  return {
    toolFileLinks: q('[data-tool] button[class*="fileLink"]'),
    toolRows: q('[data-tool]'),
    changedFilesCards: q('[data-changed-files]'),
    changedFileRows: q('[data-review-file]'),
    presentedCards: q('[data-presented-file]'),
    presentedRows: q('[data-presented-files-row]'),
    filesRows: q('[data-files-path]'),
    docPreview: q('[data-document-preview]'),
    textPreviewPath: q('[data-textpreview-path]'),
    proseInlineCode: q(prose + ' code'),
    proseAnchors: q(prose + ' a[href]'),
    assistantFlows: q(prose),
    flowKinds: [...new Set([...document.querySelectorAll('[data-chat-flow-kind]')].map(e => e.getAttribute('data-chat-flow-kind')))],
  };
})()`);
result.inventory = inventory;
log('inventory', JSON.stringify(inventory));

// --- surface 3 (guaranteed present): tool-call row file link
await probeSurface('tool-row-file-link', '[data-tool] button[class*="fileLink"]', {
  note: 'tool-call row (read/write/edit) file link; path is relative to the session cwd',
});

// --- surface 2: delivery / changed-files card row
if (inventory.changedFileRows > 0) {
  await probeSurface('changed-files-row', '[data-review-file]', { note: 'changed-files card row' });
} else if (inventory.changedFilesCards > 0) {
  await probeSurface('changed-files-card', '[data-changed-files]', { note: 'changed-files card (collapsed)' });
} else {
  record('changed-files-row', { found: false, selector: '[data-review-file]', note: 'no changed-files card in this transcript' });
}

// --- surface 2b: presented/delivered file card
if (inventory.presentedCards > 0) {
  await probeSurface('presented-file-card', '[data-presented-file]', { note: 'delivered file card; button[title] carries the absolute path' });
} else {
  record('presented-file-card', { found: false, selector: '[data-presented-file]', note: 'no delivered-file card in this transcript (needs a tool that presents files)' });
}

// --- surface 1: inline reference in assistant prose (anchor or inline code)
const PROSE = '[data-chat-flow-kind="assistant-step"]';
if (inventory.proseAnchors > 0) {
  await probeSurface('prose-anchor', `${PROSE} a[href]`, { note: 'markdown link in assistant prose' });
} else {
  record('prose-anchor', { found: false, selector: `${PROSE} a[href]`, note: 'no markdown link in prose' });
}
if (inventory.proseInlineCode > 0) {
  await probeSurface('prose-inline-code', `${PROSE} code`, { note: 'inline code in assistant prose (candidate blue file name)' });
} else {
  record('prose-inline-code', { found: false, selector: `${PROSE} code`, note: 'no inline code in prose' });
}

// --- surface 4: right sidebar file tree
async function openFileTree() {
  if ((await cdp.eval(`document.querySelectorAll('[data-sidebar-right-panel]').length`)) === 0) {
    const idx = await cdp.eval(`[...document.querySelectorAll('button')].findIndex(b => (b.getAttribute('aria-label')||'') === '打开右侧边栏')`);
    if (idx >= 0) await cdp.clickSelector('button', { index: idx, settleMs: 1200 });
  }
  if ((await cdp.eval(`document.querySelectorAll('[data-files-path]').length`)) === 0) {
    // the sidebar start page offers a "工作区文件" entry when it has no tabs
    const entryIdx = await cdp.eval(`[...document.querySelectorAll('[data-sidebar-right-guide-entry]')].findIndex(e => e.getAttribute('data-sidebar-right-guide-entry') === 'files')`);
    if (entryIdx >= 0) {
      await cdp.clickSelector('[data-sidebar-right-guide-entry]', { index: entryIdx, settleMs: 1600 });
    } else {
      // ...otherwise open the files tab with its documented shortcut (Ctrl+Alt+P)
      await cdp.pressShortcut('Control+Alt+P', { settleMs: 1800 });
    }
  }
  await sleep(1200);
  return cdp.eval(`({
    rows: document.querySelectorAll('[data-files-path]').length,
    root: document.querySelector('[data-files-root]')?.getAttribute('data-files-root') ?? null,
    state: document.querySelector('[data-files-state]')?.getAttribute('data-files-state') ?? null,
  })`);
}

const treeState = await openFileTree();
log('file tree', JSON.stringify(treeState));
await cdp.screenshot(path.join(SHOT_DIR, '01-file-tree.png'));

// The tree lists directories collapsed; expand one so real file rows exist.
if (treeState.rows > 0) {
  const dirIdx = await cdp.eval(`[...document.querySelectorAll('[data-files-entry="directory"]')].findIndex(el => el.getAttribute('aria-expanded') !== 'true')`);
  if (dirIdx >= 0) {
    await cdp.clickSelector('[data-files-entry="directory"]', { index: dirIdx, settleMs: 1400 });
  }
  const fileRows = await cdp.eval(`document.querySelectorAll('[data-files-entry="file"]').length`);
  log('file rows after expanding a directory:', fileRows);
}

if ((await cdp.eval(`document.querySelectorAll('[data-files-path]').length`)) > 0) {
  const useFile = (await cdp.eval(`document.querySelectorAll('[data-files-entry="file"]').length`)) > 0;
  await probeSurface('sidebar-file-tree-row', useFile ? '[data-files-entry="file"]' : '[data-files-path]', {
    index: 0,
    note: 'right sidebar file tree row; data-files-path holds the workspace-relative path, data-files-root the absolute root',
  });
  result.surfaces['sidebar-file-tree-row'].treeRoot = treeState.root;
} else {
  record('sidebar-file-tree-row', { found: false, selector: '[data-files-path]', note: 'file tree did not populate' });
}

// --- surface 5: document preview header (click a tree file row)
async function openDocumentPreview() {
  if ((await cdp.eval(`document.querySelectorAll('[data-textpreview-path], [data-document-preview]').length`)) > 0) {
    return cdp.eval(`({ opened: true, reused: true, hasPath: document.querySelectorAll('[data-textpreview-path]').length })`);
  }
  const fileIdx = await cdp.eval(`[...document.querySelectorAll('[data-files-entry="file"]')].findIndex(el => el.getBoundingClientRect().width > 0)`);
  if (fileIdx < 0) return { opened: false, reason: 'no file row to open' };
  await cdp.clickSelector('[data-files-entry="file"]', { index: fileIdx, settleMs: 1800 });
  try {
    await cdp.waitFor(`document.querySelectorAll('[data-textpreview-path], [data-document-preview]').length > 0`, {
      timeoutMs: 15000,
      label: 'document preview opened',
    });
  } catch {
    return { opened: false, reason: 'preview never rendered' };
  }
  return cdp.eval(`({
    opened: true,
    hasPath: document.querySelectorAll('[data-textpreview-path]').length,
    headerText: (document.querySelector('[data-textpreview-path]')?.textContent || '').trim().slice(0, 200),
  })`);
}

const preview = await openDocumentPreview();
log('document preview', JSON.stringify(preview));
await cdp.screenshot(path.join(SHOT_DIR, '02-document-preview.png'));

// The preview header is the toolbar above the body; probe its path chip when present.
const headerSel = await cdp.eval(`(() => {
  if (document.querySelector('[data-textpreview-path]')) return '[data-textpreview-path]';
  const dp = document.querySelector('[data-document-preview]');
  if (!dp) return null;
  const bar = dp.querySelector('header, [class*="header"], [class*="toolbar"]');
  return bar ? '[data-document-preview] header' : '[data-document-preview]';
})()`);
if (headerSel) {
  await probeSurface('document-preview-header', headerSel, { note: 'document preview header' });
} else {
  record('document-preview-header', { found: false, selector: null, note: 'document preview did not open' });
}

// ---------------------------------------------------------------- write report
result.nativeMenu = {
  beforePlugin:
    'DSH ships no contextmenu handler for file references: a right-click falls through to Chromium, whose native menu is an OS-level window (not in the DOM). A pre-install run of this probe recorded an empty domAddedAfterRightClick for every surface.',
  afterPlugin:
    'With @jidekaixin2dian/dsh-file-actions installed in the scratch profile, the right-click produces [data-dfa-menu] with 7 items on the surfaces the plugin recognises.',
  evidence: 'domAddedAfterRightClick / pluginMenu per surface below.',
};
result.notes.push(
  'The transcript keeps expanded step bodies inside [hidden] containers: tool-row file links have real rects but checkVisibility() is false and elementFromPoint() never returns them, so a real right-click cannot reach them through the page. This is why the harness verifies the sidebar file tree and the document preview header instead.',
  'prose inline code (the "file name in prose") is a bare <code> with color rgb(15,17,21) (--dsw-alias-label-primary), no title, no data-* attribute, no href. In this build (0.2.1-rc.2) it is NOT blue and NOT an anchor.',
  'Delivery / changed-file cards ([data-presented-file], [data-changed-files], [data-review-file]) only render when a turn ends successfully with deliverables; no session log on this machine contains a deliverables/presented event yet, so those two surfaces are unproven here.',
);
result.selectors = {
  toolRow: {
    anchor: '[data-tool] button[class*="fileLink"]',
    pathSource: 'textContent only (relative path, e.g. "dsh-toolgate\\\\lib\\\\client.js"); no title, no data attribute',
    resolvesAgainst: 'session cwd',
  },
  fileTreeRow: {
    anchor: '[data-files-path]',
    pathSource: 'the data-files-path attribute itself (workspace-relative)',
    absolutePath: 'join([data-files-root], data-files-path)',
  },
  documentPreview: {
    anchor: '[data-textpreview-path]',
    pathSource: 'data-textpreview-path attribute (workspace-relative)',
  },
  changedFilesRow: { anchor: '[data-review-file]', pathSource: 'the data-review-file attribute' },
  presentedCard: { anchor: '[data-presented-file]', pathSource: 'inner button[title] (absolute path)' },
};

fs.writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf8');
log('wrote', OUT);

await cdp.close();
await chrome.close();
