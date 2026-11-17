import { expect, it } from 'vitest'
import { expect as browserExpect } from '@playwright/test'
import { menuFixture } from './fixtures/menu.ts'
import path from 'node:path'

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

it('settings.section.icon renders the contributed icon on 0.2.2 hosts and unregisters cleanly', async () => {
  const fixture = await menuFixture({ settings: true })
  const { page } = fixture
  try {
    await page.evaluate(() => (window as any).slotDeclared.add('settings.section.icon'))
    await page.evaluate(() => { const w = window as any; w.plugin.apply(w.ctx) })
    await browserExpect(page.locator('#settings-nav button[data-section-id="file-actions"] .dfa-nav-icon svg')).toHaveCount(1)
    await browserExpect(page.locator('[data-dfa-nav-icon]')).toHaveCount(0)
    await page.evaluate(() => (window as any).cleanup())
    await browserExpect(page.locator('#settings-nav button[data-section-id="file-actions"] .dfa-nav-icon')).toHaveCount(0)
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
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dsh-file-actions.settings.v1')!))).toEqual({ menuMode: 'compact', glass: 'on', contextLines: 16 })
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
    // Chromium delivers the resize event after setViewportSize has returned.
    const assertBounds = async () => expect.poll(async () => {
      const popup = await page.getByRole('listbox').boundingBox(), trigger = await context.boundingBox()
      return !!popup && !!trigger && popup.x >= 8 && popup.x + popup.width <= page.viewportSize()!.width - 8
        && popup.y >= 8 && popup.y + popup.height <= trigger.y - 5
    }, { timeout: 5000 }).toBe(true)
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
