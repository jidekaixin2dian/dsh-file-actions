// Market previews: capture 3:2 crops of the menu at 2x for the plugin card.
// The market card box is 132x88 (3:2, object-fit: contain) and the dialog strip is
// 220x150 (cover), so a 3:2 crop centred on the menu is what actually reads well.
//
// usage: node shoot-market.mjs   (reads token.txt, serves port 5499)
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(here, '..')
const project = projectDir.replace(/\\/g, '/')
const TOKEN = fs.readFileSync(path.join(here, 'token.txt'), 'utf8').trim()
const PORT = Number(process.argv[2] || 5499)
const CDP_PORT = Number(process.env.DFA_CDP_PORT || 9225)
const CHROME = process.env.DFA_CHROME || path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1243', 'chrome-win64', 'chrome.exe')
const USER_DIR = path.join(here, '.chrome-market')
const OUT = path.join(projectDir, 'assets')
const PAGE = `http://127.0.0.1:${PORT}/?token=${TOKEN}`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
try { fs.rmSync(USER_DIR, { recursive: true, force: true }) } catch { /* a leftover browser still holds it */ }

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${USER_DIR}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1440,900', PAGE],
  { detached: true, stdio: 'ignore' })
chrome.unref()

async function waitTarget() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()
      const page = list.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl)
      if (page) return page
    } catch { /* wait */ }
    await sleep(400)
  }
  throw new Error('no target')
}

const target = await waitTarget()
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve) => socket.addEventListener('open', resolve))
let next = 1
const pending = new Map()
socket.addEventListener('message', (event) => {
  const payload = JSON.parse(event.data)
  const entry = pending.get(payload.id)
  if (!entry) return
  pending.delete(payload.id)
  if (payload.error) entry.reject(new Error(payload.error.message))
  else entry.resolve(payload.result)
})
const send = (method, params) => new Promise((resolve, reject) => {
  const id = next++
  pending.set(id, { resolve, reject })
  socket.send(JSON.stringify({ id, method, params: params || {} }))
})
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}

await send('Runtime.enable')
await send('Page.enable')
await send('Network.enable')
await send('Network.setCacheDisabled', { cacheDisabled: true })
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
await sleep(9000)

// Dismiss the one-time welcome modal if this profile is fresh.
await evaluate(`(() => {
  const go = [...document.querySelectorAll('button')].find((node) => /^(继续|Continue)$/i.test((node.textContent || '').trim()))
  if (go) go.click()
  return true
})()`)
await sleep(800)
for (let i = 0; i < 60; i += 1) {
  if (await evaluate(`document.documentElement.hasAttribute('data-dfa-ready')`)) break
  await sleep(250)
}

await evaluate(`(() => {
  document.getElementById('dfa-market-fixtures')?.remove()
  const root = document.createElement('div')
  root.id = 'dfa-market-fixtures'
  root.style.cssText = 'position:fixed;left:6%;top:30%;z-index:2147482000;background:transparent;padding:6px;font:13px/26px monospace'
  root.innerHTML = [
    '<div data-test="title"><span title=${JSON.stringify(project + '/package.json')}>package.json</span></div>',
    '<div data-test="img" data-files-path=${JSON.stringify(project + '/assets/preview-dark.png')}>preview-dark.png</div>',
  ].join('')
  document.body.appendChild(root)
  return true
})()`)

const fire = async (selector, dx) => evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)})
  const rect = el.getBoundingClientRect()
  const x = Math.round(rect.left + ${dx || 10})
  const y = Math.round(rect.top + rect.height / 2)
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 }))
  return true
})()`)

const closeMenus = async () => {
  await evaluate(`(() => { document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return true })()`)
  await sleep(350)
}

const waitFor = async (expression, timeoutMs = 15000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return true
    await sleep(200)
  }
  return false
}

// Clip a 3:2 box around the open menu(s) at 2x device scale.
const shootMenu = async (name) => {
  const box = await evaluate(`(() => {
    const rects = [...document.querySelectorAll('[data-dfa-menu]')].map((node) => node.getBoundingClientRect())
    if (rects.length === 0) return null
    const left = Math.min(...rects.map((r) => r.left))
    const top = Math.min(...rects.map((r) => r.top))
    const right = Math.max(...rects.map((r) => r.right))
    const bottom = Math.max(...rects.map((r) => r.bottom))
    const pad = 22
    let w = right - left + pad * 2
    let h = bottom - top + pad * 2
    if (w / h < 1.5) w = h * 1.5
    else h = w / 1.5
    // The market asks for at least 1280x800; at scale 2 that is a 660x440 crop.
    if (w < 900) {
      w = 900
      h = 600
    }
    const cx = (left + right) / 2
    const cy = (top + bottom) / 2
    return {
      x: Math.max(0, Math.round(cx - w / 2)),
      y: Math.max(0, Math.round(cy - h / 2)),
      width: Math.round(w),
      height: Math.round(h),
    }
  })()`)
  if (!box) throw new Error('no menu for ' + name)
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale: 2 },
    captureBeyondViewport: false,
  })
  const file = path.join(OUT, name)
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'))
  console.log('saved', file, `${box.width * 2}x${box.height * 2}`)
}

// 1. text file menu
await fire('[data-test="title"] span', 10)
await waitFor(`!!document.querySelector('[data-dfa-item="openWith"]')`)
await sleep(400)
await shootMenu('preview-dark.png')

// 2. open-with submenu
await evaluate(`(() => {
  const item = document.querySelector('[data-dfa-item="openWith"]')
  if (item) item.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
  return true
})()`)
await sleep(700)
await shootMenu('preview-open-with.png')

// 3. filtered submenu
await evaluate(`(() => {
  const input = document.querySelector('[data-dfa-menu].dfa-sub .dfa-search')
  if (!input) return false
  input.value = 'code'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`)
await sleep(500)
await shootMenu('preview-search.png')
await closeMenus()

// 4. image thumbnail
await fire('[data-test="img"]', 10)
await waitFor(`(() => { const img = document.querySelector('[data-dfa-menu] .dfa-thumb img'); return Boolean(img && img.naturalWidth > 0) })()`)
await sleep(500)
await shootMenu('preview-image.png')
await closeMenus()

// 5. light theme
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] })
await sleep(700)
await fire('[data-test="title"] span', 10)
await waitFor(`!!document.querySelector('[data-dfa-item="openWith"]')`)
await sleep(400)
await shootMenu('preview-light.png')

try { process.kill(-chrome.pid) } catch { try { process.kill(chrome.pid) } catch { /* gone */ } }
setTimeout(() => process.exit(0), 400)
