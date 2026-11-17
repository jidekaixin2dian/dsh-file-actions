import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { bundleSource as source, clientPlugin as mod } from './helpers/client-bundle.js'

test('the bundle registers a client plugin', () => {
  assert.equal(mod.name, 'dsh-file-actions')
  assert.equal(typeof mod.apply, 'function')
  assert.equal(mod.inject.join(','), 'sessions,remote,remote.session,remote.workspaceFiles')
})

test('classic concatenation and repeated script loads preserve other plugins global bindings', () => {
  const registrations = []
  const context = vm.createContext({ window: { __ModuleLoader__: { load: row => registrations.push(row) } } })
  vm.runInContext('const factory = "unrelated plugin";', context)
  vm.runInContext(source + '\n' + source, context)
  vm.runInContext(source, context)
  assert.equal(registrations.length, 3)
  assert.equal(registrations.every(row => row.id === '@jidekaixin2dian/dsh-file-actions'), true)
  assert.equal(vm.runInContext('factory', context), 'unrelated plugin')
})
