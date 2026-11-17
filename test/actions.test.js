import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadBundle, same, bundleSource as source, clientApi as api, zh, en } from './helpers/client-bundle.js'

test('the copy cap is exported for the action layer', () => {
  assert.equal(api.MAX_COPY_BYTES, 2 * 1024 * 1024)
})

// Regression: asking for MAX + 1 trips the Host's own `length > maxBytes` guard,
// which made 复制文件内容 fail for every file, not just large ones.
test('copy contents never asks the Host for more than its cap', async () => {
  const calls = []
  const bridge = {
    readBytes: async (_sessionId, _path, options) => {
      calls.push(options)
      return { data: new TextEncoder().encode('hello'), eof: true }
    },
  }
  await api.dispatch({ action: 'copyContents' }, { absolutePath: 'D:\\r\\a.ts', displayPath: 'a.ts' }, { bridge, t: zh, sessionId: 's' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].range.length, api.MAX_COPY_BYTES)
})

test('a file over the cap never crosses the wire', async () => {
  let called = false
  const bridge = {
    readBytes: async () => {
      called = true
      return { data: new Uint8Array(0), eof: true }
    },
  }
  await api.dispatch(
    { action: 'copyContents' },
    { absolutePath: 'D:\\r\\big.bin', displayPath: 'big.bin', bytes: api.MAX_COPY_BYTES + 1 },
    { bridge, t: zh, sessionId: 's' },
  )
  assert.equal(called, false)
})

test('copying a file outside the workspace asks first; declined copies read nothing', async () => {
  const reads = [], prompts = []
  const bridge = {
    readBytes: async () => {
      reads.push(1)
      return { data: new TextEncoder().encode('secret'), eof: true }
    },
  }
  const outside = { absolutePath: 'C:\\Users\\me\\.ssh\\id_rsa', displayPath: 'id_rsa', outsideWorkspace: true }
  await api.dispatch({ action: 'copyContents' }, outside, { bridge, t: zh, sessionId: 's', confirm: () => false })
  assert.equal(reads.length, 0)
  await api.dispatch({ action: 'copyContents' }, outside, {
    bridge, t: zh, sessionId: 's',
    confirm: (message) => { prompts.push(message); return true },
  })
  assert.equal(reads.length, 1)
  assert.ok(prompts[0].includes('C:\\Users\\me\\.ssh\\id_rsa'))
  assert.ok(prompts[0].startsWith(zh.confirmOutsideCopy.split('\n')[0]))
  await api.dispatch(
    { action: 'copyContents' },
    { absolutePath: 'D:\\r\\a.ts', displayPath: 'a.ts' },
    { bridge, t: zh, sessionId: 's', confirm: () => { throw new Error('inside the workspace must not ask') } },
  )
  assert.equal(reads.length, 2)
})

test('save as reads the whole file in chunks until the Host reports the end', async () => {
  const calls = []
  const bridge = {
    readBytes: async (_sessionId, _path, options) => {
      calls.push(options)
      // Two full windows then the tail: a 5 MB video no longer dies on the Host cap.
      const more = calls.length < 3
      return { data: new Uint8Array(more ? 2 : 1), eof: !more, version: 'v1', absolutePath: 'D:\\r\\big.mp4',
        offset: options.range.offset, bytes: 5 }
    },
  }
  await api.dispatch({ action: 'saveAs' }, { absolutePath: 'D:\\r\\big.mp4', displayPath: 'big.mp4' }, { bridge, t: zh, sessionId: 's' })
  assert.equal(calls.length, 3)
  assert.deepEqual(calls.map((call) => call.range.offset), [0, 2, 4])
  assert.equal(calls[0].range.length, 2 * 1024 * 1024)
})

test('outside copies fail closed when confirmation is absent, throws, rejects, or is not affirmative', async () => {
  let reads = 0
  const bridge = { readBytes: async () => { reads++; return { data: new Uint8Array(), eof: true } } }
  for (const confirm of [undefined, () => { throw new Error('unavailable') }, async () => { throw new Error('unavailable') }, () => 'yes']) {
    await api.dispatch({ action: 'copyContents' }, { absolutePath: '/outside/a.env', outsideWorkspace: true },
      { bridge, t: en, sessionId: 's', confirm })
  }
  assert.equal(reads, 0)
  await api.dispatch({ action: 'copyContents' }, { absolutePath: '/outside/a.env', outsideWorkspace: true },
    { bridge, t: en, sessionId: 's', confirm: async () => true })
  assert.equal(reads, 1)
})

test('whole-file reads reject changing identity and noncontiguous or incomplete responses', async () => {
  const chunk = (offset) => ({ absolutePath: '/a.txt', version: 'v1', bytes: 4, offset,
    data: new TextEncoder().encode(offset ? 'BB' : 'AA'), eof: offset > 0 })
  for (const changed of [{ version: 'v2' }, { absolutePath: '/b.txt' }, { bytes: 5 }]) {
    let calls = 0
    const result = await api.readAllBytes({ readBytes: async () => calls++ ? { ...chunk(2), ...changed } : chunk(0) }, 's', '/a.txt')
    same(result, { kind: 'changed' })
  }
  same(await api.readAllBytes({ readBytes: async () => chunk(2) }, 's', '/a.txt'), { kind: 'failed' })
  same(await api.readAllBytes({ readBytes: async () => ({ ...chunk(0), eof: true }) }, 's', '/a.txt'), { kind: 'changed' })
  same(await api.readAllBytes({ readBytes: async () => ({ ...chunk(0), bytes: 65 * 1024 * 1024 }) }, 's', '/a.txt'), { kind: 'too-large' })
  let calls = 0
  const valid = await api.readAllBytes({ readBytes: async () => chunk(calls++ * 2) }, 's', '/a.txt')
  assert.equal(new TextDecoder().decode(valid.bytes), 'AABB')
})

test('invalid UTF-8 never reaches the clipboard, while Unicode text is preserved', async () => {
  const copied = []
  const isolated = loadBundle({ navigator: { clipboard: { writeText: async text => copied.push(text) } } }).__internals
  const copy = async data => isolated.dispatch({ action: 'copyContents' }, { absolutePath: '/a.txt' },
    { bridge: { readBytes: async () => ({ data, eof: true }) }, t: en, sessionId: 's' })
  await copy(new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]))
  assert.equal(copied.length, 0)
  await copy(new TextEncoder().encode("中文 é 😀 O'Connor"))
  assert.deepEqual(copied, ["中文 é 😀 O'Connor"])
})

test('referenced text selects complete lines and preserves their internal line endings', () => {
  const text = 'first\r\n中文 😀\r\nthird\r\n'
  assert.equal(api.referencedText(text, { line: 2 }), '中文 😀')
  assert.equal(api.referencedText(text, { line: 2, endLine: 3 }), '中文 😀\r\nthird')
  assert.equal(api.referencedText('a\rb\rc', { line: 2, endLine: 3 }), 'b\rc')
  assert.equal(api.referencedText('\n\n', { line: 2 }), '')
  for (const location of [{ line: 0 }, { line: -1 }, { line: 1.5 }, { line: Infinity },
    { line: 3, endLine: 2 }, { line: 4 }, { line: 1, endLine: 4 }]) {
    assert.equal(api.referencedText(text, location), null)
  }
  assert.equal(api.referencedText('', { line: 1 }), null)
})

test('only valid located text references offer copying their referenced lines', () => {
  const actions = (path, location) => api.buildMenuModel({ absolutePath: path, location, t: en })
    .sections.flat().map(item => item.action)
  assert.ok(actions('/note.txt', { line: 2, endLine: 3 }).includes('copyLines'))
  for (const [path, location] of [['/note.txt', undefined], ['/image.png', { line: 1 }],
    ['/note.txt', { line: 0 }], ['/note.txt', { line: 3, endLine: 2 }]]) {
    assert.ok(!actions(path, location).includes('copyLines'))
  }
})

test('copy referenced lines retains confirmation, size and encoding gates and rejects stale locations', async () => {
  const copied = []
  let reads = 0
  const isolated = loadBundle({ navigator: { clipboard: { writeText: async text => copied.push(text) } } }).__internals
  const target = { absolutePath: '/note.txt', line: 2, endLine: 3 }
  const bridge = { readBytes: async () => { reads++; return {
    data: new TextEncoder().encode('one\ntwo\nthree\nfour\n'), eof: true,
  } } }
  const context = { bridge, t: en, sessionId: 's' }
  await isolated.dispatch({ action: 'copyLines' }, target, context)
  assert.deepEqual(copied, ['two\nthree'])
  await isolated.dispatch({ action: 'copyLines' }, { ...target, endLine: 8 }, context)
  assert.equal(copied.length, 1)
  const before = reads
  await isolated.dispatch({ action: 'copyLines' }, { ...target, outsideWorkspace: true }, { ...context, confirm: () => false })
  await isolated.dispatch({ action: 'copyLines' }, { ...target, bytes: api.MAX_COPY_BYTES + 1 }, context)
  assert.equal(reads, before)
  for (const result of [{ data: new Uint8Array([0xff]), eof: true },
    { data: new TextEncoder().encode('one\ntwo'), eof: false }]) {
    await isolated.dispatch({ action: 'copyLines' }, target, { ...context, bridge: { readBytes: async () => result } })
  }
  assert.equal(copied.length, 1)
})

test('preview reads require confirmation and reject changed files, invalid text and partial reads', async () => {
  let reads = 0
  const target = { absolutePath: '/a.txt', line: 1, version: 'v1', outsideWorkspace: true }
  const read = async result => ({ readBytes: async () => { reads++; return result } })
  const context = { t: en, sessionId: 's', confirm: () => false, bridge: await read({}) }
  assert.equal(await api.readTextTarget(target, context), null)
  assert.equal(reads, 0)
  for (const result of [
    { data: new TextEncoder().encode('a'), eof: true, version: 'v2' },
    { data: new Uint8Array([0xff]), eof: true, version: 'v1' },
    { data: new Uint8Array([0]), eof: true, version: 'v1' },
    { data: new TextEncoder().encode('a'), eof: false, version: 'v1' },
  ]) assert.ok((await api.readTextTarget(target, { ...context, confirm: () => true, bridge: await read(result) })).error)
  const before = reads
  assert.ok((await api.readTextTarget({ ...target, bytes: api.MAX_COPY_BYTES + 1 }, context)).error)
  assert.equal(reads, before)
})

test('cancelled reads cannot put a stale source excerpt on the clipboard', async () => {
  let current = true, release
  const copied = []
  const isolated = loadBundle({ navigator: { clipboard: { writeText: async text => copied.push(text) } } }).__internals
  const pending = isolated.dispatch({ action: 'copySource' }, { absolutePath: '/a.txt', line: 1 }, {
    t: en, sessionId: 's', isCurrent: () => current,
    bridge: { readBytes: () => new Promise(resolve => { release = resolve }) },
  })
  await new Promise(resolve => setImmediate(resolve))
  current = false
  release({ data: new TextEncoder().encode('secret'), eof: true })
  await pending
  assert.deepEqual(copied, [])
})
