import os from 'node:os'
import { findChrome, requireFreePort } from './lib/cdp.mjs'
// Capture screenshots of the menu for visual review and the README.
// Run after launch.ps1; reads run/instance.json.
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
const CDP_PORT = Number(process.env.DFA_CDP_PORT || 9224)
const CHROME = findChrome()
const USER_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dfa-browser-'))
const OUT = path.join(here, 'run')
const PAGE = `http://127.0.0.1:${PORT}/?token=${TOKEN}`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
fs.mkdirSync(OUT, { recursive: true })
// A reused profile would serve the previous run's cached bundle under the same
// rev URL, so every shot starts from a clean browser profile.

await requireFreePort(CDP_PORT)
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${USER_DIR}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1280,860', PAGE],
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
const shoot = async (name) => {
  const result = await send('Page.captureScreenshot', { format: 'png' })
  const file = path.join(OUT, name)
  fs.writeFileSync(file, Buffer.from(result.data, 'base64'))
  console.log('saved', file)
}

await send('Runtime.enable')
await send('Page.enable')
await send('Network.enable')
await send('Network.setCacheDisabled', { cacheDisabled: true })
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
await sleep(9000)

// A fresh browser profile shows the "预览版说明" welcome modal; dismiss it so the
// screenshots show the conversation surface.
const dismissed = await evaluate(`(() => {
  const buttons = [...document.querySelectorAll('button')]
  const go = buttons.find((node) => /^(继续|Continue)$/i.test((node.textContent || '').trim()))
  if (go) { go.click(); return 'clicked' }
  return 'no-modal'
})()`)
console.log('welcome modal:', dismissed)
await sleep(1200)

// Wait for the plugin to install its listener instead of guessing at boot time.
let ready = false
for (let i = 0; i < 60; i += 1) {
  if (await evaluate(`document.documentElement.hasAttribute('data-dfa-ready')`)) { ready = true; console.log('plugin ready after', i * 400, 'ms'); break }
  await sleep(400)
}
if (!ready) console.log('plugin never became ready')

// Probe what the theme actually exposes to our menu node.
const theme = await evaluate(`(() => {
  const probe = document.createElement('div')
  document.body.appendChild(probe)
  const style = getComputedStyle(probe)
  const names = ['--dsw-alias-bg-layer-1','--dsw-alias-label-primary','--dsw-alias-border-l2','--dsw-alias-interactive-bg-hover','--dsw-radius-lg','--dsw-alias-label-tertiary','--dsw-alias-bg-base']
  const out = {}
  for (const name of names) out[name] = style.getPropertyValue(name)
  const bodyBg = getComputedStyle(document.body).backgroundColor
  const bodyColor = getComputedStyle(document.body).color
  probe.remove()
  return { out, bodyBg, bodyColor, htmlTheme: document.documentElement.getAttribute('data-theme'), bodyTheme: document.body.getAttribute('data-theme') }
})()`)
console.log('theme:', JSON.stringify(theme, null, 2))

await evaluate(`(() => {
  document.getElementById('dfa-selftest')?.remove()
  const root = document.createElement('div')
  root.id = 'dfa-selftest'
  root.style.cssText = 'position:fixed;left:46%;top:40%;z-index:2147482000;background:transparent;padding:6px;font:13px/26px monospace'
  root.innerHTML = [
    '<div data-test="title"><span title=${JSON.stringify(project + '/package.json')}>package.json</span></div>',
    '<div data-test="attr" data-files-path=${JSON.stringify(project + '/icon.svg')}>icon.svg</div>',
    '<div data-test="img" data-files-path=${JSON.stringify(project + '/assets/menu-light.png')}>menu-light.png</div>',
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
  return [x, y]
})()`)

await fire('[data-test="title"] span', 10)
// Wait for the slow OS association rows so the screenshot shows the real menu.
for (let i = 0; i < 60; i += 1) {
  const ready = await evaluate(`!!document.querySelector('[data-dfa-item="openWith"]')`)
  if (ready) break
  await sleep(250)
}
await sleep(300)
const opened = await evaluate(`(async () => {
  const menu = document.querySelector('[data-dfa-menu]')
  const toast = document.querySelector('.dfa-toast')
  const entry = (window.__DSH_BOOT__?.entries || []).find((item) => item.id === '@jidekaixin2dian/dsh-file-actions')
  let bundle = { rev: entry?.rev || null, bytes: 0, hasInstalled: false }
  if (entry?.url) {
    const text = await (await fetch(entry.url, { credentials: 'same-origin' })).text()
    bundle = { rev: entry.rev, bytes: text.length, hasInstalled: text.includes('__dfaInstalled') }
  }
  return {
    menu: menu ? { rect: menu.getBoundingClientRect().toJSON(), text: menu.innerText.slice(0, 160) } : null,
    styleTag: !!document.querySelector('style[data-plugin-css="dsh-file-actions"]'),
    bootFailed: document.body.innerText.includes('Failed to load plugins'),
    toast: toast ? toast.textContent : null,
    fixture: document.querySelector('[data-test="title"] span')?.getAttribute('title') || null,
    debug: window.__dfaDebug || null,
    installed: window.__dfaInstalled || 0,
    connected: document.body.contains(document.querySelector('[data-test="title"] span')),
    bundle,
  }
})()`)
console.log('menu after fire:', JSON.stringify(opened))
await shoot('menu-text-dark.png')

// Simulate the liquid-glass + wallpaper theme: a bright gradient behind the menu.
await evaluate(`(() => {
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  const bg = document.createElement('div')
  bg.id = 'dfa-wallpaper'
  bg.style.cssText = 'position:fixed;inset:0;z-index:2147481000;background:linear-gradient(135deg,#f6d365,#fda085 35%,#84fab0 70%,#8fd3f4)'
  document.body.appendChild(bg)
  // Simulate the liquid-glass theme before the menu opens, so the floor is
  // computed from the translucent surface itself.
  document.documentElement.style.setProperty('--dsw-alias-bg-layer-1', 'rgba(26,27,31,0.30)')
  document.documentElement.style.setProperty('--dsw-alias-bg-layer-2', 'rgba(26,27,31,0.30)')
  return true
})()`)
await sleep(400)
await fire('[data-test="title"] span', 10)
for (let i = 0; i < 40; i += 1) {
  if (await evaluate(`!!document.querySelector('[data-dfa-menu]')`)) break
  await sleep(150)
}
await sleep(400)
await sleep(350)
await shoot('menu-glass-dark.png')
await evaluate(`(() => { document.getElementById('dfa-wallpaper')?.remove(); document.documentElement.style.removeProperty('--dsw-alias-bg-layer-1'); document.documentElement.style.removeProperty('--dsw-alias-bg-layer-2'); return true })()`)
await sleep(250)

// Open the "open with" submenu for the second shot.
await evaluate(`(() => {
  const item = document.querySelector('[data-dfa-item="openWith"]')
  if (item) item.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
  return true
})()`)
await sleep(700)
await shoot('menu-openwith-dark.png')

// The association filter: 17 apps, type to narrow.
await evaluate(`(() => {
  const input = document.querySelector('[data-dfa-menu].dfa-sub .dfa-search')
  if (!input) return false
  input.value = 'code'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`)
await sleep(400)
await shoot('menu-submenu-search-dark.png')

// The image thumbnail.
await evaluate(`(() => { document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return true })()`)
await sleep(400)
await fire('[data-test="img"]', 10)
for (let i = 0; i < 40; i += 1) {
  const ready = await evaluate(`(() => {
    const img = document.querySelector('[data-dfa-menu] .dfa-thumb img')
    return Boolean(img && img.naturalWidth > 0)
  })()`)
  if (ready) break
  await sleep(150)
}
await sleep(300)
await shoot('menu-image-dark.png')

// Light theme
await evaluate(`(() => { document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return true })()`)
await sleep(400)
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] })
await sleep(600)
await fire('[data-test="attr"]', 10)
await sleep(1500)
await shoot('menu-svg-light.png')

try { chrome.kill() } catch { /* already exited */ }
setTimeout(() => process.exit(0), 400)
