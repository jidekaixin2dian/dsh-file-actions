import { test } from 'node:test'
import assert from 'node:assert/strict'
import { same, clientApi as api } from './helpers/client-bundle.js'

test('preferences persist by file type and report storage failure without claiming success', () => {
  const map = new Map()
  const storage = { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) }
  const prefs = api.applicationPreferences(storage)
  assert.equal(prefs.set('/repo/a.JSON', 'editor'), true)
  assert.equal(api.applicationPreferences(storage).get('/another/b.json'), 'editor')
  assert.equal(prefs.get('/repo/a.txt'), '')
  assert.equal(prefs.set('/repo/a.json', ''), true)
  assert.equal(prefs.get('/repo/a.json'), '')
  assert.equal(api.applicationPreferences({ getItem() { throw Error('denied') }, setItem() { throw Error('denied') } }).set('a.json', 'editor'), false)
  assert.equal(api.applicationPreferences(undefined).get('a.json'), '')
})

test('client settings default safely, persist valid choices, and preserve other preferences on reset', () => {
  const map = new Map([['dsh-file-actions.preferred-apps.v1', '{".txt":"notepad"}']])
  const storage = { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }
  const settings = api.clientPreferences(storage)
  same(settings.get(), { menuMode: 'full', glass: 'on', contextLines: 8 })
  assert.equal(settings.set({ menuMode: 'compact', contextLines: 16 }), true)
  same(api.clientPreferences(storage).get(), { menuMode: 'compact', glass: 'on', contextLines: 16 })
  map.set('dsh-file-actions.settings.v1', '{"menuMode":"unsupported","contextLines":100000}')
  same(settings.get(), { menuMode: 'full', glass: 'on', contextLines: 8 })
  assert.equal(settings.reset(), true)
  assert.equal(map.get('dsh-file-actions.preferred-apps.v1'), '{".txt":"notepad"}')
  const blocked = api.clientPreferences({ getItem: key => map.get(key), setItem() { throw Error('denied') }, removeItem() { throw Error('denied') } })
  assert.equal(blocked.set({ menuMode: 'compact' }), false)
  assert.equal(blocked.reset(), false)
  same(blocked.get(), { menuMode: 'full', glass: 'on', contextLines: 8 })
})

test('preferred applications can be listed and removed without erasing unrelated client storage', () => {
  const map = new Map([['unrelated', 'keep']]); let changes = 0
  const storage = { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }
  const preferences = api.applicationPreferences(storage, () => changes++)
  preferences.set('a.txt','notepad'); preferences.set('a.json','code')
  same(preferences.list(), [{ type: 'json', appId: 'code' }, { type: 'txt', appId: 'notepad' }])
  assert.equal(preferences.remove('txt'), true)
  assert.equal(preferences.get('a.json'), 'code')
  assert.equal(preferences.clear(), true)
  same(preferences.list(), [])
  assert.equal(map.get('unrelated'), 'keep')
  assert.equal(changes, 4)
})

test('reference context preference changes the window without changing the copied range', () => {
  const text = Array.from({ length: 100 }, (_, index) => `line ${index + 1}`).join('\n')
  assert.equal(api.referenceContext(text, { line: 50 }, 4).rows.length, 9)
  assert.equal(api.referenceContext(text, { line: 50 }, 16).rows.length, 33)
  assert.equal(api.referenceContext(text, { line: 50 }, -2).rows.length, 17)
  assert.equal(api.referencedText(text, { line: 50 }), 'line 50')
})

test('glass stays on unless it is explicitly switched off', () => {
  const map = new Map()
  const storage = { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }
  const prefs = api.clientPreferences(storage)
  assert.equal(prefs.get().glass, 'on')
  assert.equal(prefs.set({ glass: 'off' }), true)
  assert.equal(prefs.get().glass, 'off')
  assert.equal(prefs.set({ glass: 'sideways' }), true)
  assert.equal(prefs.get().glass, 'on')
  assert.equal(prefs.set({ menuMode: 'compact' }), true)
  assert.deepEqual([prefs.get().menuMode, prefs.get().glass], ['compact', 'on'])
})
