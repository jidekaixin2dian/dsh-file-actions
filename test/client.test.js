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

function loadBundle() {
  let captured = null
  const sandbox = {
    window: { __ModuleLoader__: { load: (definition) => { captured = definition } } },
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
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
  assert.equal(text.kind, 'text')
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
  assert.equal(api.classify('a.exe', false).kind, 'binary')
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
  assert.equal(model.kind, 'text')
  assert.match(model.meta, /文本/)
  assert.match(model.meta, /2\.0 KB/)

  const ids = model.sections.flat().map((item) => item.id)
  assert.equal(ids.join(','), 'open,editor,openWith,reveal,copyPath,copyRelPath,copyContents,saveAs')

  const openWith = model.sections.flat().find((item) => item.id === 'openWith')
  assert.equal(openWith.children.length, 2)
  assert.equal(openWith.children[1].checked, true)
  assert.equal(openWith.children[0].label, 'Visual Studio Code')
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
