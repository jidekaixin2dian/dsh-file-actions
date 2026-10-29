// The client half is a classic browser bundle (no ESM exports), so the tests
// evaluate it with a fake `window` and read the internals the factory exposes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.join(here, '..', 'lib', 'client.js'), 'utf8')

// Values crossing the VM boundary carry another realm's prototypes, so compare
// their JSON shape instead of their identity.
const same = (actual, expected) => assert.equal(JSON.stringify(actual), JSON.stringify(expected))

function loadBundle(overrides = {}) {
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
    // Minimal DOM for the download path: a menu action may save a file without a page.
    document: {
      querySelector: () => null,
      createElement: () => ({
        style: { setProperty() {} }, dataset: {}, className: '', textContent: '',
        setAttribute() {}, appendChild() {}, click() {}, remove() {}, addEventListener() {},
      }),
      body: { appendChild() {} },
    },
    navigator: { clipboard: { writeText: async () => {} } },
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    ...overrides,
  }
  vm.runInNewContext(source, sandbox, { filename: 'client.js' })
  assert.ok(captured, 'bundle did not register itself with the module loader')
  assert.equal(captured.id, '@jidekaixin2dian/dsh-file-actions')
  return captured.factory()
}

const mod = loadBundle()
const api = mod.__internals
const zh = api.messages('zh-CN')
const en = api.messages('en-US')

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

test('stripLocationSuffix splits :line:col and #L.. suffixes', () => {
  same(api.stripLocationSuffix('src/app.ts:12:3'), { path: 'src/app.ts', line: 12, column: 3 })
  same(api.stripLocationSuffix('src/app.ts:12'), { path: 'src/app.ts', line: 12 })
  same(api.stripLocationSuffix('src/app.ts#L12-L20'), { path: 'src/app.ts', line: 12, endLine: 20 })
  same(api.stripLocationSuffix('src/app.ts'), { path: 'src/app.ts' })
})

test('a drive letter is not mistaken for a location suffix', () => {
  same(api.stripLocationSuffix('C:'), { path: 'C:' })
  same(api.stripLocationSuffix('D:\\repo\\a.js'), { path: 'D:\\repo\\a.js' })
})

test('isAbsolutePath recognises the three Host path shapes', () => {
  assert.equal(api.isAbsolutePath('D:\\repo\\a.js'), true)
  assert.equal(api.isAbsolutePath('/home/me/a.js'), true)
  assert.equal(api.isAbsolutePath('\\\\server\\share\\a.js'), true)
  assert.equal(api.isAbsolutePath('lib/client.js'), false)
  assert.equal(api.isAbsolutePath('./lib/client.js'), false)
})

test('joinPath keeps the cwd separator and drops a leading ./', () => {
  assert.equal(api.joinPath('D:\\repo', 'lib/a.js'), 'D:\\repo\\lib/a.js')
  assert.equal(api.joinPath('D:\\repo', './lib/a.js'), 'D:\\repo\\lib/a.js')
  assert.equal(api.joinPath('/home/me/repo', 'lib/a.js'), '/home/me/repo/lib/a.js')
  assert.equal(api.joinPath('D:\\repo\\', 'a.js'), 'D:\\repo\\a.js')
})

test('looksLikePath accepts file references and rejects prose and URLs', () => {
  assert.equal(api.looksLikePath('lib/client.js'), true)
  assert.equal(api.looksLikePath('D:\\repo\\lib\\client.js'), true)
  assert.equal(api.looksLikePath('README.md'), true)
  assert.equal(api.looksLikePath('https://example.com/a.js'), false)
  assert.equal(api.looksLikePath('预览'), false)
  assert.equal(api.looksLikePath('Read file'), false)
  assert.equal(api.looksLikePath(''), false)
})

test('pathFromHref unwraps file: URLs and leaves web links alone', () => {
  assert.equal(api.pathFromHref('file:///C:/repo/a.js'), 'C:/repo/a.js')
  assert.equal(api.pathFromHref('file:///home/me/a.js'), '/home/me/a.js')
  assert.equal(api.pathFromHref('https://example.com'), '')
  assert.equal(api.pathFromHref('lib/a.js'), 'lib/a.js')
  assert.equal(api.pathFromHref('#section'), '')
})

test('classify maps extensions onto menu capabilities', () => {
  const text = api.classify('src/a.ts', false)
  assert.equal(text.kind, 'code')
  assert.equal(text.canCopyText, true)
  assert.equal(text.canBrowser, false)

  const image = api.classify('a.png', false)
  assert.equal(image.kind, 'image')
  assert.equal(image.canCopyText, false)
  assert.equal(image.canBrowser, true)

  assert.equal(api.classify('a.html', false).kind, 'html')
  assert.equal(api.classify('a.svg', false).kind, 'html')
  assert.equal(api.classify('a.pdf', false).kind, 'pdf')
  assert.equal(api.classify('a.md', false).kind, 'markdown')
  assert.equal(api.classify('a.docx', false).kind, 'office')
  assert.equal(api.classify('a.zip', false).kind, 'archive')
  assert.equal(api.classify('a.exe', false).kind, 'exec')
  assert.equal(api.classify('a.exe', false).canCopyText, false)

  const dir = api.classify('D:\\repo', true)
  assert.equal(dir.kind, 'dir')
  assert.equal(dir.canSaveAs, false)
})

test('formatBytes is human readable and stable', () => {
  assert.equal(api.formatBytes(0), '0 B')
  assert.equal(api.formatBytes(999), '999 B')
  assert.equal(api.formatBytes(2048), '2.0 KB')
  assert.equal(api.formatBytes(1024 * 1024 * 3.5), '3.5 MB')
  assert.equal(api.formatBytes(undefined), '')
})

test('pickEditor prefers a known editor over other associations', () => {
  const apps = [
    { id: 'notepad', name: 'Notepad', default: true, icon: null },
    { id: 'vscode', name: 'Visual Studio Code', default: false, icon: null },
  ]
  assert.equal(api.pickEditor(apps).id, 'vscode')
  assert.equal(api.pickEditor([]), null)
  assert.equal(api.pickEditor(null), null)
})

test('a text file gets open, open-with, reveal, copy and save-as rows', () => {
  const model = api.buildMenuModel({
    absolutePath: 'D:\\repo\\src\\a.ts',
    displayPath: 'src/a.ts',
    isDir: false,
    apps: [
      { id: 'vscode', name: 'Visual Studio Code', default: false, icon: null },
      { id: 'notepad', name: 'Notepad', default: true, icon: null },
    ],
    bytes: 2048,
    t: zh,
  })
  assert.equal(model.title, 'a.ts')
  assert.equal(model.kind, 'code')
  assert.match(model.meta, /代码/)
  assert.match(model.meta, /2\.0 KB/)

  const ids = model.sections.flat().map((item) => item.id)
  assert.equal(ids.join(','), 'open,editor,openWith,reveal,copyPath,copyRelPath,copyFileName,copyContents,saveAs')

  const openWith = model.sections.flat().find((item) => item.id === 'openWith')
  assert.equal(openWith.children.length, 2)
  assert.equal(openWith.children[0].checked, true)
  assert.equal(openWith.children[0].label, 'Notepad')
})

test('an image drops copy-contents but keeps the browser preview', () => {
  const model = api.buildMenuModel({
    absolutePath: '/home/me/pic.png',
    displayPath: 'pic.png',
    isDir: false,
    apps: [],
    bytes: 4096,
    t: en,
  })
  const ids = model.sections.flat().map((item) => item.id)
  assert.equal(ids.includes('copyContents'), false)
  assert.equal(ids.includes('browser'), true)
  assert.equal(ids.includes('saveAs'), true)
  assert.equal(ids.includes('openWith'), false)
})

test('a directory only offers folder actions and no save-as', () => {
  const model = api.buildMenuModel({
    absolutePath: 'D:\\repo\\lib',
    displayPath: 'lib',
    isDir: true,
    apps: [],
    t: zh,
  })
  const items = model.sections.flat()
  const ids = items.map((item) => item.id)
  assert.equal(ids.includes('open'), true)
  assert.equal(items.find((item) => item.id === 'open').label, zh.openFolder)
  assert.equal(items.find((item) => item.id === 'reveal').label, zh.revealFolder)
  assert.equal(ids.includes('saveAs'), false)
  assert.equal(ids.includes('copyContents'), false)
  assert.equal(ids.includes('browser'), false)
})

test('copy relative path is omitted when the display path is already absolute', () => {
  const model = api.buildMenuModel({
    absolutePath: 'D:\\repo\\a.js',
    displayPath: 'D:\\repo\\a.js',
    isDir: false,
    apps: [],
    t: zh,
  })
  assert.equal(model.sections.flat().some((item) => item.id === 'copyRelPath'), false)
})

test('every row carries an id, a label and an icon', () => {
  const model = api.buildMenuModel({
    absolutePath: 'D:\\repo\\a.js',
    displayPath: 'a.js',
    isDir: false,
    apps: [{ id: 'x', name: 'X', default: false, icon: null }],
    t: zh,
  })
  for (const section of model.sections) {
    for (const item of section) {
      assert.equal(typeof item.id, 'string')
      assert.equal(typeof item.label, 'string')
      assert.ok(item.label.length > 0)
      assert.equal(typeof item.icon, 'string')
    }
  }
})

test('unwrap reads the Remote result envelope', () => {
  assert.equal(api.unwrap({ ok: true, value: 42 }), 42)
  assert.equal(api.unwrap({ ok: false, error: { code: 'x' } }), null)
  assert.equal(api.unwrap(null), null)
  assert.equal(api.unwrap(undefined), null)
})

test('mimeOf covers the browser-previewable kinds', () => {
  assert.equal(api.mimeOf('a.html'), 'text/html;charset=utf-8')
  assert.equal(api.mimeOf('a.svg'), 'image/svg+xml')
  assert.equal(api.mimeOf('a.pdf'), 'application/pdf')
  assert.equal(api.mimeOf('a.png'), 'image/png')
  assert.equal(api.mimeOf('a.unknownext'), 'application/octet-stream')
  assert.equal(api.mimeOf('a.ts'), 'text/plain;charset=utf-8')
})

// Regression: `extname` returns '' for every one of these, so before the fix a
// repository's most-copied files were classified as binary.
test('extension-less repository files are text, not binary', () => {
  for (const name of ['Dockerfile', 'Makefile', 'LICENSE', 'README', 'CHANGELOG', 'Procfile', '.gitignore', '.env', '.npmrc', 'CMakeLists.txt']) {
    const kind = api.classify(name, false)
    assert.equal(kind.kind, 'text', name)
    assert.equal(kind.canCopyText, true, name)
    assert.equal(api.mimeOf(name), 'text/plain;charset=utf-8', name)
  }
  assert.equal(api.classify('Dockerfile', false).kind, 'text')
  assert.equal(api.classify('node_modules/.bin/tool', false).kind, 'binary')
  assert.equal(api.classify('archive.tar.gz', false).kind, 'archive')
  assert.equal(api.isTextName('Dockerfile'), true)
  assert.equal(api.isTextName('a.png'), false)
  assert.equal(api.isTextName(''), false)
})

test('a Dockerfile gets the copy-contents row', () => {
  const model = api.buildMenuModel({
    absolutePath: 'D:\\repo\\Dockerfile',
    displayPath: 'Dockerfile',
    isDir: false,
    apps: [],
    bytes: 120,
    t: zh,
  })
  const ids = model.sections.flat().map((item) => item.id)
  assert.equal(ids.includes('copyContents'), true)
  assert.equal(ids.includes('browser'), false)
  assert.match(model.meta, /文本/)
})

test('a binary file keeps the external actions but never copy-contents', () => {
  const model = api.buildMenuModel({
    absolutePath: 'D:\\repo\\tool.exe',
    displayPath: 'tool.exe',
    isDir: false,
    apps: [],
    bytes: 900000,
    t: zh,
  })
  const ids = model.sections.flat().map((item) => item.id)
  assert.equal(ids.includes('copyContents'), false)
  assert.equal(ids.includes('browser'), false)
  assert.equal(ids.includes('saveAs'), true)
  assert.equal(ids.includes('copyPath'), true)
})

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
    same(result, { changed: true })
  }
  assert.equal(await api.readAllBytes({ readBytes: async () => chunk(2) }, 's', '/a.txt'), null)
  same(await api.readAllBytes({ readBytes: async () => ({ ...chunk(0), eof: true }) }, 's', '/a.txt'), { changed: true })
  same(await api.readAllBytes({ readBytes: async () => ({ ...chunk(0), bytes: 65 * 1024 * 1024 }) }, 's', '/a.txt'), { tooLarge: true })
  let calls = 0
  const valid = await api.readAllBytes({ readBytes: async () => chunk(calls++ * 2) }, 's', '/a.txt')
  assert.equal(new TextDecoder().decode(valid), 'AABB')
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

test('UNC file URLs retain their absolute identity and encoded names', () => {
  assert.equal(api.pathFromHref('file://server/share/report.txt'), '//server/share/report.txt')
  assert.equal(api.pathFromHref('file://server/share/%E4%B8%AD%E6%96%87%20a.txt'), '//server/share/中文 a.txt')
  assert.equal(api.isAbsolutePath(api.pathFromHref('file://server/share/report.txt')), true)
  assert.equal(api.pathFromHref('file://localhost/C:/a%20b.txt'), 'C:/a b.txt')
})

test('path heuristics understand located references, dotfiles, and known extensionless files', () => {
  for (const path of ['src/app.ts:42:7', 'notes.md#L42-L48', '.env', 'Dockerfile']) {
    assert.equal(api.looksLikePath(path), true, path)
    assert.equal(api.softPath(path), true, path)
  }
  assert.equal(api.looksLikePath('ordinary words'), false)
})

test('soft sources must look like a real file', () => {
  assert.equal(api.softPath('src/app.ts'), true)
  assert.equal(api.softPath('D:\\repo\\a.ts'), true)
  assert.equal(api.softPath('2026/10/22 12:00'), false)
  assert.equal(api.softPath('2/3 files'), false)
  assert.equal(api.softPath('src/app.ts · 2.1 KB'), false)
  assert.equal(api.softPath(''), false)
})

test('isInside compares a root and a path case-insensitively', () => {
  assert.equal(api.isInside('D:\\repo', 'D:\\repo\\src\\a.ts'), true)
  assert.equal(api.isInside('D:\\repo', 'D:\\repo'), true)
  assert.equal(api.isInside('D:\\repo', 'D:\\repo2\\a.ts'), false)
  assert.equal(api.isInside('D:\\repo', 'D:\\other\\a.ts'), false)
  assert.equal(api.isInside('/home/me/repo', '/home/me/repo/a.ts'), true)
  assert.equal(api.isInside('', 'D:\\a'), false)
})

test('a path outside the workspace is labelled in the header', () => {
  const inside = api.buildMenuModel({
    absolutePath: 'D:\\repo\\a.ts', displayPath: 'a.ts', isDir: false, apps: [], bytes: 10, t: zh,
  })
  const outside = api.buildMenuModel({
    absolutePath: 'C:\\Users\\me\\.ssh\\id_rsa', displayPath: 'C:\\Users\\me\\.ssh\\id_rsa', isDir: false, apps: [], bytes: 10, outsideWorkspace: true, t: zh,
  })
  assert.equal(inside.meta.includes(zh.outsideWorkspace), false)
  assert.equal(outside.meta.includes(zh.outsideWorkspace), true)
})

test('.env.local style dotfiles are text', () => {
  assert.equal(api.classify('.env.local', false).kind, 'text')
  assert.equal(api.classify('.env.production', false).kind, 'text')
  assert.equal(api.classify('.prettierrc', false).kind, 'text')
  assert.equal(api.classify('.tar.gz', false).kind, 'archive')
})

test('relativeTo strips the workspace root and refuses outsiders', () => {
  assert.equal(api.relativeTo('D:\\dsh\\plugin', 'D:\\dsh\\plugin\\dsh-file-actions\\package.json'), 'dsh-file-actions/package.json')
  assert.equal(api.relativeTo('D:\\dsh\\plugin', 'D:\\other\\a.ts'), '')
  assert.equal(api.relativeTo('/home/me/repo', '/home/me/repo/a.ts'), 'a.ts')
  assert.equal(api.relativeTo('D:\\repo', 'D:\\repo'), '')
  assert.equal(api.relativeTo('', 'D:\\repo\\a.ts'), '')
})

test('the header path prefers the workspace-relative form', () => {
  const inside = api.buildMenuModel({
    absolutePath: 'D:\\repo\\src\\a.ts', displayPath: 'a.ts', isDir: false, apps: [], bytes: 10, cwd: 'D:\\repo', t: zh,
  })
  assert.equal(inside.pathLine, 'src/a.ts')
  assert.equal(inside.sizeLabel, '10 B')
  assert.equal(inside.kindLabel, '代码')

  const outside = api.buildMenuModel({
    absolutePath: 'C:\\Users\\me\\.ssh\\id_rsa', displayPath: 'id_rsa', isDir: false, apps: [], bytes: 10,
    cwd: 'D:\\repo', outsideWorkspace: true, t: zh,
  })
  assert.equal(outside.pathLine, 'C:\\Users\\me\\.ssh\\id_rsa')
  assert.equal(outside.outsideWorkspace, true)

  const dir = api.buildMenuModel({
    absolutePath: 'D:\\repo\\lib', displayPath: 'lib', isDir: true, apps: [], cwd: 'D:\\repo', t: zh,
  })
  assert.equal(dir.sizeLabel, '')
  assert.equal(dir.pathLine, 'lib')
})

// The chat, the Sidebar and the delivery table link files as dsh-resource://file/…
test('pathFromHref understands dsh-resource file addresses', () => {
  assert.equal(api.pathFromHref('dsh-resource://file/session/s1/lib/a.ts'), 'lib/a.ts')
  assert.equal(api.pathFromHref('dsh-resource://file/session/s1/C:/x/y.png'), 'C:/x/y.png')
  assert.equal(api.pathFromHref('dsh-resource://file/session/s1/%E4%BA%A4%E4%BB%98/%E5%AD%97%E5%B9%95.srt'), '交付/字幕.srt')
  assert.equal(api.pathFromHref('dsh-resource://file/session/s1/a.srt#L3'), 'a.srt')
  assert.equal(api.pathFromHref('dsh-resource://file/session/s1/'), '')
  assert.equal(api.pathFromHref('https://example.com/a.ts'), '')
})

test('resource paths retain POSIX roots and encoded separators', () => {
  assert.equal(api.pathFromHref('dsh-resource://file/session/s1//home/me/a.txt'), '/home/me/a.txt')
  assert.equal(api.pathFromHref('dsh-resource://file/absolute/%2Fhome%2Fme%2Fa.txt'), '/home/me/a.txt')
  assert.equal(api.pathFromHref('dsh-resource://file/absolute//home/me/a.txt'), '/home/me/a.txt')
  assert.equal(api.pathFromHref('dsh-resource://file/shared/team/a.txt'), '')
})

test('POSIX path identity is case sensitive while Windows remains case insensitive', () => {
  assert.equal(api.isInside('/home/me/repo', '/home/me/Repo/a.txt'), false)
  assert.equal(api.relativeTo('/home/me/repo', '/home/me/Repo/a.txt'), '')
  assert.equal(api.isInside('C:/repo', 'c:/Repo/a.txt'), true)
  assert.equal(api.relativeTo('C:/repo', 'c:/Repo/a.txt'), 'a.txt')
  assert.equal(api.isInside('/', '/tmp/a.txt'), true)
})

test('a resource Session is resolved exactly, never replaced by the active chat', () => {
  const bridge = api.createBridge({ remote: {}, sessions: { list: { getSnapshot: () => ({ byId: {
    a: { id: 'a', cwd: '/one', retainedBy: { mainView: 1 } },
    b: { id: 'b', cwd: '/two' },
  } }) } } })
  assert.equal(bridge.activeSession().id, 'a')
  assert.equal(bridge.activeSession('b').cwd, '/two')
  assert.equal(bridge.activeSession('gone').id, 'gone')
  assert.equal(bridge.activeSession('gone').cwd, undefined)
})

test('subtitles, video and audio are classified for the menu', () => {
  for (const name of ['a.srt', 'a.ass', 'a.ssa', 'a.vtt', 'a.lrc']) {
    const kind = api.classify(name, false)
    assert.equal(kind.kind, 'subtitle', name)
    assert.equal(kind.canCopyText, true, name)
  }
  const mp4 = api.classify('成片.mp4', false)
  assert.equal(mp4.kind, 'video')
  assert.equal(mp4.canBrowser, true)
  assert.equal(mp4.canCopyText, false)
  const mkv = api.classify('a.mkv', false)
  assert.equal(mkv.kind, 'video')
  assert.equal(mkv.canBrowser, false)
  const mp3 = api.classify('a.mp3', false)
  assert.equal(mp3.kind, 'audio')
  assert.equal(mp3.canBrowser, true)
  assert.equal(api.classify('a.psd', false).kind, 'design')
  assert.equal(api.classify('a.ipynb', false).kind, 'code')
  assert.equal(api.mimeOf('a.mp4'), 'video/mp4')
  assert.equal(api.mimeOf('a.mp3'), 'audio/mpeg')
})

test('a video file gets the browser row, a subtitle file the copy row', () => {  const video = api.buildMenuModel({
    absolutePath: 'D:\\repo\\out\\成片.mp4', displayPath: 'out/成片.mp4', isDir: false, apps: [], bytes: 34603008, cwd: 'D:\\repo', t: zh,
  })
  const videoIds = video.sections.flat().map((item) => item.id)
  assert.equal(videoIds.includes('browser'), true)
  assert.equal(videoIds.includes('copyContents'), false)
  assert.equal(videoIds.includes('saveAs'), true)
  assert.equal(video.kindLabel, '视频')

  const subtitle = api.buildMenuModel({
    absolutePath: 'D:\\repo\\out\\字幕.srt', displayPath: 'out/字幕.srt', isDir: false, apps: [], bytes: 2048, cwd: 'D:\\repo', t: zh,
  })
  const subtitleIds = subtitle.sections.flat().map((item) => item.id)
  assert.equal(subtitleIds.includes('copyContents'), true)
  assert.equal(subtitleIds.includes('browser'), false)
  assert.equal(subtitle.kindLabel, '字幕')
})

// A delivery table renders "📄发布文案.md"; the decoration must not defeat detection.
test('icon and bullet decorations are stripped from a file name', () => {
  assert.equal(api.stripDecorations('📄发布文案.md'), '发布文案.md')
  assert.equal(api.stripDecorations('▸ 字幕.srt'), '字幕.srt')
  assert.equal(api.stripDecorations('• 剪辑工程.zip'), '剪辑工程.zip')
  assert.equal(api.stripDecorations('  🔗 配音来源.json'), '配音来源.json')
  assert.equal(api.stripDecorations('D:\\a\\b.md'), 'D:\\a\\b.md')
  assert.equal(api.stripDecorations('.env.local'), '.env.local')
  assert.equal(api.stripDecorations('/abs/x.ts'), '/abs/x.ts')
})

test('web links get a link menu instead of file actions', () => {
  const model = api.buildLinkMenuModel({ url: 'https://github.com/jidekaixin2dian/dsh-file-actions/releases/tag/v0.1.5', t: zh })
  assert.equal(model.kind, 'link')
  assert.equal(model.title, 'github.com')
  assert.match(model.pathLine, /dsh-file-actions/)
  const ids = model.sections.flat().map((item) => item.id)
  assert.equal(ids.join(','), 'openLink,copyLink,copyLinkText')
  assert.equal(model.meta, zh.kinds.link)

  const withWww = api.buildLinkMenuModel({ url: 'https://www.example.com/a/b?c=1', t: en })
  assert.equal(withWww.title, 'example.com')
  assert.equal(withWww.pathLine, '/a/b?c=1')
})

test('linkFromHref only accepts http(s)', () => {
  assert.equal(api.linkFromHref('https://github.com/x'), 'https://github.com/x')
  assert.equal(api.linkFromHref('http://a.example/b'), 'http://a.example/b')
  assert.equal(api.linkFromHref('mailto:a@b.c'), '')
  assert.equal(api.linkFromHref('javascript:alert(1)'), '')
  assert.equal(api.linkFromHref('file:///C:/a.ts'), '')
  assert.equal(api.linkFromHref('/local/path'), '')
  assert.equal(api.linkFromHref(''), '')
})

test('application ordering keeps every unique association and puts explicit preference first', () => {
  const apps = [{ id: 'media', name: 'Player' }, { id: 'editor', name: 'Visual Studio Code' },
    { id: 'default', name: 'Notepad', default: true }, { id: 'media', name: 'duplicate' }, { id: 'other', name: 'Other' }]
  same(api.orderApplications(apps, 'media').map(app => app.id), ['media', 'default', 'editor', 'other'])
  const model = api.buildMenuModel({ absolutePath: '/repo/a.json', displayPath: 'a.json', apps,
    preferredId: 'media', appsState: 'ready', t: en })
  assert.equal(model.sections.flat().find(row => row.id === 'editor').appId, 'media')
  assert.equal(model.sections.flat().find(row => row.id === 'openWith').children[0].preferred, true)
})

test('a failed or empty application lookup leaves no dead row in the menu', () => {
  const rows = state => api.buildMenuModel({ absolutePath: '/repo/a.txt', apps: [], appsState: state, t: en }).sections.flat()
  // While the query runs the editor row keeps its slot (so rows below do not jump)
  // but carries a neutral label instead of "no preferred application".
  const loadingEditor = rows('loading').find(row => row.id === 'editor')
  assert.equal(loadingEditor.label, en.editorPending)
  assert.equal(loadingEditor.disabled, true)
  // The submenu keeps a disabled slot while the query runs, so the rows below it
  // stay put when the answer lands.
  const loadingOpenWith = rows('loading').find(row => row.id === 'openWith')
  assert.equal(loadingOpenWith.label, en.openWith)
  assert.equal(loadingOpenWith.disabled, true)
  assert.equal(loadingOpenWith.children, undefined)
  // A failed lookup is not actionable — the Host query throws when one registered
  // handler is broken — so the menu offers nothing rather than a retry that cannot
  // succeed. An empty answer has nothing to list either.
  for (const state of ['failed', 'ready']) {
    assert.equal(rows(state).some(row => row.id === 'editor'), false, state)
    assert.equal(rows(state).some(row => row.id === 'openWith'), false, state)
  }
  assert.equal(rows('failed').some(row => row.action === 'retryApps'), false)
  // With a real association list the editor shortcut comes back next to the submenu.
  const ready = api.buildMenuModel({
    absolutePath: '/repo/a.txt', appsState: 'ready', t: en,
    apps: [{ id: 'code', name: 'Visual Studio Code', default: true, icon: null }],
  }).sections.flat()
  assert.equal(ready.find(row => row.id === 'editor').label, 'Open in Visual Studio Code')
  assert.equal(ready.find(row => row.id === 'openWith').children.length, 1)
})

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

test('bridge distinguishes empty applications, query errors, missing files and missing services', async () => {
  const bridge = api.createBridge({ remote: { session: { workspacePathApplications: async () => ({ ok: true, value: [] }) },
    workspaceFiles: { stat: async () => ({ ok: false, error: { code: 'workspace-file/not-found' } }),
      list: async () => ({ ok: false }) } } })
  same(await bridge.applications('/a'), { state: 'ready', apps: [] })
  same(await bridge.probe('s', '/a'), { error: 'notFound' })
  const absent = api.createBridge({ remote: {} })
  same(await absent.applications('/a'), { state: 'failed', apps: [] })
  same(await absent.probe('s', '/a'), { error: 'unavailable' })
  const failed = api.createBridge({ remote: { session: { workspacePathApplications: async () => ({ ok: false }) } } })
  same(await failed.applications('/a'), { state: 'failed', apps: [] })
})

// A reference like `src/app.ts:42:7` names a line; the menu shows and copies it.
test('a located reference shows its line and copies the reference verbatim', () => {
  const located = api.buildMenuModel({
    absolutePath: 'D:\\repo\\src\\app.ts', displayPath: 'src/app.ts', isDir: false, apps: [], bytes: 2048,
    cwd: 'D:\\repo', t: zh, location: { line: 42, column: 7 }, reference: 'src/app.ts:42:7',
  })
  const ids = located.sections.flat().map((item) => item.id)
  assert.equal(ids.includes('copyReference'), true)
  assert.equal(ids.includes('copyFileName'), true)
  assert.match(located.meta, /第 42 行/)
  assert.equal(located.meta.split(' · ')[0], '第 42 行')

  const plain = api.buildMenuModel({
    absolutePath: 'D:\\repo\\src\\app.ts', displayPath: 'src/app.ts', isDir: false, apps: [], bytes: 2048,
    cwd: 'D:\\repo', t: zh,
  })
  const plainIds = plain.sections.flat().map((item) => item.id)
  assert.equal(plainIds.includes('copyReference'), false)
  assert.doesNotMatch(plain.meta, /行/)

  assert.equal(api.formatLocation({ line: 42 }, zh), '第 42 行')
  assert.equal(api.formatLocation({ line: 42, endLine: 48 }, zh), '第 42–48 行')
  assert.equal(api.formatLocation({ line: 42, endLine: 42 }, zh), '第 42 行')
  assert.equal(api.formatLocation({}, zh), '')
  assert.equal(api.formatLocation({ line: 42 }, en), 'line 42')
  assert.equal(api.formatLocation({ line: 42, endLine: 48 }, en), 'lines 42–48')
})

test('a link with visible text can be copied as Markdown', () => {
  const withText = api.buildLinkMenuModel({ url: 'https://github.com/x/y', text: 'v0.1.11', t: zh })
  const ids = withText.sections.flat().map((item) => item.id)
  assert.equal(ids.join(','), 'openLink,copyLink,copyLinkText,copyMarkdown')

  const withoutText = api.buildLinkMenuModel({ url: 'https://github.com/x/y', text: '   ', t: zh })
  assert.equal(withoutText.sections.flat().some((item) => item.id === 'copyMarkdown'), false)
})
// Every glyph a menu asks for must exist; a typo would render the literal string
// "undefined" inside the SVG and silently blank the row icon.
test('every menu row names an icon that exists', () => {
  const fileMenu = api.buildMenuModel({
    absolutePath: 'D:\\repo\\src\\a.ts', displayPath: 'src/a.ts', isDir: false, bytes: 10,
    apps: [{ id: 'vscode', name: 'VS Code', default: true, icon: null }], appsState: 'ready',
    cwd: 'D:\\repo', t: zh, location: { line: 42 }, reference: 'src/a.ts:42',
  })
  const linkMenu = api.buildLinkMenuModel({ url: 'https://github.com/x/y', text: 'v0.1.12', t: zh })
  const names = [...fileMenu.sections, ...linkMenu.sections]
    .flat()
    .flatMap((item) => [item.icon, ...(item.children || []).map((child) => child.icon)])
    .filter(Boolean)
  assert.ok(names.length >= 10, `expected a full menu, got ${names.join(',')}`)
  for (const name of names) {
    assert.equal(typeof api.ICON_PATHS[name], 'string', `missing icon: ${name}`)
    assert.match(api.ICON_PATHS[name], /^<path|<rect|<circle/, `empty icon: ${name}`)
  }
  const svg = api.iconSvg('nope')
  assert.doesNotMatch(svg, /undefined/)
  assert.match(svg, /viewBox="0 0 24 24"/)
  assert.equal(api.iconSvg('link'), svg.replace(/<path[^>]*\/><path[^>]*\/>/, api.ICON_PATHS.link) === svg ? svg : api.iconSvg('link'))
})

test('the preference pin is the drawn star glyph, not a text character', () => {
  const svg = api.iconSvg('star')
  assert.match(svg, /viewBox="0 0 24 24"/)
  assert.match(svg, /stroke-width="1\.9"/)
  // ★/☆ inherit whatever font the page loaded, so their weight and size never
  // matched the row icons; the pin has to come from the same 24-grid set.
  assert.doesNotMatch(source, /'[★☆]'|"[★☆]"/)
  assert.match(source, /pin\.innerHTML = iconSvg\('star'\)/)
})

test('the menu clips its children so the sticky submenu header cannot square the corners', () => {
  const rule = source.match(/\.dfa-menu\{([\s\S]*?)\}/)
  assert.ok(rule, 'the .dfa-menu rule is missing')
  // The header is sticky with an opaque background and negative margins; without the
  // clip it paints over the rounded top corners until the scroll fade masks it.
  assert.match(rule[1], /overflow:hidden/)
  assert.match(source, /\.dfa-subhead\{position:sticky/)
})

test('the preview block clips its image instead of letting it overflow the header', () => {
  const thumb = source.match(/\.dfa-thumb\{([\s\S]*?)\}/)
  assert.ok(thumb, 'the .dfa-thumb rule is missing')
  assert.match(thumb[1], /overflow:hidden/)
  assert.match(thumb[1], /border-radius/)
  const img = source.match(/\.dfa-thumb img\{([\s\S]*?)\}/)
  assert.ok(img, 'the .dfa-thumb img rule is missing')
  // A percentage max-height inside the grid did not constrain a decoded frame — a
  // 188px video poster overflowed a 137px box and covered the file name row.
  assert.match(img[1], /position:absolute/)
  assert.match(img[1], /object-fit:contain/)
})

test('the link menu uses distinct, meaningful glyphs', () => {
  const model = api.buildLinkMenuModel({ url: 'https://github.com/x/y', text: 'v0.1.12', t: zh })
  const icons = model.sections.flat().map((item) => `${item.id}:${item.icon}`)
  assert.equal(icons.join(','), 'openLink:external,copyLink:link,copyLinkText:text,copyMarkdown:markdown')
})

// Every file type the classifier can produce needs its own glyph and tile colour:
// a missing entry used to fall back to the document icon, which read as "unknown".
test('each file kind has a glyph and a tile hue', () => {
  const table = {
    'a.ts': 'code', 'a.py': 'code', 'a.json': 'data', 'a.yaml': 'data', 'a.csv': 'data',
    'a.srt': 'subtitle', 'a.vtt': 'subtitle',
    'a.ttf': 'font', 'a.woff2': 'font',
    'a.psd': 'design', 'a.fig': 'design',
    'a.blend': 'model', 'a.glb': 'model',
    'a.iso': 'disk', 'a.vhd': 'disk',
    'a.exe': 'exec', 'a.msi': 'exec', 'a.wasm': 'exec',
    'a.mp4': 'video', 'a.mkv': 'video',
    'a.mp3': 'audio', 'a.flac': 'audio',
    'a.txt': 'text', 'a.md': 'markdown', 'a.html': 'html', 'a.pdf': 'pdf',
    'a.png': 'image', 'a.docx': 'office', 'a.zip': 'archive', 'a.unknown-ext': 'binary',
  }
  for (const [name, kind] of Object.entries(table)) {
    assert.equal(api.classify(name, false).kind, kind, name)
  }
  assert.equal(api.classify('some-folder', true).kind, 'dir')

  const kinds = new Set(Object.values(table).concat(['dir', 'link']))
  for (const kind of kinds) {
    assert.equal(typeof api.KIND_ICONS[kind], 'string', 'missing glyph mapping: ' + kind)
    assert.equal(typeof api.ICON_PATHS[api.KIND_ICONS[kind]], 'string', 'missing glyph: ' + kind)
    assert.ok(api.CSS.includes('.dfa-tile[data-kind="' + kind + '"]'), 'missing tile hue: ' + kind)
  }
})

test('video files preview a poster frame instead of the generic tile', () => {
  const video = api.buildMenuModel({
    absolutePath: 'D:\\repo\\out\\成片.mp4', displayPath: 'out/成片.mp4', isDir: false, apps: [], bytes: 4096,
    cwd: 'D:\\repo', t: zh,
  })
  assert.equal(video.kind, 'video')
  assert.equal(video.kindLabel, '视频')
  assert.equal(video.preview, true)
  assert.equal(video.sections.flat().some((item) => item.id === 'browser'), true)
})

// A duplicated key is silent at runtime — the last one wins — so it survives code
// review and slowly rots the dictionaries. Catch it statically instead.
test('the ZH and EN dictionaries have no duplicate keys', () => {
  const blockOf = (name) => {
    const start = source.indexOf(`const ${name} = {`)
    assert.ok(start >= 0, `missing ${name}`)
    let depth = 0
    for (let at = source.indexOf('{', start); at < source.length; at += 1) {
      if (source[at] === '{') depth += 1
      else if (source[at] === '}') {
        depth -= 1
        if (depth === 0) return source.slice(start, at + 1)
      }
    }
    throw new Error(`unbalanced ${name}`)
  }
  const duplicates = (text, indent) => {
    const keys = [...text.matchAll(new RegExp(`^\\s{${indent}}([A-Za-z][\\w]*)\\s*:`, 'gm'))].map((match) => match[1])
    return keys.filter((key, at) => keys.indexOf(key) !== at)
  }
  for (const name of ['ZH', 'EN']) {
    const text = blockOf(name)
    assert.deepEqual(duplicates(text, 4), [], `${name}: duplicate top-level key`)
    const kindsAt = text.indexOf('kinds: {')
    assert.ok(kindsAt >= 0, `${name}: missing kinds`)
    const kinds = text.slice(kindsAt, text.indexOf('},', kindsAt))
    assert.deepEqual(duplicates(kinds, 6), [], `${name}: duplicate kind key`)
  }
})
