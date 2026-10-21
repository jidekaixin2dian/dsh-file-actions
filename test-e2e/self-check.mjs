// Real-app self-check: drive headless Chromium over CDP against a scratch DSH
// instance, right-click a few file references, and assert the menu behaves.
//
// The synthetic references reproduce the carriers the shipped Web GUI writes
// (a title with the absolute path, a data-files-path row, an anchor title, and a
// bare text token), so this proves activation, detection, classification, the
// Remote calls and the click pipeline without depending on a live agent turn.
//
// usage:
//   pwsh -File .\start-instance.ps1      # boots the scratch instance + token.txt
//   node self-check.mjs                  # reads token.txt next to this file
//   node self-check.mjs <token> [port]
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(here, '..')
const project = projectDir.replace(/\\/g, '/')

const tokenFile = path.join(here, 'token.txt')
const TOKEN = process.argv[2] || (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8').trim() : '')
const PORT = Number(process.argv[3] || 5499)
const CDP_PORT = Number(process.env.DFA_CDP_PORT || 9223)
const CHROME = process.env.DFA_CHROME
  || 'C:\\Users\\Aether\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe'
const USER_DIR = path.join(here, '.chrome-profile')
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

  fs.rmSync(USER_DIR, { recursive: true, force: true })
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
    pluginCss: !!document.querySelector('style[data-plugin-css="dsh-file-actions"]'),
    failed: document.body.innerText.includes('Failed to load plugins'),
  }))()`)
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
  }
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
    ].join('')
    document.body.appendChild(root)
    return true
  })()`)
  await sleep(300)

  const fire = async (selector) => evaluate(`(() => {
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

  const readMenu = async () => evaluate(`(() => {
    const menu = document.querySelector('[data-dfa-menu]:not(.dfa-sub)')
    if (!menu) return null
    return {
      title: menu.querySelector('.dfa-name')?.textContent || '',
      meta: menu.querySelector('.dfa-meta')?.textContent || '',
      items: [...menu.querySelectorAll('[data-dfa-item]')].map((node) => node.getAttribute('data-dfa-item')),
      labels: [...menu.querySelectorAll('.dfa-label')].map((node) => node.textContent),
    }
  })()`)

  const waitMenu = async (timeoutMs = 5000) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const menu = await readMenu()
      if (menu) return menu
      await sleep(120)
    }
    return null
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
  check('menu shows a type + size line', titleMenu && /文本/.test(titleMenu.meta), titleMenu && titleMenu.meta)

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

  // copy path through the real click handler
  await evaluate(`(() => { document.querySelector('[data-dfa-item="copyPath"]')?.click(); return true })()`)
  await sleep(700)
  const afterCopy = await evaluate(`(() => ({
    toast: document.querySelector('.dfa-toast')?.textContent || '',
    menuGone: !document.querySelector('[data-dfa-menu]'),
  }))()`)
  check('copy path reports success', afterCopy.toast.includes('复制') || afterCopy.toast.includes('copied'), afterCopy.toast)
  check('menu closes after an action', afterCopy.menuGone)
  await closeMenu()

  // 2. attribute carrier, svg file
  const fire2 = await fire('[data-test="attr"]')
  const attrMenu = await waitMenu()
  console.log('fire(attr):', fire2, 'menu:', JSON.stringify(attrMenu))
  check('menu opens on a data-files-path carrier', Boolean(attrMenu), fire2)
  check('svg is classified as a web page', attrMenu && /网页/.test(attrMenu.meta), attrMenu && attrMenu.meta)
  check('svg offers the browser row', attrMenu && attrMenu.items.includes('browser'))
  check('svg offers copy contents (it is text)', attrMenu && attrMenu.items.includes('copyContents'))
  await closeMenu()

  // 3. anchor carrier, markdown file
  const fire3 = await fire('[data-test="anchor"] a')
  const anchorMenu = await waitMenu()
  console.log('fire(anchor):', fire3, 'menu:', JSON.stringify(anchorMenu))
  check('menu opens on an anchor carrier', Boolean(anchorMenu), fire3)
  check('markdown is classified as Markdown', anchorMenu && /Markdown/.test(anchorMenu.meta), anchorMenu && anchorMenu.meta)
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
  check('unknown path leaves no menu behind', bogusMenu === null, fire5)

  cdp.close()
  const failed = results.filter((entry) => !entry.ok)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error('self-check failed:', error)
  process.exitCode = 1
}).finally(async () => {
  try {
    const list = await fetchJson(`http://127.0.0.1:${CDP_PORT}/json/list`)
    for (const entry of list) {
      if (entry.type === 'page') await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${entry.id}`)
    }
  } catch { /* chrome already gone */ }
  // Kill only the browser this script launched; never the user's own Chrome.
  try { process.kill(-chromeProcess.pid) } catch { try { process.kill(chromeProcess.pid) } catch { /* already gone */ } }
  setTimeout(() => process.exit(process.exitCode || 0), 500)
})
