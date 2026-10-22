import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'node:http'
import { chromium } from '@playwright/test'
import { expect, it } from 'vitest'
import { openWorkspace, signal } from 'host-source/packages/api/workspace-files/tests/harness.ts'

it('real WorkspaceFiles and browser cover resource identity, sandbox isolation, unload and cache cleanup', async () => {
  const host = await openWorkspace('dfa-host-')
  const endpoint = host.endpoint({ maxBytes: 2 * 1024 * 1024, maxFileBytes: 32 * 1024 * 1024 })
  const project = process.env.DFA_PROJECT!
  const client = fs.readFileSync(path.join(project, 'lib/client.js'), 'utf8')
  const calls: Array<{ id: string; path: string; op: string }> = []
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
      if (req.url === '/client.js') { res.setHeader('content-type', 'text/javascript'); res.end(client); return }
      if (req.url === '/') {
        res.setHeader('content-type', 'text/html; charset=utf-8')
        res.setHeader('set-cookie', 'fixture=synthetic; SameSite=Strict')
        res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body>
          <button id="note" data-file-actions-path="note.txt">note.txt</button>
          <a id="resource" href="dsh-resource://file/session/other/note.txt"><span title="wrong.txt">note.txt</span></a>
          <script>window.__ModuleLoader__ = { load(def) { window.plugin = def.factory() } };</script>
          <script src="/client.js"></script><script>
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
      if (!['active', 'other'].includes(args.id) || path.dirname(args.path) !== host.workspace
        || !['preview.html','note.txt','large.txt','image.svg'].includes(path.basename(args.path))) throw new Error('fixture path rejected')
      calls.push(args)
      if (pending && args.op === 'stat') { pending = false; await new Promise<void>(resolve => { release = resolve }) }
      const value = args.op === 'stat' ? await endpoint.stat(host.scope, args.path, signal())
        : args.op === 'readBytes' ? await endpoint.readBytes(host.scope, args.path, args.options || {}, signal()) : null
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ ok: true, value: args.op === 'readBytes' ? { ...value, data: Array.from((value as any).data) } : value }))
    } catch { res.end(JSON.stringify({ ok: false })) }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  let browser
  try {
    browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge', headless: true } : { headless: true })
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${address.port}/`)
    await page.locator('#resource span').click({ button: 'right' })
    await expect.poll(() => calls.some(call => call.op === 'stat' && call.id === 'other')).toBe(true)
    await expect.poll(() => page.locator('[data-dfa-menu]').count()).toBe(1)
    await page.keyboard.press('Escape')

    // The actual action creates a popup, reads from the real Host and installs
    // a sandboxed preview; file scripts run but cannot reach DSH DOM/cookies.
    const popupPromise = page.waitForEvent('popup')
    await page.evaluate(({ file }) => {
      void (window as any).plugin.__internals.dispatch({ action: 'browser' }, { absolutePath: file }, {
        bridge: (window as any).plugin.__internals.createBridge((window as any).ctx),
        t: (window as any).plugin.__internals.messages('en'), sessionId: 'active',
      })
    }, { file: path.join(host.workspace, 'preview.html') })
    const popup = await popupPromise
    await expect.poll(async () => {
      const frame = popup.frames().find(frame => frame !== popup.mainFrame())
      return frame?.evaluate(() => (window as any).scriptRan)
    }).toBe(true)
    const child = popup.frames().find(frame => frame !== popup.mainFrame())!
    expect(await child.evaluate(() => [(window as any).parentReadable, (window as any).cookieReadable, (window as any).openerReadable])).toEqual([false, false, false])
    expect(await popup.evaluate(() => window.opener)).toBe(null)
    await popup.close()

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
    await expect.poll(() => page.locator('[data-dfa-menu] img').count()).toBe(1)
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
    await page.waitForFunction(() => (window as any).__dfaDebug?.stage === 'probe')
    // Flush the fixture request and client continuations, then inspect the DOM.
    await page.evaluate(async () => { await fetch('/'); await new Promise(resolve => setTimeout(resolve, 50)) })
    expect(await page.locator('[data-dfa-menu]').count()).toBe(0)
    expect(errors).toEqual([])
    await page.screenshot({ path: path.join(project, 'work/results/browser.png') })
  } finally {
    release?.()
    await browser?.close()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await host.dispose()
  }
}, 30000)
