import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

export const bundleSource = fs.readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8')
export const same = (actual, expected) => assert.equal(JSON.stringify(actual), JSON.stringify(expected))

export function loadBundle(overrides = {}) {
  let captured = null
  const sandbox = {
    window: { __ModuleLoader__: { load: (definition) => { captured = definition } } },
    console,
    URL,
    TextEncoder,
    TextDecoder,
    // Share the host realm's binary types so `instanceof Uint8Array` inside the bundle
    // accepts byte fixtures built by the test, exactly like the browser would.
    Uint8Array,
    ArrayBuffer,
    Blob,
    AbortController,
    AbortSignal,
    // Minimal DOM for the download path: a menu action may save a file without a page.
    document: {
      querySelector: () => null,
      createElement: () => ({
        style: { setProperty() {}, removeProperty() {} }, dataset: {}, className: '', textContent: '',
        setAttribute() {}, appendChild() {}, click() {}, remove() {}, addEventListener() {},
      }),
      body: { appendChild() {} },
    },
    navigator: { clipboard: { writeText: async () => {} } },
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    cancelAnimationFrame: clearTimeout,
    ...overrides,
  }
  vm.runInNewContext(bundleSource, sandbox, { filename: 'client.js' })
  assert.ok(captured, 'bundle did not register itself with the module loader')
  assert.equal(captured.id, '@jidekaixin2dian/dsh-file-actions')
  return captured.factory()
}

export const clientPlugin = loadBundle()
export const clientApi = clientPlugin.__internals
export const zh = clientApi.messages('zh-CN')
export const en = clientApi.messages('en-US')
