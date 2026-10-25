import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'node:http'
import { chromium } from '@playwright/test'
import { expect, it } from 'vitest'
import { listenSafe } from './server.ts'
import { openWorkspace, signal } from 'host-source/packages/api/workspace-files/tests/harness.ts'

it('real WorkspaceFiles and browser cover resource identity, sandbox isolation, unload and cache cleanup', async () => {
  const host = await openWorkspace('dfa-host-')
  const endpoint = host.endpoint({ maxBytes: 2 * 1024 * 1024, maxFileBytes: 32 * 1024 * 1024 })
  const project = process.env.DFA_PROJECT!
  const client = fs.readFileSync(path.join(project, 'lib/client.js'), 'utf8')
  const calls: Array<{ id: string; path: string; op: string }> = []
  const fixtureErrors: string[] = []
  const outbound: string[] = []
  let release: (() => void) | undefined
  let pending = false
  const attack = `<html><body><script>
    window.scriptRan = true;
    try { parent.document.body.dataset.compromised = 'yes'; window.parentReadable = true } catch { window.parentReadable = false }
    try { window.cookieReadable = document.cookie.includes('fixture=') } catch { window.cookieReadable = false }
    window.openerReadable = !!window.opener;
  </script>Preview</body></html>`
  fs.writeFileSync(path.join(host.workspace, 'preview.html'), attack)
  fs.writeFileSync(path.join(host.workspace, 'note.txt'), 'synthetic fixture')
  fs.writeFileSync(path.join(host.workspace, 'large.txt'), Buffer.alloc(3 * 1024 * 1024, 65))
  fs.writeFileSync(path.join(host.workspace, 'image.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="red"/></svg>')
  const server = createServer(async (req, res) => {
    try {
      if (req.url?.startsWith('/collect?')) { outbound.push(req.url); res.end('synthetic receiver'); return }
      if (req.url === '/client.js') { res.setHeader('content-type', 'text/javascript'); res.end(client); return }
      if (req.url === '/') {
        res.setHeader('content-type', 'text/html; charset=utf-8')
        res.setHeader('set-cookie', 'fixture=synthetic; SameSite=Strict')
        res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body>
          <button id="note" data-file-actions-path="note.txt">note.txt</button>
          <span id="title" title=${JSON.stringify(path.join(host.workspace, 'note.txt'))}>note.txt</span>
          <a id="anchor" href="#" title=${JSON.stringify(path.join(host.workspace, 'note.txt'))}>note.txt</a>
          <code id="text">note.txt</code>
          <a id="resource" href="dsh-resource://file/session/other/note.txt"><span title="wrong.txt">note.txt</span></a>
          <script>window.__ModuleLoader__ = { load(def) { window.plugin = def.factory() } };</script>
          <script>const factory = "unrelated plugin";</script><script src="/client.js"></script><script>
          window.urls = { created: [], revoked: [] };
          const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
          URL.createObjectURL = (blob) => { const u=create(blob); urls.created.push(u); return u };
          URL.revokeObjectURL = (u) => { urls.revoked.push(u); revoke(u) };
          const rpc = async (op,id,path,options) => {
            const value = await (await fetch('/rpc', {method:'POST',body:JSON.stringify({op,id,path,options})})).json();
            if(value.ok && op==='readBytes') value.value.data = new Uint8Array(value.value.data);
            return value;
          };
          window.ctx = { effect(fn) { window.cleanup = fn() },
            sessions: {list: {getSnapshot: () => ({byId: {
              active: {id:'active',cwd:${JSON.stringify(host.workspace)},retainedBy:{mainView:1}},
              other: {id:'other',cwd:${JSON.stringify(host.workspace)}}
            }})}}, remote: {session: {workspacePathApplications: async () => ({ok:true,value:[]})},
              workspaceFiles: Object.fromEntries(['stat','list','readBytes'].map(op => [op, (...args)=>rpc(op,...args)]))}
          }; plugin.apply(ctx);
          </script></body></html>`)
        return
      }
      if (req.url !== '/rpc' || req.method !== 'POST') { res.writeHead(404); res.end(); return }
      const buffers: Buffer[] = []
      for await (const chunk of req) { buffers.push(chunk); if (buffers.reduce((n,b)=>n+b.length,0)>8192) throw new Error('fixture body cap') }
      const args = JSON.parse(Buffer.concat(buffers).toString())
      // This fixture serves only its known synthetic files, never arbitrary paths.
      // Windows runners may expose a short TEMP spelling (RUNNER~1) while the
      // Host returns its canonical long path. Compare filesystem identities.
      if (!['active', 'other'].includes(args.id) || path.dirname(fs.realpathSync.native(args.path)) !== fs.realpathSync.native(host.workspace)
        || !['preview.html','note.txt','large.txt','image.svg'].includes(path.basename(args.path))) throw new Error('fixture path rejected')
      calls.push(args)
      if (pending && args.op === 'stat') { pending = false; await new Promise<void>(resolve => { release = resolve }) }
      const value = args.op === 'stat' ? await endpoint.stat(host.scope, args.path, signal())
        : args.op === 'readBytes' ? await endpoint.readBytes(host.scope, args.path, args.options || {}, signal()) : null
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ ok: true, value: args.op === 'readBytes' ? { ...value, data: Array.from((value as any).data) } : value }))
    } catch (error) { fixtureErrors.push(String(error)); res.end(JSON.stringify({ ok: false })) }
  })
  await listenSafe(server)
  const address = server.address() as { port: number }
  const receiver = `http://127.0.0.1:${address.port}/collect?synthetic=`
  fs.writeFileSync(path.join(host.workspace, 'preview.html'), attack.replace('window.scriptRan = true;',
    `window.scriptRan = true; new Image().src=${JSON.stringify(receiver + 'script')};`)
    + `<img src="${receiver}image"><style>body{background-image:url('${receiver}css')}</style>`)
  let browser
  let page
  try {
    browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge', headless: true } : { headless: true })
    page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${address.port}/`)
    await page.locator('#resource span').click({ button: 'right' })
    await expect.poll(() => calls.some(call => call.op === 'stat' && call.id === 'other')).toBe(true)
    await expect.poll(() => page.locator('[data-dfa-menu]').count()).toBe(1)
    await page.keyboard.press('Escape')

    // Real Host validation warms ambiguous title/text references before the
    // synchronous contextmenu handler takes over the native event.
    for (const selector of ['#title', '#anchor', '#text']) {
      await page.locator(selector).hover()
      await expect.poll(() => page.locator(selector).evaluate(el => !el.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
      ))).toBe(true)
      await expect.poll(() => page.locator('.dfa-name').textContent()).toBe('note.txt')
      await page.keyboard.press('Escape')
    }

    // The actual action creates a popup, reads from the real Host and installs
    // a static safe preview. Script/network execution requires a separate opt-in.
    const popupPromise = page.waitForEvent('popup')
    await page.evaluate(({ file }) => {
      void (window as any).plugin.__internals.dispatch({ action: 'browser' }, { absolutePath: file }, {
        bridge: (window as any).plugin.__internals.createBridge((window as any).ctx),
        t: (window as any).plugin.__internals.messages('en'), sessionId: 'active',
      })
    }, { file: path.join(host.workspace, 'preview.html') })
    const popup = await popupPromise
    await expect.poll(() => popup.locator('button').count()).toBe(1)
    await expect.poll(async () => {
      const frame = popup.frames().find(frame => frame !== popup.mainFrame())
      return frame?.locator('body').textContent()
    }).toContain('Preview')
    const safe = popup.frames().find(frame => frame !== popup.mainFrame())!
    expect(await safe.evaluate(() => (window as any).scriptRan)).toBeUndefined()
    await popup.screenshot({ path: path.join(project, 'work/results/preview-safe.png') })
    expect(outbound).toEqual([])
    await popup.getByRole('button', { name: /enable scripts and network/i }).click()
    await expect.poll(async () => {
      const frame = popup.frames().find(frame => frame !== popup.mainFrame())
      return frame?.evaluate(() => (window as any).scriptRan)
    }).toBe(true)
    const child = popup.frames().find(frame => frame !== popup.mainFrame())!
    expect(await child.evaluate(() => [(window as any).parentReadable, (window as any).cookieReadable, (window as any).openerReadable])).toEqual([false, false, false])
    expect(await popup.evaluate(() => window.opener)).toBe(null)
    await expect.poll(() => outbound.includes('/collect?synthetic=script')).toBe(true)
    await popup.close()

    const refreshPopupPromise = page.waitForEvent('popup')
    await page.evaluate(({ receiver }) => {
      const win = window.open('', '_blank')!
      ;(window as any).plugin.__internals.fillBrowserWindow(win,
        new TextEncoder().encode(`<meta http-equiv="refresh" content="0;url=${receiver}refresh">Static refresh fixture`), 'text/html')
    }, { receiver })
    const refreshPopup = await refreshPopupPromise
    await expect.poll(async () => refreshPopup.frames().find(frame => frame !== refreshPopup.mainFrame())?.locator('body').textContent()).toContain('Static refresh fixture')
    await refreshPopup.screenshot({ path: path.join(project, 'work/results/preview-refresh.png') })
    expect(outbound.some(url => url.includes('refresh'))).toBe(false)
    await refreshPopup.close()

    // Whole-file download genuinely exceeds the 2 MiB copy-window cap.
    const downloadPromise = page.waitForEvent('download')
    await page.evaluate(({ file }) => {
      void (window as any).plugin.__internals.dispatch({ action: 'saveAs' }, { absolutePath: file }, {
        bridge: (window as any).plugin.__internals.createBridge((window as any).ctx),
        t: (window as any).plugin.__internals.messages('en'), sessionId: 'active',
      })
    }, { file: path.join(host.workspace, 'large.txt') })
    const download = await downloadPromise
    expect(fs.statSync((await download.path())!).size).toBe(3 * 1024 * 1024)

    await page.locator('#note').evaluate((el: HTMLElement) => { el.dataset.fileActionsPath = 'image.svg' })
    await page.locator('#note').click({ button: 'right' })
    await expect.poll(() => page.locator('[data-dfa-menu] img').count(), {
      message: 'Host-canonical thumbnail must load from the same synthetic workspace',
    }).toBe(1)
    await page.evaluate(() => (window as any).cleanup())
    expect(await page.locator('[data-dfa-menu]').count()).toBe(0)
    expect(await page.evaluate(() => (window as any).urls.revoked.length)).toBeGreaterThan(0)

    // A stat that completes after unload must not recreate the menu.
    await page.evaluate(() => { (window as any).plugin.apply((window as any).ctx); (document.querySelector('#note') as HTMLElement).dataset.fileActionsPath = 'note.txt' })
    pending = true
    await page.locator('#note').click({ button: 'right' })
    await expect.poll(() => !!release).toBe(true)
    await page.evaluate(() => (window as any).cleanup())
    release!(); release = undefined
    // The held fixture stat proves the disposed install had reached its probe
    // before the continuation could reconsider the menu.
    expect(calls.some(call => call.op === 'stat' && path.basename(call.path) === 'note.txt')).toBe(true)
    // Flush the fixture request and client continuations, then inspect the DOM.
    await page.evaluate(async () => { await fetch('/'); await new Promise(resolve => setTimeout(resolve, 50)) })
    expect(await page.locator('[data-dfa-menu]').count()).toBe(0)
    expect(errors).toEqual([])
    await page.screenshot({ path: path.join(project, 'work/results/browser.png') })
  } catch (error) {
    const diagnostics = await page?.evaluate(() => ({ urls: (window as any).urls,
      focused: document.hasFocus(), menu: document.querySelector('[data-dfa-menu]')?.outerHTML }))
    fs.writeFileSync(path.join(project, 'work/results/failure.json'), JSON.stringify({ diagnostics, calls, fixtureErrors }, null, 2))
    await page?.screenshot({ path: path.join(project, 'work/results/failure.png') }).catch(() => {})
    throw error
  } finally {
    release?.()
    await browser?.close()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await host.dispose()
  }
}, 30000)
