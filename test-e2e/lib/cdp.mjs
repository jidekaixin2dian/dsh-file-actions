import { createServer } from 'node:net';
// Tiny Chrome DevTools Protocol driver: launch a Chromium from the Playwright
// browser cache, connect to its page target over the hand-rolled WebSocket
// client, and expose the handful of primitives the harness needs.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebSocketClient } from './ws.mjs';

// The browser comes from the Playwright cache; keep the machine-specific root out
// of the repository — set DFA_CHROME or rely on %LOCALAPPDATA%.
const PLAYWRIGHT_ROOT = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'ms-playwright');

export function findChrome() {
  if (process.env.DFA_CHROME && fs.existsSync(process.env.DFA_CHROME)) return process.env.DFA_CHROME;
  if (fs.existsSync(PLAYWRIGHT_ROOT)) {
    const dirs = fs.readdirSync(PLAYWRIGHT_ROOT);
    const exact = dirs.filter((dir) => dir.startsWith('chromium-')).sort().reverse();
    for (const dir of exact) {
      const p = path.join(PLAYWRIGHT_ROOT, dir, 'chrome-win64', 'chrome.exe');
      if (fs.existsSync(p)) return p;
    }
    for (const dir of dirs.filter((name) => name.startsWith('chromium_headless_shell-'))) {
      const p = path.join(PLAYWRIGHT_ROOT, dir, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
      if (fs.existsSync(p)) return p;
    }
  }
  throw new Error(`no Chromium found under ${PLAYWRIGHT_ROOT} — set DFA_CHROME`);
}

export async function requireFreePort(port) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function httpJson(url, timeoutMs = 5000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

export async function waitForDevtools(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      return await httpJson(`http://127.0.0.1:${port}/json/version`, 2000);
    } catch (err) {
      lastErr = err;
      await sleep(200);
    }
  }
  throw new Error(`devtools endpoint on :${port} never answered (${lastErr?.message})`);
}

/**
 * Launch Chromium with remote debugging and return { proc, port, userDataDir, close() }.
 * @param {{url?: string, port?: number, headless?: boolean, width?: number, height?: number, userDataDir?: string}} opts
 */
export async function launchChrome(opts = {}) {
  const exe = findChrome();
  const port = opts.port ?? 9333;
  await requireFreePort(port);
  const userDataDir = opts.userDataDir ?? path.join(os.tmpdir(), `dsh-e2e-chrome-${Date.now()}`);
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-features=Translate,MediaRouter',
    `--window-size=${opts.width ?? 1600},${opts.height ?? 1000}`,
    '--force-device-scale-factor=1',
    // Chromium refuses to render a page in a "hidden" window under some
    // sessions; these keep layout/paint deterministic in headless.
    '--hide-scrollbars',
    '--disable-gpu',
  ];
  if (opts.headless !== false) args.push('--headless=new');
  if (opts.url) args.push(opts.url);

  const proc = spawn(exe, args, { stdio: 'ignore', detached: false });
  proc.on('error', () => {});

  const version = await waitForDevtools(port);

  const close = async () => {
    try {
      proc.kill();
    } catch {}
    await sleep(300);
    try {
      await fsp.rm(userDataDir, { recursive: true, force: true });
    } catch {}
  };
  return { proc, port, userDataDir, exe, version, close };
}

export async function connectPage(port, { match, timeoutMs = 30000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let target = null;
  while (Date.now() < deadline) {
    const list = await httpJson(`http://127.0.0.1:${port}/json/list`).catch(() => []);
    target = list.find((t) => t.type === 'page' && (!match || t.url.includes(match))) ?? null;
    if (target) break;
    await sleep(200);
  }
  if (!target) throw new Error('no page target found');
  const cdp = new Cdp(target.webSocketDebuggerUrl, target);
  await cdp.connect();
  return cdp;
}

export class Cdp {
  #ws;
  #seq = 0;
  #pending = new Map();
  #listeners = new Map();

  constructor(wsUrl, target) {
    this.wsUrl = wsUrl;
    this.target = target;
  }

  async connect() {
    this.#ws = new WebSocketClient(this.wsUrl);
    this.#ws.on('message', (text) => this.#onMessage(text));
    this.#ws.on('error', () => {});
    await this.#ws.connect();
    return this;
  }

  #onMessage(text) {
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (msg.id !== undefined && this.#pending.has(msg.id)) {
      const { resolve, reject } = this.#pending.get(msg.id);
      this.#pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
      else resolve(msg.result);
      return;
    }
    const handlers = this.#listeners.get(msg.method);
    if (handlers) for (const h of handlers) h(msg.params);
  }

  on(method, handler) {
    if (!this.#listeners.has(method)) this.#listeners.set(method, []);
    this.#listeners.get(method).push(handler);
    return () => {
      const arr = this.#listeners.get(method) ?? [];
      const i = arr.indexOf(handler);
      if (i >= 0) arr.splice(i, 1);
    };
  }

  send(method, params = {}, timeoutMs = 30000) {
    const id = ++this.#seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`CDP ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.#pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.#ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Evaluate an expression in the page; returns the JSON value. */
  async eval(expression, { awaitPromise = true, timeoutMs = 30000 } = {}) {
    const res = await this.send(
      'Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise, userGesture: true, allowUnsafeEvalBlockedByCSP: true },
      timeoutMs,
    );
    if (res.exceptionDetails) {
      const d = res.exceptionDetails;
      const text = d.exception?.description ?? d.text ?? JSON.stringify(d);
      throw new Error(`page eval threw: ${text}`);
    }
    return res.result?.value;
  }

  async screenshot(filePath) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, Buffer.from(data, 'base64'));
    return filePath;
  }

  async goto(url) {
    await this.send('Page.navigate', { url });
  }

  /** Poll an expression until it returns truthy. */
  async waitFor(expression, { timeoutMs = 30000, intervalMs = 200, label = expression } = {}) {
    const deadline = Date.now() + timeoutMs;
    let last;
    while (Date.now() < deadline) {
      try {
        last = await this.eval(expression);
        if (last) return last;
      } catch (err) {
        last = err.message;
      }
      await sleep(intervalMs);
    }
    throw new Error(`waitFor timeout: ${label} (last=${JSON.stringify(last)?.slice(0, 300)})`);
  }

  /**
   * Scroll a selector into view and measure it. The chat list scrolls smoothly
   * and virtualizes, so a rect taken right after scrollIntoView() can still be
   * outside the viewport — measure, wait, and nudge the scroll container.
   * Returns { x, y, w, h } in CSS pixels, or null when the selector is absent.
   */
  async measureSelector(selector, { index = 0, settleMs = 450 } = {}) {
    const read = () =>
      this.eval(`(() => {
        const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const hit = document.elementFromPoint(x, y);
        return {
          x, y, w: r.width, h: r.height, top: r.top, bottom: r.bottom,
          inView: r.top >= 0 && r.bottom <= innerHeight && r.width > 0 && r.height > 0,
          hitSelf: !!hit && (hit === el || el.contains(hit)),
          hitTag: hit ? hit.tagName + '.' + (hit.className || '').toString().slice(0, 40) : null,
          vh: innerHeight, vw: innerWidth,
        };
      })()`);

    for (let attempt = 0; attempt < 4; attempt++) {
      await this.eval(`(() => {
        const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
        if (!el) return null;
        el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
        return true;
      })()`);
      await sleep(settleMs);
      let box = await read();
      if (!box) return null;
      if (box.inView && box.hitSelf) return box;

      if (!box.inView) {
        // Drive the scrollable ancestors ourselves: smooth scrolling and
        // virtualized lists both ignore scrollIntoView sometimes.
        await this.eval(`(() => {
          const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
          let node = el.parentElement;
          while (node && node !== document.body) {
            const cs = getComputedStyle(node);
            if (/(auto|scroll)/.test(cs.overflowY) && node.scrollHeight > node.clientHeight + 4) {
              const er = el.getBoundingClientRect();
              const nr = node.getBoundingClientRect();
              node.scrollTop += (er.top - nr.top) - (nr.height / 2 - er.height / 2);
            }
            node = node.parentElement;
          }
          return true;
        })()`);
        await sleep(settleMs);
      } else if (!box.hitSelf) {
        // In view but something overlays the centre point; nudge to a point that
        // belongs to the element itself.
        const nudged = await this.eval(`(() => {
          const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
          const r = el.getBoundingClientRect();
          const candidates = [
            [r.left + 4, r.top + r.height / 2],
            [r.right - 4, r.top + r.height / 2],
            [r.left + r.width / 2, r.top + 2],
            [r.left + r.width / 2, r.bottom - 2],
            [r.left + 6, r.top + 2],
          ];
          for (const [x, y] of candidates) {
            const hit = document.elementFromPoint(x, y);
            if (hit && (hit === el || el.contains(hit))) {
              return { x, y, w: r.width, h: r.height, inView: true, hitSelf: true, vh: innerHeight, vw: innerWidth };
            }
          }
          return null;
        })()`);
        if (nudged) return nudged;
      }
    }
    return read();
  }

  /** Right-click at the centre of a CSS selector, with a real mouse event. */
  async rightClickSelector(selector, { index = 0, settleMs = 400 } = {}) {
    const box = await this.measureSelector(selector, { index });
    if (!box) throw new Error(`selector not found: ${selector}`);
    if (box.w === 0 || box.h === 0) throw new Error(`selector has zero box: ${selector}`);
    if (!box.inView) throw new Error(`selector is outside the viewport: ${selector} (y=${Math.round(box.y)} of ${box.vh})`);
    const { x, y } = box;
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'right',
      buttons: 2,
      clickCount: 1,
    });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'right',
      buttons: 0,
      clickCount: 1,
    });
    await sleep(settleMs);
    return box;
  }

  /** Real right-click at absolute viewport coordinates. */
  async rightClickAt(x, y, { settleMs = 500 } = {}) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', buttons: 2, clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', buttons: 0, clickCount: 1 });
    await sleep(settleMs);
  }

  /**
   * Find an element of `selector` that is really clickable right now: inside the
   * viewport, and with `elementFromPoint` resolving to it (not to the composer
   * that floats over the transcript). Scans from the end of the list by default,
   * because the chat follows its tail.
   */
  async findClickable(selector, { maxCandidates = 15, from = 'last' } = {}) {
    const info = await this.eval(`(() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const composer = document.querySelector('[class*="composerStack"], [class*="composer"]');
      const composerTop = composer ? composer.getBoundingClientRect().top : innerHeight;
      const out = [];
      els.forEach((el, index) => {
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return;
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        if (r.top < 8 || r.bottom > Math.min(innerHeight - 8, composerTop - 4)) return;
        const hit = document.elementFromPoint(x, y);
        const hitSelf = !!hit && (hit === el || el.contains(hit));
        out.push({ index, x, y, hitSelf, text: (el.textContent || '').trim().slice(0, 90) });
      });
      return { total: els.length, candidates: out, composerTop: Math.round(composerTop) };
    })()`);
    const list = from === 'last' ? [...info.candidates].reverse() : info.candidates;
    const usable = list.filter((c) => c.hitSelf);
    const chosen = usable[0] ?? null;
    return { ...info, chosen };
  }

  /** Real left click at the centre of a CSS selector (React-friendly). */
  async clickSelector(selector, { index = 0, settleMs = 300 } = {}) {
    const box = await this.measureSelector(selector, { index, settleMs: Math.max(settleMs, 250) });
    if (!box) throw new Error(`selector not found: ${selector}[${index}]`);
    if (!box.inView) throw new Error(`selector is outside the viewport: ${selector}[${index}]`);
    const { x, y } = box;
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(settleMs);
    return box;
  }

  /** Real left click at absolute viewport coordinates. */
  async clickAt(x, y, { settleMs = 300 } = {}) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(settleMs);
  }

  /** Dispatch a synthetic contextmenu DOM event (fallback when mouse is blocked). */
  async dispatchContextMenu(selector, { index = 0, settleMs = 300 } = {}) {
    const ok = await this.eval(`(() => {
      const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
      if (!el) return false;
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true, view: window, button: 2, buttons: 2,
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
      }));
      return true;
    })()`);
    await sleep(settleMs);
    return ok;
  }

  async typeText(text) {
    await this.send('Input.insertText', { text });
  }

  /**
   * Press a chord such as 'Control+Alt+P'. CDP wants the modifier mask on the
   * final key event, so the modifiers are held for the last key only.
   */
  async pressShortcut(chord, { settleMs = 600 } = {}) {
    const parts = chord.split('+').map((s) => s.trim()).filter(Boolean);
    const key = parts.pop();
    let modifiers = 0;
    const held = [];
    for (const mod of parts) {
      const m = mod.toLowerCase();
      if (m === 'control' || m === 'ctrl') {
        modifiers |= 2;
        held.push({ key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17 });
      } else if (m === 'alt') {
        modifiers |= 1;
        held.push({ key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18 });
      } else if (m === 'shift') {
        modifiers |= 8;
        held.push({ key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
      } else if (m === 'meta') {
        modifiers |= 4;
        held.push({ key: 'Meta', code: 'MetaLeft', windowsVirtualKeyCode: 91 });
      }
    }
    for (const h of held) await this.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...h, modifiers: 0 });
    const upper = key.length === 1 ? key.toUpperCase() : key;
    const finalKey = {
      key: parts.some((p) => /control|ctrl|meta/i.test(p)) ? key.toLowerCase() : key,
      code: key.length === 1 ? `Key${upper}` : key,
      windowsVirtualKeyCode: upper.charCodeAt(0),
      modifiers,
    };
    await this.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...finalKey });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...finalKey });
    for (const h of held.reverse()) await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...h, modifiers: 0 });
    await sleep(settleMs);
  }

  async pressKey(key, { code, windowsVirtualKeyCode, text } = {}) {
    const base = { key, code: code ?? key, windowsVirtualKeyCode: windowsVirtualKeyCode ?? 0 };
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, ...(text ? { text } : {}) });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  async close() {
    try {
      this.#ws.close();
    } catch {}
  }
}
