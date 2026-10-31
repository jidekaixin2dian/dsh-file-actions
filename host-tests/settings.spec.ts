import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { expect, it } from 'vitest'
import { Context } from 'host-source/vendor/cordis/src/index.ts'
import { SlotRegistry } from 'host-source/packages/client/ui-renderer/src/client/registry.ts'

it('the settings page uses the real host slot registry and unregisters cleanly', async () => {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  const undeclare = slots.register({ name: 'root', children: { 'settings.section': { kind: 'list', scope: 'root' } } } as never, () => null)
  let definition: any
  const sandbox = { window: { __ModuleLoader__: { load: value => { definition = value } } }, console }
  vm.runInNewContext(fs.readFileSync(path.join(process.env.DFA_PROJECT!, 'lib/client.js'), 'utf8'), sandbox)
  const api = definition.factory(() => ({})).__internals
  try {
    const stop = api.registerSettings(ctx, {})
    await expect.poll(() => slots.entries('settings.section').length).toBe(1)
    expect(slots.entries('settings.section')[0]!.options.id).toBe('file-actions')
    stop()
    await expect.poll(() => slots.entries('settings.section').length).toBe(0)
    const again = api.registerSettings(ctx, {})
    await expect.poll(() => slots.entries('settings.section').length).toBe(1)
    again()
  } finally { undeclare(); await ctx.fiber.dispose() }
})
