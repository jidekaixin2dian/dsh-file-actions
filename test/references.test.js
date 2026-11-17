import { test } from 'node:test'
import assert from 'node:assert/strict'
import { same, clientApi as api, zh, en } from './helpers/client-bundle.js'

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

test('new file kinds remain discoverable as bare filenames', () => {
  for (const name of ['预算.xlsx', 'slides.pptx', 'book.epub', 'notes.ipynb', 'data.sqlite', 'setup.msix', 'task.vbs']) {
    assert.equal(api.looksLikePath(name), true, name)
  }
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

test('isInside compares a root and a path case-insensitively', () => {
  assert.equal(api.isInside('D:\\repo', 'D:\\repo\\src\\a.ts'), true)
  assert.equal(api.isInside('D:\\repo', 'D:\\repo'), true)
  assert.equal(api.isInside('D:\\repo', 'D:\\repo2\\a.ts'), false)
  assert.equal(api.isInside('D:\\repo', 'D:\\other\\a.ts'), false)
  assert.equal(api.isInside('/home/me/repo', '/home/me/repo/a.ts'), true)
  assert.equal(api.isInside('', 'D:\\a'), false)
})

test('POSIX backslashes remain filename characters, not workspace separators', () => {
  const sibling = '/tmp/repo\\secret.txt'
  assert.equal(api.isInside('/tmp/repo', sibling), false)
  assert.equal(api.relativeTo('/tmp/repo', sibling), '')
  assert.equal(api.isInside('/tmp/repo', '/tmp/repo/secret.txt'), true)
})

test('a home-relative path keeps its tilde when decorations are stripped', () => {
  assert.equal(api.stripDecorations('~/repo/a.txt'), '~/repo/a.txt')
  assert.equal(api.stripDecorations('📄发布文案.md'), '发布文案.md')
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

test('linkFromHref only accepts http(s)', () => {
  assert.equal(api.linkFromHref('https://github.com/x'), 'https://github.com/x')
  assert.equal(api.linkFromHref('http://a.example/b'), 'http://a.example/b')
  assert.equal(api.linkFromHref('mailto:a@b.c'), '')
  assert.equal(api.linkFromHref('javascript:alert(1)'), '')
  assert.equal(api.linkFromHref('file:///C:/a.ts'), '')
  assert.equal(api.linkFromHref('/local/path'), '')
  assert.equal(api.linkFromHref(''), '')
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

test('reference preview is offered only for located text files', () => {
  const rows = (file, location) => api.buildMenuModel({ absolutePath: file, location, t: en }).sections.flat()
  const row = rows('/repo/note.md', { line: 2 }).find(row => row.action === 'referencePreview')
  assert.equal(row.keepOpen, true)
  for (const [file, location] of [['/note.md', undefined], ['/img.png', { line: 2 }], ['/a.txt', { line: 0 }]]) {
    assert.ok(!rows(file, location).some(row => row.action === 'referencePreview'))
  }
})
