import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'node:http'
import { chromium, expect as browserExpect } from '@playwright/test'
import { expect, it } from 'vitest'

// Browser interaction checks use deterministic Remote responses. The separate
// runtime suite exercises real Host filesystem reads and sandboxed previews.
async function menuFixture() {
  const client = fs.readFileSync(path.join(process.env.DFA_PROJECT!, 'lib/client.js'), 'utf8')
  const server = createServer((req, res) => {
    if (req.url === '/client.js') { res.setHeader('content-type', 'text/javascript'); res.end(client); return }
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(`<!doctype html><html lang="en" style="font-size:16px;color-scheme:dark"><head><meta charset="utf-8">
      <style>body{font:16px system-ui;background:#181818;color:#eee;padding:28px}button,code,a{margin:8px}
      .controls{display:flex;flex-wrap:wrap;max-width:500px}</style></head><body>
      <div class="controls"><button id="note" data-file-actions-path="note.txt">note.txt</button>
      <button id="image" data-file-actions-path="image.svg">image.svg</button>
      <button id="missing" data-file-actions-path="missing.txt">missing.txt</button>
      <code id="guess" tabindex="0">guess.txt</code><code id="prose">missing-prose.txt</code>
      <a id="link" href="https://example.com/docs">Documentation</a></div>
      <script>window.__ModuleLoader__={load(def){window.plugin=def.factory()}};</script>
      <script src="/client.js"></script><script>
      window.state={missing:true,apps:'ready',delayApps:false,delayThumb:false};
      window.calls={opens:[],apps:0,stats:0}; window.lastPrevented=null;
      document.addEventListener('contextmenu',e=>window.lastPrevented=e.defaultPrevented);
      window.apps=[{id:'player',name:'Media Player'},{id:'code',name:'Visual Studio Code'},
        {id:'notepad',name:'Notepad',default:true},...Array.from({length:7},(_,i)=>({id:'other'+i,name:'Other '+i}))];
      window.ctx={effect(fn){window.cleanup=fn()},sessions:{list:{getSnapshot:()=>({byId:{
        active:{id:'active',cwd:'/workspace',retainedBy:{mainView:1}}}})}},remote:{
        session:{openWorkspacePath:async request=>{calls.opens.push(request);return {ok:true,value:{opened:true}}},
          workspacePathApplications:async()=>{calls.apps++;if(state.delayApps)await new Promise(r=>window.releaseApps=r);
            return state.apps==='failed'?{ok:false,error:{code:'gateway/internal'}}:{ok:true,value:state.apps==='empty'?[]:apps}}},
        workspaceFiles:{stat:async(id,path)=>{calls.stats++;
          if((path.endsWith('missing.txt')&&state.missing)||path.endsWith('missing-prose.txt'))
            return {ok:false,error:{code:'workspace-file/not-found'}};
          return {ok:true,value:{absolutePath:path,bytes:32,version:'v1'}}},
          list:async()=>({ok:false,error:{code:'workspace-file/not-found'}}),
          readBytes:async()=>{if(state.delayThumb)await new Promise(r=>window.releaseThumb=r);
            return {ok:true,value:{data:new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>'),eof:true}}}
        }}};plugin.apply(ctx);
      </script></body></html>`)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge', headless: true } : { headless: true })
  const page = await browser.newPage({ locale: 'en-US', viewport: { width: 1100, height: 850 } })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${(server.address() as any).port}/`)
  return { page, errors, async dispose() { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())) } }
}

it('cold guesses and Shift preserve the native event; explicit missing files offer a working retry', async () => {
  const fixture = await menuFixture()
  const { page, errors } = fixture
  try {
    // Dispatch without pointerover to exercise the genuinely cold path.
    const cold = await page.locator('#guess').evaluate(el => !el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))
    expect(cold).toBe(false)
    await expect.poll(() => page.evaluate(() => (window as any).calls.stats)).toBe(1)
    await page.locator('#guess').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-item="open"]')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.locator('#prose').hover()
    await expect.poll(() => page.evaluate(() => (window as any).calls.stats)).toBeGreaterThan(1)
    const invalid = await page.locator('#prose').evaluate(el => !el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))
    expect(invalid).toBe(false)
    await page.locator('#missing').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-item="status"]')).toContainText('File not found')
    await page.evaluate(() => { (window as any).state.missing = false })
    await page.locator('[data-dfa-item="retry"]').click()
    await browserExpect(page.locator('[data-dfa-item="open"]')).toBeVisible()
    await page.keyboard.press('Escape')
    const shifted = await page.locator('#link').evaluate(el => !el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, shiftKey: true })))
    expect(shifted).toBe(false)
    expect(await page.locator('[data-dfa-menu]').count()).toBe(0)
    expect(errors).toEqual([])
  } finally { await fixture.dispose() }
})

it('late associations keep the hovered row in place; query failures can retry to an empty result', async () => {
  const fixture = await menuFixture()
  const { page, errors } = fixture
  try {
    await page.evaluate(() => { (window as any).state.delayApps = true })
    await page.locator('#note').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-item="editor"]')).toContainText('Finding applications')
    await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished)))
    const probesBeforeHover = await page.evaluate(() => (window as any).calls.stats)
    await page.locator('.dfa-name').hover()
    expect(await page.evaluate(() => (window as any).calls.stats)).toBe(probesBeforeHover)
    const reveal = page.locator('[data-dfa-item="reveal"]')
    await reveal.hover()
    const before = await reveal.boundingBox()
    await page.evaluate(() => (window as any).releaseApps())
    await browserExpect(page.locator('[data-dfa-item="editor"]')).toContainText('Visual Studio Code')
    const after = await reveal.boundingBox()
    expect(after!.y).toBe(before!.y)
    expect(after!.x).toBe(before!.x)
    await browserExpect(reveal).toHaveAttribute('data-focus', 'true')
    await page.keyboard.press('Escape')
    await page.reload()
    await page.evaluate(() => { (window as any).state.apps = 'failed' })
    await page.locator('#note').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-item="openWith"]')).toContainText('lookup failed')
    await page.evaluate(() => { (window as any).state.apps = 'empty' })
    await page.locator('[data-dfa-item="openWith"]').click()
    await browserExpect(page.locator('[data-dfa-item="openWith"]')).toContainText('No associated applications')
    expect(await page.evaluate(() => (window as any).calls.apps)).toBe(2)
    expect(errors).toEqual([])
  } finally { await fixture.dispose() }
})

it('preferred applications survive reload, open the selected handler, and clear with the keyboard', async () => {
  const fixture = await menuFixture()
  const { page, errors } = fixture
  try {
    await page.locator('#note').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-item="openWith"]')).toHaveAttribute('aria-disabled', 'false')
    await page.locator('[data-dfa-item="openWith"]').hover()
    await page.locator('[data-dfa-item="app:player"] button').click()
    expect(await page.evaluate(() => (window as any).calls.opens.length)).toBe(0)
    await page.reload()
    await page.locator('#note').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-item="editor"]')).toContainText('Media Player')
    await page.locator('[data-dfa-item="editor"]').click()
    expect(await page.evaluate(() => (window as any).calls.opens)).toEqual([{ path: '/workspace/note.txt', application: 'player' }])
    await page.locator('#note').click({ button: 'right' })
    await page.locator('[data-dfa-item="openWith"]').hover()
    expect(await page.locator('[data-dfa-menu="submenu"] [role="menuitem"]').first().getAttribute('data-dfa-item')).toBe('app:player')
    await page.locator('[data-dfa-item="app:player"]').hover()
    await page.keyboard.press('Shift+Enter')
    await page.locator('#note').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-item="editor"]')).toContainText('Visual Studio Code')
    expect(errors).toEqual([])
    await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished)))
    await page.screenshot({ path: path.join(process.env.DFA_PROJECT!, 'work/results/menu-preference.png') })
  } finally { await fixture.dispose() }
})

it('late thumbnails retain submenu search, no matches cannot launch hidden apps, and large text stays in the viewport', async () => {
  const fixture = await menuFixture()
  const { page, errors } = fixture
  try {
    await page.evaluate(() => { (window as any).state.delayThumb = true })
    await page.locator('#image').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-item="openWith"]')).toHaveAttribute('aria-disabled', 'false')
    await page.locator('[data-dfa-item="openWith"]').hover()
    const input = page.locator('.dfa-search')
    await input.click()
    await input.fill('Other 6')
    const before = await page.locator('[data-dfa-menu="1"]').boundingBox()
    await page.evaluate(() => (window as any).releaseThumb())
    await browserExpect(page.locator('.dfa-thumb img')).toBeVisible()
    await browserExpect(input).toBeFocused()
    await browserExpect(input).toHaveValue('Other 6')
    expect((await page.locator('[data-dfa-menu="1"]').boundingBox())!.y).toBe(before!.y)
    await input.fill('no such application')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    expect(await page.evaluate(() => (window as any).calls.opens.length)).toBe(0)
    await browserExpect(input).toBeVisible()
    await page.keyboard.press('Escape') // clear filter
    await page.keyboard.press('Escape') // close submenu
    await page.keyboard.press('Escape') // close menu
    await page.setViewportSize({ width: 420, height: 480 })
    await page.evaluate(() => { document.documentElement.style.fontSize = '28px' })
    await page.locator('#note').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-item="editor"]')).toContainText('Visual Studio Code')
    const root = page.locator('[data-dfa-menu="1"]')
    expect(await root.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(24)
    const box = await root.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(8)
    expect(box!.x + box!.width).toBeLessThanOrEqual(412)
    expect(box!.y + box!.height).toBeLessThanOrEqual(472)
    await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished)))
    await page.screenshot({ path: path.join(process.env.DFA_PROJECT!, 'work/results/menu-large-text.png') })
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 1100, height: 850 })
    await page.evaluate(() => {
      document.documentElement.style.cssText = 'font-size:16px;color-scheme:light;--dsw-alias-bg-layer-1:#fafafa;--dsw-alias-bg-layer-2:#fff;--dsw-alias-label-primary:#202020;--dsw-alias-label-tertiary:#666'
      document.body.style.background = '#eee'
      document.querySelector<HTMLElement>('#note')!.style.cssText = 'position:fixed;right:10px;bottom:10px'
    })
    await page.locator('#note').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-item="openWith"]')).toHaveAttribute('aria-disabled', 'false')
    await page.locator('[data-dfa-item="openWith"]').hover()
    const submenu = page.locator('[data-dfa-menu="submenu"]')
    await browserExpect(submenu).toBeVisible()
    await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished)))
    const parentBox = await root.boundingBox()
    const subBox = await submenu.boundingBox()
    expect(subBox!.x).toBeGreaterThanOrEqual(8)
    expect(subBox!.x + subBox!.width).toBeLessThanOrEqual(parentBox!.x + 8)
    expect(subBox!.y + subBox!.height).toBeLessThanOrEqual(842)
    await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished)))
    await page.screenshot({ path: path.join(process.env.DFA_PROJECT!, 'work/results/menu-light.png') })
    expect(errors).toEqual([])
  } finally { await fixture.dispose() }
})
