import os from 'node:os'
import { findChrome, requireFreePort } from './lib/cdp.mjs'
// Real-app self-check: drive headless Chromium over CDP against a scratch DSH
// instance, right-click a few file references, and assert the menu behaves.
//
// The synthetic references reproduce the carriers the shipped Web GUI writes
// (a title with the absolute path, a data-files-path row, an anchor title, and a
// bare text token), so this proves activation, detection, classification, the
// Remote calls and the click pipeline without depending on a live agent turn.
//
// Run launch.ps1 first, then node test-e2e/self-check.mjs.
// The private URL and port come from run/instance.json.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(here, '..')
const project = projectDir.replace(/\\/g, '/')

const instance = JSON.parse(fs.readFileSync(path.join(here, 'run', 'instance.json'), 'utf8'))
const TOKEN = new URL(instance.url).searchParams.get('token')
const PORT = instance.port
const CDP_PORT = Number(process.env.DFA_CDP_PORT || 9223)
const CHROME = findChrome()
const USER_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dfa-browser-'))
const PAGE = `http://127.0.0.1:${PORT}/?token=${TOKEN}`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

async function fetchJson(url) {
  return (await fetch(url)).json()
}

async function waitForTarget(timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const list = await fetchJson(`http://127.0.0.1:${CDP_PORT}/json/list`)
      const page = list.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl)
      if (page) return page
    } catch { /* not up yet */ }
    await sleep(400)
  }
  throw new Error('no CDP page target')
}

class Cdp {
  constructor(url) {
    this.next = 1
    this.pending = new Map()
    this.socket = new WebSocket(url)
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', () => resolve())
      this.socket.addEventListener('error', () => reject(new Error('ws error')))
    })
    this.socket.addEventListener('message', (event) => {
      const payload = JSON.parse(event.data)
      const entry = this.pending.get(payload.id)
      if (!entry) return
      this.pending.delete(payload.id)
      if (payload.error) entry.reject(new Error(payload.error.message))
      else entry.resolve(payload.result)
    })
  }

  async send(method, params) {
    await this.ready
    const id = this.next++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params: params || {} }))
    })
  }

  close() {
    try { this.socket.close() } catch { /* already closed */ }
  }
}

let chromeProcess = null

async function main() {
  if (!TOKEN) throw new Error('missing token: pass it as argv[2] or write test-e2e/token.txt')
  if (!fs.existsSync(CHROME)) throw new Error('chromium missing: ' + CHROME)

  await requireFreePort(CDP_PORT)
  chromeProcess = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${USER_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1280,900',
    PAGE,
  ], { detached: true, stdio: 'ignore' })
  chromeProcess.unref()

  const target = await waitForTarget(20000)
  const cdp = new Cdp(target.webSocketDebuggerUrl)
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')
  await sleep(9000)

  const evaluate = async (expression) => {
    const result = await cdp.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    })
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text + ' ' + (result.exceptionDetails.exception?.description || ''))
    }
    return result.result.value
  }

  const booted = await evaluate(`(() => ({
    href: location.href.slice(0, 140),
    ready: document.documentElement.hasAttribute('data-dfa-ready'),
    body: document.body ? document.body.innerText.slice(0, 40) : '',
    bgBase: getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base'),
    bgLayer1: getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-layer-1'),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    pluginCss: !!document.querySelector('style[data-plugin-css="dsh-file-actions"]'),
    failed: document.body.innerText.includes('Failed to load plugins'),
  }))()`)
  console.log('page:', JSON.stringify(booted))
  check('plugin bundle activates (style tag present)', booted.pluginCss)
  check('no boot-audit failure', !booted.failed)

  // Wait for the listener instead of guessing at boot timing: the marker is set
  // by install() and removed by its disposer.
  let readyAfter = -1
  for (let i = 0; i < 60; i += 1) {
    if (await evaluate(`document.documentElement.hasAttribute('data-dfa-ready')`)) { readyAfter = i * 400; break }
    await sleep(400)
  }
  check('plugin installed its context menu listener', readyAfter >= 0, readyAfter >= 0 ? `after ${readyAfter} ms` : 'never')

  // Synthetic references covering every detection carrier. They sit in the
  // middle of the viewport so no app overlay can swallow the pointer.
  const fixtures = {
    title: `${project}/package.json`,
    attr: `${project}/icon.svg`,
    anchor: `${project}/README.md`,
    text: `${project}/lib/client.js`,
    bogus: `${project}/does-not-exist.js`,
    img: `${project}/assets/preview-dark.png`,
    loc: `${project}/package.json:42:7`,
  }
  // A resource address is session-scoped, so the fixture has to carry a real
  // session id; take the one the page already uses, if any.
  const liveSessionId = await evaluate(`(() => {
    const holder = document.querySelector('[data-session-id]')
    if (holder) return holder.getAttribute('data-session-id')
    const anchor = document.querySelector('a[href^="dsh-resource://file/session/"]')
    const match = anchor && /^dsh-resource:\\/\\/file\\/session\\/([^/]+)\\//.exec(anchor.getAttribute('href'))
    return match ? match[1] : ''
  })()`)
  await evaluate(`(() => {
    document.getElementById('dfa-selftest')?.remove()
    const root = document.createElement('div')
    root.id = 'dfa-selftest'
    root.style.cssText = 'position:fixed;left:50%;top:45%;transform:translate(-50%,-50%);z-index:2147482000;background:#1b1d21;color:#ddd;padding:14px;border-radius:8px;font:13px/26px monospace;border:1px solid #444'
    root.innerHTML = [
      '<div data-test="title"><span title=${JSON.stringify(fixtures.title)}>package.json</span></div>',
      '<div data-test="attr" data-files-path=${JSON.stringify(fixtures.attr)}>icon.svg</div>',
      '<div data-test="anchor"><a title=${JSON.stringify(fixtures.anchor)} href="#">README.md</a></div>',
      '<div data-test="text">' + ${JSON.stringify(fixtures.text)} + '</div>',
      '<div data-test="bogus"><span title=${JSON.stringify(fixtures.bogus)}>does-not-exist.js</span></div>',
      '<div data-test="kbd" tabindex="0" title=${JSON.stringify(fixtures.attr)}>icon.svg</div>',
      '<div data-test="img" data-files-path=${JSON.stringify(fixtures.img)}>menu-dark.png</div>',
      '<div data-test="loc"><span title=${JSON.stringify(fixtures.loc)}>package.json:42:7</span></div>',
      '<div data-test="resource"><a href="dsh-resource://file/session/' + ${JSON.stringify(liveSessionId || 'selftest')} + '/dsh-file-actions/icon.svg">icon.svg</a></div>',
      '<div data-test="weblink"><a href="https://github.com/jidekaixin2dian/dsh-file-actions/releases/tag/v0.1.5">v0.1.5</a></div>',
    ].join('')
    document.body.appendChild(root)
    return true
  })()`)
  await sleep(300)

  // Guessed text is verified on hover before it may take over the right-click, so
  // the driver warms the reference first — exactly what a moving pointer does.
  const warm = async (selector) => evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return 'missing'
    const rect = el.getBoundingClientRect()
    const x = Math.round(rect.left + Math.min(rect.width / 2, 20))
    const y = Math.round(rect.top + rect.height / 2)
    const hit = document.elementFromPoint(x, y)
    const target = (hit && hit.closest(${JSON.stringify(selector)})) || hit || el
    target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, clientX: x, clientY: y }))
    return 'warmed'
  })()`)

  const fire = async (selector, waitMs = 500) => {
    await warm(selector)
    await sleep(waitMs)
    return evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return 'missing'
    const rect = el.getBoundingClientRect()
    const x = Math.round(rect.left + Math.min(rect.width / 2, 20))
    const y = Math.round(rect.top + rect.height / 2)
    const hit = document.elementFromPoint(x, y)
    if (!hit) return 'no-hit'
    const target = hit.closest(${JSON.stringify(selector)}) || hit
    target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 }))
    return 'fired:' + target.tagName
  })()`)
  }

  const readMenu = async () => evaluate(`(() => {
    const menu = document.querySelector('[data-dfa-menu]:not(.dfa-sub)')
    if (!menu) return null
    return {
      title: menu.querySelector('.dfa-name')?.textContent || '',
      path: menu.querySelector('.dfa-path')?.textContent || '',
      kind: menu.querySelector('.dfa-tile')?.getAttribute('data-kind') || '',
      size: menu.querySelector('.dfa-size')?.textContent || '',
      badge: menu.querySelector('.dfa-badge')?.textContent || '',
      loc: menu.querySelector('.dfa-loc')?.textContent || '',
      foot: menu.querySelector('.dfa-foot')?.textContent || '',
      items: [...menu.querySelectorAll('[data-dfa-item]')].map((node) => node.getAttribute('data-dfa-item')),
      labels: [...menu.querySelectorAll('.dfa-label')].map((node) => node.textContent),
    }
  })()`)

  // The menu paints a status row ("checking the file…") before the probe answers,
  // so waiting for a settled menu means waiting past that single row.
  const waitMenu = async (timeoutMs = 5000) => {
    const deadline = Date.now() + timeoutMs
    let last = null
    while (Date.now() < deadline) {
      const menu = await readMenu()
      if (menu) {
        last = menu
        if (menu.items.length > 1) return menu
      }
      await sleep(120)
    }
    return last
  }

  const closeMenu = async () => {
    await evaluate(`(() => { document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return true })()`)
    for (let i = 0; i < 20; i += 1) {
      if (!(await readMenu())) return true
      await sleep(100)
    }
    return false
  }

  // 1. title carrier, text file
  const fire1 = await fire('[data-test="title"] span')
  const titleMenu = await waitMenu()
  console.log('fire(title):', fire1, 'menu:', JSON.stringify(titleMenu))
  check('menu opens on a title carrier', Boolean(titleMenu), fire1)
  check('title carrier resolves package.json', titleMenu && titleMenu.title === 'package.json', titleMenu && titleMenu.title)
  check('text file offers copy contents', titleMenu && titleMenu.items.includes('copyContents'))
  check('text file offers save as', titleMenu && titleMenu.items.includes('saveAs'))
  check('text file offers reveal', titleMenu && titleMenu.items.includes('reveal'))
  check('text file offers copy file name', titleMenu && titleMenu.items.includes('copyFileName'))
  check('a plain reference has no copy-reference row', titleMenu && !titleMenu.items.includes('copyReference'))

  const floor = await evaluate(`(() => {
    const menu = document.querySelector('[data-dfa-menu]:not(.dfa-sub)')
    if (!menu) return null
    const color = getComputedStyle(menu).backgroundColor
    const match = /rgba?\(([^)]+)\)/.exec(color)
    const parts = match ? match[1].split(',').map(Number) : []
    return { color, alpha: parts.length > 3 ? parts[3] : 1 }
  })()`)
  check('menu has an opaque readability floor', Boolean(floor) && floor.alpha >= 0.85, floor && floor.color)
  check('menu shows a file-type tile and size', titleMenu && titleMenu.kind === 'data' && /\d+(\.\d+)? KB/.test(titleMenu.size), titleMenu && (titleMenu.kind + ' / ' + titleMenu.size))
  check('menu shows a path line', titleMenu && /package\.json$/.test(titleMenu.path), titleMenu && titleMenu.path)

  // The OS association query is slow on Windows; the rows must still land while
  // the menu is open.
  const waitForItems = async (ids, timeoutMs) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const menu = await readMenu()
      if (menu && ids.every((id) => menu.items.includes(id))) return menu
      await sleep(250)
    }
    return null
  }
  const enriched = await waitForItems(['editor', 'openWith'], 15000)
  check('association rows arrive while the menu is open', Boolean(enriched), enriched && enriched.labels.join('|'))

  // Focus must move into the menu, or the composer keeps eating the keystrokes.
  const focusInside = await evaluate(`(() => document.activeElement?.hasAttribute?.('data-dfa-menu') === true)()`)
  check('focus moves into the menu', focusInside)

  // Scrolling the menu's own list (or the long "open with" submenu) must not be
  // mistaken for the page scrolling away from the anchor.
  const scrollKeeps = await evaluate(`(() => {
    const menu = document.querySelector('[data-dfa-menu]:not(.dfa-sub)')
    menu.scrollTop = 30
    menu.dispatchEvent(new Event('scroll', { bubbles: false }))
    return !!document.querySelector('[data-dfa-menu]')
  })()`)
  check('scrolling inside the menu keeps it open', scrollKeeps)

  // A right-click on the menu itself must not stack a second menu on top.
  const stacked = await evaluate(`(() => {
    const menu = document.querySelector('[data-dfa-menu]:not(.dfa-sub)')
    menu.querySelector('.dfa-name').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    return document.querySelectorAll('[data-dfa-menu]:not(.dfa-sub)').length
  })()`)
  check('right-click inside the menu does not stack a second menu', stacked === 1, `menus=${stacked}`)

  // Keyboard path: ArrowDown walks the rows, Enter runs the focused one.
  const pressKey = (key) => evaluate(`(() => {
    const target = document.activeElement || document.body
    target.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true }))
    return true
  })()`)
  let focusedId = null
  for (let i = 0; i < 12; i += 1) {
    await pressKey('ArrowDown')
    focusedId = await evaluate(`document.querySelector('[data-dfa-item][data-focus="true"]')?.getAttribute('data-dfa-item') || null`)
    if (focusedId === 'copyPath') break
  }
  check('ArrowDown walks the rows', Boolean(focusedId), String(focusedId))
  await pressKey('Enter')
  await sleep(700)
  const afterCopy = await evaluate(`(() => ({
    toast: document.querySelector('.dfa-toast')?.textContent || '',
    menuGone: !document.querySelector('[data-dfa-menu]'),
  }))()`)
  check('Enter runs the focused row (copy path)', afterCopy.toast.includes('复制') || afterCopy.toast.includes('copied'), afterCopy.toast)
  check('menu closes after an action', afterCopy.menuGone)
  await closeMenu()

  // The keyboard path must reach the "open with" submenu too. In a web-only
  // instance the app-association query times out by design, so the submenu cannot
  // open; that path is covered by host-tests with deterministic responses.
  await fire('[data-test="title"] span')
  await waitMenu(8000)
  // The keyboard skips disabled rows, so reaching `openWith` at all proves the
  // association query answered; otherwise the submenu leg is not applicable.
  let reachedOpenWith = false
  for (let i = 0; i < 12; i += 1) {
    await pressKey('ArrowDown')
    const id = await evaluate(`document.querySelector('[data-dfa-item][data-focus="true"]')?.getAttribute('data-dfa-item') || null`)
    if (id === 'openWith') { reachedOpenWith = true; break }
  }
  if (reachedOpenWith) {
    await pressKey('ArrowRight')
    await sleep(250)
  }
  const subFocus = reachedOpenWith ? await evaluate(`(() => {
    const sub = document.querySelector('[data-dfa-menu].dfa-sub')
    if (!sub) return null
    return sub.querySelector('[data-focus="true"]')?.getAttribute('data-dfa-item') || 'none'
  })()`) : null
  if (!subFocus) {
    console.log('SKIP  submenu, filter and scroll-fade checks — app associations unavailable in this instance')
    await closeMenu()
  } else {
  check('ArrowRight opens the submenu with a focused row', Boolean(subFocus) && subFocus !== 'none', String(subFocus))

  // A 17-app list gets a filter box and scroll fades.
  const subState = await evaluate(`(() => {
    const sub = document.querySelector('[data-dfa-menu].dfa-sub')
    const body = sub && sub.querySelector('.dfa-body')
    return {
      search: Boolean(sub && sub.querySelector('.dfa-search')),
      fade: body ? body.dataset.fade || 'none' : null,
      rows: sub ? [...sub.querySelectorAll('[data-dfa-item]')].filter((node) => node.getClientRects().length > 0).length : 0,
    }
  })()`)
  check('the long association list has a search box', subState.search, JSON.stringify(subState))
  check('the scrollable submenu shows an edge fade', subState.fade === 'bottom' || subState.fade === 'both', String(subState.fade))

  const filtered = await evaluate(`(() => {
    const input = document.querySelector('[data-dfa-menu].dfa-sub .dfa-search')
    input.value = 'code'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const sub = document.querySelector('[data-dfa-menu].dfa-sub')
    const visible = [...sub.querySelectorAll('[data-dfa-item]')].filter((node) => node.getClientRects().length > 0)
    return { count: visible.length, first: visible[0] ? visible[0].getAttribute('data-dfa-item') : '', empty: !sub.querySelector('.dfa-empty').hidden }
  })()`)
  check('typing filters the app list', filtered.count > 0 && filtered.count < subState.rows, JSON.stringify(filtered))
  check('the filter matches by name', /code/i.test(filtered.first), filtered.first)

  const noMatch = await evaluate(`(() => {
    const input = document.querySelector('[data-dfa-menu].dfa-sub .dfa-search')
    input.value = 'zzz-not-an-app'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const sub = document.querySelector('[data-dfa-menu].dfa-sub')
    return {
      visible: [...sub.querySelectorAll('[data-dfa-item]')].filter((node) => node.getClientRects().length > 0).length,
      empty: !sub.querySelector('.dfa-empty').hidden,
    }
  })()`)
  check('an unmatched filter shows the empty hint', noMatch.visible === 0 && noMatch.empty, JSON.stringify(noMatch))

  // First Escape clears the non-empty filter, the second closes the submenu.
  await pressKey('Escape')
  await sleep(200)
  const cleared = await evaluate(`(() => ({
    value: document.querySelector('[data-dfa-menu].dfa-sub .dfa-search')?.value ?? null,
    sub: !!document.querySelector('[data-dfa-menu].dfa-sub'),
  }))()`)
  check('Escape clears the filter before closing', cleared.value === '' && cleared.sub === true, JSON.stringify(cleared))
  await pressKey('Escape')
  await sleep(200)
  const subClosed = await evaluate(`(() => ({
    sub: !!document.querySelector('[data-dfa-menu].dfa-sub'),
    main: !!document.querySelector('[data-dfa-menu]:not(.dfa-sub)'),
  }))()`)
  check('Escape closes the submenu first', subClosed.sub === false && subClosed.main === true, JSON.stringify(subClosed))
  await pressKey('Escape')
  await sleep(200)
  await closeMenu()
  }

  // 2. attribute carrier, svg file
  const fire2 = await fire('[data-test="attr"]')
  const attrMenu = await waitMenu()
  console.log('fire(attr):', fire2, 'menu:', JSON.stringify(attrMenu))
  check('menu opens on a data-files-path carrier', Boolean(attrMenu), fire2)
  check('svg is classified as a web page', attrMenu && attrMenu.kind === 'html', attrMenu && attrMenu.kind)
  check('svg offers the browser row', attrMenu && attrMenu.items.includes('browser'))
  check('svg offers copy contents (it is text)', attrMenu && attrMenu.items.includes('copyContents'))
  await closeMenu()

  // 2b. image carrier: the menu shows a real thumbnail
  const fireImg = await fire('[data-test="img"]')
  const imgMenu = await waitMenu()
  console.log('fire(img):', fireImg, 'menu:', JSON.stringify(imgMenu))
  check('menu opens on an image', Boolean(imgMenu), fireImg)
  check('image is classified as an image', imgMenu && imgMenu.kind === 'image', imgMenu && imgMenu.kind)
  let thumb = null
  for (let i = 0; i < 50; i += 1) {
    thumb = await evaluate(`(() => {
      const img = document.querySelector('[data-dfa-menu] .dfa-thumb img')
      return img ? { w: img.naturalWidth, h: img.naturalHeight } : null
    })()`)
    if (thumb && thumb.w > 0) break
    await sleep(150)
  }
  check('image menu renders a thumbnail', Boolean(thumb) && thumb.w > 0, thumb ? `${thumb.w}x${thumb.h}` : 'none')
  await closeMenu()

  // 2c. dsh-resource:// link — how the chat and the delivery table address files.
  // A resource address is session-scoped: without an open Session on this page the
  // plugin has nothing to resolve against, so this leg only runs when one exists.
  if (liveSessionId) {
    const fireRes = await fire('[data-test="resource"] a')
    const resMenu = await waitMenu()
    console.log('fire(resource):', fireRes, 'menu:', JSON.stringify(resMenu))
    check('menu opens on a dsh-resource link', Boolean(resMenu), fireRes)
    check('dsh-resource link resolves the file', resMenu && resMenu.title === 'icon.svg', resMenu && resMenu.title)
    await closeMenu()
  } else {
    console.log('SKIP  dsh-resource link — no open Session on this page (covered by unit tests)')
  }

  // 2d. web link — the other kind of blue reference gets link actions
  const fireWeb = await fire('[data-test="weblink"] a')
  const webMenu = await waitMenu()
  console.log('fire(weblink):', fireWeb, 'menu:', JSON.stringify(webMenu))
  check('menu opens on a web link', Boolean(webMenu), fireWeb)
  check('web link is classified as a link', webMenu && webMenu.kind === 'link', webMenu && webMenu.kind)
  check('web link menu names the host', webMenu && webMenu.title === 'github.com', webMenu && webMenu.title)
  check('web link menu offers link actions', webMenu && webMenu.items.join(',') === 'openLink,copyLink,copyLinkText,copyMarkdown', webMenu && webMenu.items.join(','))
  await evaluate(`(() => { document.querySelector('[data-dfa-item="copyLink"]')?.click(); return true })()`)
  await sleep(700)
  const webCopy = await evaluate(`(() => ({ toast: document.querySelector('.dfa-toast')?.textContent || '' }))()`)
  check('copy link reports success', webCopy.toast.includes('链接') || webCopy.toast.includes('link'), webCopy.toast)
  await closeMenu()

  // 3. anchor carrier, markdown file
  const fire3 = await fire('[data-test="anchor"] a')
  const anchorMenu = await waitMenu()
  console.log('fire(anchor):', fire3, 'menu:', JSON.stringify(anchorMenu))
  check('menu opens on an anchor carrier', Boolean(anchorMenu), fire3)
  check('markdown is classified as Markdown', anchorMenu && anchorMenu.kind === 'markdown', anchorMenu && anchorMenu.kind)
  await closeMenu()

  // 4. bare text token
  const fire4 = await fire('[data-test="text"]')
  const textMenu = await waitMenu(6000)
  console.log('fire(text):', fire4, 'menu:', JSON.stringify(textMenu))
  check('menu opens on a bare text token', Boolean(textMenu), textMenu ? textMenu.title : fire4)
  check('text token resolves lib/client.js', textMenu && textMenu.title === 'client.js', textMenu && textMenu.title)
  await closeMenu()

  // 5. a path that does not exist must not hijack the native menu
  const fire5 = await fire('[data-test="bogus"] span')
  const bogusMenu = await waitMenu(3000)
  // An absolute tooltip is a real address, so a missing file reports it instead of
  // silently keeping the browser menu.
  check('a missing absolute reference reports not-found', Boolean(bogusMenu) && bogusMenu.items.includes('status'), bogusMenu && (bogusMenu.items.join(',') + ' / ' + bogusMenu.labels.join('|')))
  await closeMenu()

  // A reference carrying a line (`file.ts:42:7`) keeps the location in the header
  // and can be copied verbatim.
  const fireLoc = await fire('[data-test="loc"] span')
  const locMenu = await waitMenu()
  console.log('fire(loc):', fireLoc, 'menu:', JSON.stringify(locMenu))
  check('menu opens on a located reference', Boolean(locMenu), fireLoc)
  check('located reference shows its line', locMenu && /42/.test(locMenu.loc || ''), locMenu && locMenu.loc)
  check('located reference offers copy reference', locMenu && locMenu.items.includes('copyReference'), locMenu && locMenu.items.join(','))
  await evaluate(`(() => { document.querySelector('[data-dfa-item="copyReference"]')?.click(); return true })()`)
  await sleep(600)
  const refCopy = await evaluate(`(() => ({ toast: document.querySelector('.dfa-toast')?.textContent || '' }))()`)
  check('copy reference reports success', /引用|reference/.test(refCopy.toast), refCopy.toast)
  await closeMenu()

  // Shift+right-click lets the page answer first. DSH ships no native menu, so the
  // fallback must open ours instead of leaving the click dead.
  await warm('[data-test="title"] span')
  await sleep(600)
  await closeMenu()
  await evaluate(`(() => {
    const el = document.querySelector('[data-test="title"] span')
    const rect = el.getBoundingClientRect()
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, shiftKey: true, button: 2, clientX: rect.left + 10, clientY: rect.top + 8 }))
    return true
  })()`)
  const shiftMenu = await waitMenu(4000)
  check('Shift+right-click falls back to the menu when nothing else answers', Boolean(shiftMenu), shiftMenu && shiftMenu.title)
  await closeMenu()
  // Shift+F10 opens the same menu from the keyboard, with the key hints. The
  // keyboard path applies the same verify-before-takeover rule, so warm it first.
  await warm('[data-test="kbd"]')
  await sleep(600)
  await evaluate(`(() => {
    const el = document.querySelector('[data-test="kbd"]')
    el.focus()
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }))
    return true
  })()`)
  const kbdMenu = await waitMenu(8000)
  check('Shift+F10 opens the menu', Boolean(kbdMenu), kbdMenu && kbdMenu.title)
  check('keyboard-opened menu shows the key hints', Boolean(kbdMenu && kbdMenu.foot), kbdMenu && kbdMenu.foot)
  await closeMenu()

  cdp.close()
  const failed = results.filter((entry) => !entry.ok)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error('self-check failed:', error)
  process.exitCode = 1
}).finally(async () => {
  try { chromeProcess?.kill() } catch { /* already exited */ }
  setTimeout(() => process.exit(process.exitCode || 0), 500)
})
