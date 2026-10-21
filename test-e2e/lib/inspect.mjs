// Page-side helpers for describing an element and its ancestry. Kept as source
// strings so the same code can be injected into the page via Runtime.evaluate.
import { sleep } from './cdp.mjs';

/** Expression fragment: `(el) => {...}` describing el + up to N ancestors. */
export const DESCEND_FN = `function describe(el, maxLevels) {
  const out = [];
  let node = el;
  for (let level = 0; level < maxLevels && node && node.nodeType === 1; level++) {
    const attrs = {};
    for (const a of node.attributes) {
      const n = a.name;
      if (n === 'class' || n === 'style') continue;
      if (n.startsWith('data-') || n === 'title' || n.startsWith('aria-') || n === 'role' || n === 'type' || n === 'id' || n === 'href') {
        attrs[n] = a.value.length > 200 ? a.value.slice(0, 200) + '…' : a.value;
      }
    }
    const html = node.outerHTML || '';
    out.push({
      level,
      tag: node.tagName.toLowerCase(),
      id: node.id || null,
      classes: node.className && typeof node.className === 'string' ? node.className.split(/\\s+/).filter(Boolean) : [],
      attrs,
      text: (node.textContent || '').trim().slice(0, 120),
      outerHTML: html.length > 400 ? html.slice(0, 400) + '…' : html,
      outerHTMLLength: html.length,
    });
    node = node.parentElement;
  }
  return out;
}`;

/** Describe the element matched by selector[index] plus ancestors. */
export async function dumpAncestry(cdp, selector, index = 0, maxLevels = 6) {
  const expr = `(() => {
    ${DESCEND_FN}
    const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
    if (!el) return null;
    return describe(el, ${maxLevels});
  })()`;
  return cdp.eval(expr);
}

/** Build a readable CSS selector path from an element (best-effort, stable-ish). */
export const SELECTOR_PATH_FN = `function cssPath(el) {
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && parts.length < 8) {
    if (node.id) { parts.unshift('#' + node.id); break; }
    let part = node.tagName.toLowerCase();
    for (const a of node.attributes) {
      if (a.name.startsWith('data-') && a.value.length < 60) {
        part += '[' + a.name + '="' + a.value.replace(/"/g, '\\\\"') + '"]';
        break;
      }
    }
    const parent = node.parentElement;
    if (parent) {
      const sameTag = [...parent.children].filter((c) => c.tagName === node.tagName);
      if (sameTag.length > 1) part += ':nth-of-type(' + (sameTag.indexOf(node) + 1) + ')';
    }
    parts.unshift(part);
    node = parent;
  }
  return parts.join(' > ');
}`;

/** Wait until the DSH web shell has painted something interactive. */
export async function waitForShell(cdp, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await cdp
      .eval(`(() => {
        const root = document.querySelector('#root, #app, [data-dsh-root], body');
        return {
          ready: document.readyState,
          bodyChildren: document.body.children.length,
          text: (document.body.innerText || '').slice(0, 400),
          booted: !!document.querySelector('style[data-plugin-css]'),
          textareas: document.querySelectorAll('textarea').length,
        };
      })()`)
      .catch(() => null);
    if (state && state.bodyChildren > 0 && state.booted) {
      await cdp
        .eval(`(() => {
          if (document.querySelector('style[data-e2e-no-smooth]')) return true;
          const s = document.createElement('style');
          s.dataset.e2eNoSmooth = '';
          s.textContent = '*, *::before, *::after { scroll-behavior: auto !important; }';
          document.head.appendChild(s);
          return true;
        })()`)
        .catch(() => {});
      return state;
    }
    await sleep(400);
  }
  throw new Error('DSH web shell never booted');
}
