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

test('save as reads the whole file, with no window', async () => {
  const calls = []
  const bridge = {
    readBytes: async (_sessionId, _path, options) => {
      calls.push(options)
      return { data: new Uint8Array(3), eof: true }
    },
  }
  await api.dispatch({ action: 'saveAs' }, { absolutePath: 'D:\\r\\a.ts', displayPath: 'a.ts' }, { bridge, t: zh, sessionId: 's' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].range, undefined)
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
  assert.equal(inside.kindLabel, '文本')

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

test('subtitles, video and audio are classified for the menu', () => {
  for (const name of ['a.srt', 'a.ass', 'a.ssa', 'a.vtt', 'a.lrc']) {
    const kind = api.classify(name, false)
    assert.equal(kind.kind, 'text', name)
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
  assert.equal(api.classify('a.psd', false).kind, 'binary')
  assert.equal(api.classify('a.ipynb', false).kind, 'text')
  assert.equal(api.mimeOf('a.mp4'), 'video/mp4')
  assert.equal(api.mimeOf('a.mp3'), 'audio/mpeg')
})

test('a video file gets the browser row, a subtitle file the copy row', () => {
  const video = api.buildMenuModel({
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
  assert.equal(subtitle.kindLabel, '文本')
})
