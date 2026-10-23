// dsh-file-actions — file and link actions (web bundle, ModuleLoader CJS).
//
// Every file reference the Web GUI renders (inline-code links in the closing
// prose, delivery cards, changed-file rows, tool-call rows, the right Sidebar
// file tree, the review tab) is a plain DOM node carrying the Host path in a
// title/data attribute or as its visible text. This module listens for
// `contextmenu` in the capture phase, resolves that node to a real Host path
// through the shipped Remotes, and replaces Chromium's link menu with one that
// acts on the file.
//
// No host half is needed: opening and revealing go through
// `session.openWorkspacePath` (the same Session-authorized route the document
// preview uses), file associations through `session.workspacePathApplications`,
// and contents/save-as through `workspaceFiles.readBytes`. All three validate
// the path against the composed filesystem before touching the desktop.
// DSH concatenates classic bundles; every registration needs its own scope.
;(() => {
const factory = () => {
  const module = { exports: {} }
  const exports = module.exports
  Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

  const MENU_ATTR = 'data-dfa-menu'
  const ITEM_ATTR = 'data-dfa-item'
  // One live install per page: a second materialization (HMR, a re-enabled row)
  // would otherwise register a second contextmenu listener and open two menus.
  let activeCleanup = null

  /* ─────────────────────────────── copy ─────────────────────────────── */

  const ZH = {
    open: '打开文件',
    openFolder: '打开文件夹',
    openIn: (name) => `在 ${name} 中打开`,
    openWith: '打开方式',
    reveal: '在资源管理器中显示',
    revealFolder: '在资源管理器中打开',
    browser: '在浏览器中打开',
    copyPath: '复制路径',
    copyRelPath: '复制相对路径',
    copyFileName: '复制文件名',
    copyReference: '复制引用',
    copyMarkdown: '复制为 Markdown',
    copyContents: '复制文件内容',
    saveAs: '另存为…',
    copiedPath: '路径已复制',
    copiedRelPath: '相对路径已复制',
    copiedFileName: '文件名已复制',
    copiedReference: '引用已复制',
    copiedMarkdown: 'Markdown 已复制',
    lineAt: '第 {line} 行',
    lineRange: '第 {from}–{to} 行',
    copiedContents: '文件内容已复制',
    copyFailed: '复制失败',
    readFailed: '读取失败',
    tooLarge: '文件过大，请改用「另存为」',
    binary: '二进制文件，无法复制为文本',
    openFailed: '打开失败',
    revealFailed: '无法定位该文件',
    popupBlocked: '浏览器拦截了新窗口',
    noSession: '没有可用的会话',
    loading: '正在读取…',
    dir: '文件夹',
    notFound: '找不到该文件',
    outsideWorkspace: '工作区外',
    defaultApp: '默认',
    appsUnit: '个应用',
    openLink: '打开链接',
    copyLink: '复制链接',
    copyLinkText: '复制链接文字',
    copiedLink: '链接已复制',
    copiedLinkText: '链接文字已复制',
    keysMove: '↑↓ 选择',
    keysRun: 'Enter 执行',
    keysClose: 'Esc 关闭',
    searchApps: '搜索应用…',
    noMatch: '没有匹配的应用',
    appsLoading: '正在查询关联应用…',
    appsEmpty: '没有关联应用',
    appsFailed: '应用查询失败，点击重试',
    preferred: '首选',
    pinApp: '设为此文件类型的首选应用',
    unpinApp: '取消此文件类型的首选应用',
    pinHint: 'Shift+Enter 设置或取消首选',
    preferenceSaved: '首选应用已保存',
    preferenceCleared: '已恢复自动选择应用',
    preferenceFailed: '无法保存首选应用，请检查浏览器存储设置',
    noPreferred: '未选择首选应用',
    previewLoading: '正在读取缩略图…',
    previewUnavailable: '无可用缩略图',
    checking: '正在确认文件…',
    unavailable: '文件服务不可用',
    denied: '没有权限访问该文件',
    probeFailed: '无法确认文件，请检查连接或权限',
    retry: '重试',
    nativeHint: 'Shift+右键 使用原生菜单',
    kinds: {
      text: '文本',
      markdown: 'Markdown',
      html: '网页',
      pdf: 'PDF',
      image: '图片',
      office: 'Office 文档',
      archive: '压缩包',
      video: '视频',
      audio: '音频',
      link: '链接',
      binary: '二进制',
      dir: '文件夹',
    },
  }

  const EN = {
    open: 'Open file',
    openFolder: 'Open folder',
    openIn: (name) => `Open in ${name}`,
    openWith: 'Open with',
    reveal: 'Reveal in File Explorer',
    revealFolder: 'Reveal in File Explorer',
    browser: 'Open in browser',
    copyPath: 'Copy path',
    copyRelPath: 'Copy relative path',
    copyFileName: 'Copy file name',
    copyReference: 'Copy reference',
    copyMarkdown: 'Copy as Markdown',
    copyContents: 'Copy file contents',
    saveAs: 'Save as…',
    copiedPath: 'Path copied',
    copiedRelPath: 'Relative path copied',
    copiedFileName: 'File name copied',
    copiedReference: 'Reference copied',
    copiedMarkdown: 'Markdown copied',
    lineAt: 'line {line}',
    lineRange: 'lines {from}–{to}',
    copiedContents: 'File contents copied',
    copyFailed: 'Copy failed',
    readFailed: 'Read failed',
    tooLarge: 'File is too large — use Save as',
    binary: 'Binary file cannot be copied as text',
    openFailed: 'Open failed',
    revealFailed: 'Could not reveal this file',
    popupBlocked: 'The browser blocked the new window',
    noSession: 'No active session',
    loading: 'Reading…',
    dir: 'Folder',
    notFound: 'File not found',
    outsideWorkspace: 'Outside workspace',
    defaultApp: 'Default',
    appsUnit: 'apps',
    openLink: 'Open link',
    copyLink: 'Copy link',
    copyLinkText: 'Copy link text',
    copiedLink: 'Link copied',
    copiedLinkText: 'Link text copied',
    keysMove: '↑↓ select',
    keysRun: 'Enter run',
    keysClose: 'Esc close',
    searchApps: 'Search apps…',
    noMatch: 'No matching app',
    appsLoading: 'Finding applications…',
    appsEmpty: 'No associated applications',
    appsFailed: 'Application lookup failed — retry',
    preferred: 'Preferred',
    pinApp: 'Prefer this application for this file type',
    unpinApp: 'Clear the preferred application for this file type',
    pinHint: 'Shift+Enter to set or clear preference',
    preferenceSaved: 'Preferred application saved',
    preferenceCleared: 'Automatic application selection restored',
    preferenceFailed: 'Could not save preference; check browser storage settings',
    noPreferred: 'No preferred application',
    previewLoading: 'Loading thumbnail…',
    previewUnavailable: 'No thumbnail available',
    checking: 'Checking file…',
    unavailable: 'File service unavailable',
    denied: 'Permission to access this file was denied',
    probeFailed: 'Could not verify file; check connection or permissions',
    retry: 'Retry',
    nativeHint: 'Shift+right-click for the native menu',
    kinds: {
      text: 'Text',
      markdown: 'Markdown',
      html: 'Web page',
      pdf: 'PDF',
      image: 'Image',
      office: 'Office document',
      archive: 'Archive',
      video: 'Video',
      audio: 'Audio',
      link: 'Link',
      binary: 'Binary',
      dir: 'Folder',
    },
  }

  function messages(lang) {
    return /^zh/i.test(String(lang || '')) ? ZH : EN
  }

  /* ───────────────────────────── path helpers ───────────────────────── */

  const TEXT_EXT = new Set([
    // documents, data, config
    'txt', 'md', 'markdown', 'mdx', 'rst', 'log', 'csv', 'tsv', 'json', 'jsonc', 'json5', 'jsonl', 'ndjson',
    'har', 'xml', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'env', 'properties', 'plist', 'lock',
    // subtitles and captions
    'srt', 'ass', 'ssa', 'vtt', 'sub', 'sbv', 'lrc',
    // web
    'js', 'mjs', 'cjs', 'jsx', 'ts', 'mts', 'cts', 'tsx', 'vue', 'svelte', 'astro', 'html', 'htm', 'xhtml',
    'svg', 'css', 'scss', 'sass', 'less', 'styl', 'hbs', 'ejs', 'pug', 'twig', 'liquid', 'njk',
    // languages
    'py', 'pyi', 'ipynb', 'rb', 'php', 'go', 'rs', 'java', 'kt', 'kts', 'scala', 'groovy',
    'clj', 'cljs', 'ex', 'exs', 'erl', 'hrl', 'hs', 'elm', 'lua', 'pl', 'r', 'jl', 'dart', 'swift', 'm', 'mm',
    'fs', 'fsx', 'cs', 'vb', 'pas', 'f90', 'for', 'asm', 's', 'v', 'sv', 'vhd', 'vhdl',
    'c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'hh', 'hxx',
    // shells, build, schemas
    'sh', 'bash', 'zsh', 'fish', 'ps1', 'psm1', 'bat', 'cmd', 'sql', 'graphql', 'gql', 'proto', 'thrift', 'prisma',
    'diff', 'patch', 'cmake', 'mk', 'ninja', 'bazel', 'bzl', 'gradle', 'tf', 'tfvars',
    // shaders, typesetting
    'glsl', 'hlsl', 'wgsl', 'frag', 'vert', 'comp', 'shader', 'mtl', 'tex', 'bib', 'rtf',
  ])
  const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif', 'tif', 'tiff', 'heic', 'heif', 'jfif'])
  const HTML_EXT = new Set(['html', 'htm', 'xhtml', 'svg'])
  const PDF_EXT = new Set(['pdf'])
  const MD_EXT = new Set(['md', 'markdown', 'mdx'])
  const OFFICE_EXT = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'pages', 'numbers', 'key'])
  const ARCHIVE_EXT = new Set(['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'zst'])
  const VIDEO_EXT = new Set(['mp4', 'm4v', 'mov', 'webm', 'ogv', 'mkv', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', '3gp', 'mts', 'm2ts'])
  const AUDIO_EXT = new Set(['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wma', 'aiff', 'mid', 'midi'])
  // Chromium can play these in a blob tab; the rest only get external actions.
  const BROWSER_VIDEO = new Set(['mp4', 'm4v', 'mov', 'webm', 'ogv'])
  const BROWSER_AUDIO = new Set(['mp3', 'wav', 'flac', 'm4a', 'ogg', 'oga', 'opus'])

  const KNOWN_EXT = new Set([...TEXT_EXT, ...IMAGE_EXT, ...PDF_EXT, ...OFFICE_EXT, ...ARCHIVE_EXT, ...VIDEO_EXT, ...AUDIO_EXT,
    // binaries and assets whose names still deserve a menu
    'wasm', 'map', 'lockb', 'db', 'sqlite', 'sqlite3', 'parquet', 'arrow', 'avro', 'orc',
    'woff', 'woff2', 'ttf', 'otf', 'ttc', 'eot', 'fon', 'icns', 'cur',
    'psd', 'ai', 'eps', 'indd', 'fig', 'sketch', 'xd', 'blend', 'fbx', 'obj', 'glb', 'gltf', 'stl',
    'step', 'stp', 'iges', 'igs', '3ds', 'max', 'c4d', 'ma', 'mb', 'abc', 'usd', 'usdz',
    'iso', 'dmg', 'img', 'vhd', 'vhdx', 'vmdk', 'exe', 'msi', 'dll', 'so', 'dylib', 'bin', 'dat', 'pak',
    'class', 'jar', 'war', 'apk', 'ipa', 'deb', 'rpm', 'appimage', 'raw', 'cr2', 'nef', 'arw', 'dng'])

  const MIME = {
    html: 'text/html;charset=utf-8', htm: 'text/html;charset=utf-8', xhtml: 'application/xhtml+xml',
    svg: 'image/svg+xml', pdf: 'application/pdf', md: 'text/plain;charset=utf-8',
    markdown: 'text/plain;charset=utf-8', mdx: 'text/plain;charset=utf-8',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
    bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif', tif: 'image/tiff', tiff: 'image/tiff',
    json: 'application/json', txt: 'text/plain;charset=utf-8',
    mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', ogv: 'video/ogg',
    mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac',
    ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg',
  }

  /** An absolute http(s) URL, or '' for anything else (mailto:, blob:, javascript:). */
  function linkFromHref(href) {
    const value = String(href || '').trim()
    if (!/^https?:\/\//i.test(value)) return ''
    try {
      const url = new URL(value)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
      return url.href
    } catch {
      return ''
    }
  }

  function isAbsolutePath(value) {
    return /^(?:[A-Za-z]:[\\/]|\\\\[^\\]|\/)/.test(String(value || ''))
  }

  function normalizeSlashes(value) {
    return String(value || '').replace(/\\/g, '/')
  }

  function basename(value) {
    const s = normalizeSlashes(value).replace(/\/+$/, '')
    const at = s.lastIndexOf('/')
    return at === -1 ? s : s.slice(at + 1)
  }

  function extname(value) {
    const name = basename(value)
    const at = name.lastIndexOf('.')
    if (at <= 0) return ''
    return name.slice(at + 1).toLowerCase()
  }

  function formatBytes(bytes) {
    const n = Number(bytes)
    if (!Number.isFinite(n) || n < 0) return ''
    if (n < 1024) return `${n} B`
    const units = ['KB', 'MB', 'GB', 'TB']
    let value = n / 1024
    let unit = 0
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024
      unit += 1
    }
    return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
  }

  /** `src/app.ts:12:3` and `src/app.ts#L12-L20` both name one file plus a location. */
  function stripLocationSuffix(value) {
    let path = String(value || '').trim()
    const hash = path.match(/#L(\d+)(?:-L?(\d+))?$/)
    if (hash) {
      return {
        path: path.slice(0, hash.index),
        line: Number(hash[1]),
        endLine: hash[2] === undefined ? undefined : Number(hash[2]),
      }
    }
    const colon = path.match(/:(\d+)(?::(\d+))?$/)
    if (colon) {
      const head = path.slice(0, colon.index)
      // A bare drive prefix (`C:`) is not a location suffix.
      if (!/^[A-Za-z]:$/.test(head)) {
        return {
          path: head,
          line: Number(colon[1]),
          column: colon[2] === undefined ? undefined : Number(colon[2]),
        }
      }
    }
    return { path }
  }

  function joinPath(cwd, relative) {
    if (!cwd) return relative
    const base = String(cwd).replace(/[\\/]+$/, '')
    const rest = String(relative).replace(/^\.?[\\/]+/, '')
    const sep = /^[A-Za-z]:/.test(base) || base.includes('\\') ? '\\' : '/'
    return `${base}${sep}${rest}`
  }

  /** Whether one path sits inside a root directory (case-insensitive on Windows). */
  function isInside(root, path) {
    const windows = /^(?:[A-Za-z]:|\\\\|\/\/)/.test(String(root || ''))
    const normalize = (value) => windows ? normalizeSlashes(value).toLowerCase() : normalizeSlashes(value)
    const a = normalize(root || '').replace(/\/+$/, '')
    const b = normalize(path || '')
    if (a === '' && root === '/') return b.startsWith('/')
    if (a === '' || b === '') return false
    return b === a || b.startsWith(`${a}/`)
  }

  /** The path relative to a root, or '' when it is not inside it. */
  function relativeTo(root, path) {
    const a = normalizeSlashes(root || '').replace(/\/+$/, '')
    const b = normalizeSlashes(path || '')
    if (a === '' && root === '/') return b.startsWith('/') ? b.slice(1) : ''
    if (a === '' || b === '') return ''
    if (!isInside(root, path)) return ''
    if (b.length === a.length) return ''
    const prefix = `${a}/`
    return b.slice(prefix.length)
  }

  /** A title, an attribute value, or a text token worth resolving as a file. */
  function looksLikePath(value) {
    if (typeof value !== 'string') return false
    const s = value.trim()
    if (s.length === 0 || s.length > 1024) return false
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return false
    if (/[\r\n\t]/.test(s)) return false
    if (/[\\/]/.test(s)) return true
    const ext = extname(s)
    return ext.length > 0 && KNOWN_EXT.has(ext)
  }

  function pathFromHref(href) {
    const value = String(href || '').trim()
    if (value === '') return ''
    // The chat, the Sidebar and the delivery table address files as
    // `dsh-resource://file/session/<sessionId>/<path>`; the path is workspace
    // relative or absolute with its drive letter kept literal.
    const resource = /^dsh-resource:\/\/file\/([^?#]*)/i.exec(value)
    if (resource) {
      const match = /^(?:session\/[^/]+|absolute)\/(.+)$/.exec(resource[1])
      if (!match) return ''
      try { return decodeURIComponent(match[1]) } catch { return match[1] }
    }
    if (/^file:\/\//i.test(value)) {
      let path = ''
      try {
        path = decodeURIComponent(value.replace(/^file:\/\//i, ''))
      } catch {
        // A malformed escape (file:///C:/a%zz) must not throw inside the
        // capture-phase listener; fall back to the raw text.
        path = value.replace(/^file:\/\//i, '')
      }
      if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1)
      return path
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return ''
    if (value.startsWith('#')) return ''
    return looksLikePath(value) ? value : ''
  }

  /* ─────────────────────────── file classification ─────────────────────────── */

  /**
   * Extension-less text files are the norm in a repository root (Dockerfile,
   * Makefile, LICENSE, .gitignore). `extname` returns '' for all of them, so
   * without this set they would be classified as binary and lose "copy
   * contents".
   */
  const TEXT_NAMES = new Set([
    'dockerfile', 'containerfile', 'makefile', 'gnumakefile', 'cmakelists.txt', 'procfile',
    'gemfile', 'rakefile', 'vagrantfile', 'jenkinsfile', 'brewfile', 'justfile', 'taskfile',
    'license', 'licence', 'notice', 'readme', 'changelog', 'changes', 'authors', 'contributors',
    'copying', 'copyright', 'install', 'todo', 'version', 'codeowners', 'editorconfig',
  ])

  /** A dotfile with no second dot is configuration text, not a binary blob. */
  function isTextName(path) {
    const name = basename(path).toLowerCase()
    if (name === '') return false
    if (TEXT_NAMES.has(name)) return true
    // `.gitignore`, `.env`, and also `.env.local` / `.env.production`: a leading
    // dot names a config file, whatever the trailing label looks like.
    return name.startsWith('.')
  }

  /**
   * The kind decides which rows appear: images get a browser preview, text gets
   * copy-contents, archives and Office files only get the external actions.
   */
  function classify(path, isDir) {
    if (isDir) return { kind: 'dir', ext: '', canCopyText: false, canBrowser: false, canSaveAs: false }
    const ext = extname(path)
    if (IMAGE_EXT.has(ext)) return { kind: 'image', ext, canCopyText: false, canBrowser: true, canSaveAs: true }
    if (HTML_EXT.has(ext)) return { kind: 'html', ext, canCopyText: true, canBrowser: true, canSaveAs: true }
    if (PDF_EXT.has(ext)) return { kind: 'pdf', ext, canCopyText: false, canBrowser: true, canSaveAs: true }
    if (MD_EXT.has(ext)) return { kind: 'markdown', ext, canCopyText: true, canBrowser: true, canSaveAs: true }
    if (OFFICE_EXT.has(ext)) return { kind: 'office', ext, canCopyText: false, canBrowser: false, canSaveAs: true }
    if (ARCHIVE_EXT.has(ext)) return { kind: 'archive', ext, canCopyText: false, canBrowser: false, canSaveAs: true }
    if (VIDEO_EXT.has(ext)) return { kind: 'video', ext, canCopyText: false, canBrowser: BROWSER_VIDEO.has(ext), canSaveAs: true }
    if (AUDIO_EXT.has(ext)) return { kind: 'audio', ext, canCopyText: false, canBrowser: BROWSER_AUDIO.has(ext), canSaveAs: true }
    if (TEXT_EXT.has(ext)) return { kind: 'text', ext, canCopyText: true, canBrowser: false, canSaveAs: true }
    if (isTextName(path)) return { kind: 'text', ext, canCopyText: true, canBrowser: false, canSaveAs: true }
    return { kind: 'binary', ext, canCopyText: false, canBrowser: false, canSaveAs: true }
  }

  function mimeOf(path) {
    const ext = extname(path)
    if (MIME[ext]) return MIME[ext]
    if (TEXT_EXT.has(ext) || isTextName(path)) return 'text/plain;charset=utf-8'
    return 'application/octet-stream'
  }

  const EDITOR_RE = /(visual studio code|vs ?code|vscode|cursor|windsurf|zed|sublime|intellij|pycharm|webstorm|goland|rider|phpstorm|android studio|notepad\+\+|vim|neovim|emacs|textmate|xcode)/i

  function pickEditor(apps) {
    if (!Array.isArray(apps)) return null
    return apps.find((app) => app && typeof app.name === 'string' && EDITOR_RE.test(app.name)) || null
  }

  function orderApplications(apps, preferredId) {
    const seen = new Set()
    const rank = (app) => app.id === preferredId ? 0 : app.default ? 1 : EDITOR_RE.test(app.name) ? 2 : 3
    return (Array.isArray(apps) ? apps : [])
      .filter((app) => {
        if (!app || typeof app.id !== 'string' || typeof app.name !== 'string' || seen.has(app.id)) return false
        seen.add(app.id)
        return true
      })
      .map((app, index) => ({ app, index }))
      .sort((a, b) => rank(a.app) - rank(b.app) || a.index - b.index)
      .map(({ app }) => app)
  }

  // Store application IDs only, never commands. Host validation still owns opens.
  function applicationPreferences(storage) {
    const key = 'dsh-file-actions.preferred-apps.v1'
    const type = (path) => extname(path).toLowerCase() || '[no extension]'
    const read = () => {
      try {
        const value = JSON.parse(storage.getItem(key) || '{}')
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
      } catch { return {} }
    }
    return {
      get(path) { const value = read()[type(path)]; return typeof value === 'string' ? value : '' },
      set(path, appId) {
        try {
          const value = read()
          if (appId) Object.defineProperty(value, type(path), { value: appId, enumerable: true, configurable: true, writable: true })
          else delete value[type(path)]
          storage.setItem(key, JSON.stringify(value))
          return true
        } catch { return false }
      },
    }
  }

  function buildStatusModel(path, message, t, retry = false) {
    return { title: basename(path) || path, subtitle: path, pathLine: path, kind: 'binary',
      status: true, sections: [[{ id: 'status', label: message, disabled: true }],
        ...(retry ? [[{ id: 'retry', label: t.retry, action: 'retry', icon: 'open' }]] : [])] }
  }

  /* ─────────────────────────── menu model (pure) ─────────────────────────── */

  /**
   * Build the rows as data so the widget stays a dumb renderer and the tests can
   * assert which actions a file kind earns.
   * @param input - resolved target: absolute path, display path, kind flags, apps.
   * @returns header text plus ordered sections of rows.
   */
  /**
   * A reference like `src/app.ts:42:7` or `notes.md#L42-L48` names a line. The
   * Host cannot position an editor, but showing and copying the location still
   * answers "which part of the file" while the menu is open.
   */
  function formatLocation(location, t) {
    const line = location && Number(location.line)
    if (!line) return ''
    const end = Number(location && location.endLine)
    if (end && end !== line) return t.lineRange.replace('{from}', line).replace('{to}', end)
    return t.lineAt.replace('{line}', line)
  }

  function buildMenuModel(input) {
    const t = input.t || ZH
    const { absolutePath, displayPath, isDir, bytes } = input
    const apps = orderApplications(input.apps, input.preferredId)
    const file = classify(absolutePath, isDir)
    const sections = []
    const primary = []

    primary.push({
      id: 'open',
      label: isDir ? t.openFolder : t.open,
      icon: isDir ? 'folder' : 'open',
      action: 'open',
    })

    const editor = apps.find((app) => app.id === input.preferredId) || pickEditor(apps)
    if (!isDir && (editor || input.appsState)) {
      primary.push({
        id: 'editor',
        label: editor ? t.openIn(editor.name) : input.appsState === 'loading' ? t.appsLoading : t.noPreferred,
        icon: 'editor',
        action: 'open',
        appId: editor?.id,
        disabled: !editor,
      })
    }

    if (!isDir && (apps.length > 0 || input.appsState)) {
      primary.push({
        id: 'openWith',
        label: input.appsState === 'failed' ? t.appsFailed : input.appsState === 'ready' && !apps.length ? t.appsEmpty : t.openWith,
        icon: 'chevron',
        action: input.appsState === 'failed' ? 'retryApps' : undefined,
        keepOpen: input.appsState === 'failed',
        disabled: apps.length === 0 && input.appsState !== 'failed',
        children: apps.length ? apps.map((app) => ({
          id: `app:${app.id}`,
          label: app.name,
          action: 'open',
          appId: app.id,
          iconData: app.icon || null,
          checked: app.default === true,
          preferred: app.id === input.preferredId,
          pinnable: true,
        })) : undefined,
      })
    }
    if (primary.length > 0) sections.push(primary)

    const navigate = []
    if (!isDir && file.canBrowser) {
      navigate.push({
        id: 'browser',
        label: t.browser,
        icon: 'globe',
        action: 'browser',
      })
    }
    navigate.push({
      id: 'reveal',
      label: isDir ? t.revealFolder : t.reveal,
      icon: 'reveal',
      action: 'reveal',
    })
    sections.push(navigate)

    const transfer = [
      { id: 'copyPath', label: t.copyPath, icon: 'copy', action: 'copyPath' },
    ]
    if (displayPath && normalizeSlashes(displayPath) !== normalizeSlashes(absolutePath)) {
      transfer.push({ id: 'copyRelPath', label: t.copyRelPath, icon: 'copy', action: 'copyRelPath' })
    }
    if (!isDir) {
      transfer.push({ id: 'copyFileName', label: t.copyFileName, icon: 'copy', action: 'copyFileName' })
    }
    // Copying the reference verbatim is only useful when it carries a location.
    if (!isDir && input.location && Number(input.location.line) && input.reference) {
      transfer.push({ id: 'copyReference', label: t.copyReference, icon: 'clipboard', action: 'copyReference' })
    }
    if (!isDir && file.canCopyText) {
      transfer.push({ id: 'copyContents', label: t.copyContents, icon: 'clipboard', action: 'copyContents' })
    }
    if (!isDir) {
      transfer.push({ id: 'saveAs', label: t.saveAs, icon: 'download', action: 'saveAs' })
    }
    sections.push(transfer)

    const kindLabel = t.kinds[file.kind] || t.kinds.binary
    const locationLabel = formatLocation(input.location, t)
    const metaParts = locationLabel ? [locationLabel, kindLabel] : [kindLabel]
    if (!isDir && bytes) metaParts.push(formatBytes(bytes))
    // Copy/save-as read through the Host, which also serves paths outside the
    // session workspace. Say so instead of letting the absolute path be the only
    // clue that the file is not part of this project.
    if (input.outsideWorkspace) metaParts.push(t.outsideWorkspace)
    const meta = metaParts.join(' · ')

    return {
      title: basename(absolutePath) || absolutePath,
      subtitle: absolutePath,
      // Inside the workspace the relative path answers "which one"; outside it,
      // the absolute path is the only thing that does.
      pathLine: input.outsideWorkspace
        ? absolutePath
        : (relativeTo(input.cwd, absolutePath) || displayPath || absolutePath),
      sizeLabel: !isDir && bytes ? formatBytes(bytes) : '',
      kindLabel,
      locationLabel,
      meta,
      kind: file.kind,
      preview: file.kind === 'image' || extname(absolutePath) === 'svg',
      outsideWorkspace: input.outsideWorkspace === true,
      sections: sections.filter((section) => section.length > 0),
    }
  }

  /**
   * The same menu shape for a web link: the header names the site and the path,
   * and the rows act on the URL instead of a file.
   */
  function buildLinkMenuModel(input) {
    const t = input.t || ZH
    let host = input.url
    let pathLine = input.url
    try {
      const url = new URL(input.url)
      host = url.hostname.replace(/^www\./i, '') || input.url
      const path = `${url.pathname}${url.search}`.replace(/\/$/, '')
      pathLine = path === '' ? '/' : path
    } catch { /* keep the raw URL */ }
    const copy = [
      { id: 'copyLink', label: t.copyLink, icon: 'copy', action: 'copyLink' },
      { id: 'copyLinkText', label: t.copyLinkText, icon: 'clipboard', action: 'copyLinkText' },
    ]
    // `[text](url)` only exists when the link has visible text to label it.
    if (String(input.text || '').trim() !== '') {
      copy.push({ id: 'copyMarkdown', label: t.copyMarkdown, icon: 'markdown', action: 'copyMarkdown' })
    }
    return {
      title: host,
      subtitle: input.url,
      pathLine,
      sizeLabel: '',
      kindLabel: t.kinds.link,
      meta: t.kinds.link,
      kind: 'link',
      outsideWorkspace: false,
      sections: [
        [{ id: 'openLink', label: t.openLink, icon: 'globe', action: 'openLink' }],
        copy,
      ],
    }
  }

  /* ─────────────────────────────── icons ─────────────────────────────── */

  const ICON_PATHS = {
    open: '<path d="M9.2 2.6H4.4a1 1 0 0 0-1 1v8.8a1 1 0 0 0 1 1h7.2a1 1 0 0 0 1-1V6.2z"/><path d="M9.2 2.6v3.6h3.4"/>',
    folder: '<path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h3l1.4 1.5H12a1.5 1.5 0 0 1 1.5 1.5v4.5A1.5 1.5 0 0 1 12 13H4a1.5 1.5 0 0 1-1.5-1.5z"/>',
    editor: '<path d="M5.8 4.6 2.8 8l3 3.4"/><path d="M10.2 4.6 13.2 8l-3 3.4"/>',
    chevron: '<path d="M6.5 4.5 10 8l-3.5 3.5"/>',
    reveal: '<path d="M2.5 4.5h5l1.3 1.6H13a1 1 0 0 1 1 1v5.4a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1z"/><path d="M6 10.4h4"/>',
    copy: '<rect x="5.5" y="5.5" width="7" height="8" rx="1.2"/><path d="M10.5 3.6V3a1 1 0 0 0-1-1H3.9a1 1 0 0 0-1 1v7.2a1 1 0 0 0 1 1h.6"/>',
    clipboard: '<rect x="4.5" y="3.5" width="7" height="10" rx="1.3"/><path d="M6.6 3.5V2.8h2.8v.7"/><path d="M6.4 7h3.2"/><path d="M6.4 9.4h3.2"/>',
    download: '<path d="M8 2.8v6.4"/><path d="M5.6 7.2 8 9.6l2.4-2.4"/><path d="M3.2 11.4v1.2a1 1 0 0 0 1 1h7.6a1 1 0 0 0 1-1v-1.2"/>',
    globe: '<circle cx="8" cy="8" r="5.4"/><path d="M2.8 8h10.4"/><path d="M8 2.6c1.6 1.6 2.4 3.4 2.4 5.4S9.6 11.8 8 13.4C6.4 11.8 5.6 10 5.6 8S6.4 4.2 8 2.6"/>',
    check: '<path d="M3.6 8.4 6.6 11.4 12.4 4.9"/>',
    link: '<path d="M6.6 9.4a2.6 2.6 0 0 0 3.7 0l1.9-1.9a2.6 2.6 0 0 0-3.7-3.7l-1 1"/><path d="M9.4 6.6a2.6 2.6 0 0 0-3.7 0L3.8 8.5a2.6 2.6 0 0 0 3.7 3.7l1-1"/>',
    // File-type glyphs for the header tile: shape carries the kind, the tile hue
    // only reinforces it.
    text: '<path d="M4 4.6h8"/><path d="M4 7.6h8"/><path d="M4 10.6h5"/>',
    markdown: '<path d="M2.8 10.6V5.4l2.1 2.5 2.1-2.5v5.2"/><path d="M11.1 5.6v3.4"/><path d="M9.6 7.6l1.5 1.5 1.5-1.5"/>',
    image: '<rect x="2.6" y="3.6" width="10.8" height="8.8" rx="1.4"/><circle cx="6" cy="6.6" r="1"/><path d="M3.6 11.2 6.9 8.3l1.9 1.7 1.8-1.4 1.9 2.1"/>',
    web: '<rect x="2.6" y="3.4" width="10.8" height="9.2" rx="1.4"/><path d="M2.6 6.2h10.8"/><circle cx="4.6" cy="4.8" r=".5" fill="currentColor" stroke="none"/><circle cx="6.2" cy="4.8" r=".5" fill="currentColor" stroke="none"/>',
    doc: '<path d="M9.2 2.6H4.4a1 1 0 0 0-1 1v8.8a1 1 0 0 0 1 1h7.2a1 1 0 0 0 1-1V6.2z"/><path d="M9.2 2.6v3.6h3.4"/>',
    office: '<rect x="3.4" y="2.8" width="9.2" height="10.4" rx="1.3"/><path d="M6 6h4"/><path d="M6 8.3h4"/><path d="M6 10.6h2.4"/>',
    archive: '<rect x="3" y="4.8" width="10" height="7.4" rx="1.2"/><path d="M3 7.5h10"/><path d="M6.6 4.8V3.4h2.8v1.4"/>',
    binary: '<rect x="3" y="3.4" width="10" height="9.2" rx="1.2"/><path d="M5.6 6.6h1.1v3.2"/><path d="M9.3 6.6h1.5l-1.5 3.2h1.5"/>',
  }

  /** The header tile glyph for one file kind. */
  const KIND_ICONS = {
    text: 'text',
    markdown: 'markdown',
    html: 'web',
    pdf: 'doc',
    image: 'image',
    office: 'office',
    archive: 'archive',
    binary: 'binary',
    dir: 'folder',
    link: 'link',
  }

  function iconSvg(name) {
    const body = ICON_PATHS[name] || ICON_PATHS.open
    return `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
  }

  /* ─────────────────────────────── styles ─────────────────────────────── */

  const CSS = `
.dfa-pin{flex:none;margin-left:6px;border:0;border-radius:4px;background:transparent;color:inherit;
  font:inherit;cursor:pointer;padding:0 5px;line-height:1.6}
.dfa-pin:hover,.dfa-pin:focus-visible{background:rgba(127,127,127,.22);outline:1px solid currentColor}
.dfa-pin[aria-pressed="true"]{color:#5b8cff}

.dfa-menu{position:fixed;z-index:2147483000;width:min(24em,calc(100vw - 16px));min-width:0;max-width:calc(100vw - 16px);box-sizing:border-box;
  display:flex;flex-direction:column;max-height:min(78vh,560px);
  border-radius:var(--dsw-radius-lg,10px);border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.32));
  /* Readability floor: an almost-opaque base colour sits under the themed layer.
     A translucent theme (liquid glass over a wallpaper) keeps its tint, but text
     never lands on the wallpaper itself. The exact colour is computed at open
     time from the theme's own background; Canvas is the pre-JS fallback. */
  background-color:var(--dfa-floor,Canvas);
  background-image:linear-gradient(var(--dsw-alias-bg-layer-1,transparent),var(--dsw-alias-bg-layer-1,transparent));
  color:var(--dsw-alias-label-primary,#e8e8e8);
  box-shadow:0 1px 2px rgba(0,0,0,.14),0 14px 38px rgba(0,0,0,.32);
  font-family:var(--dsw-font-family,system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif);
  font-size:max(13px,.875rem);line-height:1.5;-webkit-font-smoothing:antialiased;user-select:none;outline:none;
  animation:dfa-in 90ms cubic-bezier(.2,.7,.3,1) both}
/* An explicit display on a row beats the UA [hidden] rule, so filtered rows need
   this to actually disappear. */
.dfa-menu [hidden]{display:none!important}
@keyframes dfa-in{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.dfa-menu{animation:none}.dfa-item{transition:none}}
/* The body is the scroll container so the fades can sit on its edges without
   fading the menu's own border and shadow. */
.dfa-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;
  padding:5px;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2,rgba(127,127,127,.4)) transparent}
.dfa-body[data-fade="both"]{mask-image:linear-gradient(to bottom,transparent 0,#000 16px,#000 calc(100% - 16px),transparent 100%)}
.dfa-body[data-fade="top"]{mask-image:linear-gradient(to bottom,transparent 0,#000 16px)}
.dfa-body[data-fade="bottom"]{mask-image:linear-gradient(to bottom,#000 calc(100% - 16px),transparent 100%)}
.dfa-thumb{height:118px;box-sizing:content-box;color:var(--dsw-alias-label-tertiary,#888);font-size:.85em;margin:-5px -5px 6px;padding:9px;display:grid;place-items:center;
  background:color-mix(in srgb,var(--dsw-static-neutral-00,#fff) 6%,transparent);
  border-bottom:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.28))}
.dfa-thumb img{max-width:100%;max-height:118px;display:block;object-fit:contain;border-radius:6px}
.dfa-head{display:flex;align-items:center;gap:9px;padding:6px 7px 8px;min-width:0;
  border-bottom:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.28));margin-bottom:3px}
.dfa-tile{flex:none;width:28px;height:28px;border-radius:8px;display:grid;place-items:center;
  color:var(--dfa-hue,#5b8cff);
  background:color-mix(in srgb,var(--dfa-hue,#5b8cff) 13%,transparent);
  box-shadow:inset 0 0 0 .5px color-mix(in srgb,var(--dfa-hue,#5b8cff) 30%,transparent)}
.dfa-tile svg{width:16px;height:16px}
.dfa-tile[data-kind="text"]{--dfa-hue:#5b8cff}
.dfa-tile[data-kind="markdown"]{--dfa-hue:#7b8cff}
.dfa-tile[data-kind="html"]{--dfa-hue:#e0714a}
.dfa-tile[data-kind="pdf"]{--dfa-hue:#e5484d}
.dfa-tile[data-kind="image"]{--dfa-hue:#2fa46b}
.dfa-tile[data-kind="office"]{--dfa-hue:#2f6fdb}
.dfa-tile[data-kind="archive"]{--dfa-hue:#c9971f}
.dfa-tile[data-kind="binary"]{--dfa-hue:#8b8d98}
.dfa-tile[data-kind="dir"]{--dfa-hue:#c9971f}
.dfa-tile[data-kind="link"]{--dfa-hue:#4f8cff}
.dfa-headtext{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
.dfa-name{font-weight:600;font-size:1em;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dfa-path{font-family:var(--ds-font-family-code,Consolas,monospace);font-size:.85em;line-height:1.4;
  color:var(--dsw-alias-label-tertiary,rgba(160,160,160,.95));overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dfa-loc{flex:none;align-self:flex-start;margin-top:2px;padding:0 6px;border-radius:999px;font-size:.85em;line-height:1.4;
  background:color-mix(in srgb,var(--dsw-alias-label-primary,#e8e8e8) 10%,transparent);
  color:var(--dsw-alias-label-secondary,#a9adb5)}
.dfa-size{flex:none;align-self:flex-start;padding-top:2px;font-size:.85em;line-height:1.4;
  color:var(--dsw-alias-label-tertiary,rgba(160,160,160,.95));font-variant-numeric:tabular-nums}
.dfa-aside{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:2px}
.dfa-badge{flex:none;align-self:flex-start;margin-top:2px;font-size:.85em;line-height:1.4;padding:0 6px;border-radius:999px;
  border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.4));color:var(--dsw-alias-label-tertiary,rgba(160,160,160,.95))}
.dfa-sep{height:1px;margin:5px 7px;background:var(--dsw-alias-border-l2,rgba(127,127,127,.28))}
.dfa-item{display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;min-height:30px;padding:4px 8px;
  border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;
  transition:background-color 70ms ease}
.dfa-item[data-focus="true"]{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.18))}
.dfa-menu[data-keyboard="true"] .dfa-item[data-focus="true"]{
  box-shadow:inset 0 0 0 1.5px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4f8cff))}
.dfa-item[aria-disabled="true"]{opacity:.45;cursor:default}
.dfa-ico{flex:none;width:16px;height:16px;display:flex;align-items:center;justify-content:center;
  color:var(--dsw-alias-label-secondary,rgba(190,190,190,.95))}
.dfa-ico img{width:16px;height:16px;object-fit:contain;display:block;border-radius:3px}
.dfa-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dfa-tail{flex:none;display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-tertiary,rgba(160,160,160,.95));font-size:.85em}
.dfa-default{font-size:.85em;line-height:1.4;padding:0 6px;border-radius:999px;
  color:var(--dsw-alias-state-business-primary,#4f8cff);
  background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#4f8cff) 14%,transparent)}
.dfa-sub{position:fixed;z-index:2147483001;max-height:min(64vh,440px)}
.dfa-subhead{position:sticky;top:-5px;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:8px;
  margin:-5px -5px 0;padding:6px 13px 5px;background:var(--dsw-alias-bg-layer-1,#24262b);
  border-bottom:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.28));
  font-size:.85em;line-height:1.4;color:var(--dsw-alias-label-tertiary,rgba(160,160,160,.95))}
.dfa-searchwrap{position:sticky;top:27px;z-index:1;margin:0 -5px 4px;padding:5px 8px 6px;
  background:var(--dsw-alias-bg-layer-1,#24262b);border-bottom:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.2))}
.dfa-search{width:100%;box-sizing:border-box;font:inherit;font-size:1em;line-height:1.4;padding:3px 7px;
  border-radius:5px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.4));
  background:var(--dsw-alias-bg-layer-2,transparent);color:inherit;outline:none}
.dfa-search:focus{border-color:var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4f8cff))}
.dfa-search::placeholder{color:var(--dsw-alias-label-tertiary,rgba(160,160,160,.95))}
.dfa-empty{padding:8px 10px;font-size:.85em;color:var(--dsw-alias-label-tertiary,rgba(160,160,160,.95))}
.dfa-foot{display:flex;justify-content:center;gap:12px;margin-top:5px;padding:6px 8px 2px;
  border-top:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.28));
  font-size:.85em;line-height:1.4;color:var(--dsw-alias-label-tertiary,rgba(160,160,160,.95))}
.dfa-toast{position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:2147483002;
  padding:7px 14px;border-radius:8px;font-size:.875rem;line-height:1.4;pointer-events:none;
  background-color:var(--dfa-floor,Canvas);
  background-image:linear-gradient(var(--dsw-alias-bg-layer-2,transparent),var(--dsw-alias-bg-layer-2,transparent));
  color:var(--dsw-alias-label-primary,#eee);
  box-shadow:0 2px 6px rgba(0,0,0,.18),0 10px 28px rgba(0,0,0,.28);
  opacity:0;transition:opacity .16s ease}
.dfa-toast[data-show="true"]{opacity:1}
.dfa-toast[data-error="true"]{color:var(--dsw-alias-state-error-primary,#f85149)}
`

  function ensureCss() {
    if (typeof document === 'undefined') return
    if (document.querySelector('style[data-plugin-css="dsh-file-actions"]')) return
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-file-actions'
    tag.dataset.pluginCss = 'dsh-file-actions'
    tag.textContent = CSS
    document.head.appendChild(tag)
  }

  /**
   * A near-opaque colour derived from the theme's own page background. A theme
   * that makes every surface translucent (liquid glass over a wallpaper) would
   * otherwise let the wallpaper through and drop the menu's contrast. Recomputed
   * per open so a theme switch is picked up without a reload.
   */
  function menuFloor() {
    if (typeof document === 'undefined') return ''
    try {
      const probe = document.createElement('div')
      // Derive the floor from the same surface colour the menu paints, so a dark
      // glass theme gets a dark floor instead of a white one.
      probe.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;background:var(--dsw-alias-bg-layer-1,#24262b)'
      document.body.appendChild(probe)
      const raw = getComputedStyle(probe).backgroundColor
      probe.remove()
      const match = /rgba?\(([^)]+)\)/.exec(raw)
      if (!match) return ''
      const parts = match[1].split(',').map((value) => parseFloat(value))
      const [r, g, b] = parts
      const alpha = parts.length > 3 ? parts[3] : 1
      if (![r, g, b, alpha].every((value) => Number.isFinite(value))) return ''
      // Flatten the theme colour against black or white by its own luminance, then
      // keep a hint of transparency so a glass theme still reads as glass.
      const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
      const base = luminance < 0.5 ? 0 : 255
      const blend = (channel) => Math.round(channel * alpha + base * (1 - alpha))
      return `rgba(${blend(r)}, ${blend(g)}, ${blend(b)}, 0.94)`
    } catch {
      return ''
    }
  }

  /* ─────────────────────────────── toast ─────────────────────────────── */

  let toastTimer = null
  function toast(text, options) {
    if (typeof document === 'undefined' || !text) return
    let node = document.querySelector('.dfa-toast')
    if (!node) {
      node = document.createElement('div')
      node.className = 'dfa-toast'
      const floor = menuFloor()
      if (floor) node.style.setProperty('--dfa-floor', floor)
      document.body.appendChild(node)
    }
    node.textContent = text
    node.dataset.error = options && options.error ? 'true' : 'false'
    // Force a frame so a repeated message re-runs the fade-in.
    node.dataset.show = 'false'
    requestAnimationFrame(() => {
      node.dataset.show = 'true'
    })
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      node.dataset.show = 'false'
    }, options && options.error ? 3200 : 1800)
  }

  /* ─────────────────────────────── bridge ─────────────────────────────── */

  /** Every Remote call answers `{ ok, value }`; unwrap or return null. */
  function unwrap(result) {
    if (!result || typeof result !== 'object') return null
    if (result.ok === true) return result.value
    return null
  }

  function probeError(error) {
    const code = String(error?.code || '')
    if (/not-found|ENOENT/.test(code)) return 'notFound'
    if (/denied|forbidden|EACCES|EPERM/.test(code)) return 'denied'
    return 'probeFailed'
  }

  async function boundedCall(call, milliseconds = 8000) {
    let timer
    try {
      return await Promise.race([Promise.resolve().then(call), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Remote request timed out')), milliseconds)
      })])
    } finally { clearTimeout(timer) }
  }

  function createBridge(ctx) {
    const remote = ctx.remote
    const sessions = ctx.sessions
    // Both namespaces are optional so a Host without one still gets the rows it
    // can serve: no workspaceFiles means no verification and no read actions.
    // Cordis throws on an undeclared sub-service, so both are declared in
    // `inject` and every access stays guarded.
    let files = null
    let sessionApi = null
    try { files = remote && remote.workspaceFiles ? remote.workspaceFiles : null } catch { files = null }
    try { sessionApi = remote && remote.session ? remote.session : null } catch { sessionApi = null }

    function activeSession(sessionId) {
      try {
        const snapshot = sessions && sessions.list && sessions.list.getSnapshot
          ? sessions.list.getSnapshot()
          : null
        const rows = snapshot && snapshot.byId ? Object.values(snapshot.byId) : []
        if (sessionId) {
          const exact = rows.find((row) => row && row.id === sessionId)
          // The Host can resolve a Session header even when the Client has not
          // retained it. Leave relative paths for that Session's Remote.
          return { id: sessionId, cwd: exact?.cwd }
        }
        if (rows.length === 0) return null
        const retained = rows.find((row) => row && row.retainedBy && row.retainedBy.mainView > 0)
        const pick = retained || rows.find((row) => row && typeof row.cwd === 'string' && row.cwd !== '')
        return pick ? { id: pick.id, cwd: pick.cwd } : null
      } catch {
        return null
      }
    }

    return {
      activeSession,
      /** Resolve one path to a real file or directory, or null when it is neither. */
      async probe(sessionId, path) {
        if (!files) return { error: 'unavailable' }
        let failure = 'probeFailed'
        try {
          const result = await boundedCall(() => files.stat(sessionId, path))
          const stat = unwrap(result)
          if (!result?.ok) failure = probeError(result?.error)
          if (stat && typeof stat.absolutePath === 'string') {
            return { isDir: false, absolutePath: stat.absolutePath, bytes: stat.bytes, version: stat.version }
          }
        } catch (error) { failure = probeError(error) }
        try {
          const listing = unwrap(await boundedCall(() => files.list(sessionId, path)))
          if (listing && Array.isArray(listing.entries)) {
            return { isDir: true, absolutePath: path, bytes: undefined }
          }
        } catch { /* not a directory either */ }
        return { error: failure }
      },
      async applications(path) {
        if (!sessionApi) return { state: 'failed', apps: [] }
        try {
          const result = await boundedCall(() => sessionApi.workspacePathApplications({ path }))
          const value = unwrap(result)
          return result?.ok && Array.isArray(value) ? { state: 'ready', apps: value } : { state: 'failed', apps: [] }
        } catch {
          return { state: 'failed', apps: [] }
        }
      },
      async open(path, appId) {
        if (!sessionApi) return false
        try {
          const request = appId === undefined ? { path } : { path, application: appId }
          return unwrap(await sessionApi.openWorkspacePath(request)) !== null
        } catch {
          return false
        }
      },
      async reveal(path) {
        if (!sessionApi) return false
        try {
          return unwrap(await sessionApi.openWorkspacePath({ path, action: 'reveal' })) !== null
        } catch {
          return false
        }
      },
      async readBytes(sessionId, path, options) {
        if (!files) return null
        try {
          return unwrap(await files.readBytes(sessionId, path, options || {}))
        } catch {
          return null
        }
      },
    }
  }

  /* ───────────────────────────── detection ───────────────────────────── */

  const PATH_ATTRS = ['data-file-actions-path', 'data-files-path', 'data-review-file']

  function isEditable(node) {
    if (!node || !node.closest) return false
    return node.closest('input, textarea, [contenteditable]:not([contenteditable="false"])') !== null
  }

  /** Expand the text under the pointer to one path-like token. */
  function tokenAtPoint(doc, x, y) {
    if (!doc || typeof doc.caretRangeFromPoint !== 'function') return ''
    let range = null
    try {
      range = doc.caretRangeFromPoint(x, y)
    } catch {
      return ''
    }
    if (!range || !range.startContainer || range.startContainer.nodeType !== 3) return ''
    const text = range.startContainer.nodeValue || ''
    const at = Math.min(Math.max(range.startOffset, 0), text.length)
    const isPathChar = (ch) => /[\w.@()+\-\[\]{}~#$%&',=!\\/:]/.test(ch)
    let start = at
    let end = at
    while (start > 0 && isPathChar(text[start - 1])) start -= 1
    while (end < text.length && isPathChar(text[end])) end += 1
    return text.slice(start, end).replace(/^[`'"(<[]+/, '').replace(/[`'")>\],.;:!?]+$/, '')
  }

  /**
   * A soft source (a tooltip, an element's text, the caret token) only counts when
   * it looks like an actual file: an absolute path or a name with an extension.
   * "2026/10/22 12:00", "2/3 files" and "src/app.ts · 2.1 KB" all contain a slash
   * but are prose, and swallowing the native menu for them is worse than missing
   * an exotic path.
   */
  function softPath(value) {
    const text = String(value || '').trim()
    if (text === '') return false
    if (isAbsolutePath(text)) return true
    return /\.[A-Za-z0-9]{1,10}$/.test(text)
  }

  /**
   * A delivery table prefixes the name with an icon glyph ("📄发布文案.md"), and a
   * chip may start with a bullet or arrow. Strip that decoration before the name
   * is tested as a path — never strip a leading dot, slash or drive letter.
   */
  function stripDecorations(value) {
    return String(value || '').replace(/^[^\p{L}\p{N}._\\/-]+/u, '').trim()
  }

  /**
   * Find the file a right-click points at. Structured carriers (a title or a
   * data attribute the GUI already writes) win; a bare text token is the
   * fallback for surfaces that only render the path as text.
   */
  function candidateFromEvent(event, doc) {
    const target = event.target
    if (!target || !target.closest) return null
    if (isEditable(target)) return null

    // A resource address owns its Session and path, even when its child has a
    // different title. Do not reinterpret it against the selected chat.
    const resourceAnchor = target.closest('a[href^="dsh-resource://file/"]')
    if (resourceAnchor) {
      const href = resourceAnchor.getAttribute('href')
      const resourcePath = pathFromHref(href)
      const session = /^dsh-resource:\/\/file\/session\/([^/]+)\//i.exec(href)
      if (!resourcePath) return null
      let sessionId = session?.[1]
      try { if (sessionId) sessionId = decodeURIComponent(sessionId) } catch { return null }
      return { path: resourcePath, sessionId, source: 'href', element: resourceAnchor }
    }

    for (const attr of PATH_ATTRS) {
      const holder = target.closest(`[${attr}]`)
      if (holder) {
        const value = holder.getAttribute(attr)
        if (value && looksLikePath(value)) return { path: value, source: attr, element: holder }
      }
    }

    const card = target.closest('[data-presented-file]')
    if (card) {
      const titled = card.querySelector('[title]')
      const value = titled && titled.getAttribute('title')
      if (value && looksLikePath(value)) return { path: value, source: 'presented', element: card }
    }

    let node = target
    for (let depth = 0; depth < 5 && node && node !== doc.body; depth += 1, node = node.parentElement) {
      const value = node.getAttribute && node.getAttribute('title')
      if (value && looksLikePath(value) && softPath(value)) return { path: value, source: 'title', element: node }
    }

    const anchor = target.closest('a[href]')
    if (anchor) {
      const href = String(anchor.getAttribute('href') || '')
      const fromHref = pathFromHref(href)
      if (fromHref) return { path: fromHref, source: 'href', element: anchor }
      // A blue reference can also be an ordinary web link (a GitHub release, a
      // discussion). It gets the same menu shape with link actions instead of
      // file actions, so the two kinds of blue text behave alike.
      const link = linkFromHref(href)
      if (link) return { link, source: 'href', element: anchor }
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null
    }

    // The element's own text is often exactly the path (a tool row's file link,
    // a chip). Cheaper and steadier than caret hit-testing. Delivery-table cells
    // arrive as "📄发布文案.md", so the decoration goes first.
    const own = stripDecorations(target.textContent)
    if (own && own.length <= 512 && looksLikePath(own) && softPath(own)) {
      return { path: own, source: 'text', element: target }
    }

    const token = stripDecorations(tokenAtPoint(doc, event.clientX, event.clientY))
    if (token && looksLikePath(token) && softPath(token)) return { path: token, source: 'text', element: target }
    return null
  }

  /* ───────────────────────────── menu widget ───────────────────────────── */

  function makeNode(tag, props, children) {
    const node = document.createElement(tag)
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (value === undefined || value === null || value === false) continue
        if (key === 'html') node.innerHTML = value
        else if (key === 'text') node.textContent = value
        else if (key === 'class') node.className = value
        else node.setAttribute(key, String(value))
      }
    }
    for (const child of children || []) {
      if (child === null || child === undefined) continue
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child)
    }
    return node
  }

  class FileMenu {
    constructor(options) {
      this.model = options.model
      this.x = options.x
      this.y = options.y
      this.onPick = options.onPick
      this.onClose = options.onClose
      this.keyboard = options.keyboard === true
      this.anchor = options.anchor || null
      this.t = options.t || ZH
      this.root = null
      this.body = null
      this.thumbUrl = null
      this.submenu = null
      this.submenuFor = null
      this.subItems = []
      this.subVisible = []
      this.subIndex = -1
      this.searchInput = null
      this.subBody = null
      this.subEmpty = null
      this.items = []
      this.index = -1
      this.closed = false
      this.handleKeyDown = this.handleKeyDown.bind(this)
      this.handlePointerDown = this.handlePointerDown.bind(this)
    }

    open() {
      const root = makeNode('div', {
        class: 'dfa-menu',
        role: 'menu',
        tabindex: '-1',
        [MENU_ATTR]: '1',
        'aria-label': this.model.title,
      })
      this.root = root
      this.body = makeNode('div', { class: 'dfa-body' })
      root.appendChild(this.body)
      const floor = menuFloor()
      if (floor) root.style.setProperty('--dfa-floor', floor)
      this.previousFocus = document.activeElement
      root.setAttribute('data-keyboard', this.keyboard ? 'true' : 'false')
      root.addEventListener('mousedown', (event) => { if (!event.target.closest('input,button')) event.preventDefault() })
      this.body.addEventListener('scroll', () => this.updateFade(), { passive: true })
      document.body.appendChild(root)
      this.render()
      this.place(root, this.x, this.y)
      document.addEventListener('keydown', this.handleKeyDown, true)
      document.addEventListener('pointerdown', this.handlePointerDown, true)
      window.addEventListener('resize', this.handlePointerDown, true)
      window.addEventListener('blur', this.handlePointerDown, true)
      // Move focus into the menu so the composer does not keep receiving the
      // keystrokes meant for the rows; close() hands focus back. The window
      // blur listener ignores descendant blurs, so this cannot close the menu.
      try { root.focus({ preventScroll: true }) } catch { /* older engine */ }
    }

    /** Fade the scroll edges so a clipped list reads as scrollable. */
    updateFade() {
      const body = this.body
      if (!body) return
      const top = body.scrollTop > 2
      const bottom = body.scrollTop + body.clientHeight < body.scrollHeight - 2
      const mode = top && bottom ? 'both' : top ? 'top' : bottom ? 'bottom' : 'none'
      if (body.dataset.fade !== mode) body.dataset.fade = mode
    }

    /**
     * Paint the current model into the existing body. File associations arrive a
     * few seconds after the first right-click, so the same menu is re-rendered in
     * place instead of opening late or flickering through a close/reopen.
     */
    render() {
      if (!this.root || !this.body) return
      this.closeSubmenu()
      const scrollTop = this.body.scrollTop
      const position = this.root.getBoundingClientRect()
      const painted = this.items.length > 0
      const keep = this.items[this.index] ? this.items[this.index].item.id : null
      this.body.textContent = ''
      this.items = []
      this.index = -1
      if (this.model.preview) this.body.appendChild(this.renderThumb())
      this.body.appendChild(this.renderHead())
      this.model.sections.forEach((section, at) => {
        if (at > 0) this.body.appendChild(makeNode('div', { class: 'dfa-sep' }))
        for (const item of section) this.body.appendChild(this.renderItem(item))
      })
      this.body.appendChild(makeNode('div', { class: 'dfa-foot', text: this.t.nativeHint }))
      if (this.keyboard) {
        this.body.appendChild(makeNode('div', { class: 'dfa-foot' }, [
          makeNode('span', { text: this.t.keysMove }),
          makeNode('span', { text: this.t.keysRun }),
          makeNode('span', { text: this.t.keysClose }),
        ]))
      }
      const restored = keep === null ? -1 : this.items.findIndex((entry) => entry.item.id === keep)
      // A pointer-opened menu keeps no row highlighted; the keyboard opener and
      // the post-enrichment repaint both restore a real selection.
      if (restored >= 0 && !this.items[restored].disabled) this.focus(restored)
      else if (this.keyboard) this.focus(this.items.findIndex((entry) => !entry.disabled))
      this.body.scrollTop = scrollTop
      if (this.root.parentNode) {
        // Keep the chosen side of the pointer; only clamp when the viewport ends.
        this.place(this.root, painted ? position.left : this.x, painted ? position.top : this.y, painted)
      }
      this.root.setAttribute('aria-label', this.model.title)
      requestAnimationFrame(() => this.updateFade())
    }

    renderThumb() {
      const wrap = makeNode('div', { class: 'dfa-thumb' })
      if (this.thumbUrl) wrap.appendChild(makeNode('img', { src: this.thumbUrl, alt: this.model.title }))
      else wrap.textContent = this.thumbnailDone ? this.t.previewUnavailable : this.t.previewLoading
      return wrap
    }

    /** Drop an image preview above the header once its bytes have arrived. */
    setThumbnail(url) {
      if (this.closed) return
      this.thumbUrl = url
      this.thumbnailDone = true
      const previous = this.body?.querySelector('.dfa-thumb')
      if (previous) previous.replaceWith(this.renderThumb())
    }

    /**
     * The header is the one deliberate element: a tinted file-type tile, the name,
     * and the path that answers "which file is this" without leaving the menu.
     */
    renderHead() {
      const model = this.model
      const tile = makeNode('span', { class: 'dfa-tile', 'data-kind': model.kind || 'binary' })
      tile.innerHTML = iconSvg(KIND_ICONS[model.kind] || 'doc')
      const text = makeNode('span', { class: 'dfa-headtext' }, [
        makeNode('span', { class: 'dfa-name', text: model.title, title: model.subtitle }),
        makeNode('span', { class: 'dfa-path', text: model.pathLine || model.subtitle, title: model.subtitle }),
      ])
      const aside = makeNode('span', { class: 'dfa-aside' })
      if (model.outsideWorkspace) aside.appendChild(makeNode('span', { class: 'dfa-badge', text: this.t.outsideWorkspace }))
      // A reference like `file.ts:42` names a line the Host cannot jump to, so the
      // header states it instead of silently dropping the suffix.
      if (model.locationLabel) aside.appendChild(makeNode('span', { class: 'dfa-loc', text: model.locationLabel }))
      if (model.sizeLabel) aside.appendChild(makeNode('span', { class: 'dfa-size', text: model.sizeLabel }))
      return makeNode('div', { class: 'dfa-head' }, [tile, text, aside])
    }

    /** Replace the model (rows only) and repaint without moving the menu. */
    setModel(model) {
      if (this.closed) return
      this.model = model
      this.render()
    }

    renderItem(item) {
      const row = makeNode('div', {
        class: 'dfa-item',
        role: 'menuitem',
        tabindex: '-1',
        id: `dfa-row-${this.items.length}`,
        [ITEM_ATTR]: item.id,
        'aria-disabled': item.disabled ? 'true' : 'false',
        'aria-haspopup': item.children ? 'menu' : 'false',
        'aria-expanded': item.children ? 'false' : undefined,
      })
      const icon = makeNode('span', { class: 'dfa-ico' })
      if (item.iconData) {
        icon.appendChild(makeNode('img', { src: item.iconData, alt: '' }))
      } else {
        icon.innerHTML = iconSvg(item.icon)
      }
      row.appendChild(icon)
      row.appendChild(makeNode('span', { class: 'dfa-label', text: item.label }))
      if (item.children) {
        row.appendChild(makeNode('span', { class: 'dfa-tail', html: iconSvg('chevron') }))
      }
      const entry = { element: row, item, disabled: item.disabled === true }
      this.items.push(entry)
      row.addEventListener('mouseenter', () => {
        this.focus(this.items.indexOf(entry))
        if (item.children) this.openSubmenu(entry)
        else this.closeSubmenu()
      })
      row.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        if (entry.disabled) return
        if (item.children) {
          this.openSubmenu(entry)
          return
        }
        if (!item.keepOpen) this.close()
        this.onPick(item)
      })
      return row
    }

    openSubmenu(entry) {
      if (this.submenuFor === entry.element) return
      this.closeSubmenu()
      const submenu = makeNode('div', {
        class: 'dfa-menu dfa-sub',
        role: 'menu',
        [MENU_ATTR]: 'submenu',
      })
      const body = makeNode('div', { class: 'dfa-body' })
      submenu.appendChild(body)
      submenu.addEventListener('mousedown', (event) => { if (!event.target.closest('input,button')) event.preventDefault() })
      this.subItems = []
      this.subVisible = []
      this.subIndex = -1
      this.subBody = body
      // A long association list needs a header that stays while it scrolls.
      body.appendChild(makeNode('div', { class: 'dfa-subhead' }, [
        makeNode('span', { text: this.t.openWith }),
        makeNode('span', { text: `${entry.item.children.length} ${this.t.appsUnit}` }),
      ]))
      body.appendChild(makeNode('div', { class: 'dfa-foot', text: this.t.pinHint }))
      const needsSearch = entry.item.children.length > 7
      if (needsSearch) {
        const wrap = makeNode('div', { class: 'dfa-searchwrap' })
        this.searchInput = makeNode('input', {
          class: 'dfa-search',
          type: 'text',
          placeholder: this.t.searchApps,
          'aria-label': this.t.searchApps,
          spellcheck: 'false',
          autocomplete: 'off',
        })
        this.searchInput.addEventListener('input', () => this.filterSubmenu())
        this.searchInput.addEventListener('keydown', (event) => event.stopPropagation())
        wrap.appendChild(this.searchInput)
        body.appendChild(wrap)
      }
      for (const item of entry.item.children) {
        const row = makeNode('div', {
          class: 'dfa-item',
          role: 'menuitem',
          tabindex: '-1',
          id: `dfa-subrow-${this.subItems.length}`,
          [ITEM_ATTR]: item.id,
          title: item.label,
        })
        const icon = makeNode('span', { class: 'dfa-ico' })
        if (item.iconData) icon.appendChild(makeNode('img', { src: item.iconData, alt: '' }))
        else icon.innerHTML = iconSvg('open')
        row.appendChild(icon)
        row.appendChild(makeNode('span', { class: 'dfa-label', text: item.label }))
        if (item.checked || item.preferred) {
          row.appendChild(makeNode('span', { class: 'dfa-tail' }, [
            makeNode('span', { class: 'dfa-default', text: item.preferred ? this.t.preferred : this.t.defaultApp }),
          ]))
        }
        if (item.pinnable) {
          const pin = makeNode('button', { class: 'dfa-pin', type: 'button', tabindex: '-1',
            'aria-label': `${item.preferred ? this.t.unpinApp : this.t.pinApp}: ${item.label}`,
            'aria-pressed': item.preferred ? 'true' : 'false',
            title: item.preferred ? this.t.unpinApp : this.t.pinApp,
            text: item.preferred ? '★' : '☆' })
          pin.addEventListener('click', (event) => {
            event.preventDefault(); event.stopPropagation()
            this.close()
            this.onPick({ ...item, action: 'preferApp' })
          })
          row.appendChild(pin)
        }
        const index = this.subItems.length
        const record = { element: row, item, label: String(item.label).toLowerCase() }
        this.subItems.push(record)
        this.subVisible.push(record)
        row.addEventListener('mouseenter', () => this.focusSub(index))
        row.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          this.close()
          this.onPick(item)
        })
        body.appendChild(row)
      }
      this.subEmpty = makeNode('div', { class: 'dfa-empty', text: this.t.noMatch })
      this.subEmpty.hidden = true
      body.appendChild(this.subEmpty)
      const floor = menuFloor()
      if (floor) submenu.style.setProperty('--dfa-floor', floor)
      document.body.appendChild(submenu)
      this.placeSubmenu(submenu, entry.element)
      this.submenu = submenu
      this.submenuFor = entry.element
      entry.element.setAttribute('aria-expanded', 'true')
      body.addEventListener('scroll', () => this.updateSubFade(), { passive: true })
      requestAnimationFrame(() => this.updateSubFade())
      if (this.keyboard && this.searchInput) {
        try { this.searchInput.focus({ preventScroll: true }) } catch { /* older engine */ }
      }
    }

    /** Filter the association rows by a case-insensitive substring. */
    filterSubmenu() {
      const query = String(this.searchInput ? this.searchInput.value : '').trim().toLowerCase()
      this.subVisible = []
      for (const record of this.subItems) {
        const match = query === '' || record.label.includes(query)
        record.element.hidden = !match
        if (match) this.subVisible.push(record)
      }
      this.subEmpty.hidden = this.subVisible.length > 0
      this.subIndex = -1
      for (const record of this.subItems) record.element.dataset.focus = 'false'
      if (this.submenu) this.submenu.removeAttribute('aria-activedescendant')
      if (this.subVisible.length > 0) this.focusSub(0)
      this.updateSubFade()
    }

    updateSubFade() {
      const body = this.subBody
      if (!body) return
      const top = body.scrollTop > 2
      const bottom = body.scrollTop + body.clientHeight < body.scrollHeight - 2
      const mode = top && bottom ? 'both' : top ? 'top' : bottom ? 'bottom' : 'none'
      if (body.dataset.fade !== mode) body.dataset.fade = mode
    }

    /** Roving focus inside the submenu; the parent menu keeps its own index. */
    focusSub(index) {
      const rows = this.subVisible
      if (rows.length === 0) return
      const next = Math.min(Math.max(index, 0), rows.length - 1)
      const target = rows[next]
      for (const record of this.subItems) record.element.dataset.focus = 'false'
      target.element.dataset.focus = 'true'
      // Keep the parent menu's own row highlighted while the submenu is open.
      this.subIndex = this.subItems.indexOf(target)
      if (this.submenu) this.submenu.setAttribute('aria-activedescendant', target.element.id)
      if (target.element.scrollIntoView) target.element.scrollIntoView({ block: 'nearest' })
    }

    moveSub(delta) {
      const rows = this.subVisible
      if (rows.length === 0) return
      const current = this.subVisible.length > 0 ? this.subVisible.indexOf(this.subItems[this.subIndex]) : this.subIndex
      const from = current < 0 ? (delta > 0 ? -1 : 0) : current
      const next = (from + delta + rows.length) % rows.length
      this.focusSub(next)
    }

    activateSub(prefer = false) {
      const rows = this.subVisible
      const current = this.subItems[this.subIndex]
      const entry = rows.includes(current) ? current : rows[0]
      if (!entry) return
      this.close()
      this.onPick(prefer && entry.item.pinnable ? { ...entry.item, action: 'preferApp' } : entry.item)
    }

    /**
     * Anchor the submenu to its row, flipping to the parent menu's left side when
     * the right edge would clip — flipping relative to the row would cover the
     * menu it belongs to.
     */
    placeSubmenu(submenu, row) {
      submenu.style.left = '0px'
      submenu.style.top = '0px'
      const box = row.getBoundingClientRect()
      const rect = submenu.getBoundingClientRect()
      const parent = this.root ? this.root.getBoundingClientRect() : box
      const vw = window.innerWidth
      const vh = window.innerHeight
      let left = parent.right - 4
      if (left + rect.width > vw - 8) left = parent.left - rect.width + 4
      if (left < 8) left = 8
      let top = box.top - 4
      if (top + rect.height > vh - 8) top = vh - rect.height - 8
      if (top < 8) top = 8
      submenu.style.left = `${Math.round(left)}px`
      submenu.style.top = `${Math.round(top)}px`
    }

    closeSubmenu() {
      if (this.submenu) {
        this.submenuFor?.setAttribute('aria-expanded', 'false')
        this.submenu.remove()
        this.submenu = null
        this.submenuFor = null
      }
      this.subItems = []
      this.subVisible = []
      this.subIndex = -1
      this.searchInput = null
      this.subBody = null
      this.subEmpty = null
    }

    place(menu, x, y, preserveSide = false) {
      menu.style.left = '0px'
      menu.style.top = '0px'
      const rect = menu.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      let left = x
      let top = y
      if (left + rect.width > vw - 8) left = Math.max(8, preserveSide ? vw - rect.width - 8 : x - rect.width)
      if (left < 8) left = 8
      if (top + rect.height > vh - 8) top = Math.max(8, vh - rect.height - 8)
      if (top < 8) top = 8
      menu.style.left = `${Math.round(left)}px`
      menu.style.top = `${Math.round(top)}px`
    }

    focus(index) {
      if (this.items.length === 0) return
      const next = Math.min(Math.max(index, 0), this.items.length - 1)
      this.items.forEach((entry, at) => {
        entry.element.dataset.focus = at === next ? 'true' : 'false'
      })
      this.index = next
      const entry = this.items[next]
      if (entry && this.root) this.root.setAttribute('aria-activedescendant', entry.element.id)
      if (entry && entry.element.scrollIntoView) entry.element.scrollIntoView({ block: 'nearest' })
    }

    move(delta) {
      if (this.items.length === 0) return
      let next = this.index
      for (let step = 0; step < this.items.length; step += 1) {
        next = (next + delta + this.items.length) % this.items.length
        if (!this.items[next].disabled) break
      }
      this.focus(next)
    }

    activate(index) {
      const entry = this.items[index]
      if (!entry || entry.disabled) return
      if (entry.item.children) {
        this.openSubmenu(entry)
        if (this.keyboard) this.focusSub(0)
        return
      }
      if (!entry.item.keepOpen) this.close()
      this.onPick(entry.item)
    }

    handleKeyDown(event) {
      if (!this.root) return
      const typing = this.searchInput && event.target === this.searchInput
      // While the submenu is open it owns the arrows, Enter and Escape, so a
      // keyboard user can actually pick an application.
      if (this.submenu) {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          this.moveSub(1)
          return
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          this.moveSub(-1)
          return
        }
        if (event.key === 'Enter' || (event.key === ' ' && !typing)) {
          event.preventDefault()
          this.activateSub(event.shiftKey && event.key === 'Enter')
          return
        }
        if (event.key === 'ArrowLeft' || event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          // Escape in a non-empty filter clears it first, then closes.
          if (event.key === 'Escape' && this.searchInput && this.searchInput.value !== '') {
            this.searchInput.value = ''
            this.filterSubmenu()
            return
          }
          this.closeSubmenu()
          return
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        this.close()
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        this.move(1)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        this.move(-1)
        return
      }
      if (event.key === 'Home') {
        event.preventDefault()
        this.focus(0)
        return
      }
      if (event.key === 'End') {
        event.preventDefault()
        this.focus(this.items.length - 1)
        return
      }
      if (event.key === 'ArrowRight') {
        const entry = this.items[this.index]
        if (entry && entry.item.children) {
          event.preventDefault()
          this.openSubmenu(entry)
          this.focusSub(0)
        }
        return
      }
      if (event.key === 'ArrowLeft') {
        if (this.submenu) {
          event.preventDefault()
          this.closeSubmenu()
        }
        return
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        this.activate(this.index)
      }
    }

    handlePointerDown(event) {
      if (!this.root) return
      // `blur` does not bubble, but a capture listener on window still sees the
      // blur of any descendant — including the element that loses focus to this
      // menu when it opens. Only a real window blur may close it.
      if (event.type === 'blur' && event.target !== window) return
      const target = event.target
      if (target instanceof Node && (this.root.contains(target) || (this.submenu && this.submenu.contains(target)))) return
      this.close()
    }

    /**
     * The chat transcript streams, so the page scrolls under an open menu. Follow
     * the anchor row instead of vanishing; close only once it leaves the viewport.
     */
    followAnchor() {
      if (!this.root) return
      const anchor = this.anchor
      if (!anchor || !anchor.isConnected) {
        this.close()
        return
      }
      const rect = anchor.getBoundingClientRect()
      if ((rect.width === 0 && rect.height === 0) || rect.bottom < 0 || rect.top > window.innerHeight) {
        this.close()
        return
      }
      this.closeSubmenu()
      this.x = rect.left
      this.y = rect.bottom
      this.place(this.root, this.x, this.y)
    }

    close() {
      if (this.closed) return
      this.closed = true
      this.closeSubmenu()
      document.removeEventListener('keydown', this.handleKeyDown, true)
      document.removeEventListener('pointerdown', this.handlePointerDown, true)
      window.removeEventListener('resize', this.handlePointerDown, true)
      window.removeEventListener('blur', this.handlePointerDown, true)
      if (this.root) this.root.remove()
      this.root = null
      this.body = null
      this.thumbUrl = null
      this.items = []
      const previous = this.previousFocus
      this.previousFocus = null
      if (previous && previous !== document.body && typeof previous.focus === 'function' && previous.isConnected) {
        try { previous.focus({ preventScroll: true }) } catch { /* the element may have unmounted */ }
      }
      if (this.onClose) this.onClose()
    }
  }

  /* ───────────────────────────── clipboard ───────────────────────────── */

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch { /* fall through to the legacy path */ }
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.top = '-1000px'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      area.remove()
      return ok
    } catch {
      return false
    }
  }

  function downloadBytes(bytes, name, mime) {
    const blob = new Blob([bytes], { type: mime || 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name || 'download'
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  /** Hand a URL to the app's own link handling (a new window/tab). */
  function openExternal(url) {
    try {
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.target = '_blank'
      anchor.rel = 'noopener noreferrer'
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      return true
    } catch {
      return false
    }
  }

  /** Fill the window opened synchronously by the click with the file's bytes. */
  function fillBrowserWindow(win, bytes, mime) {
    try {
      const blob = new Blob([bytes], { type: mime })
      const url = URL.createObjectURL(blob)
      // File HTML/SVG may contain scripts. Keep working previews, but give
      // them an opaque origin so they cannot read the DSH page or its cookies.
      win.opener = null
      const frame = win.document.createElement('iframe')
      frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-downloads allow-popups')
      frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0'
      frame.src = url
      win.document.body.replaceChildren(frame)
      setTimeout(() => URL.revokeObjectURL(url), 60000)
      return true
    } catch {
      try { win.close() } catch { /* already gone */ }
      return false
    }
  }

  /* ─────────────────────────────── actions ─────────────────────────────── */

  const MAX_COPY_BYTES = 2 * 1024 * 1024

  async function dispatch(item, target, context) {
    const { bridge, t, sessionId } = context
    const path = target.absolutePath
    if (item.action === 'openLink' || item.action === 'copyLink' || item.action === 'copyLinkText') {
      if (item.action === 'openLink') {
        if (!openExternal(target.link)) toast(t.openFailed, { error: true })
        return
      }
      const value = item.action === 'copyLink' ? target.link : target.text
      const ok = await copyText(value || target.link)
      toast(ok ? (item.action === 'copyLink' ? t.copiedLink : t.copiedLinkText) : t.copyFailed, { error: !ok })
      return
    }
    if (item.action === 'open') {
      const ok = await bridge.open(path, item.appId)
      if (!ok) toast(t.openFailed, { error: true })
      return
    }
    if (item.action === 'reveal') {
      const ok = await bridge.reveal(path)
      if (!ok) toast(t.revealFailed, { error: true })
      return
    }
    if (item.action === 'copyPath' || item.action === 'copyRelPath' || item.action === 'copyFileName') {
      const value = item.action === 'copyPath' ? path
        : item.action === 'copyRelPath' ? target.displayPath : basename(path)
      const message = item.action === 'copyPath' ? t.copiedPath
        : item.action === 'copyRelPath' ? t.copiedRelPath : t.copiedFileName
      const ok = await copyText(value)
      toast(ok ? message : t.copyFailed, { error: !ok })
      return
    }
    if (item.action === 'copyReference') {
      const ok = await copyText(target.reference || path)
      toast(ok ? t.copiedReference : t.copyFailed, { error: !ok })
      return
    }
    if (item.action === 'copyMarkdown') {
      const label = String(target.text || '').replace(/([\[\]])/g, '\\$1')
      const ok = await copyText(`[${label || target.link}](${target.link})`)
      toast(ok ? t.copiedMarkdown : t.copyFailed, { error: !ok })
      return
    }
    if (item.action === 'copyContents' && typeof target.bytes === 'number' && target.bytes > MAX_COPY_BYTES) {
      // The size is already known from the stat; never pull a huge file across
      // the wire just to refuse it.
      toast(t.tooLarge, { error: true })
      return
    }
    if (item.action === 'browser') {
      // Must happen inside the click's gesture, before any await, or the popup
      // blocker eats it.
      const win = window.open('', '_blank')
      if (!win) {
        toast(t.popupBlocked, { error: true })
        return
      }
      win.opener = null
      const result = await bridge.readBytes(sessionId, path)
      if (!result || !(result.data instanceof Uint8Array) || result.eof === false) {
        try { win.close() } catch { /* already gone */ }
        toast(t.readFailed, { error: true })
        return
      }
      if (!fillBrowserWindow(win, result.data, mimeOf(path))) toast(t.popupBlocked, { error: true })
      return
    }
    if (item.action === 'copyContents' || item.action === 'saveAs') {
      const options = item.action === 'copyContents'
        // The Host refuses a window above its own maxBytes (2 MB by default), so
        // ask for exactly the cap and read `eof === false` as "too large".
        ? { range: { offset: 0, length: MAX_COPY_BYTES } }
        : {}
      const result = await bridge.readBytes(sessionId, path, options)
      if (!result || !(result.data instanceof Uint8Array) || (item.action === 'saveAs' && result.eof === false)) {
        toast(t.readFailed, { error: true })
        return
      }
      const bytes = result.data
      if (item.action === 'saveAs') {
        downloadBytes(bytes, basename(path), mimeOf(path))
        return
      }
      if (bytes.byteLength > MAX_COPY_BYTES || result.eof === false) {
        toast(t.tooLarge, { error: true })
        return
      }
      let text = ''
      try {
        text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
      } catch {
        toast(t.readFailed, { error: true })
        return
      }
      if (text.includes('\u0000')) {
        toast(t.binary, { error: true })
        return
      }
      const ok = await copyText(text)
      toast(ok ? t.copiedContents : t.copyFailed, { error: !ok })
    }
  }

  /* ─────────────────────────────── plugin ─────────────────────────────── */

  function detectLanguage(ctx) {
    try {
      const service = ctx.locale
      const candidates = [
        service && service.language && service.language.getSnapshot ? service.language.getSnapshot() : null,
        service && service.locale && service.locale.getSnapshot ? service.locale.getSnapshot() : null,
        service && service.current && service.current.getSnapshot ? service.current.getSnapshot() : null,
      ]
      for (const value of candidates) {
        if (typeof value === 'string' && value) return value
        if (value && typeof value.language === 'string') return value.language
      }
    } catch { /* fall back to the browser */ }
    try {
      return navigator.language || 'zh-CN'
    } catch {
      return 'zh-CN'
    }
  }

  function start(ctx) {
    if (typeof document === 'undefined' || typeof window === 'undefined') return
    ensureCss()
    const bridge = createBridge(ctx)
    const t = messages(detectLanguage(ctx))

    let menu = null
    let generation = 0
    let disposed = false

    function closeMenu() {
      generation++
      if (menu) {
        menu.close()
        menu = null
      }
    }

    // Guessed text must be verified before cancelling the browser's menu. Warm
    // it on hover/focus; a cold right-click keeps the native menu for that click.
    const probeCache = new Map()
    const probePending = new Map()
    function locate(candidate) {
      const session = bridge.activeSession(candidate.sessionId)
      const located = stripLocationSuffix(candidate.path)
      const path = isAbsolutePath(located.path) ? located.path : joinPath(session?.cwd, located.path)
      return { session, located, path, key: JSON.stringify([session?.id, path]) }
    }
    function cachedProbe(candidate) {
      const cached = probeCache.get(locate(candidate).key)
      return cached && Date.now() - cached.at < 5000 ? cached.value : null
    }
    function warmCandidate(candidate) {
      if (!candidate || candidate.link || !['text', 'title'].includes(candidate.source)) return
      const { session, path, key } = locate(candidate)
      if (!session || !path || cachedProbe(candidate) || probePending.has(key) || probePending.size >= 4) return
      const pending = bridge.probe(session.id, path).then((value) => {
        if (disposed) return
        if (probeCache.size >= 64) probeCache.delete(probeCache.keys().next().value)
        probeCache.set(key, { value, at: Date.now() })
      }).finally(() => probePending.delete(key))
      probePending.set(key, pending)
    }
    let preferenceStorage
    try { preferenceStorage = window.localStorage } catch { /* private storage may be disabled */ }
    const preferences = applicationPreferences(preferenceStorage)

    async function openAt(candidate, x, y, keyboard) {
      const debug = { path: candidate.path, source: candidate.source, stage: 'start' }
      try { window.__dfaDebug = debug } catch { /* no window */ }
      if (disposed) return
      const attempt = ++generation
      let handle
      try {
        if (candidate.link) {
          const text = String(candidate.element?.textContent || '').trim().slice(0, 512)
          const target = { link: candidate.link, text }
          handle = new FileMenu({ model: buildLinkMenuModel({ url: candidate.link, text, t }),
            x, y, keyboard, anchor: candidate.element, t,
            onClose: () => { if (menu === handle) menu = null },
            onPick: (item) => { void dispatch(item, target, { bridge, t }) },
          })
          menu = handle
          handle.open()
          debug.stage = 'opened'
          return
        }
        const { session, located, path } = locate(candidate)
        const modelInput = { absolutePath: path, displayPath: located.path, apps: [], appsState: 'loading',
          location: located, reference: candidate.path, t }
        let target
        handle = new FileMenu({ model: buildStatusModel(path, t.checking, t),
          x, y, keyboard, anchor: candidate.element, t,
          onClose: () => { if (menu === handle) menu = null },
          onPick: (item) => {
            if (item.action === 'retry') { void openAt(candidate, x, y, keyboard); return }
            if (item.action === 'retryApps') {
              modelInput.appsState = 'loading'
              handle.setModel(buildMenuModel(modelInput))
              void enrich(handle, modelInput)
              return
            }
            if (item.action === 'preferApp') {
              const appId = preferences.get(path) === item.appId ? '' : item.appId
              const saved = preferences.set(path, appId)
              toast(saved ? (appId ? t.preferenceSaved : t.preferenceCleared) : t.preferenceFailed, { error: !saved })
              return
            }
            if (target) void dispatch(item, target, { bridge, t, sessionId: session.id })
          },
        })
        menu = handle
        handle.open()
        if (!session) {
          debug.stage = 'no-session'
          handle.setModel(buildStatusModel(path, t.noSession, t, true))
          return
        }
        debug.session = session.id
        debug.cwd = session.cwd
        debug.absolutePath = path
        debug.stage = 'probe'
        const probe = cachedProbe(candidate) || await bridge.probe(session.id, path)
        if (disposed || attempt !== generation || handle.closed) return
        debug.probe = probe
        if (!probe || probe.error) {
          debug.stage = 'probe-failed'
          handle.setModel(buildStatusModel(path, t[probe?.error] || t.probeFailed, t, true))
          return
        }
        Object.assign(modelInput, { absolutePath: probe.absolutePath, isDir: probe.isDir,
          bytes: probe.bytes, outsideWorkspace: !isInside(session.cwd, probe.absolutePath),
          cwd: session.cwd, preferredId: preferences.get(probe.absolutePath) })
        target = { absolutePath: probe.absolutePath, displayPath: located.path,
          isDir: probe.isDir, line: located.line, column: located.column, bytes: probe.bytes,
          reference: candidate.path }
        handle.setModel(buildMenuModel(modelInput))
        debug.stage = 'opened'
        if (!probe.isDir) void enrich(handle, modelInput)
        if (!probe.isDir && (classify(probe.absolutePath, false).kind === 'image' || extname(probe.absolutePath) === 'svg')) {
          void loadThumb(handle, session.id, probe.absolutePath, probe.bytes, probe.version)
        }
      } catch (error) {
        debug.stage = 'error'
        debug.error = String(error?.message || error)
        if (!disposed && attempt === generation && handle && !handle.closed) {
          handle.setModel(buildStatusModel(candidate.path, t.probeFailed, t, true))
        }
        console.warn('[dsh-file-actions] context menu failed:', error)
      }
    }

    // Associations are per file type, so one query per extension serves the page.
    // Ten minutes keeps a newly installed editor visible without re-asking the
    // OS on every right-click.
    const APPS_TTL_MS = 10 * 60 * 1000
    const appsCache = new Map()
    async function enrich(handle, input) {
      const key = extname(input.absolutePath).toLowerCase()
      const cached = appsCache.get(key)
      const result = cached && Date.now() - cached.at < cached.ttl
        ? cached.result : await bridge.applications(input.absolutePath)
      if (disposed) return
      // Successful empty answers are different from a failed Remote query.
      if (result.state === 'ready') appsCache.set(key, { result, at: Date.now(), ttl: result.apps.length ? APPS_TTL_MS : 15000 })
      if (menu !== handle || handle.closed) return
      Object.assign(input, { apps: result.apps, appsState: result.state })
      handle.setModel(buildMenuModel(input))
    }

    // A thumbnail is worth one bounded read; bigger files just keep the tile.
    const THUMB_MAX_BYTES = 8 * 1024 * 1024
    const thumbCache = new Map()
    async function loadThumb(handle, sessionId, absolutePath, bytes, version) {
      try {
        if (typeof bytes === 'number' && bytes > THUMB_MAX_BYTES) { handle.setThumbnail(null); return }
        const key = JSON.stringify([sessionId, absolutePath, version])
        const cached = version && thumbCache.get(key)
        if (cached) {
          if (menu === handle && !handle.closed) handle.setThumbnail(cached.url)
          return
        }
        const result = await bridge.readBytes(sessionId, absolutePath)
        if (disposed || menu !== handle || handle.closed) return
        if (!result || !(result.data instanceof Uint8Array) || result.eof === false || result.data.byteLength > THUMB_MAX_BYTES) {
          handle.setThumbnail(null)
          return
        }
        const url = URL.createObjectURL(new Blob([result.data], { type: mimeOf(absolutePath) }))
        const previous = thumbCache.get(key)
        if (previous) URL.revokeObjectURL(previous.url)
        thumbCache.set(key, { url, at: Date.now() })
        if (thumbCache.size > 12) {
          const oldest = [...thumbCache.entries()].sort((a, b) => a[1].at - b[1].at)[0]
          if (oldest) {
            URL.revokeObjectURL(oldest[1].url)
            thumbCache.delete(oldest[0])
          }
        }
        if (menu === handle && !handle.closed) handle.setThumbnail(url)
      } catch (error) {
        if (menu === handle && !handle.closed) handle.setThumbnail(null)
        console.warn('[dsh-file-actions] thumbnail failed:', error)
      }
    }

    function onContextMenu(event) {
      if (event.defaultPrevented) return
      if (event.shiftKey) { closeMenu(); return }
      const target = event.target
      // A right-click on the menu itself must not open a second menu over it.
      if (target && target.closest && target.closest(`[${MENU_ATTR}]`)) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      closeMenu()
      const candidate = candidateFromEvent(event, document)
      if (!candidate) return
      if (['text', 'title'].includes(candidate.source)) {
        const probe = cachedProbe(candidate)
        if (!probe || probe.error) { warmCandidate(candidate); return }
      }
      event.preventDefault()
      event.stopPropagation()
      void openAt(candidate, event.clientX, event.clientY, false)
    }

    function onKeyDown(event) {
      const wantsMenu = (event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu'
      if (!wantsMenu) return
      const active = document.activeElement
      if (!active || !active.getBoundingClientRect) return
      const rect = active.getBoundingClientRect()
      const candidate = candidateFromEvent({
        target: active,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }, document)
      if (!candidate) return
      if (['text', 'title'].includes(candidate.source)) {
        const probe = cachedProbe(candidate)
        if (!probe || probe.error) { warmCandidate(candidate); return }
      }
      event.preventDefault()
      void openAt(candidate, rect.left, rect.bottom, true)
    }

    function onWarm(event) {
      if (event.shiftKey || event.target?.closest?.(`[${MENU_ATTR}]`)) return
      const rect = event.target?.getBoundingClientRect?.()
      warmCandidate(candidateFromEvent({ target: event.target,
        clientX: event.clientX ?? rect?.left, clientY: event.clientY ?? rect?.top }, document))
    }

    function onPointerDown(event) {
      const target = event.target
      if (target && target.closest && target.closest(`[${MENU_ATTR}]`)) return
      closeMenu()
    }

    function onViewportChange(event) {
      // Scrolling the menu's own long lists (or the "open with" submenu) is not
      // the page moving; closing on it would make those lists unusable.
      const target = event && event.target
      if (target && target.closest && target.closest(`[${MENU_ATTR}]`)) return
      if (!menu) return
      if (event && event.type === 'scroll') {
        menu.followAnchor()
        return
      }
      closeMenu()
    }

    const install = () => {
      if (activeCleanup) activeCleanup()
      document.addEventListener('contextmenu', onContextMenu, true)
      document.addEventListener('pointerover', onWarm, true)
      document.addEventListener('focusin', onWarm, true)
      document.addEventListener('keydown', onKeyDown, true)
      document.addEventListener('pointerdown', onPointerDown, true)
      window.addEventListener('resize', onViewportChange)
      document.addEventListener('scroll', onViewportChange, true)
      // A DOM marker survives page-side identity quirks and gives the e2e driver
      // one stable readiness signal instead of guessing at boot timing.
      document.documentElement.setAttribute('data-dfa-ready', '1')
      const cleanup = () => {
        disposed = true
        document.documentElement.removeAttribute('data-dfa-ready')
        document.removeEventListener('contextmenu', onContextMenu, true)
        document.removeEventListener('pointerover', onWarm, true)
        document.removeEventListener('focusin', onWarm, true)
        probeCache.clear()
        probePending.clear()
        document.removeEventListener('keydown', onKeyDown, true)
        document.removeEventListener('pointerdown', onPointerDown, true)
        window.removeEventListener('resize', onViewportChange)
        document.removeEventListener('scroll', onViewportChange, true)
        closeMenu()
        for (const value of thumbCache.values()) URL.revokeObjectURL(value.url)
        thumbCache.clear()
        appsCache.clear()
        if (activeCleanup === cleanup) activeCleanup = null
      }
      activeCleanup = cleanup
      return cleanup
    }

    if (typeof ctx.effect === 'function') {
      ctx.effect(install, 'dsh-file-actions: context menu')
    } else {
      install()
    }
  }

  /**
   * The loader records one failed row as a boot-audit failure with no message, so
   * log the real stack before rethrowing.
   */
  function apply(ctx) {
    try {
      start(ctx)
    } catch (error) {
      console.error('[dsh-file-actions] activation failed:', (error && error.stack) || error)
      throw error
    }
  }

  module.exports = {
    name: 'dsh-file-actions',
    inject: ['sessions', 'remote', 'remote.session', 'remote.workspaceFiles'],
    apply,
    // Exposed for the Node unit tests: the bundle is a classic script, so the
    // test harness evaluates it with a fake `window` and reads these directly.
    __internals: {
      messages,
      isAbsolutePath,
      normalizeSlashes,
      basename,
      extname,
      formatBytes,
      stripLocationSuffix,
      joinPath,
      looksLikePath,
      pathFromHref,
      classify,
      isTextName,
      isInside,
      relativeTo,
      softPath,
      stripDecorations,
      dispatch,
      mimeOf,
      pickEditor,
      orderApplications,
      applicationPreferences,
      buildStatusModel,
      FileMenu,
      buildMenuModel,
      buildLinkMenuModel,
      formatLocation,
      linkFromHref,
      candidateFromEvent,
      createBridge,
      fillBrowserWindow,
      tokenAtPoint,
      unwrap,
      menuFloor,
      MAX_COPY_BYTES,
    },
  }
  return module.exports
}

if (typeof window !== 'undefined' && window.__ModuleLoader__) {
  window.__ModuleLoader__.load({ id: '@jidekaixin2dian/dsh-file-actions', factory })
}
})()
