import { test } from 'node:test'
import assert from 'node:assert/strict'
import { same, bundleSource as source, clientApi as api, zh } from './helpers/client-bundle.js'

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

// A file without a poster used to paint a ~100px empty panel over a nine-row menu.
test('a preview with nothing to show stops reserving a frame', () => {
  const rule = source.match(/\.dfa-thumb\[data-state="empty"\]\{([\s\S]*?)\}/)
  assert.ok(rule, 'the empty preview rule is missing')
  assert.match(rule[1], /height:auto/)
  assert.match(rule[1], /border:0/)
  // Loading keeps the frame so the menu does not grow under the pointer; only a
  // finished answer with no poster collapses.
  assert.match(source, /wrap\.dataset\.state = url \? 'ready' : this\.thumbnailDone \? 'empty' : 'loading'/)
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
    'a.svg': 'svg', 'a.xlsx': 'sheet', 'a.pptx': 'slides', 'a.ipynb': 'notebook',
    'a.sqlite': 'database', 'a.epub': 'ebook', 'a.wps': 'office', 'a.dps': 'slides',
    'a.exe': 'exec', 'a.ps1': 'script', 'a.reg': 'data', 'a.msix': 'exec',
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

// A duplicated key is silent at runtime — the last one wins — so it survives code
// review and slowly rots the dictionaries. Catch it statically instead.
function dictionaryBlock(name) {
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

test('the ZH and EN dictionaries have no duplicate keys', () => {
  const duplicates = (text, indent) => {
    const keys = [...text.matchAll(new RegExp(`^\\s{${indent}}([A-Za-z][\\w]*)\\s*:`, 'gm'))].map((match) => match[1])
    return keys.filter((key, at) => keys.indexOf(key) !== at)
  }
  for (const name of ['ZH', 'EN']) {
    const text = dictionaryBlock(name)
    assert.deepEqual(duplicates(text, 4), [], `${name}: duplicate top-level key`)
    const kindsAt = text.indexOf('kinds: {')
    assert.ok(kindsAt >= 0, `${name}: missing kinds`)
    const kinds = text.slice(kindsAt, text.indexOf('},', kindsAt))
    assert.deepEqual(duplicates(kinds, 6), [], `${name}: duplicate kind key`)
  }
})

// A string added to one language only renders as `undefined` in the other, and a
// status row is exactly where nobody looks twice. Keep the two key sets equal.
test('the ZH and EN dictionaries carry the same keys', () => {
  const topLevel = (text) => [...text.matchAll(/^\s{4}([A-Za-z][\w]*)\s*:/gm)].map((match) => match[1]).sort()
  assert.deepEqual(topLevel(dictionaryBlock('EN')), topLevel(dictionaryBlock('ZH')))
})
