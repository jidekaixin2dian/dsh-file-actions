import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadBundle } from './helpers/client-bundle.js'

test('an old menu operation cannot cancel the replacement, and session changes invalidate its actions', () => {
  const api = loadBundle().__internals
  let sessionId = 'one'
  const owner = api.createMenuSession({ activeSession: () => ({ id: sessionId }) })
  const first = owner.begin()
  owner.close()
  assert.equal(first.signal.aborted, true)
  const second = owner.begin()
  first.cancelLookup()
  assert.equal(second.signal.aborted, false)
  assert.equal(first.isCurrent(), false)
  sessionId = 'two'
  assert.equal(second.isCurrent(), false)
  owner.dispose()
  assert.equal(second.signal.aborted, true)
  assert.equal(second.isPending(), false)
})

test('application cache invalidation rejects late answers and disposal cancels pending storage writes', async () => {
  const api = loadBundle().__internals
  let release
  let notifications = 0
  let writes = 0
  const bridge = { applications: () => new Promise(resolve => { release = resolve }) }
  const cache = api.createApplicationCache(bridge, { getItem: () => null, setItem: () => { writes++ } }, () => { notifications++ })
  const first = cache.forPath('/a.txt')
  cache.clear()
  release({ state: 'ready', apps: [{ id: 'one', name: 'One' }] })
  await first
  assert.equal(cache.size(), 0)
  assert.equal(notifications, 0)
  const second = cache.forPath('/a.txt')
  release({ state: 'ready', apps: [{ id: 'two', name: 'Two' }] })
  await second
  assert.equal(cache.size(), 1)
  assert.equal(cache.nameOf('two'), 'Two')
  cache.dispose()
  assert.equal(cache.size(), 0)
  assert.equal(writes, 0)
  assert.equal((await cache.forPath('/after-dispose.txt')).state, 'failed')
})

test('a disposed preview cache ignores a read that finishes after unload', async () => {
  const api = loadBundle().__internals
  let release
  let paints = 0
  const handle = { closed: false, setThumbnail: () => { paints++ } }
  const cache = api.createPreviewCache({ readBytes: () => new Promise(resolve => { release = resolve }) }, () => true)
  const pending = cache.load(handle, 'one', '/a.png', 2, 'v1')
  cache.dispose()
  release({ data: new Uint8Array([1, 2]), eof: true })
  await pending
  assert.equal(paints, 0)
})
