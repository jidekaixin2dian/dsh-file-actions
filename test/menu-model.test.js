import { test } from 'node:test'
import assert from 'node:assert/strict'
import { same, bundleSource as source, clientApi as api, zh, en } from './helpers/client-bundle.js'

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
  assert.equal(api.classify('a.svg', false).kind, 'svg')
  assert.equal(api.classify('a.xlsx', false).kind, 'sheet')
  assert.equal(api.classify('a.pptx', false).kind, 'slides')
  assert.equal(api.classify('a.db', false).kind, 'database')
  assert.equal(api.classify('a.epub', false).kind, 'ebook')
  assert.equal(api.classify('a.et', false).kind, 'sheet')
  assert.equal(api.classify('a.ps1', false).kind, 'script')
  assert.equal(api.classify('a.bat', false).kind, 'script')
  assert.equal(api.classify('a.exe', false).kind, 'exec')
  assert.equal(api.classify('a.msix', false).kind, 'exec')
  assert.equal(api.classify('a.reg', false).kind, 'data')
  assert.equal(api.classify('a.ps1', false).canCopyText, true)
  assert.equal(api.classify('a.exe', false).canCopyText, false)
  assert.equal(api.classify('a.heic', false).canBrowser, false)
  assert.equal(api.classify('a.png', false).canBrowser, true)
  assert.equal(api.classify('a.ps1xml', false).kind, 'data')
  assert.equal(api.classify('a.psd1', false).kind, 'data')
  assert.equal(api.classify('Dockerfile', false).kind, 'text')
  assert.equal(api.classify('Makefile', false).kind, 'text')
  assert.equal(api.classify('a.wav', false).canBrowser, true)
  assert.equal(api.classify('a.ape', false).canBrowser, false)
  assert.equal(api.classify('a.pdf', false).kind, 'pdf')
  assert.equal(api.classify('a.md', false).kind, 'markdown')
  assert.equal(api.classify('a.docx', false).kind, 'office')
  assert.equal(api.classify('a.zip', false).kind, 'archive')

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

test('soft sources must look like a real file', () => {
  assert.equal(api.softPath('src/app.ts'), true)
  assert.equal(api.softPath('D:\\repo\\a.ts'), true)
  assert.equal(api.softPath('2026/10/22 12:00'), false)
  assert.equal(api.softPath('2/3 files'), false)
  assert.equal(api.softPath('src/app.ts · 2.1 KB'), false)
  assert.equal(api.softPath(''), false)
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
  assert.equal(api.classify('a.ipynb', false).kind, 'notebook')
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

test('a link with visible text can be copied as Markdown', () => {
  const withText = api.buildLinkMenuModel({ url: 'https://github.com/x/y', text: 'v0.1.11', t: zh })
  const ids = withText.sections.flat().map((item) => item.id)
  assert.equal(ids.join(','), 'openLink,copyLink,copyLinkText,copyMarkdown')

  const withoutText = api.buildLinkMenuModel({ url: 'https://github.com/x/y', text: '   ', t: zh })
  assert.equal(withoutText.sections.flat().some((item) => item.id === 'copyMarkdown'), false)
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

test('reference preview bounds context and preserves only actual lines', () => {
  const preview = api.referenceContext('one\r\ntwo\r\nthree\r\n', { line: 2 })
  same(preview.rows.map(row => [row.line, row.text, row.selected]), [[1,'one',false],[2,'two',true],[3,'three',false]])
  assert.equal(api.referenceContext('a\n', { line: 2 }), null)
  assert.equal(api.referenceContext('', { line: 1 }), null)
  const huge = api.referenceContext('x\n'.repeat(250), { line: 2, endLine: 240 })
  assert.equal(huge.rows.length, 80)
  assert.equal(huge.clipped, true)
  assert.equal(api.referenceContext('x'.repeat(10000), { line: 1 }).rows[0].text.length, 2401)
})

test('source excerpts include relative location and selected original text with safe fences', () => {
  const target = { absolutePath: '/repo/file.md', displayPath: 'file.md', line: 2, endLine: 3 }
  assert.equal(api.sourceExcerpt('context\r\n```js\r\nchosen\r\nafter', target), 'file.md#L2-L3\n\n````\n```js\r\nchosen\n````')
  assert.equal(api.sourceExcerpt('a\nb', { ...target, endLine: 6 }), null)
  assert.equal(api.sourceExcerpt('\n\n', { ...target, line: 1, endLine: 1 }), 'file.md#L1\n\n```\n\n```')
  assert.ok(api.sourceExcerpt('`x '.repeat(100000), { ...target, line: 1, endLine: 1 }).endsWith('\n```'))
})

test('compact menus retain useful operations and default full menus are unchanged', () => {
  const input = { absolutePath: '/repo/a.txt', displayPath: 'a.txt', location: { line: 5 }, reference: 'a.txt:5', t: en }
  const full = api.buildMenuModel(input).sections.flat().map(row => row.id)
  const compact = api.buildMenuModel({ ...input, menuMode: 'compact' }).sections.flat().map(row => row.id)
  for (const id of ['open','reveal','copyPath','copyContents','copyLines','referencePreview','saveAs']) assert.ok(compact.includes(id), id)
  assert.ok(full.includes('copyFileName')); assert.ok(!compact.includes('copyFileName'))
  assert.ok(!compact.includes('copyReference'))
  assert.equal(api.buildLinkMenuModel({ url: 'https://example.com', text: 'Example', menuMode: 'compact' }).sections.flat().length, 2)
})

test('a silent application open is only reported when nothing took focus', () => {
  assert.equal(api.shouldHintSilentOpen(true, true), true)
  assert.equal(api.shouldHintSilentOpen(true, false), false)
  assert.equal(api.shouldHintSilentOpen(false, true), false)
  assert.equal(api.shouldHintSilentOpen(undefined, true), false)
  assert.ok(zh.openNoEffect && en.openNoEffect)
  assert.notEqual(zh.openNoEffect, en.openNoEffect)
})
