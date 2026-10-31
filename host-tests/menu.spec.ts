import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { chromium, expect as browserExpect } from '@playwright/test'
import { expect, it } from 'vitest'
import { listenSafe } from './server.ts'

// Browser interaction checks use deterministic Remote responses. The separate
// runtime suite exercises real Host filesystem reads and sandboxed previews.
async function menuFixture(initial: { state?: Record<string, unknown>; apps?: Array<{ id: string; name: string }>; settings?: boolean; storage?: Record<string, string> } = {}) {
  const client = fs.readFileSync(path.join(process.env.DFA_PROJECT!, 'lib/client.js'), 'utf8')
  let settingsBoot = ''
  if (initial.settings) {
    const build = createRequire(fs.realpathSync(path.join(process.cwd(), 'node_modules/tsx/package.json')))('esbuild').buildSync
    const rendererRequire = createRequire(path.join(process.cwd(), 'packages/client/ui-renderer/package.json'))
    settingsBoot = build({ stdin: { contents: `
      import React from ${JSON.stringify(rendererRequire.resolve('react'))};
      import {createRoot} from ${JSON.stringify(rendererRequire.resolve('react-dom/client'))};
      window.React = React; window.settingsSections = [];
      const root = createRoot(document.getElementById('settings'));
      window.slots = { inject(_name, fn) {return fn()}, register(meta, Component) {
        window.settingsSections.push(meta);
        const button = document.createElement('button');
        button.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" /></svg><span></span>';
        button.querySelector('span').textContent = typeof meta.label === 'function' ? meta.label() : meta.label;
        document.getElementById('settings-nav').appendChild(button);
        root.render(React.createElement(Component));
        return () => {button.remove();root.render(null); window.settingsSections = window.settingsSections.filter(item => item !== meta)};
      }};
    `, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent' }).outputFiles[0].text
  }

  const server = createServer((req, res) => {
    if (req.url === '/client.js') { res.setHeader('content-type', 'text/javascript'); res.end(client); return }
    if (req.url === '/icon.svg') { res.setHeader('content-type', 'image/svg+xml'); res.end(fs.readFileSync(path.join(process.env.DFA_PROJECT!, 'icon.svg'))); return }
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(`<!doctype html><html lang="en" style="font-size:16px;color-scheme:dark"><head><meta charset="utf-8">
      <style>body{font:16px system-ui;background:#181818;color:#eee;padding:28px}button,code,a{margin:8px}
      .controls{display:flex;flex-wrap:wrap;max-width:500px}</style></head><body>
      <div class="controls"><button id="note" data-file-actions-path="note.txt">note.txt</button>
      <button id="image" data-file-actions-path="image.svg">image.svg</button>
      <button id="image2" data-file-actions-path="image2.svg">image2.svg</button>
      <button id="missing" data-file-actions-path="missing.txt">missing.txt</button>
      <code id="guess" tabindex="0">guess.txt</code><span id="prose">missing-prose.txt</span>
      <span id="plain" tabindex="0">plain.txt</span>
      <code id="reference" tabindex="0">note.txt</code>
      <pre><code id="fenced">fenced-only.txt</code></pre>
      <a id="link" href="https://example.com/docs">Documentation</a>
      <div id="tree-row" class="row" role="button" title="C:/workspace/note.txt">note.txt</div></div>
      ${initial.settings ? '<section role="dialog" aria-label="Settings fixture"><nav id="settings-nav"><button id="other-section"><svg width="16" height="16"><circle cx="8" cy="8" r="6" /></svg><span>Other settings</span></button></nav><div id="settings"></div></section>' : '<div id="settings"></div>'}<script>${settingsBoot.replaceAll('</script', '<\/script')}</script>
      <script>window.__ModuleLoader__={load(def){window.plugin=def.factory(name=>{if(name==='react')return window.React;throw Error(name)})}};</script>
      <script src="/client.js"></script><script>
      window.state={missing:true,apps:'ready',delayApps:false,delayThumb:false};
      window.calls={opens:[],apps:0,stats:0,paths:[]}; window.lastPrevented=null;
      document.addEventListener('contextmenu',e=>window.lastPrevented=e.defaultPrevented);
      window.apps=[{id:'player',name:'Media Player'},{id:'code',name:'Visual Studio Code'},
        {id:'notepad',name:'Notepad',default:true},...Array.from({length:7},(_,i)=>({id:'other'+i,name:'Other '+i}))];
      Object.assign(window.state, ${JSON.stringify(initial.state || {})});
      if (${JSON.stringify(Boolean(initial.apps))}) window.apps=${JSON.stringify(initial.apps || [])};
      if(!sessionStorage.getItem('dfa-fixture-seeded')){for(const [key,value] of Object.entries(${JSON.stringify(initial.storage || {})}))localStorage.setItem(key,value);sessionStorage.setItem('dfa-fixture-seeded','1')}
      window.uiLanguage="en";
      window.ctx={get(name){return name==='slots'?window.slots:undefined},effect(fn){window.cleanup=fn()},sessions:{list:{getSnapshot:()=>({byId:{
        active:{id:'active',cwd:'/workspace',retainedBy:{mainView:1}}}})}},remote:{
        session:{openWorkspacePath:async request=>{calls.opens.push(request);return {ok:true,value:{opened:true}}},
          workspacePathApplications:async()=>{calls.apps++;if(state.delayApps)await new Promise(r=>window.releaseApps=r);
            return state.apps==='failed'?{ok:false,error:{code:'gateway/internal'}}:{ok:true,value:state.apps==='empty'?[]:apps}}},
        workspaceFiles:{stat:async(id,path)=>{calls.stats++;calls.paths.push(path);
          if((path.endsWith('missing.txt')&&state.missing)||path.endsWith('missing-prose.txt'))
            return {ok:false,error:{code:'workspace-file/not-found'}};
          return {ok:true,value:{absolutePath:path,bytes:32,version:'v1'}}},
          list:async()=>({ok:false,error:{code:'workspace-file/not-found'}}),
          readBytes:async(id,path)=>{if(state.delayThumb)await new Promise(r=>{const w=window;w.thumbWaiters??=[];
              w.thumbWaiters.push(r);w.releaseThumb=()=>{w.thumbWaiters.splice(0).forEach(fn=>fn())}});
            const marker=path.includes('image2')?'#00ff00':'#ff0000';
            const svg='<svg xmlns="http://www.w3.org/2000/svg" width="40" height="24"><rect width="40" height="24" fill="'+marker+'"/></svg>';
            return {ok:true,value:{data:new TextEncoder().encode(svg),eof:true}}}
        }}};if(window.slots)ctx.locale={language:{getSnapshot:()=>window.uiLanguage}};plugin.apply(ctx);
      </script></body></html>`)
  })
  await listenSafe(server)
  const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge', headless: true } : { headless: true })
  const page = await browser.newPage({ locale: 'en-US', viewport: { width: 1100, height: 850 } })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  // Park away from fixture controls before navigation: Chromium may emit a
  // pointerover during the first paint, which would warm a supposedly cold case.
  await page.mouse.move(1090, 840)
  try { await page.goto(`http://127.0.0.1:${(server.address() as any).port}/`) }
  catch (error) { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); throw error }
  return { page, errors, async dispose() { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())) } }
}

it('application search keeps cursor editing and IME confirmation inside the input', async () => {
  const fixture = await menuFixture()
  const { page } = fixture
  try {
    await page.locator('#note').click({ button: 'right' })
    await page.locator('[data-dfa-item="openWith"]').hover()
    const input = page.locator('.dfa-search')
    await input.fill('Other')
    await input.press('ArrowLeft')
    await browserExpect(input).toBeFocused()
    expect(await input.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(4)
    await input.press('Home')
    expect(await input.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(0)
    const accepted = await input.evaluate(el => el.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', isComposing: true, keyCode: 229, bubbles: true, cancelable: true,
    })))
    expect(accepted).toBe(true)
    await browserExpect(input).toBeVisible()
    expect(await page.evaluate(() => (window as any).calls.opens)).toEqual([])
  } finally { await fixture.dispose() }
})

it('background application validation retains the filter, selection and input focus', async () => {
  const fixture = await menuFixture()
  const { page } = fixture
  try {
    await page.locator('#note').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-item="editor"]')).toContainText('Visual Studio Code')
    await expect.poll(() => page.evaluate(() => !!localStorage.getItem('dsh-file-actions.apps.v1'))).toBe(true)
    await page.reload()
    await page.evaluate(() => {
      (window as any).state.delayApps = true
      ;(window as any).apps.push({ id: 'new', name: 'New Editor' })
    })
    await page.locator('#note').click({ button: 'right' })
    await page.locator('[data-dfa-item="openWith"]').hover()
    await page.locator('.dfa-search').fill('Other')
    await page.locator('.dfa-search').press('ArrowDown')
    const selected = await page.locator('.dfa-sub [data-focus="true"]').getAttribute('data-dfa-item')
    await expect.poll(() => page.evaluate(() => typeof (window as any).releaseApps)).toBe('function')
    await page.evaluate(() => { (window as any).state.delayApps = false; (window as any).releaseApps() })
    await browserExpect(page.locator('[data-dfa-item="openWith"]')).toContainText('Open with')
    await expect.poll(() => page.locator('[data-dfa-item="app:new"]').count()).toBe(1)
    await browserExpect(page.locator('.dfa-search')).toHaveValue('Other')
    await browserExpect(page.locator('.dfa-search')).toBeFocused()
    expect(await page.locator('.dfa-sub [data-focus="true"]').getAttribute('data-dfa-item')).toBe(selected)
    await page.keyboard.press('Enter')
    await expect.poll(() => page.evaluate(() => (window as any).calls.opens)).toEqual([
      { path: '/workspace/note.txt', application: selected!.slice(4) },
    ])
  } finally { await fixture.dispose() }
})

for (const change of ['removing', 'renaming']) {
it(`${change} the selected application during validation cannot open a different application`, async () => {
  const fixture = await menuFixture()
  const { page } = fixture
  try {
    await page.locator('#note').click({ button: 'right' })
    await expect.poll(() => page.evaluate(() => !!localStorage.getItem('dsh-file-actions.apps.v1'))).toBe(true)
    await page.reload()
    await page.evaluate(change => {
      (window as any).state.delayApps = true
      const w = window as any
      if (change === 'removing') w.apps = w.apps.filter(app => app.id !== 'other0')
      else w.apps.find(app => app.id === 'other0').name = 'Renamed application'
    }, change)
    await page.locator('#note').click({ button: 'right' })
    await page.locator('[data-dfa-item="openWith"]').hover()
    await page.locator('.dfa-search').fill('Other')
    await expect.poll(() => page.evaluate(() => typeof (window as any).releaseApps)).toBe('function')
    await page.evaluate(() => { (window as any).state.delayApps = false; (window as any).releaseApps() })
    await browserExpect(page.locator('.dfa-sub')).toHaveCount(0)
    await page.keyboard.press('Enter')
    expect(await page.evaluate(() => (window as any).calls.opens)).toEqual([])
  } finally { await fixture.dispose() }
})
}

it('inline tooltips retain matching line labels without borrowing another file location', async () => {
  const fixture = await menuFixture()
  const { page } = fixture
  try {
    await page.evaluate(() => {
      (window as any).copied = []
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => (window as any).copied.push(text) } })
      const button = document.createElement('button')
      button.title = '/workspace/note.txt'
      button.textContent = 'note.txt#L2-L3'
      document.querySelector('#reference')!.replaceChildren(button)
    })
    await page.locator('#reference button').click({ button: 'right' })
    await browserExpect(page.locator('.dfa-loc')).toContainText('lines 2–3')
    await browserExpect(page.locator('[data-dfa-item="copyLines"]')).toBeVisible()
    await page.locator('[data-dfa-item="copyReference"]').click()
    expect(await page.evaluate(() => (window as any).copied)).toEqual(['note.txt#L2-L3'])
    await page.locator('#reference button').evaluate(el => { el.textContent = 'other.txt#L2-L3' })
    await page.locator('#reference button').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-item="open"]')).toBeVisible()
    await browserExpect(page.locator('[data-dfa-item="copyLines"]')).toHaveCount(0)
  } finally { await fixture.dispose() }
})

it('keyboard opening a different reference replaces the existing menu', async () => {
  const fixture = await menuFixture()
  const { page } = fixture
  try {
    await page.locator('#note').focus()
    await page.keyboard.press('Shift+F10')
    await browserExpect(page.locator('.dfa-name')).toHaveText('note.txt')
    await page.locator('#image2').focus()
    await page.keyboard.press('Shift+F10')
    await browserExpect(page.locator('[data-dfa-menu="1"]')).toHaveCount(1)
    await browserExpect(page.locator('.dfa-name')).toHaveText('image2.svg')
    await page.keyboard.press('Escape')
    await browserExpect(page.locator('[data-dfa-menu]')).toHaveCount(0)
  } finally { await fixture.dispose() }
})

it('absolute references inside the workspace offer a canonical relative path', async () => {
  const fixture = await menuFixture()
  const { page } = fixture
  try {
    await page.evaluate(() => {
      (window as any).copied = []
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => (window as any).copied.push(text) } })
    })
    await page.locator('#note').evaluate(el => { (el as HTMLElement).dataset.fileActionsPath = '/workspace/src/note.txt' })
    await page.locator('#note').click({ button: 'right' })
    await page.locator('[data-dfa-item="copyRelPath"]').click()
    expect(await page.evaluate(() => (window as any).copied)).toEqual(['src/note.txt'])
  } finally { await fixture.dispose() }
})

it('clicking the full-size preview dismisses only the preview', async () => {
  const fixture = await menuFixture()
  const { page } = fixture
  try {
    await page.locator('#image').click({ button: 'right' })
    await page.locator('.dfa-thumb img').click()
    await browserExpect(page.locator('.dfa-lightbox')).toBeVisible()
    await page.locator('.dfa-lightbox img').click()
    await browserExpect(page.locator('.dfa-lightbox')).toHaveCount(0)
    await browserExpect(page.locator('[data-dfa-menu="1"]')).toHaveCount(1)
  } finally { await fixture.dispose() }
})

it('cold guesses and Shift preserve the native event; explicit missing files offer a working retry', async () => {
  const fixture = await menuFixture()
  const { page, errors } = fixture
  try {
    // Plain text is still a guess: a cold right-click keeps the native menu, and the
    // hover warms it so the next click is taken over.
    const cold = await page.locator('#plain').evaluate(el => !el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))
    expect(cold).toBe(false)
    await expect.poll(() => page.evaluate(() => (window as any).calls.paths.includes('/workspace/plain.txt'))).toBe(true)
    await page.locator('#plain').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-item="open"]')).toBeVisible()
    await page.keyboard.press('Escape')
    // Inline code is a deliberate reference: a cold right-click opens the menu
    // immediately, without a hover first.
    const inlineCold = await page.locator('#reference').evaluate(el => !el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))
    expect(inlineCold).toBe(true)
    await browserExpect(page.locator('[data-dfa-item="open"]')).toBeVisible()
    await page.keyboard.press('Escape')
    // Code inside a fenced block is content, not a reference: it stays a guess.
    const fenced = await page.locator('#fenced').evaluate(el => !el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))
    expect(fenced).toBe(false)
    expect(await page.locator('[data-dfa-menu]').count()).toBe(0)
    await page.locator('#prose').hover()
    await expect.poll(() => page.evaluate(() => (window as any).calls.paths.includes('/workspace/missing-prose.txt'))).toBe(true)
    const invalid = await page.locator('#prose').evaluate(el => !el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))
    expect(invalid).toBe(false)
    await page.locator('#missing').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-item="status"]')).toContainText('File not found')
    await page.evaluate(() => { (window as any).state.missing = false })
    await page.locator('[data-dfa-item="retry"]').click()
    await browserExpect(page.locator('[data-dfa-item="open"]')).toBeVisible()
    await page.keyboard.press('Escape')
    // Shift lets the page answer first. When nobody does, the plugin falls back to
    // its own menu: the Electron shell ships no native menu, so silence would read
    // as a broken click.
    const shifted = await page.locator('#link').evaluate(el => !el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, shiftKey: true })))
    expect(shifted).toBe(true)
    await browserExpect(page.locator('[data-dfa-menu]')).toBeVisible()
    await page.keyboard.press('Escape')
    // A page that does handle the event keeps it: the fallback must stay quiet.
    await page.locator('#link').evaluate(el => {
      el.addEventListener('contextmenu', (event) => event.preventDefault(), { once: true })
    })
    const handled = await page.locator('#link').evaluate(el => !el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, shiftKey: true })))
    expect(handled).toBe(true)
    expect(await page.locator('[data-dfa-menu]').count()).toBe(0)
    expect(errors).toEqual([])
  } finally { await fixture.dispose() }
})

it('a file tree row whose tooltip is an absolute path opens the menu cold', async () => {
  const fixture = await menuFixture()
  const { page, errors } = fixture
  try {
    // No hover: a file tree stores the absolute path in the row tooltip, so it is a
    // real address and must not fall through to the browser's menu.
    const fired = await page.locator('#tree-row').evaluate((el) => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })
      el.dispatchEvent(event)
      return event.defaultPrevented
    })
    expect(fired).toBe(true)
    await browserExpect(page.locator('[data-dfa-menu]')).toBeVisible()
    await browserExpect(page.locator('.dfa-name')).toContainText('note.txt')
    expect(errors).toEqual([])
  } finally { await fixture.dispose() }
})
it('hover prefetches the association list and a second menu reuses it', async () => {
  const fixture = await menuFixture()
  const { page, errors } = fixture
  try {
    // Hovering an explicit carrier starts the slow OS query before any click.
    await page.locator('#note').hover()
    await expect.poll(() => page.evaluate(() => (window as any).calls.apps)).toBeGreaterThan(0)
    const afterHover = await page.evaluate(() => (window as any).calls.apps)

    await page.locator('#note').click({ button: 'right' })
    await page.locator('[data-dfa-item="openWith"]').hover()
    await browserExpect(page.locator('[data-dfa-menu="submenu"] [data-dfa-item="app:notepad"]')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')

    // A second menu for the same extension reuses the cached answer.
    await page.locator('#note').click({ button: 'right' })
    await page.locator('[data-dfa-item="openWith"]').hover()
    await browserExpect(page.locator('[data-dfa-menu="submenu"] [data-dfa-item="app:notepad"]')).toBeVisible()
    expect(await page.evaluate(() => (window as any).calls.apps)).toBe(afterHover)
    await page.keyboard.press('Escape')
    expect(errors).toEqual([])
  } finally { await fixture.dispose() }
})
it('late associations keep the hovered row in place; a failed lookup leaves no dead row', async () => {
  const fixture = await menuFixture({ state: { delayApps: true } })
  const { page, errors } = fixture
  try {
    await page.locator('#note').click({ button: 'right' })
    // Both rows hold their slots while the query runs, so the rows below do not jump
    // when the answer lands. Neither row claims anything about the file type yet.
    await browserExpect(page.locator('[data-dfa-item="openWith"]')).toHaveAttribute('aria-disabled', 'true')
    await browserExpect(page.locator('[data-dfa-item="openWith"]')).toContainText('Open with')
    await browserExpect(page.locator('[data-dfa-item="editor"]')).toContainText('Open in editor')
    await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished)))
    const probesBeforeHover = await page.evaluate(() => (window as any).calls.stats)
    await page.locator('.dfa-name').hover()
    expect(await page.evaluate(() => (window as any).calls.stats)).toBe(probesBeforeHover)
    const reveal = page.locator('[data-dfa-item="reveal"]')
    await reveal.hover()
    const before = await reveal.boundingBox()
    await page.evaluate(() => (window as any).releaseApps())
    await browserExpect(page.locator('[data-dfa-item="editor"]')).toContainText('Visual Studio Code')
    await browserExpect(page.locator('[data-dfa-item="openWith"]')).toHaveAttribute('aria-disabled', 'false')
    const after = await reveal.boundingBox()
    expect(after!.y).toBe(before!.y)
    expect(after!.x).toBe(before!.x)
    await browserExpect(reveal).toHaveAttribute('data-focus', 'true')
    await page.keyboard.press('Escape')
    await page.reload()
    await page.evaluate(() => { (window as any).state.apps = 'failed'; (window as any).state.delayApps = false })
    await page.locator('#note').click({ button: 'right' })
    // The Host query throws as soon as one registered handler is broken, and no retry
    // can fix that: both association rows disappear instead of dead-ending the menu.
    await browserExpect(page.locator('[data-dfa-item="openWith"]')).toHaveCount(0)
    await browserExpect(page.locator('[data-dfa-item="editor"]')).toHaveCount(0)
    await browserExpect(page.locator('[data-dfa-item="reveal"]')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.evaluate(() => { (window as any).state.apps = 'empty' })
    await page.locator('#note').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-item="openWith"]')).toHaveCount(0)
    // A failed answer is never cached: the next menu asks again.
    expect(await page.evaluate(() => (window as any).calls.apps)).toBeGreaterThanOrEqual(2)
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

it('the open-with submenu clips its sticky header so the rounded corners survive', async () => {
  const fixture = await menuFixture()
  const { page, errors } = fixture
  try {
    await page.locator('#note').click({ button: 'right' })
    await page.locator('[data-dfa-item="openWith"]').hover()
    const submenu = page.locator('[data-dfa-menu="submenu"]')
    await browserExpect(submenu).toBeVisible()
    const probe = await page.evaluate(() => {
      const menu = document.querySelector('[data-dfa-menu="submenu"]') as HTMLElement
      const body = menu.querySelector('.dfa-body') as HTMLElement
      const header = menu.querySelector('.dfa-subhead') as HTMLElement
      const style = getComputedStyle(menu)
      const headerStyle = getComputedStyle(header)
      return {
        overflow: style.overflow,
        radius: parseFloat(style.borderTopLeftRadius),
        headerPosition: headerStyle.position,
        headerBackground: headerStyle.backgroundColor,
        headerInsideBody: body.contains(header),
        scrollTop: body.scrollTop,
      }
    })
    expect(probe.radius).toBeGreaterThan(6)
    // The header is sticky and opaque; only clipping to the rounded box keeps it from
    // painting the top corners square until the scroll fade masks them.
    expect(probe.headerPosition).toBe('sticky')
    expect(probe.headerBackground).not.toBe('rgba(0, 0, 0, 0)')
    expect(probe.headerInsideBody).toBe(true)
    expect(probe.overflow).toBe('hidden')
    expect(probe.scrollTop).toBe(0)
    expect(errors).toEqual([])
  } finally { await fixture.dispose() }
})

it('the open-with submenu stays glued to its row while the chat scrolls', async () => {
  const fixture = await menuFixture()
  const { page, errors } = fixture
  try {
    // Give the page room to scroll and park the anchor mid-viewport.
    await page.evaluate(() => {
      document.body.insertAdjacentHTML('afterbegin', '<div id="spacer" style="height:600px"></div>')
      window.scrollTo(0, 200)
    })
    await page.locator('#note').click({ button: 'right' })
    await page.locator('[data-dfa-item="openWith"]').hover()
    await browserExpect(page.locator('[data-dfa-menu="submenu"]')).toBeVisible()
    // Measure settled boxes: the entrance animation offsets the painted rect.
    await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)))
    const offsets = () => page.evaluate(() => {
      const row = document.querySelector('#note')!.getBoundingClientRect()
      const read = (selector: string) => {
        const node = document.querySelector(selector) as HTMLElement | null
        if (!node) return null
        const rect = node.getBoundingClientRect()
        return { dx: Math.round(rect.left - row.left), dy: Math.round(rect.top - row.top) }
      }
      return { menu: read('[data-dfa-menu="1"]'), sub: read('[data-dfa-menu="submenu"]') }
    })

    const before = await offsets()
    expect(before.menu).not.toBeNull()
    expect(before.sub).not.toBeNull()

    // Scroll one wheel-sized step and wait for the follow frame to settle.
    await page.evaluate(() => new Promise<void>((resolve) => {
      window.scrollBy(0, 120)
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    }))

    const after = await offsets()
    expect(after.sub).not.toBeNull()
    // Pure translation with at most a rounding pixel: nothing drifts.
    expect(Math.abs(after.menu!.dx - before.menu!.dx)).toBeLessThanOrEqual(1)
    expect(Math.abs(after.menu!.dy - before.menu!.dy)).toBeLessThanOrEqual(1)
    expect(Math.abs(after.sub!.dx - before.sub!.dx)).toBeLessThanOrEqual(1)
    expect(Math.abs(after.sub!.dy - before.sub!.dy)).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  } finally { await fixture.dispose() }
})

it('menu and submenu keep their size inside the viewport bounds and flip above a low anchor', async () => {
  const fixture = await menuFixture()
  const { page, errors } = fixture
  try {
    // Park the anchor mid-viewport for the size check.
    await page.evaluate(() => document.body.insertAdjacentHTML('afterbegin', '<div style="height:300px"></div>'))
    await page.locator('#note').click({ button: 'right' })
    await page.locator('[data-dfa-item="openWith"]').hover()
    await browserExpect(page.locator('[data-dfa-menu="submenu"]')).toBeVisible()
    const sizes = await page.evaluate(() => {
      const root = document.querySelector('[data-dfa-menu="1"]') as HTMLElement
      const sub = document.querySelector('[data-dfa-menu="submenu"]') as HTMLElement
      const note = document.querySelector('#note') as HTMLElement
      const rootStyle = getComputedStyle(root)
      const subStyle = getComputedStyle(sub)
      const px = (value: string) => parseFloat(value)
      const rect = root.getBoundingClientRect()
      const noteRect = note.getBoundingClientRect()
      const clickY = noteRect.top + noteRect.height / 2
      return {
        width: root.offsetWidth,
        minWidth: px(rootStyle.minWidth),
        maxWidth: px(rootStyle.maxWidth),
        height: root.offsetHeight,
        maxHeight: px(rootStyle.maxHeight),
        subWidth: sub.offsetWidth,
        subMinWidth: px(subStyle.minWidth),
        subMaxWidth: px(subStyle.maxWidth),
        subHeight: sub.offsetHeight,
        subMaxHeight: px(subStyle.maxHeight),
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        // The panel must sit entirely above or below the pointer, never over it.
        coversPointer: clickY >= rect.top && clickY <= rect.bottom,
      }
    })
    // Bounded on both sides: never cramped, never wider or taller than its cap.
    expect(sizes.width).toBeGreaterThanOrEqual(Math.floor(sizes.minWidth))
    expect(sizes.width).toBeLessThanOrEqual(Math.ceil(sizes.maxWidth))
    expect(sizes.height).toBeLessThanOrEqual(Math.ceil(sizes.maxHeight))
    expect(sizes.height).toBeLessThanOrEqual(sizes.viewportHeight)
    expect(sizes.subWidth).toBeGreaterThanOrEqual(Math.floor(sizes.subMinWidth))
    expect(sizes.subWidth).toBeLessThanOrEqual(Math.ceil(sizes.subMaxWidth))
    expect(sizes.subHeight).toBeLessThanOrEqual(Math.ceil(sizes.subMaxHeight))
    expect(sizes.subWidth).toBeLessThanOrEqual(sizes.viewportWidth - 16)
    expect(sizes.coversPointer).toBe(false)
    await page.keyboard.press('Escape')

    // Push the anchor down near the bottom edge: the panel must flip above it instead
    // of being clamped over the row it belongs to.
    const flip = await page.evaluate(() => {
      document.body.insertAdjacentHTML('afterbegin', '<div style="height:420px"></div>')
      window.scrollTo(0, 0)
      const note = document.querySelector('#note') as HTMLElement
      const rect = note.getBoundingClientRect()
      const clickY = Math.round(rect.top + rect.height / 2)
      note.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2,
        clientX: Math.round(rect.left + 10), clientY: clickY }))
      return { clickY, viewportHeight: window.innerHeight }
    })
    await browserExpect(page.locator('[data-dfa-menu="1"]')).toBeVisible()
    const placement = await page.evaluate(() => {
      const menu = document.querySelector('[data-dfa-menu="1"]') as HTMLElement
      return { top: Math.round(menu.getBoundingClientRect().top), bottom: Math.round(menu.getBoundingClientRect().bottom) }
    })
    // Above the pointer and inside the viewport.
    expect(placement.bottom).toBeLessThanOrEqual(flip.clickY - 2)
    expect(placement.top).toBeGreaterThanOrEqual(7)
    expect(placement.bottom).toBeLessThanOrEqual(flip.viewportHeight - 7)
    expect(errors).toEqual([])
  } finally { await fixture.dispose() }
})

it('the preview is its own block and every section shares one left axis', async () => {
  const fixture = await menuFixture()
  const { page, errors } = fixture
  try {
    await page.locator('#image').click({ button: 'right' })
    await browserExpect(page.locator('.dfa-thumb img')).toBeVisible()
    await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)))
    const boxes = await page.evaluate(() => {
      const menu = document.querySelector('[data-dfa-menu="1"]') as HTMLElement
      const rect = (selector: string) => {
        const node = menu.querySelector(selector) as HTMLElement | null
        if (!node) return null
        const r = node.getBoundingClientRect()
        return { left: r.left, top: r.top, bottom: r.bottom }
      }
      return {
        thumb: rect('.dfa-thumb'), img: rect('.dfa-thumb img'), head: rect('.dfa-head'),
        tile: rect('.dfa-tile'), ico: rect('.dfa-ico'), sep: rect('.dfa-sep'), foot: rect('.dfa-foot'),
      }
    })
    // A decoded frame is fitted inside the preview box; it can never reach the header.
    expect(boxes.img!.bottom).toBeLessThanOrEqual(boxes.thumb!.bottom + 0.5)
    expect(boxes.thumb!.bottom).toBeLessThanOrEqual(boxes.head!.top)
    // One left axis: preview, tile, row icons, separators and the footer rule.
    for (const box of [boxes.thumb, boxes.tile, boxes.ico, boxes.sep, boxes.foot]) {
      expect(Math.abs(box!.left - boxes.tile!.left)).toBeLessThanOrEqual(1)
    }
    expect(errors).toEqual([])
  } finally { await fixture.dispose() }
})

it('the preview opens full size and Escape closes only the lightbox', async () => {
  const fixture = await menuFixture()
  const { page, errors } = fixture
  try {
    await page.locator('#image').click({ button: 'right' })
    await browserExpect(page.locator('.dfa-thumb img')).toBeVisible()
    await page.locator('.dfa-thumb').click()
    await browserExpect(page.locator('.dfa-lightbox')).toBeVisible()
    await browserExpect(page.locator('.dfa-lightbox img')).toBeVisible()
    // Escape dismisses the overlay first; the menu stays for the next action.
    await page.keyboard.press('Escape')
    await browserExpect(page.locator('.dfa-lightbox')).toHaveCount(0)
    await browserExpect(page.locator('[data-dfa-menu="1"]')).toBeVisible()
    // Clicking the backdrop closes it too.
    await page.locator('.dfa-thumb').click()
    await browserExpect(page.locator('.dfa-lightbox')).toBeVisible()
    await page.locator('.dfa-lightbox').click({ position: { x: 4, y: 4 } })
    await browserExpect(page.locator('.dfa-lightbox')).toHaveCount(0)
    expect(errors).toEqual([])
  } finally { await fixture.dispose() }
})

it('Tab keeps keyboard focus inside the menu', async () => {
  const fixture = await menuFixture()
  const { page, errors } = fixture
  try {
    await page.locator('#note').click({ button: 'right' })
    const readFocus = () => page.evaluate(() => {
      const menu = document.querySelector('[data-dfa-menu="1"]') as HTMLElement
      return {
        inside: !!document.activeElement && menu.contains(document.activeElement),
        active: menu.getAttribute('aria-activedescendant'),
      }
    })
    const first = await readFocus()
    await page.keyboard.press('Tab')
    const second = await readFocus()
    await page.keyboard.press('Tab')
    const third = await readFocus()
    await page.keyboard.press('Shift+Tab')
    const fourth = await readFocus()
    expect(first.inside).toBe(true)
    expect(second.inside).toBe(true)
    expect(third.inside).toBe(true)
    expect(fourth.inside).toBe(true)
    // Focus actually moves row by row, and Shift+Tab walks it back.
    expect(second.active).not.toBe(first.active)
    expect(third.active).not.toBe(second.active)
    expect(fourth.active).toBe(second.active)
    expect(errors).toEqual([])
  } finally { await fixture.dispose() }
})

it('the association list survives a reload so the next menu opens instantly', async () => {
  const fixture = await menuFixture()
  const { page, errors } = fixture
  try {
    await page.locator('#note').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-item="openWith"]')).toHaveAttribute('aria-disabled', 'false')
    expect(await page.evaluate(() => (window as any).calls.apps)).toBeGreaterThan(0)
    // The store write is debounced by design.
    await expect.poll(() => page.evaluate(() => !!localStorage.getItem('dsh-file-actions.apps.v1'))).toBe(true)
    await page.reload()
    await page.locator('#note').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-item="openWith"]')).toHaveAttribute('aria-disabled', 'false')
    // Cached rows are available while a single background walk validates them.
    await expect.poll(() => page.evaluate(() => (window as any).calls.apps)).toBe(1)
    expect(errors).toEqual([])
  } finally { await fixture.dispose() }
})

it('located, dotfile, extensionless and UNC references reach the correct Host paths', async () => {
  const fixture = await menuFixture()
  const { page } = fixture
  try {
    for (const [text, expected] of [['src/app.ts:42:7', '/workspace/src/app.ts'], ['notes.md#L42-L48', '/workspace/notes.md'],
      ['.env', '/workspace/.env'], ['Dockerfile', '/workspace/Dockerfile']]) {
      await page.locator('#reference').evaluate((el, value) => { el.textContent = value }, text)
      await page.locator('#reference').click({ button: 'right' })
      await browserExpect(page.locator('[data-dfa-item="open"]')).toBeVisible()
      expect(await page.locator('.dfa-name').getAttribute('title')).toBe(expected)
      await page.keyboard.press('Escape')
    }
    await page.locator('#link').evaluate(el => el.setAttribute('href', 'file://server/share/report.txt'))
    await page.locator('#link').click({ button: 'right' })
    await browserExpect(page.locator('.dfa-name')).toHaveAttribute('title', '//server/share/report.txt')
  } finally { await fixture.dispose() }
})

it('filtered application hover and Enter choose the same visible row', async () => {
  const fixture = await menuFixture({ apps: [{ id: 'base', name: 'Base' }, { id: 'one', name: 'Alpha One' },
    { id: 'filler', name: 'Filler' }, { id: 'two', name: 'Alpha Two' }, { id: 'more', name: 'More' },
    { id: 'three', name: 'Alpha Three' }, { id: 'tail', name: 'Tail' }, { id: 'last', name: 'Last' }] })
  const { page } = fixture
  try {
    await page.locator('#note').click({ button: 'right' })
    await page.locator('[data-dfa-item="openWith"]').hover()
    await page.locator('.dfa-search').fill('Alpha')
    await page.locator('[data-dfa-item="app:one"]').hover()
    await browserExpect(page.locator('[data-dfa-item="app:one"]')).toHaveAttribute('data-focus', 'true')
    await page.keyboard.press('Enter')
    await expect.poll(() => page.evaluate(() => (window as any).calls.opens)).toEqual([{ path: '/workspace/note.txt', application: 'one' }])
  } finally { await fixture.dispose() }
})

it('stored associations paint immediately but invalid handlers cannot launch while validation is pending', async () => {
  const fixture = await menuFixture()
  const { page } = fixture
  try {
    await page.locator('#note').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-item="editor"]')).toContainText('Visual Studio Code')
    await expect.poll(() => page.evaluate(() => !!localStorage.getItem('dsh-file-actions.apps.v1'))).toBe(true)
    await page.reload()
    await page.evaluate(() => {
      (window as any).state.delayApps = true
      ;(window as any).apps = [{ id: 'cursor', name: 'Cursor' }]
    })
    await page.locator('#note').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-item="editor"]')).toContainText('Visual Studio Code')
    await page.locator('[data-dfa-item="editor"]').click()
    await expect.poll(() => page.evaluate(() => typeof (window as any).releaseApps)).toBe('function')
    expect(await page.evaluate(() => (window as any).calls.opens)).toEqual([])
    await page.evaluate(() => { (window as any).state.delayApps = false; (window as any).releaseApps() })
    await browserExpect(page.locator('.dfa-toast')).toContainText('associations changed')
    expect(await page.evaluate(() => (window as any).calls.opens)).toEqual([])
    await page.locator('#note').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-item="editor"]')).toContainText('Cursor')
  } finally { await fixture.dispose() }
})

it('failed application opens invalidate associations without retrying the action', async () => {
  const fixture = await menuFixture()
  const { page } = fixture
  try {
    await page.locator('#note').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-item="editor"]')).toContainText('Visual Studio Code')
    await page.evaluate(() => {
      const w = window as any
      w.apps = [{ id: 'cursor', name: 'Cursor' }]
      w.ctx.remote.session.openWorkspacePath = async request => { w.calls.opens.push(request); return { ok: false } }
    })
    await page.locator('[data-dfa-item="editor"]').click()
    await expect.poll(() => page.evaluate(() => (window as any).calls.apps)).toBe(2)
    await page.locator('#note').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-item="editor"]')).toContainText('Cursor')
    expect(await page.evaluate(() => (window as any).calls.opens.length)).toBe(1)
  } finally { await fixture.dispose() }
})

it('thumbnail eviction measures retained Blob bytes rather than short URL strings', async () => {
  const fixture = await menuFixture()
  const { page } = fixture
  try {
    await page.evaluate(() => {
      const w = window as any, size = 2 * 1024 * 1024
      const head = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>'
      const data = new TextEncoder().encode(head + ' '.repeat(size - head.length))
      w.blobs = new Map()
      const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL)
      URL.createObjectURL = blob => { const url = create(blob); w.blobs.set(url, blob.size); return url }
      URL.revokeObjectURL = url => { w.blobs.delete(url); revoke(url) }
      w.ctx.remote.workspaceFiles.stat = async (_id, path) => ({ ok: true, value: { absolutePath: path, bytes: size, version: 'v1' } })
      w.ctx.remote.workspaceFiles.readBytes = async () => ({ ok: true, value: { data, eof: true } })
    })
    for (let index = 0; index < 10; index++) {
      await page.locator('#image').evaluate((el, index) => { (el as HTMLElement).dataset.fileActionsPath = `image${index}.svg` }, index)
      await page.locator('#image').click({ button: 'right' })
      await browserExpect(page.locator('.dfa-name')).toHaveText(`image${index}.svg`)
      await browserExpect(page.locator('.dfa-thumb img')).toHaveCount(1)
      await page.keyboard.press('Escape')
    }
    expect(await page.evaluate(() => [...(window as any).blobs.values()].reduce((n: number, size: number) => n + size, 0))).toBe(16 * 1024 * 1024)
    expect(await page.evaluate(() => (window as any).blobs.size)).toBe(8)
  } finally { await fixture.dispose() }
})

it('a slow preview never lands on the file that replaced it', async () => {
  const fixture = await menuFixture()
  const { page, errors } = fixture
  try {
    await page.evaluate(() => { (window as any).state.delayThumb = true })
    const openOn = (selector: string) => page.evaluate((target: string) => {
      const el = document.querySelector(target) as HTMLElement
      const rect = el.getBoundingClientRect()
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2,
        clientX: Math.round(rect.left + 4), clientY: Math.round(rect.top + 4) }))
    }, selector)
    await openOn('#image')
    await browserExpect(page.locator('[data-dfa-menu="1"] .dfa-thumb')).toBeVisible()
    // Switch files while the first read is still pending.
    await openOn('#image2')
    await page.evaluate(() => (window as any).releaseThumb())
    await browserExpect(page.locator('[data-dfa-menu="1"] .dfa-thumb img')).toBeVisible()
    const svg = await page.evaluate(async () => {
      const img = document.querySelector('[data-dfa-menu="1"] .dfa-thumb img') as HTMLImageElement
      return (await fetch(img.src)).text()
    })
    // The visible preview belongs to image2, not to the file opened before it.
    expect(svg).toContain('#00ff00')
    expect(svg).not.toContain('#ff0000')
    expect(errors).toEqual([])
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


async function referenceFixture() {
  const fixture = await menuFixture()
  await fixture.page.evaluate(() => {
    const w = window as any
    w.copied = []; w.readCount = 0; w.version = 'v1'
    w.referenceText = 'before\r\nconst label = "<script>window.attacked=true</script>"\r\n中文 😀\r\nafter\r\n'
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => w.copied.push(text) }, configurable: true })
    w.ctx.remote.workspaceFiles.readBytes = async () => {
      w.readCount++
      if (w.holdRead) await new Promise(resolve => { w.releaseRead = resolve })
      return { ok: true, value: { data: new TextEncoder().encode(w.referenceText), eof: true, version: w.version } }
    }
    ;(document.querySelector('#note') as HTMLElement).dataset.fileActionsPath = 'note.txt#L2-L3'
  })
  return fixture
}

it('reference context is literal text, keeps keyboard focus, and copies only cited lines with source', async () => {
  const fixture = await referenceFixture()
  const { page } = fixture
  try {
    await page.locator('#note').click({ button: 'right' })
    await page.locator('[data-dfa-item="referencePreview"]').click()
    await browserExpect(page.getByRole('button', { name: 'Copy excerpt with source' })).toBeEnabled()
    await browserExpect(page.locator('.dfa-reference-code').filter({ hasText: 'window.attacked' })).toContainText('<script>')
    expect(await page.evaluate(() => (window as any).attacked)).toBeUndefined()
    expect(await page.locator('.dfa-reference-row[data-selected="true"]').count()).toBe(2)
    await page.getByRole('button', { name: 'Copy excerpt with source' }).click()
    await expect.poll(() => page.evaluate(() => (window as any).copied.length)).toBe(1)
    expect((await page.evaluate(() => (window as any).copied[0]))).toBe('note.txt#L2-L3\n\n```\nconst label = "<script>window.attacked=true</script>"\r\n中文 😀\n```')
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => !!document.activeElement?.closest('.dfa-reference'))).toBe(true)
    await page.locator('.dfa-reference-code').first().evaluate(el => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, shiftKey: true })))
    await browserExpect(page.locator('.dfa-reference-overlay')).toBeVisible()
    await page.screenshot({ path: path.join(process.env.DFA_PROJECT!, 'work/results/reference-context-dark.png') })
    await page.emulateMedia({ colorScheme: 'light' })
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await page.evaluate(() => {
      document.documentElement.style.colorScheme = 'light'
      document.documentElement.style.setProperty('--dsw-alias-bg-layer-1', '#ffffff')
      document.documentElement.style.setProperty('--dsw-alias-label-primary', '#202124')
    })
    await page.locator('#note').click({ button: 'right' })
    await page.locator('[data-dfa-item="referencePreview"]').click()
    await browserExpect(page.getByRole('button', { name: 'Copy excerpt with source' })).toBeEnabled()
    expect(await page.locator('.dfa-reference').evaluate(el => getComputedStyle(el).color)).toBe('rgb(32, 33, 36)')
    expect(await page.locator('.dfa-reference').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)')
    await page.screenshot({ path: path.join(process.env.DFA_PROJECT!, 'work/results/reference-context-light.png') })
    await page.setViewportSize({ width: 390, height: 844 })
    // Resize closes a file menu; reopen at the new viewport size.
    await page.locator('#note').click({ button: 'right' })
    await page.locator('[data-dfa-item="referencePreview"]').click()
    await browserExpect(page.getByRole('button', { name: 'Copy excerpt with source' })).toBeEnabled()
    const panel = await page.locator('.dfa-reference').boundingBox()
    expect(panel!.x).toBeGreaterThanOrEqual(0)
    expect(panel!.x + panel!.width).toBeLessThanOrEqual(390)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: path.join(process.env.DFA_PROJECT!, 'work/results/reference-context-narrow.png') })
    await page.evaluate(() => {
      const w = window as any
      w.ctx.locale = { language: { getSnapshot: () => 'zh' } }
      w.plugin.apply(w.ctx)
    })
    await page.locator('#note').click({ button: 'right' })
    await page.locator('[data-dfa-item="referencePreview"]').click()
    await browserExpect(page.getByRole('button', { name: '复制片段及来源' })).toBeEnabled()
    await browserExpect(page.locator('.dfa-reference-title')).toHaveText('查看引用上下文')
    await page.screenshot({ path: path.join(process.env.DFA_PROJECT!, 'work/results/reference-context-zh-narrow.png') })
    await page.keyboard.press('Escape')
    await browserExpect(page.locator('.dfa-reference-overlay')).toHaveCount(0)
    await browserExpect(page.locator('[data-dfa-menu]')).toBeVisible()
    expect(fixture.errors).toEqual([])
  } finally { await fixture.dispose() }
})

it('reference preview cancellation reads nothing outside the workspace', async () => {
  const fixture = await referenceFixture()
  try {
    await fixture.page.evaluate(() => {
      ;(document.querySelector('#note') as HTMLElement).dataset.fileActionsPath = '/outside/note.txt:2'
      window.confirm = () => false
    })
    await fixture.page.locator('#note').click({ button: 'right' })
    await fixture.page.locator('[data-dfa-item="referencePreview"]').click()
    await browserExpect(fixture.page.locator('.dfa-reference-overlay')).toHaveCount(0)
    expect(await fixture.page.evaluate(() => (window as any).readCount)).toBe(0)
  } finally { await fixture.dispose() }
})

it('a changed file cannot be copied as the displayed reference', async () => {
  const fixture = await referenceFixture()
  try {
    await fixture.page.locator('#note').click({ button: 'right' })
    await fixture.page.locator('[data-dfa-item="referencePreview"]').click()
    await browserExpect(fixture.page.getByRole('button', { name: 'Copy excerpt with source' })).toBeEnabled()
    await fixture.page.evaluate(() => { (window as any).version = 'v2' })
    await fixture.page.getByRole('button', { name: 'Copy excerpt with source' }).click()
    await browserExpect(fixture.page.locator('.dfa-toast')).toContainText('file changed')
    expect(await fixture.page.evaluate(() => (window as any).copied)).toEqual([])
  } finally { await fixture.dispose() }
})

it('closing or replacing a loading reference preview ignores late reads', async () => {
  const fixture = await referenceFixture()
  try {
    await fixture.page.evaluate(() => { (window as any).holdRead = true })
    await fixture.page.locator('#note').click({ button: 'right' })
    await fixture.page.locator('[data-dfa-item="referencePreview"]').click()
    await expect.poll(() => fixture.page.evaluate(() => !!(window as any).releaseRead)).toBe(true)
    await fixture.page.keyboard.press('Escape')
    await fixture.page.keyboard.press('Escape')
    await fixture.page.locator('#image').click({ button: 'right' })
    await fixture.page.evaluate(() => { (window as any).releaseRead(); (window as any).holdRead = false })
    await browserExpect(fixture.page.locator('.dfa-name')).toHaveText('image.svg')
    await browserExpect(fixture.page.locator('.dfa-reference-overlay')).toHaveCount(0)
    expect(fixture.errors).toEqual([])
  } finally { await fixture.dispose() }
})

it('session changes and plugin unload dispose reference dialogs', async () => {
  const fixture = await referenceFixture()
  try {
    await fixture.page.evaluate(() => {
      const w = window as any
      w.ctx.sessions.list.subscribe = callback => { w.sessionChanged = callback; return () => { w.unsubscribed = true } }
      w.plugin.apply(w.ctx)
    })
    await fixture.page.locator('#note').click({ button: 'right' })
    await fixture.page.locator('[data-dfa-item="referencePreview"]').click()
    await browserExpect(fixture.page.getByRole('button', { name: 'Copy excerpt with source' })).toBeEnabled()
    await fixture.page.evaluate(() => {
      const w = window as any
      w.ctx.sessions.list.getSnapshot = () => ({ byId: { other: { id: 'other', cwd: '/workspace', retainedBy: { mainView: 1 } } } })
      w.sessionChanged()
    })
    await browserExpect(fixture.page.locator('.dfa-reference-overlay')).toHaveCount(0)
    await fixture.page.locator('#note').click({ button: 'right' })
    await fixture.page.locator('[data-dfa-item="referencePreview"]').click()
    await browserExpect(fixture.page.getByRole('button', { name: 'Copy excerpt with source' })).toBeEnabled()
    await fixture.page.evaluate(() => (window as any).cleanup())
    await browserExpect(fixture.page.locator('.dfa-reference-overlay')).toHaveCount(0)
    expect(await fixture.page.evaluate(() => (window as any).unsubscribed)).toBe(true)
  } finally { await fixture.dispose() }
})


it('settings persist, change the live file menu and control the reference context window', async () => {
  const fixture = await menuFixture({ settings: true })
  const { page } = fixture
  try {
    await browserExpect(page.getByRole('combobox', { name: 'Menu display', exact: true })).toHaveAttribute('data-value', 'full')
    await page.getByRole('combobox', { name: 'Menu display', exact: true }).click()
    await page.getByRole('option', { name: 'Compact menu', exact: true }).click()
    await page.getByRole('combobox', { name: 'Reference context', exact: true }).click()
    await page.getByRole('option', { name: '4 lines before and after', exact: true }).click()
    await page.reload()
    await browserExpect(page.getByRole('combobox', { name: 'Menu display', exact: true })).toHaveAttribute('data-value', 'compact')
    await browserExpect(page.getByRole('combobox', { name: 'Reference context', exact: true })).toHaveAttribute('data-value', '4')
    await page.evaluate(() => {
      const w = window as any
      w.copied = []
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => w.copied.push(text) } })
      ;(document.querySelector('#note') as HTMLElement).dataset.fileActionsPath = 'note.txt:25'
      w.ctx.remote.workspaceFiles.readBytes = async () => ({ ok: true, value: { data: new TextEncoder().encode(Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join('\n')), eof: true, version: 'v1' } })
    })
    await page.locator('#note').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-item="copyFileName"]')).toHaveCount(0)
    await browserExpect(page.locator('[data-dfa-item="copyPath"]')).toBeVisible()
    await page.locator('[data-dfa-item="referencePreview"]').click()
    await browserExpect(page.locator('.dfa-reference-row')).toHaveCount(9)
    await page.getByRole('button', { name: 'Copy excerpt with source' }).click()
    await expect.poll(() => page.evaluate(() => (window as any).copied.at(-1))).toBe('note.txt#L25\n\n```\nline 25\n```')
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Reset menu and preview defaults' }).click()
    await browserExpect(page.getByRole('combobox', { name: 'Menu display', exact: true })).toHaveAttribute('data-value', 'full')
    await browserExpect(page.getByRole('combobox', { name: 'Reference context', exact: true })).toHaveAttribute('data-value', '8')
    await page.locator('#note').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-item="copyFileName"]')).toBeVisible()
    expect(fixture.errors).toEqual([])
  } finally { await fixture.dispose() }
})

it('settings remove individual or all existing app preferences and preserve unrelated data', async () => {
  const fixture = await menuFixture({ settings: true, storage: {
    'dsh-file-actions.preferred-apps.v1': JSON.stringify({ txt: 'notepad', json: 'code' }), unrelated: 'keep',
  } })
  const { page } = fixture
  try {
    await browserExpect(page.locator('.dfa-settings-app')).toHaveCount(2)
    await page.getByRole('button', { name: 'Remove preference: .txt', exact: true }).click()
    await browserExpect(page.locator('.dfa-settings-app')).toHaveCount(1)
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dsh-file-actions.preferred-apps.v1')!))).toEqual({ json: 'code' })
    await page.reload()
    await browserExpect(page.locator('.dfa-settings-app')).toHaveCount(1)
    await page.getByRole('button', { name: 'Clear all preferred applications', exact: true }).click()
    await browserExpect(page.locator('.dfa-settings-app')).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('unrelated'))).toBe('keep')
    expect(await page.evaluate(() => (window as any).calls.apps)).toBe(0)
    expect(await page.evaluate(() => (window as any).calls.stats)).toBe(0)
    await page.reload()
    await browserExpect(page.getByText('No preferred applications yet', { exact: true })).toBeVisible()
  } finally { await fixture.dispose() }
})

it('clearing the app cache rejects pending stale responses and retains preferred applications', async () => {
  const fixture = await menuFixture({ settings: true, storage: { 'dsh-file-actions.preferred-apps.v1': '{"txt":"notepad"}' } })
  const { page } = fixture
  try {
    await page.evaluate(() => { (window as any).state.delayApps = true })
    await page.locator('#note').hover()
    await expect.poll(() => page.evaluate(() => !!(window as any).releaseApps)).toBe(true)
    await page.getByRole('button', { name: 'Clear application cache', exact: true }).click()
    await page.evaluate(async () => { const w = window as any; w.state.delayApps = false; w.releaseApps(); await new Promise(resolve => setTimeout(resolve, 50)) })
    await browserExpect(page.getByLabel('0 file types cached', { exact: true })).toBeVisible()
    await browserExpect(page.locator('.dfa-settings-app')).toHaveCount(1)
    await page.locator('#note').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-item="openWith"]')).toBeEnabled()
    expect(await page.evaluate(() => (window as any).calls.apps)).toBeGreaterThanOrEqual(2)
    await page.keyboard.press('Escape')
    await browserExpect(page.getByLabel('1 file types cached', { exact: true })).toBeVisible()
    expect(fixture.errors).toEqual([])
  } finally { await fixture.dispose() }
})

it('storage failures retain accepted settings and announce failure without claiming success', async () => {
  const fixture = await menuFixture({ settings: true })
  const { page } = fixture
  try {
    await page.evaluate(() => { Storage.prototype.setItem = function () { throw Error('fixture storage denied') } })
    await page.getByRole('combobox', { name: 'Menu display', exact: true }).click()
    await page.getByRole('option', { name: 'Compact menu', exact: true }).click()
    await browserExpect(page.getByRole('alert')).toContainText('Could not save')
    await browserExpect(page.getByRole('combobox', { name: 'Menu display', exact: true })).toHaveAttribute('data-value', 'full')
    expect(await page.evaluate(() => localStorage.getItem('dsh-file-actions.settings.v1'))).toBe(null)
    expect(fixture.errors).toEqual([])
  } finally { await fixture.dispose() }
})

it('settings register once, react to external changes, and dispose on unload', async () => {
  const fixture = await menuFixture({ settings: true })
  const { page } = fixture
  try {
    await browserExpect(page.locator('[data-dfa-settings]')).toHaveCount(1)
    await page.evaluate(() => { const w = window as any; w.plugin.apply(w.ctx) })
    await browserExpect(page.locator('[data-dfa-settings]')).toHaveCount(1)
    expect(await page.evaluate(() => (window as any).settingsSections.length)).toBe(1)
    await page.evaluate(() => {
      localStorage.setItem('dsh-file-actions.settings.v1', '{"menuMode":"compact","contextLines":16}')
      window.dispatchEvent(new StorageEvent('storage', { key: 'dsh-file-actions.settings.v1' }))
    })
    await browserExpect(page.getByRole('combobox', { name: 'Menu display', exact: true })).toHaveAttribute('data-value', 'compact')
    await browserExpect(page.getByRole('combobox', { name: 'Reference context', exact: true })).toHaveAttribute('data-value', '16')
    await page.evaluate(() => (window as any).cleanup())
    await browserExpect(page.locator('[data-dfa-settings]')).toHaveCount(0)
    await browserExpect(page.locator('[data-dfa-nav-icon]')).toHaveCount(0)
    expect(await page.locator('#other-section svg').evaluate(el => getComputedStyle(el).display)).not.toBe('none')
    expect(await page.evaluate(() => (window as any).settingsSections.length)).toBe(0)
    expect(fixture.errors).toEqual([])
  } finally { await fixture.dispose() }
})

it('settings copy is bilingual and fits dark, light, and narrow layouts', async () => {
  const fixture = await menuFixture({ settings: true, storage: { 'dsh-file-actions.preferred-apps.v1': '{"txt":"notepad","json":"code"}' } })
  const { page } = fixture
  try {
    await browserExpect(page.getByRole('heading', { name: 'File Actions · 文件与链接操作', exact: true })).toBeVisible()
    await browserExpect(page.getByRole('link', { name: 'GitHub project', exact: true })).toHaveAttribute('href', 'https://github.com/jidekaixin2dian/dsh-file-actions')
    await browserExpect(page.getByRole('link', { name: 'Report an issue', exact: true })).toHaveAttribute('href', 'https://github.com/jidekaixin2dian/dsh-file-actions/issues/new')
    await browserExpect(page.getByRole('link', { name: 'Report an issue', exact: true })).toHaveAttribute('rel', 'noopener noreferrer')
    const captureSettings = async (name: string) => {
      const box = (await page.locator('.dfa-settings').boundingBox())!, viewport = page.viewportSize()!
      const x = Math.max(0, box.x), y = Math.max(0, box.y)
      await page.screenshot({ path: path.join(process.env.DFA_PROJECT!, `work/dropdowns-20261030/${name}.png`), clip: { x, y, width: Math.min(box.x + box.width, viewport.width) - x, height: Math.min(box.y + box.height, viewport.height) - y } })
    }
    await browserExpect(page.locator('#settings-nav button').filter({ hasText: 'File Actions' })).toHaveAttribute('data-dfa-nav-icon', 'file-actions')
    expect(await page.locator('#other-section').getAttribute('data-dfa-nav-icon')).toBe(null)
    expect(await page.locator('.dfa-settings-mark svg').count()).toBe(1)
    expect(await page.locator('[data-dfa-nav-icon]').evaluate(el => getComputedStyle(el, '::before').maskImage)).toContain('data:image/svg+xml')
    await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]')!;
      dialog.remove(); dialog.querySelector('[data-dfa-nav-icon]')!.removeAttribute('data-dfa-nav-icon');
      (window as any).reopenSettings = () => document.body.appendChild(dialog);
    })
    await page.evaluate(() => (window as any).reopenSettings())
    await browserExpect(page.getByRole('button', { name: 'File Actions', exact: true })).toHaveAttribute('data-dfa-nav-icon', 'file-actions')
    await page.screenshot({ path: path.join(process.env.DFA_PROJECT!, 'work/results/settings-en-dark.png'), fullPage: true })
    await page.getByRole('combobox', { name: 'Menu display', exact: true }).click()
    await browserExpect(page.locator('.dfa-select-menu[data-state="open"]')).toHaveCount(1)
    await captureSettings('dropdown-dark')
    await page.getByRole('combobox', { name: 'Menu display', exact: true }).press('Escape')
    await page.evaluate(() => {
      const w = window as any; w.uiLanguage = 'zh'; w.plugin.apply(w.ctx)
      document.documentElement.style.colorScheme = 'light'
      document.documentElement.style.setProperty('--dsw-alias-label-primary', '#202124')
      document.documentElement.style.setProperty('--dsw-alias-bg-layer-1', '#fff')
      document.documentElement.style.setProperty('--dsw-alias-bg-layer-2', '#f6f8fa')
      document.body.style.background = '#f6f8fa'; document.body.style.color = '#202124'
    })
    await browserExpect(page.getByRole('heading', { name: '文件与链接操作 · File Actions', exact: true })).toBeVisible()
    await browserExpect(page.getByRole('link', { name: 'GitHub 项目', exact: true })).toHaveAttribute('target', '_blank')
    await browserExpect(page.getByRole('link', { name: '反馈问题', exact: true })).toHaveAttribute('href', 'https://github.com/jidekaixin2dian/dsh-file-actions/issues/new')
    expect(await page.evaluate(() => (window as any).settingsSections[0].label())).toBe('文件操作')
    await browserExpect(page.getByRole('button', { name: '文件操作', exact: true })).toHaveAttribute('data-dfa-nav-icon', 'file-actions')
    await page.screenshot({ path: path.join(process.env.DFA_PROJECT!, 'work/results/settings-zh-light.png'), fullPage: true })
    await page.locator('.dfa-settings').screenshot({ path: path.join(process.env.DFA_PROJECT!, 'work/ui-20261030/settings-preview.png') })
    await page.getByRole('combobox', { name: '菜单显示', exact: true }).click()
    await browserExpect(page.locator('.dfa-select-menu[data-state="open"]')).toHaveCount(1)
    await captureSettings('dropdown-light')
    await page.getByRole('combobox', { name: '菜单显示', exact: true }).press('Escape')
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: path.join(process.env.DFA_PROJECT!, 'work/results/settings-zh-narrow.png'), fullPage: true })
    await page.getByRole('combobox', { name: '引用前后文', exact: true }).click()
    await browserExpect(page.locator('.dfa-select-menu[data-state="open"]')).toHaveCount(1)
    await captureSettings('dropdown-narrow')
    await page.getByRole('combobox', { name: '引用前后文', exact: true }).press('Escape')
    await page.evaluate(async () => {
      const icon = new Image(); icon.src = '/icon.svg'; icon.id = 'brand-icon';
      icon.style.cssText = 'width:128px;height:128px;display:block'; document.body.appendChild(icon);
      await icon.decode();
    })
    await page.locator('#brand-icon').screenshot({ path: path.join(process.env.DFA_PROJECT!, 'work/ui-20261030/icon-preview.png') })
    expect(fixture.errors).toEqual([])
  } finally { await fixture.dispose() }
})

it('settings dropdowns animate both directions and commit keyboard and pointer choices', async () => {
  const fixture = await menuFixture({ settings: true })
  const { page } = fixture
  const menu = page.getByRole('combobox', { name: 'Menu display', exact: true })
  try {
    await menu.focus()
    const opening = await menu.evaluate(el => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
      const popup = document.querySelector('.dfa-select-menu')!
      return { duration: popup.getAnimations()[0]?.effect?.getTiming().duration, state: (popup as HTMLElement).dataset.state }
    })
    expect(opening).toEqual({ duration: 160, state: 'opening' })
    await browserExpect(menu).toHaveAttribute('aria-expanded', 'true')
    await browserExpect(page.getByRole('option', { name: 'Full menu', exact: true })).toHaveAttribute('aria-selected', 'true')
    await menu.press('End')
    await browserExpect(page.getByRole('option', { name: 'Compact menu', exact: true })).toHaveAttribute('data-active', 'true')
    const closing = await menu.evaluate(el => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      const popup = document.querySelector('.dfa-select-menu[data-state="closing"]')!
      return { duration: popup.getAnimations()[0]?.effect?.getTiming().duration, hidden: popup.getAttribute('aria-hidden') }
    })
    expect(closing).toEqual({ duration: 120, hidden: 'true' })
    await browserExpect(menu).toHaveAttribute('data-value', 'compact')
    await browserExpect(menu).toBeFocused()
    await browserExpect(page.locator('.dfa-select-menu')).toHaveCount(0)
    const context = page.getByRole('combobox', { name: 'Reference context', exact: true })
    await context.click()
    await page.getByRole('option', { name: '16 lines before and after', exact: true }).click()
    await browserExpect(context).toHaveAttribute('data-value', '16')
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dsh-file-actions.settings.v1')!))).toEqual({ menuMode: 'compact', contextLines: 16 })
    expect(fixture.errors).toEqual([])
  } finally { await fixture.dispose() }
})

it('settings dropdown cancellation, rapid reopening and unload retain focus and clean up popups', async () => {
  const fixture = await menuFixture({ settings: true })
  const { page } = fixture
  const menu = page.getByRole('combobox', { name: 'Menu display', exact: true })
  try {
    await page.evaluate(() => { (window as any).escaped = 0; document.addEventListener('keydown', e => { if (e.key === 'Escape') (window as any).escaped++ }) })
    await menu.press('Space')
    await menu.press('End')
    await menu.press('Escape')
    await browserExpect(menu).toHaveAttribute('data-value', 'full')
    await browserExpect(menu).toBeFocused()
    expect(await page.evaluate(() => (window as any).escaped)).toBe(0)
    await menu.press('ArrowDown'); await menu.press('Tab')
    await browserExpect(page.getByRole('combobox', { name: 'Reference context', exact: true })).toBeFocused()
    await browserExpect(menu).toHaveAttribute('aria-expanded', 'false')
    await menu.click()
    await page.locator('#other-section').click()
    await browserExpect(page.locator('#other-section')).toBeFocused()
    await browserExpect(menu).toHaveAttribute('aria-expanded', 'false')
    await menu.evaluate(el => { (el as HTMLElement).click(); (el as HTMLElement).click(); (el as HTMLElement).click() })
    await browserExpect(page.getByRole('listbox')).toHaveCount(1)
    expect(await page.locator('#dfa-setting-menuMode-options').count()).toBe(1)
    await menu.press('c')
    await browserExpect(page.getByRole('option', { name: 'Compact menu', exact: true })).toHaveAttribute('data-active', 'true')
    await page.evaluate(() => (window as any).cleanup())
    await browserExpect(page.locator('.dfa-select-menu')).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('dsh-file-actions.settings.v1'))).toBe(null)
    expect(fixture.errors).toEqual([])
  } finally { await fixture.dispose() }
})

it('settings dropdowns fit viewport edges, follow resize and respect reduced motion', async () => {
  const fixture = await menuFixture({ settings: true })
  const { page } = fixture
  const context = page.getByRole('combobox', { name: 'Reference context', exact: true })
  try {
    await page.setViewportSize({ width: 390, height: 500 })
    await context.evaluate(el => { (el as HTMLElement).style.cssText = 'position:fixed;bottom:8px;right:8px' })
    await context.click()
    const assertBounds = async () => {
      const popup = await page.getByRole('listbox').boundingBox(), trigger = await context.boundingBox()
      expect(popup!.x).toBeGreaterThanOrEqual(8)
      expect(popup!.x + popup!.width).toBeLessThanOrEqual(page.viewportSize()!.width - 8)
      expect(popup!.y).toBeGreaterThanOrEqual(8)
      expect(popup!.y + popup!.height).toBeLessThanOrEqual(trigger!.y - 5)
    }
    await browserExpect(page.locator('.dfa-select-menu[data-state="open"]')).toHaveCount(1)
    await assertBounds()
    await page.setViewportSize({ width: 280, height: 500 })
    await assertBounds()
    await context.press('Home'); await context.press('ArrowDown')
    await browserExpect(page.getByRole('option', { name: '8 lines before and after', exact: true })).toHaveAttribute('data-active', 'true')
    await context.press('Escape')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await context.click()
    expect(await page.getByRole('listbox').evaluate(el => el.getAnimations().length)).toBe(0)
    await context.press('Escape')
    await browserExpect(page.locator('.dfa-select-menu')).toHaveCount(0)
    expect(fixture.errors).toEqual([])
  } finally { await fixture.dispose() }
})
