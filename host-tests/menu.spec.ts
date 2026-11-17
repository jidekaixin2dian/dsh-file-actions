import { expect, it } from 'vitest'
import { expect as browserExpect } from '@playwright/test'
import { menuFixture } from './fixtures/menu.ts'
import path from 'node:path'

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
    const appsForNote = () => page.evaluate(() => ((window as any).calls.appsPaths ?? [])
      .filter((path: unknown) => String(path).endsWith('note.txt')).length)
    const afterHover = await appsForNote()

    await page.locator('#note').click({ button: 'right' })
    await page.locator('[data-dfa-item="openWith"]').hover()
    await browserExpect(page.locator('[data-dfa-menu="submenu"] [data-dfa-item="app:notepad"]')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')

    // A second menu for the same extension reuses the cached answer. Moving the
    // pointer across other explicit carriers (host media, changed-file rows) may
    // legitimately prefetch those, so the reuse assertion counts note.txt only.
    await page.locator('#note').click({ button: 'right' })
    await page.locator('[data-dfa-item="openWith"]').hover()
    await browserExpect(page.locator('[data-dfa-menu="submenu"] [data-dfa-item="app:notepad"]')).toBeVisible()
    expect(await appsForNote()).toBe(afterHover)
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

it('the first upward key from a pointer-opened menu selects the last row', async () => {
  const fixture = await menuFixture()
  const { page } = fixture
  try {
    await page.locator('#note').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-item="saveAs"]')).toBeVisible()
    await page.keyboard.press('ArrowUp')
    await browserExpect(page.locator('[data-dfa-item="saveAs"]')).toHaveAttribute('data-focus', 'true')
    expect(fixture.errors).toEqual([])
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
    await browserExpect.poll(() => page.evaluate(() => (window as any).toastLog.join('\n')), { timeout: 15000 }).toContain('associations changed')
    expect(await page.evaluate(() => (window as any).calls.opens)).toEqual([])
    await page.locator('#note').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-item="editor"]')).toContainText('Cursor')
  } finally { await fixture.dispose() }
})

it('failed application opens invalidate associations without retrying the action', async () => {
  const fixture = await menuFixture()
  const { page } = fixture
  const appsForNote = () => page.evaluate(() => ((window as any).calls.appsPaths ?? [])
    .filter((file: string) => file === '/workspace/note.txt').length)
  try {
    await page.locator('#note').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-item="editor"]')).toContainText('Visual Studio Code')
    expect(await appsForNote()).toBe(1)
    await page.evaluate(() => {
      const w = window as any
      w.apps = [{ id: 'cursor', name: 'Cursor' }]
      w.ctx.remote.session.openWorkspacePath = async request => { w.calls.opens.push(request); return { ok: false } }
    })
    await page.locator('[data-dfa-item="editor"]').click()
    await browserExpect.poll(() => page.evaluate(() => (window as any).toastLog)).toContain('Open failed')
    // Moving off the closed menu can also prefetch an unrelated file.
    await page.locator('#image').hover()
    await expect.poll(() => page.evaluate(() => (window as any).calls.appsPaths)).toContain('/workspace/image.svg')
    await expect.poll(appsForNote).toBe(2)
    await page.locator('#note').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-item="editor"]')).toContainText('Cursor')
    expect(await appsForNote()).toBe(2)
    expect(await page.evaluate(() => (window as any).calls.opens.length)).toBe(1)
  } finally { await fixture.dispose() }
})

it('a slower old copy cannot overwrite a newer clipboard result', async () => {
  const fixture = await menuFixture()
  const { page } = fixture
  try {
    await page.evaluate(() => {
      const w = window as any
      w.copied = []; w.readGates = {}
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => w.copied.push(text) }, configurable: true })
      const original = w.ctx.remote.workspaceFiles.readBytes
      w.ctx.remote.workspaceFiles.readBytes = async (id: string, file: string, options: unknown) => {
        if (!options || typeof options !== 'object' || !('range' in options)) return original(id, file, options)
        const text = file.endsWith('note.txt') ? 'old' : 'new'
        await new Promise(resolve => { w.readGates[file] = resolve })
        return { ok: true, value: { data: new TextEncoder().encode(text), eof: true, version: 'v1' } }
      }
    })
    await page.locator('#note').click({ button: 'right' })
    await page.locator('[data-dfa-item="copyContents"]').click()
    await expect.poll(() => page.evaluate(() => Boolean((window as any).readGates['/workspace/note.txt']))).toBe(true)
    await page.locator('#image').click({ button: 'right' })
    await page.locator('[data-dfa-item="copyContents"]').click()
    await expect.poll(() => page.evaluate(() => Boolean((window as any).readGates['/workspace/image.svg']))).toBe(true)
    await page.evaluate(() => (window as any).readGates['/workspace/image.svg']())
    await expect.poll(() => page.evaluate(() => (window as any).copied)).toEqual(['new'])
    await page.evaluate(() => (window as any).readGates['/workspace/note.txt']())
    await page.waitForTimeout(100)
    expect(await page.evaluate(() => (window as any).copied)).toEqual(['new'])
    expect(fixture.errors).toEqual([])
  } finally { await fixture.dispose() }
})

it('plugin unload removes toast state and pending visual callbacks', async () => {
  const fixture = await menuFixture()
  const { page } = fixture
  try {
    await page.locator('#note').click({ button: 'right' })
    await page.locator('[data-dfa-item="copyPath"]').click()
    await browserExpect(page.locator('.dfa-toast')).toBeVisible()
    await page.evaluate(() => (window as any).cleanup())
    await browserExpect(page.locator('.dfa-toast')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-dfa-glass'))).toBe(false)
    await page.waitForTimeout(2000)
    await browserExpect(page.locator('.dfa-toast')).toHaveCount(0)
    expect(fixture.errors).toEqual([])
  } finally { await fixture.dispose() }
})

it('an action that settles after unload cannot resurrect the toast', async () => {
  const fixture = await menuFixture()
  const { page } = fixture
  try {
    await page.evaluate(() => {
      const w = window as any
      w.clipGate = null
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => new Promise<void>(resolve => { w.clipGate = resolve }) },
        configurable: true,
      })
    })
    await page.locator('#note').click({ button: 'right' })
    await page.locator('[data-dfa-item="copyPath"]').click()
    await expect.poll(() => page.evaluate(() => Boolean((window as any).clipGate))).toBe(true)
    await page.evaluate(() => (window as any).cleanup())
    await page.evaluate(() => (window as any).clipGate())
    await page.waitForTimeout(200)
    await browserExpect(page.locator('.dfa-toast')).toHaveCount(0)
    expect(fixture.errors).toEqual([])
  } finally { await fixture.dispose() }
})

it('clearing the app cache rejects pending stale responses and retains preferred applications', async () => {
  // First-paint pointer events can prefetch before the first browser evaluate.
  const fixture = await menuFixture({ settings: true, state: { delayApps: true }, storage: { 'dsh-file-actions.preferred-apps.v1': '{"txt":"notepad"}' } })
  const { page } = fixture
  try {
    await page.locator('#note').hover()
    await expect.poll(() => page.evaluate(() => !!(window as any).releaseApps), { timeout: 5000 }).toBe(true)
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

it('changed-files cards and host media images open the menu without path attributes', async () => {
  const fixture = await menuFixture({})
  const { page } = fixture
  try {
    // The changed-files card exposes each row's resolved path through its
    // aria-describedby target; the header button itself carries only a label.
    const cardFired = await page.locator('#changed-header').evaluate((el) => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })
      el.dispatchEvent(event)
      return event.defaultPrevented
    })
    expect(cardFired).toBe(true)
    await browserExpect(page.locator('[data-dfa-menu]')).toBeVisible()
    await browserExpect(page.locator('.dfa-name')).toContainText('changed-report.md')
    await page.keyboard.press('Escape')
    await browserExpect(page.locator('[data-dfa-menu]')).toHaveCount(0)
    const rowFired = await page.locator('#changed-row').evaluate((el) => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })
      el.dispatchEvent(event)
      return event.defaultPrevented
    })
    expect(rowFired).toBe(true)
    await browserExpect(page.locator('.dfa-name')).toContainText('changed-data.csv')
    await page.keyboard.press('Escape')
    // The hover diff preview names its file through a dedicated path span.
    const previewFired = await page.locator('#changed-preview').evaluate((el) => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })
      el.dispatchEvent(event)
      return event.defaultPrevented
    })
    expect(previewFired).toBe(true)
    await browserExpect(page.locator('.dfa-name')).toContainText('changed-report.md')
    await page.keyboard.press('Escape')
    // Markdown images render as the Host's own preview button; the path rides
    // in the file-route URL of the inner <img>.
    const mediaFired = await page.locator('#media-image').evaluate((el) => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })
      el.dispatchEvent(event)
      return event.defaultPrevented
    })
    expect(mediaFired).toBe(true)
    await browserExpect(page.locator('[data-dfa-menu]')).toBeVisible()
    await browserExpect(page.locator('.dfa-name')).toContainText('media-report.png')
    expect(fixture.errors).toEqual([])
  } finally { await fixture.dispose() }
})

it('a truncated nested-path scan reports an unfinished search rather than a hit or a miss', async () => {
  const directories = Array.from({ length: 50 }, (_, index) => ({ name: `d${index}`, type: 'directory' }))
  const fixture = await menuFixture({ state: { missing: true, exists: [
    '/workspace/d0/docs/HANDOFF.md', '/workspace/d49/docs/HANDOFF.md',
  ], dirs: { '/workspace': directories } } })
  const { page } = fixture
  try {
    await page.locator('#nested').click({ button: 'right' })
    const menu = page.locator('[data-dfa-menu]').first()
    await browserExpect(menu).toContainText('Search did not finish: too many folders or a failed read')
    await browserExpect(menu).not.toContainText('File not found')
    await browserExpect(menu).not.toContainText('d0/docs/HANDOFF.md')
    await browserExpect(menu.locator('[data-dfa-item="retry"]')).toBeVisible()
    expect(fixture.errors).toEqual([])
  } finally { await fixture.dispose() }
})

it('a transient directory-listing failure is not cached as a five-minute miss', async () => {
  const fixture = await menuFixture({ state: { missing: true, failListOnce: true,
    exists: '/workspace/review-1/docs/HANDOFF.md', dirs: {
      '/workspace': [{ name: 'review-1', type: 'directory' }],
    } } })
  const { page } = fixture
  try {
    await page.locator('#nested').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-menu]')).toContainText('Search did not finish: too many folders or a failed read')
    await page.locator('#nested').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-menu]')).toContainText('review-1/docs/HANDOFF.md')
    expect(fixture.errors).toEqual([])
  } finally { await fixture.dispose() }
})

it('closing a nested-path lookup stops further filesystem probes', async () => {
  const fixture = await menuFixture({ state: { missing: true, delayList: true, exists: '/workspace/review-1/docs/HANDOFF.md', dirs: {
    '/workspace': [{ name: 'review-1', type: 'directory' }],
  } } })
  const { page } = fixture
  try {
    // Reset the probe log so this case only covers the lookup it opens: hovering
    // the fixture can warm an unrelated path, and an absolute page-wide count made
    // the assertion depend on that traffic.
    await page.evaluate(() => { const w = window as any; w.calls.stats = 0; w.calls.paths.length = 0 })
    await page.locator('#nested').click({ button: 'right' })
    await browserExpect(page.locator('[data-dfa-menu]')).toContainText('Looking for the file')
    await page.keyboard.press('Escape')
    await expect.poll(() => page.evaluate(() => (window as any).state.listAborted)).toBe(true)
    const before = await page.evaluate(() => (window as any).calls)
    await page.evaluate(() => (window as any).releaseList())
    await page.waitForTimeout(100)
    const after = await page.evaluate(() => (window as any).calls)
    // The invariant is "nothing new after the cancel", not a page-wide total: the
    // cancelled walk must not keep probing queued children once the menu is gone.
    expect(after.stats, `probes continued after cancel: ${JSON.stringify(after.paths)}`).toBe(before.stats)
    expect(before.paths, JSON.stringify(before.paths)).toContain('/workspace/docs/HANDOFF.md')
    expect(fixture.errors).toEqual([])
  } finally {
    await page.evaluate(() => (window as any).releaseList?.()).catch(() => {})
    await fixture.dispose()
  }
})

it('a silent application open reports the hint without throwing asynchronously', async () => {
  const fixture = await menuFixture()
  const { page } = fixture
  try {
    await page.bringToFront()
    await page.locator('#note').focus()
    expect(await page.evaluate(() => document.hasFocus())).toBe(true)
    await page.locator('#note').click({ button: 'right' })
    await page.locator('[data-dfa-item="openWith"]').hover()
    await page.locator('[data-dfa-item="app:player"]').click()
    await expect.poll(() => page.evaluate(() => (window as any).calls.opens))
      .toEqual([{ path: '/workspace/note.txt', application: 'player' }])
    expect(await page.evaluate(() => document.hasFocus())).toBe(true)
    await page.waitForTimeout(2000)
    expect(fixture.errors).toEqual([])
    expect(await page.evaluate(() => (window as any).toastLog))
      .toContain('Open requested; if no window appeared, the app may have failed to start or was blocked')
  } finally { await fixture.dispose() }
})

it('glass surfaces follow the wallpaper plugin gate', async () => {
  const fixture = await menuFixture({ storage: { 'dsh-file-actions.settings.v1': JSON.stringify({ glass: 'on' }) } })
  const { page } = fixture
  try {
    await page.evaluate(() => {
      document.body.setAttribute('data-we-glass-floaters', '')
      const root = document.documentElement.style
      root.setProperty('--we-floaters-blur', '20px')
      root.setProperty('--we-floaters-alpha', '0.6')
      root.setProperty('--we-readability-floor', '0.82')
      root.setProperty('--we-surface-tint-light', '#ffffff')
    })
    await page.locator('#note').click({ button: 'right' })
    const menu = page.locator('[data-dfa-menu]').first()
    await browserExpect(menu).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.dataset.dfaGlass)).toBe('on')
    const filter = await menu.evaluate(el => getComputedStyle(el).backdropFilter || (getComputedStyle(el) as any).webkitBackdropFilter)
    expect(filter).toContain('blur')
  } finally { await fixture.dispose() }
})

it('glass can be switched off and the menu stays opaque', async () => {
  const fixture = await menuFixture({ storage: { 'dsh-file-actions.settings.v1': JSON.stringify({ glass: 'off' }) } })
  const { page } = fixture
  try {
    await page.evaluate(() => document.body.setAttribute('data-we-glass-floaters', ''))
    await page.locator('#note').click({ button: 'right' })
    const menu = page.locator('[data-dfa-menu]').first()
    await browserExpect(menu).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.dataset.dfaGlass)).toBe('off')
    const filter = await menu.evaluate(el => getComputedStyle(el).backdropFilter || (getComputedStyle(el) as any).webkitBackdropFilter)
    expect(filter === 'none' || filter === '').toBe(true)
  } finally { await fixture.dispose() }
})
