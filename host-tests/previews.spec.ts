import { expect, it } from 'vitest'
import { expect as browserExpect } from '@playwright/test'
import { menuFixture } from './fixtures/menu.ts'
import path from 'node:path'

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
    await browserExpect.poll(() => fixture.page.evaluate(() => (window as any).toastLog.join('\n')), { timeout: 15000 }).toContain('file changed')
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

it('a relative reference that only exists one directory down still resolves', async () => {
  const fixture = await menuFixture({ state: { missing: true, exists: '/workspace/review-1/docs/HANDOFF.md', dirs: {
    '/workspace': [{ name: 'review-1', type: 'directory' }],
    '/workspace/review-1': [{ name: 'notes.txt', type: 'file' }],
  } } })
  const { page } = fixture
  try {
    await page.locator('#nested').click({ button: 'right' })
    const menu = page.locator('[data-dfa-menu]').first()
    await browserExpect(menu).toBeVisible()
    await browserExpect(menu).toContainText('review-1/docs/HANDOFF.md')
    await browserExpect(menu).not.toContainText('File not found')
    await page.locator('[data-dfa-item="open"]').click()
    expect(await page.evaluate(() => (window as any).calls.opens)).toEqual([{ path: '/workspace/review-1/docs/HANDOFF.md' }])
  } finally { await fixture.dispose() }
})

it('a relative reference several directories down also resolves', async () => {
  const fixture = await menuFixture({ state: { missing: true, exists: '/workspace/review-1/src/packages/docs/HANDOFF.md', dirs: {
    '/workspace': [{ name: 'review-1', type: 'directory' }],
    '/workspace/review-1': [{ name: 'src', type: 'directory' }],
    '/workspace/review-1/src': [{ name: 'packages', type: 'directory' }],
  } } })
  const { page } = fixture
  try {
    await page.locator('#nested').click({ button: 'right' })
    const menu = page.locator('[data-dfa-menu]').first()
    await browserExpect(menu).toBeVisible()
    await browserExpect(menu).toContainText('review-1/src/packages/docs/HANDOFF.md')
    await page.locator('[data-dfa-item="open"]').click()
    expect(await page.evaluate(() => (window as any).calls.opens))
      .toEqual([{ path: '/workspace/review-1/src/packages/docs/HANDOFF.md' }])
    // A handful of probes for a three-level fixture; a full-tree scan would be far above
    // this ceiling, so it still catches a regression without pinning platform timing.
    expect(await page.evaluate(() => (window as any).calls.stats)).toBeLessThanOrEqual(10)
  } finally { await fixture.dispose() }
})

it('an ambiguous relative reference keeps reporting the file as missing', async () => {
  const fixture = await menuFixture({ state: { missing: true, exists: ['/workspace/alpha/docs/HANDOFF.md', '/workspace/beta/docs/HANDOFF.md'], dirs: {
    '/workspace': [{ name: 'alpha', type: 'directory' }, { name: 'beta', type: 'directory' }],
  } } })
  const { page } = fixture
  try {
    await page.locator('#nested').click({ button: 'right' })
    const menu = page.locator('[data-dfa-menu]').first()
    await browserExpect(menu).toBeVisible()
    await browserExpect(menu).toContainText('File not found')
    expect(await page.evaluate(() => (window as any).calls.opens)).toEqual([])
  } finally { await fixture.dispose() }
})

it('a large video still gets its first frame and an unusable preview stops reserving a panel', async () => {
  const fixture = await menuFixture()
  const { page, errors } = fixture
  try {
    // The real workspace files read is capped at 2 MiB per call and refuses a whole
    // file past 32 MiB, so a 56 MB promo clip used to answer "no thumbnail" without
    // reading anything. Serve a real container through the ranged contract instead.
    await page.evaluate(async () => {
      const w = window as any
      const bytes = new Uint8Array(await (await fetch('/poster.mp4')).arrayBuffer())
      w.calls.ranges = []
      w.sizes = { promo: 56 * 1024 * 1024, huge: 200 * 1024 * 1024 }
      w.ctx.remote.workspaceFiles.stat = async (_id: string, path: string) => ({
        ok: true, value: { absolutePath: path, bytes: path.includes('huge') ? w.sizes.huge : w.sizes.promo, version: path },
      })
      w.ctx.remote.workspaceFiles.readBytes = async (_id: string, path: string, options: any) => {
        w.calls.ranges.push(options?.range || null)
        const offset = options?.range?.offset ?? 0
        const end = Math.min(bytes.length, offset + (options?.range?.length ?? bytes.length))
        return { ok: true, value: { data: bytes.slice(offset, end), eof: end >= bytes.length, offset,
          absolutePath: path, version: path, bytes: bytes.length } }
      }
    })

    await page.locator('#image').evaluate((el) => { (el as HTMLElement).dataset.fileActionsPath = 'promo.mp4' })
    await page.locator('#image').click({ button: 'right' })
    await browserExpect(page.locator('.dfa-thumb img')).toBeVisible()
    expect(await page.locator('.dfa-thumb img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
    // Ranged windows, not one whole-file answer.
    expect((await page.evaluate(() => (window as any).calls.ranges)).every((range: any) => range && typeof range.length === 'number')).toBe(true)
    await page.keyboard.press('Escape')

    // Past the read ceiling there is nothing to show; the block must not keep the
    // ~100px frame that made a nine-row menu mostly empty space.
    await page.locator('#image').evaluate((el) => { (el as HTMLElement).dataset.fileActionsPath = 'huge.mov' })
    await page.locator('#image').click({ button: 'right' })
    await browserExpect(page.locator('.dfa-thumb img')).toHaveCount(0)
    await browserExpect(page.locator('.dfa-thumb')).toHaveText('No thumbnail available')
    const thumb = await page.locator('.dfa-thumb').boundingBox()
    expect(thumb!.height).toBeLessThan(52)
    expect(errors).toEqual([])
  } finally { await fixture.dispose() }
})

it('the image lightbox keeps Tab focus in its modal layer', async () => {
  const fixture = await menuFixture()
  const { page } = fixture
  try {
    await page.locator('#image').click({ button: 'right' })
    await page.locator('.dfa-thumb img').click()
    const lightbox = page.locator('.dfa-lightbox')
    await browserExpect(lightbox).toBeFocused()
    await page.keyboard.press('Tab')
    await browserExpect(lightbox).toBeFocused()
    await page.keyboard.press('Escape')
    await browserExpect(lightbox).toHaveCount(0)
    await browserExpect(page.locator('[data-dfa-menu]')).toBeVisible()
    expect(fixture.errors).toEqual([])
  } finally { await fixture.dispose() }
})
