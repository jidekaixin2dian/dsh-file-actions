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
const factory = (require) => {
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
    settings: {
      title: '文件与链接操作 · File Actions', nav: '文件操作',
      resetShort: '恢复默认', clearShort: '全部清除', removeShort: '取消',
      menuHint: '按习惯选择右键菜单的详细程度', contextHint: '只影响预览，复制仍只包含引用行',
      scopeShort: '仅在当前客户端保存，不改变系统默认应用。',
      cacheHint: '下次右键重新查询，首选应用保留。',
      intro: '让文件操作更顺手。修改后立即生效。',
      project: '项目与反馈', projectHint: '有问题或想法？欢迎在 GitHub 留言，一起把文件操作做得更顺手。',
      github: 'GitHub 项目', feedback: '反馈问题',
      scope: '仅保存在当前浏览器或 Desktop 客户端；不会修改系统默认应用。',
      display: '菜单与预览', menuMode: '菜单显示', full: '完整菜单', compact: '精简菜单',
      menuHelp: '精简模式保留打开、打开方式、定位、引用预览、复制路径与正文、另存等常用操作。',
      contextLines: '引用前后文', contextOption: '前后各 {count} 行',
      defaults: '恢复菜单与预览默认设置',
      apps: '首选应用', appsHelp: '在文件右键菜单的「打开方式」中设置首选；这里可查看和取消。',
      noApps: '尚未设置首选应用', noExtension: '无扩展名', remove: '取消首选', clearApps: '清除全部首选应用',
      cache: '关联应用缓存', cacheHelp: '安装或卸载应用后，可清除缓存。下次右键文件时会重新查询，不会清除首选应用。',
      cacheCount: '已缓存 {count} 种文件类型', clearCache: '清除关联缓存',
      saved: '设置已保存', reset: '已恢复完整菜单与前后各 8 行', removed: '首选应用已清除',
      cacheCleared: '关联缓存已清除，下次右键将重新查询',
      failed: '无法保存，请检查当前客户端的存储权限；原设置保留。',
    },
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
    copyLines: '复制引用行',
    referencePreview: '查看引用上下文',
    copySource: '复制片段及来源',
    copiedSource: '片段及来源已复制',
    closePreview: '关闭预览',
    referenceLoading: '正在读取引用上下文…',
    referenceWindow: '预览第 {from}–{to} 行，共 {total} 行 · 复制仅包含引用行',
    previewClipped: '长行或较大引用仅显示部分内容，复制保留完整引用行',
    confirmOutsidePreview: '该文件在会话工作区之外。确认读取并预览它的内容吗？\n{path}',
    saveAs: '另存为…',
    copiedPath: '路径已复制',
    copiedRelPath: '相对路径已复制',
    copiedFileName: '文件名已复制',
    copiedReference: '引用已复制',
    copiedMarkdown: 'Markdown 已复制',
    lineAt: '第 {line} 行',
    lineRange: '第 {from}–{to} 行',
    copiedContents: '文件内容已复制',
    copiedLines: '引用行已复制',
    invalidLines: '引用行超出文件范围或行号无效，请检查引用',
    copyFailed: '复制失败',
    readFailed: '读取失败',
    fileChanged: '读取期间文件已变化，请重试',
    invalidEncoding: '文件不是有效的 UTF-8 文本，请用编辑器打开',
    confirmUnavailable: '无法显示确认框，已取消复制',
    appUnavailable: '应用关联已变化，请重新打开菜单选择',
    previewSafe: '安全预览：脚本与外部资源已关闭',
    previewTrust: '信任此文件，启用脚本与联网',
    previewTrusted: '已启用脚本与联网，仅对此预览有效',
    tooLarge: '文件过大，请改用「另存为」',
    binary: '二进制文件，无法复制为文本',
    confirmOutsideCopy: '该文件在会话工作区之外，不是本对话的一部分。确认要把它的内容复制到剪贴板吗？\n{path}',
    openFailed: '打开失败',
    revealFailed: '无法定位该文件',
    popupBlocked: '浏览器拦截了新窗口',
    noSession: '没有可用的会话',
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
    editorPending: '在编辑器中打开…',
    preferred: '首选',
    pinApp: '设为此文件类型的首选应用',
    unpinApp: '取消此文件类型的首选应用',
    pinHint: 'Shift+Enter 设置或取消首选',
    preferenceSaved: '首选应用已保存',
    preferenceCleared: '已恢复自动选择应用',
    preferenceFailed: '无法保存首选应用，请检查浏览器存储设置',
    previewLoading: '正在读取缩略图…',
    previewUnavailable: '无可用缩略图',
    viewLarge: '查看大图',
    previewHint: '点击图片或按 Esc 关闭',
    previewVideoHint: '视频首帧 · 用「在浏览器中打开」看完整视频',
    checking: '正在确认文件…',
    unavailable: '文件服务不可用',
    denied: '没有权限访问该文件',
    probeFailed: '无法确认文件，请检查连接或权限',
    retry: '重试',
    nativeHint: 'Shift+右键 先交给页面处理',
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
      subtitle: '字幕',
      code: '代码',
      data: '数据',
      font: '字体',
      design: '设计稿',
      model: '3D 模型',
      disk: '磁盘镜像',
      exec: '程序',
      binary: '其他文件',
      dir: '文件夹',
      link: '链接',
    },
  }

  const EN = {
    settings: {
      title: 'File Actions · 文件与链接操作', nav: 'File Actions',
      resetShort: 'Reset', clearShort: 'Clear all', removeShort: 'Remove',
      menuHint: 'Choose how much appears in the file menu', contextHint: 'Preview only; copying keeps the referenced lines',
      scopeShort: 'Saved on this client. System defaults stay unchanged.',
      cacheHint: 'Queries again on the next file menu; preferences stay.',
      intro: 'File actions, the way you work. Changes apply immediately.',
      project: 'Project and feedback', projectHint: 'Found a problem or have an idea? Help make File Actions better on GitHub.',
      github: 'GitHub project', feedback: 'Report an issue',
      scope: 'Saved in this browser or Desktop client only. System default applications stay unchanged.',
      display: 'Menu and preview', menuMode: 'Menu display', full: 'Full menu', compact: 'Compact menu',
      menuHelp: 'Compact mode keeps open, open with, reveal, reference context, path and text copying, and save actions.',
      contextLines: 'Reference context', contextOption: '{count} lines before and after',
      defaults: 'Reset menu and preview defaults',
      apps: 'Preferred applications', appsHelp: 'Set preferences from a file’s Open with menu; view and remove them here.',
      noApps: 'No preferred applications yet', noExtension: 'No extension', remove: 'Remove preference', clearApps: 'Clear all preferred applications',
      cache: 'Application cache', cacheHelp: 'After installing or removing applications, clear this cache. The next file menu queries applications again; preferences are retained.',
      cacheCount: '{count} file types cached', clearCache: 'Clear application cache',
      saved: 'Settings saved', reset: 'Full menu and 8 context lines restored', removed: 'Application preferences cleared',
      cacheCleared: 'Cache cleared; the next file menu will query applications again',
      failed: 'Could not save. Check client storage permissions; previous settings are retained.',
    },
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
    copyLines: 'Copy referenced lines',
    referencePreview: 'View reference context',
    copySource: 'Copy excerpt with source',
    copiedSource: 'Excerpt and source copied',
    closePreview: 'Close preview',
    referenceLoading: 'Loading reference context…',
    referenceWindow: 'Showing lines {from}–{to} of {total} · Copy includes referenced lines only',
    previewClipped: 'Long lines or large references are shortened in preview; copying retains the full referenced lines',
    confirmOutsidePreview: 'This file is outside the session workspace. Read and preview its contents?\n{path}',
    saveAs: 'Save as…',
    copiedPath: 'Path copied',
    copiedRelPath: 'Relative path copied',
    copiedFileName: 'File name copied',
    copiedReference: 'Reference copied',
    copiedMarkdown: 'Markdown copied',
    lineAt: 'line {line}',
    lineRange: 'lines {from}–{to}',
    copiedContents: 'File contents copied',
    copiedLines: 'Referenced lines copied',
    invalidLines: 'Referenced lines are invalid or outside the file; check the reference',
    copyFailed: 'Copy failed',
    readFailed: 'Read failed',
    fileChanged: 'The file changed while reading; please retry',
    invalidEncoding: 'This file is not valid UTF-8 text; open it in an editor',
    confirmUnavailable: 'Confirmation is unavailable; copying was cancelled',
    appUnavailable: 'Application associations changed; reopen the menu to choose again',
    previewSafe: 'Safe preview: scripts and external resources are disabled',
    previewTrust: 'Trust this file and enable scripts and network access',
    previewTrusted: 'Scripts and network access enabled for this preview only',
    tooLarge: 'File is too large — use Save as',
    binary: 'Binary file cannot be copied as text',
    confirmOutsideCopy: 'This file is outside the session workspace and not part of this conversation. Copy its contents to the clipboard?\n{path}',
    openFailed: 'Open failed',
    revealFailed: 'Could not reveal this file',
    popupBlocked: 'The browser blocked the new window',
    noSession: 'No active session',
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
    editorPending: 'Open in editor…',
    preferred: 'Preferred',
    pinApp: 'Prefer this application for this file type',
    unpinApp: 'Clear the preferred application for this file type',
    pinHint: 'Shift+Enter to set or clear preference',
    preferenceSaved: 'Preferred application saved',
    preferenceCleared: 'Automatic application selection restored',
    preferenceFailed: 'Could not save preference; check browser storage settings',
    previewLoading: 'Loading thumbnail…',
    previewUnavailable: 'No thumbnail available',
    viewLarge: 'View full size',
    previewHint: 'Click the image or press Esc to close',
    previewVideoHint: 'First video frame · use “Open in browser” to watch it',
    checking: 'Checking file…',
    unavailable: 'File service unavailable',
    denied: 'Permission to access this file was denied',
    probeFailed: 'Could not verify file; check connection or permissions',
    retry: 'Retry',
    nativeHint: 'Shift+right-click lets the page handle it first',
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
      subtitle: 'Subtitle',
      code: 'Code',
      data: 'Data',
      font: 'Font',
      design: 'Design',
      model: '3D model',
      disk: 'Disk image',
      exec: 'Executable',
      binary: 'Other file',
      dir: 'Folder',
      link: 'Link',
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
  const SUBTITLE_EXT = new Set(['srt', 'ass', 'ssa', 'vtt', 'sub', 'sbv', 'lrc'])
  const DATA_EXT = new Set(['json', 'jsonc', 'json5', 'jsonl', 'ndjson', 'har', 'yaml', 'yml', 'toml', 'ini',
    'cfg', 'conf', 'properties', 'plist', 'lock', 'csv', 'tsv', 'xml', 'xsd', 'xsl', 'xslt', 'sql'])
  const CODE_EXT = new Set(['js', 'mjs', 'cjs', 'jsx', 'ts', 'mts', 'cts', 'tsx', 'vue', 'svelte', 'astro', 'css',
    'scss', 'sass', 'less', 'styl', 'hbs', 'ejs', 'pug', 'twig', 'liquid', 'njk', 'py', 'pyi', 'rb', 'php', 'go',
    'rs', 'java', 'kt', 'kts', 'scala', 'groovy', 'clj', 'cljs', 'ex', 'exs', 'erl', 'hrl', 'hs', 'elm', 'lua',
    'pl', 'r', 'jl', 'dart', 'swift', 'm', 'mm', 'fs', 'fsx', 'cs', 'vb', 'pas', 'f90', 'for', 'asm', 's', 'v',
    'sv', 'vhd', 'vhdl', 'c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'hh', 'hxx', 'sh', 'bash', 'zsh', 'fish', 'ps1',
    'psm1', 'bat', 'cmd', 'graphql', 'gql', 'proto', 'thrift', 'prisma', 'diff', 'patch', 'cmake', 'mk', 'ninja',
    'bazel', 'bzl', 'gradle', 'tf', 'tfvars', 'glsl', 'hlsl', 'wgsl', 'frag', 'vert', 'comp', 'shader', 'mtl',
    'tex', 'bib', 'ipynb'])
  const FONT_EXT = new Set(['woff', 'woff2', 'ttf', 'otf', 'ttc', 'eot', 'fon', 'icns', 'cur'])
  const DESIGN_EXT = new Set(['psd', 'ai', 'eps', 'indd', 'fig', 'sketch', 'xd'])
  const MODEL_EXT = new Set(['blend', 'fbx', 'obj', 'glb', 'gltf', 'stl', 'step', 'stp', 'iges', 'igs', '3ds',
    'max', 'c4d', 'ma', 'mb', 'abc', 'usd', 'usdz'])
  const DISK_EXT = new Set(['iso', 'dmg', 'vhd', 'vhdx', 'vmdk', 'img'])
  const EXEC_EXT = new Set(['exe', 'msi', 'dll', 'so', 'dylib', 'class', 'jar', 'war', 'apk', 'ipa', 'deb', 'rpm',
    'appimage', 'wasm'])
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
    const s = stripLocationSuffix(value).path
    if (s.length === 0 || s.length > 1024) return false
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return false
    if (/[\r\n\t]/.test(s)) return false
    if (/[\\/]/.test(s)) return true
    const ext = extname(s)
    return (ext.length > 0 && KNOWN_EXT.has(ext)) || isTextName(s)
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
      try {
        const url = new URL(value)
        let path
        try { path = decodeURIComponent(url.pathname) } catch { path = url.pathname }
        if (url.hostname) return `//${url.hostname}${path}`
        return /^\/[A-Za-z]:/.test(path) ? path.slice(1) : path
      } catch { /* retain malformed local paths without throwing from the event */ }
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
    if (SUBTITLE_EXT.has(ext)) return { kind: 'subtitle', ext, canCopyText: true, canBrowser: false, canSaveAs: true }
    if (FONT_EXT.has(ext)) return { kind: 'font', ext, canCopyText: false, canBrowser: false, canSaveAs: true }
    if (DESIGN_EXT.has(ext)) return { kind: 'design', ext, canCopyText: false, canBrowser: false, canSaveAs: true }
    if (MODEL_EXT.has(ext)) return { kind: 'model', ext, canCopyText: false, canBrowser: false, canSaveAs: true }
    if (DISK_EXT.has(ext)) return { kind: 'disk', ext, canCopyText: false, canBrowser: false, canSaveAs: true }
    if (EXEC_EXT.has(ext)) return { kind: 'exec', ext, canCopyText: false, canBrowser: false, canSaveAs: true }
    if (CODE_EXT.has(ext)) return { kind: 'code', ext, canCopyText: true, canBrowser: false, canSaveAs: true }
    if (DATA_EXT.has(ext)) return { kind: 'data', ext, canCopyText: true, canBrowser: false, canSaveAs: true }
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
  function applicationPreferences(storage, notify = () => {}) {
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
      list() { return Object.entries(read()).filter(([key, value]) => key && typeof value === 'string' && value).sort(([a], [b]) => a.localeCompare(b)).map(([type, appId]) => ({ type, appId })) },
      remove(type) {
        try { const value = read(); delete value[type]; storage.setItem(key, JSON.stringify(value)); notify(); return true } catch { return false }
      },
      clear() { try { storage.removeItem(key); notify(); return true } catch { return false } },
      set(path, appId) {
        try {
          const value = read()
          if (appId) Object.defineProperty(value, type(path), { value: appId, enumerable: true, configurable: true, writable: true })
          else delete value[type(path)]
          storage.setItem(key, JSON.stringify(value))
          notify()
          return true
        } catch { return false }
      },
    }
  }

  const CLIENT_SETTINGS_KEY = 'dsh-file-actions.settings.v1'
  function clientPreferences(storage) {
    const sanitize = value => ({ menuMode: value?.menuMode === 'compact' ? 'compact' : 'full',
      contextLines: [4, 8, 16].includes(value?.contextLines) ? value.contextLines : 8 })
    return {
      get() { try { return sanitize(JSON.parse(storage.getItem(CLIENT_SETTINGS_KEY) || '{}')) } catch { return sanitize(null) } },
      set(patch) { try { storage.setItem(CLIENT_SETTINGS_KEY, JSON.stringify(sanitize({ ...this.get(), ...patch }))); return true } catch { return false } },
      reset() { try { storage.removeItem(CLIENT_SETTINGS_KEY); return true } catch { return false } },
    }
  }

  function visibleMenuSections(sections, mode) {
    if (mode !== 'compact') return sections.filter(section => section.length)
    const common = new Set(['open', 'openWith', 'reveal', 'referencePreview', 'copyPath', 'copyLines', 'copyContents', 'saveAs', 'openLink', 'copyLink'])
    return sections.map(section => section.filter(item => common.has(item.id))).filter(section => section.length)
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

  function referenceRange(location) {
    const line = location?.line
    const endLine = location?.endLine ?? line
    return Number.isSafeInteger(line) && line > 0 && Number.isSafeInteger(endLine) && endLine >= line
      ? { line, endLine } : null
  }

  // Keep the file's own line breaks inside the selection; a final terminator
  // ends its last line rather than inventing one more line to copy.
  function referencedText(text, location) {
    const range = referenceRange(location)
    if (!range || !text) return null
    const endings = /\r\n|\n|\r/g
    let line = 1
    let lineStart = 0
    let start = range.line === 1 ? 0 : null
    let match
    while ((match = endings.exec(text))) {
      if (line === range.endLine) return start === null ? null : text.slice(start, match.index)
      line++
      lineStart = endings.lastIndex
      if (line === range.line) start = endings.lastIndex
    }
    return line === range.endLine && start !== null && lineStart < text.length ? text.slice(start) : null
  }

  function referenceContext(text, location, contextLines = 8) {
    const range = referenceRange(location)
    if (!range || referencedText(text, range) === null) return null
    const lines = text.split(/\r\n|\n|\r/)
    if (lines.at(-1) === '') lines.pop()
    const padding = [4, 8, 16].includes(contextLines) ? contextLines : 8
    const from = Math.max(1, range.line - padding)
    const to = Math.min(lines.length, range.endLine + padding, from + 79)
    const rows = lines.slice(from - 1, to).map((value, index) => ({
      line: from + index, text: value.length > 2400 ? value.slice(0, 2400) + '…' : value,
      selected: from + index >= range.line && from + index <= range.endLine,
    }))
    return { from, to, total: lines.length, rows,
      clipped: to < range.endLine || lines.slice(from - 1, to).some(value => value.length > 2400) }
  }

  function sourceExcerpt(text, target) {
    const range = referenceRange(target)
    const selected = referencedText(text, target)
    if (!range || selected === null) return null
    const path = String(target.displayPath || target.absolutePath).replace(/[\r\n]/g, ' ')
    const location = `${path}#L${range.line}${range.endLine === range.line ? '' : `-L${range.endLine}`}`
    let fenceLength = 3
    for (const match of selected.matchAll(/`+/g)) fenceLength = Math.max(fenceLength, match[0].length + 1)
    const fence = '`'.repeat(fenceLength)
    return `${location}\n\n${fence}\n${selected}\n${fence}`
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
      icon: isDir ? 'folder' : 'file',
      action: 'open',
    })

    // One row per meaning: the editor shortcut exists only when an editor is really
    // known. A failed or empty association query gets no row at all — a retry row
    // that cannot succeed (a broken OS handler makes the Host query throw) is a
    // dead end in the menu, and the next right-click asks again anyway.
    const editor = apps.find((app) => app.id === input.preferredId) || pickEditor(apps)
    if (!isDir && (editor || input.appsState === 'loading')) {
      primary.push({
        id: 'editor',
        label: editor ? t.openIn(editor.name) : t.editorPending,
        icon: 'code',
        action: 'open',
        appId: editor && editor.id,
        disabled: !editor,
      })
    }

    // While the query runs the submenu keeps a disabled slot so the rows below it do
    // not jump when the answer lands. A failed or empty answer removes the row
    // entirely: a retry that cannot succeed (one broken OS handler makes the Host
    // query throw) is a dead end, and the next right-click asks again anyway.
    if (!isDir && (apps.length > 0 || input.appsState === 'loading')) {
      primary.push({
        id: 'openWith',
        label: t.openWith,
        icon: 'chevron',
        disabled: apps.length === 0,
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
    if (!isDir && file.canCopyText && referenceRange(input.location)) {
      navigate.push({ id: 'referencePreview', label: t.referencePreview, icon: 'doc', action: 'referencePreview', keepOpen: true })
    }
    navigate.push({
      id: 'reveal',
      label: isDir ? t.revealFolder : t.reveal,
      icon: 'folderOpen',
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
      transfer.push({ id: 'copyFileName', label: t.copyFileName, icon: 'tag', action: 'copyFileName' })
    }
    // Copying the reference verbatim is only useful when it carries a location.
    if (!isDir && input.location && Number(input.location.line) && input.reference) {
      transfer.push({ id: 'copyReference', label: t.copyReference, icon: 'bookmark', action: 'copyReference' })
    }
    if (!isDir && file.canCopyText) {
      if (referenceRange(input.location)) {
        transfer.push({ id: 'copyLines', label: t.copyLines, icon: 'clipboard', action: 'copyLines' })
      }
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
      preview: file.kind === 'image' || file.kind === 'video' || extname(absolutePath) === 'svg',
      outsideWorkspace: input.outsideWorkspace === true,
      sections: visibleMenuSections(sections, input.menuMode),
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
      { id: 'copyLink', label: t.copyLink, icon: 'link', action: 'copyLink' },
      { id: 'copyLinkText', label: t.copyLinkText, icon: 'text', action: 'copyLinkText' },
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
      sections: visibleMenuSections([
        [{ id: 'openLink', label: t.openLink, icon: 'external', action: 'openLink' }],
        copy,
      ], input.menuMode),
    }
  }

  /* ─────────────────────────────── icons ─────────────────────────────── */

  const ICON_PATHS = {
    feedback: '<path d="M6 4h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M8 9h8M8 13h5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    sliders: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="Canvas"/><circle cx="15" cy="17" r="2" fill="Canvas"/>',
    apps: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
    refresh: '<path d="M19 8a7 7 0 1 0 .2 7M19 4v4h-4"/>',
    info: '<circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8h.01"/>',
    fileActions: '<path d="M13 3.5H6.5A1.5 1.5 0 0 0 5 5v14a1.5 1.5 0 0 0 1.5 1.5h7M13 3.5l5 5h-5z"/><path d="m14 12 6.5 4.1-3.3.9-1.4 3.2z"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2.6h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    folderOpen: '<path d="M3 18V7a2 2 0 0 1 2-2h4l2 2.6h8a2 2 0 0 1 2 2V11"/><path d="M3 18.5 5.7 12a2 2 0 0 1 1.9-1.3H22l-2.7 7.6a2 2 0 0 1-1.9 1.3H4.8a1.8 1.8 0 0 1-1.8-1.1z"/>',
    code: '<path d="m9 8-4 4 4 4"/><path d="m15 8 4 4-4 4"/>',
    chevron: '<path d="m10 7 5 5-5 5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2.4"/><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/>',
    clipboard: '<rect x="7" y="4.5" width="10" height="16" rx="2.2"/><path d="M10 4.5v-.7a.8.8 0 0 1 .8-.8h2.4a.8.8 0 0 1 .8.8v.7"/>',
    download: '<path d="M12 4v10.5"/><path d="m7.6 11 4.4 4.4L16.4 11"/><path d="M4.8 19.4h14.4"/>',
    link: '<path d="M10.4 13.6a4.3 4.3 0 0 0 6.1 0l2.3-2.3a4.3 4.3 0 0 0-6.1-6.1l-1.2 1.2"/><path d="M13.6 10.4a4.3 4.3 0 0 0-6.1 0l-2.3 2.3a4.3 4.3 0 0 0 6.1 6.1l1.2-1.2"/>',
    text: '<path d="M4 6.5h16"/><path d="M4 12h10.5"/><path d="M4 17.5h13"/>',
    markdown: '<path d="M3.5 17V7l4 5 4-5v10"/><path d="M16.5 7v10"/><path d="m13.8 14.2 2.7 2.8 2.7-2.8"/>',
    image: '<rect x="3" y="4.5" width="18" height="15" rx="2.6"/><circle cx="8.6" cy="9.8" r="1.5"/><path d="m20.5 16-4.2-4.2a2 2 0 0 0-2.8 0L4.5 20"/>',
    web: '<rect x="3" y="4.5" width="18" height="15" rx="2.6"/><path d="M3 9.4h18"/><circle cx="6.6" cy="6.9" r=".75" fill="currentColor" stroke="none"/><circle cx="9.3" cy="6.9" r=".75" fill="currentColor" stroke="none"/>',
    doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8.5 13h7"/><path d="M8.5 17h4.5"/>',
    office: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8.6 12.4h6.8"/><path d="M8.6 16.4h6.8"/><path d="M12 12.4v4"/>',
    archive: '<rect x="3" y="4" width="18" height="4.6" rx="1.6"/><path d="M5 8.6V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.6"/><path d="M10 12.6h4"/>',
    binary: '<rect x="4" y="4" width="6.2" height="7" rx="2"/><rect x="13.8" y="13" width="6.2" height="7" rx="2"/><path d="M5.4 20.2h3.4"/><path d="M15.2 10.8h3.4"/><path d="M6.8 7.6h1.1v3"/><path d="M16.6 16.6h1.1v3"/>',
    bookmark: '<path d="M7 4.6h10a1.6 1.6 0 0 1 1.6 1.6V21L12 16.8 5.4 21V6.2A1.6 1.6 0 0 1 7 4.6z"/>',
    star: '<path d="M12 4.3 14.1 9.6 19.7 9.9 15.3 13.5 16.8 18.9 12 15.9 7.2 18.9 8.7 13.5 4.3 9.9 9.9 9.6z"/>',
    tag: '<path d="M11.6 3.6H5.4A1.8 1.8 0 0 0 3.6 5.4v6.2a2 2 0 0 0 .6 1.4l7.4 7.4a2 2 0 0 0 2.8 0l5.6-5.6a2 2 0 0 0 0-2.8L12.9 4.2a2 2 0 0 0-1.3-.6z"/><circle cx="8.2" cy="8.2" r="1.2"/>',
    video: '<rect x="3" y="5" width="18" height="14" rx="2.6"/><path d="m10.2 9.6 4.8 2.4-4.8 2.4z"/>',
    audio: '<path d="M9.2 18V6.4l9-1.9V16"/><circle cx="6.7" cy="18" r="2.4"/><circle cx="15.7" cy="16" r="2.4"/>',
    subtitle: '<rect x="3" y="5" width="18" height="14" rx="2.6"/><path d="M7 10.4h6"/><path d="M7 14.4h4.5"/><path d="M15.6 14.4h1.6"/>',
    data: '<path d="M9.4 4.5H8.2A2.7 2.7 0 0 0 5.5 7.2v1.6a2.4 2.4 0 0 1-2.4 2.4 2.4 2.4 0 0 1 2.4 2.4v1.6a2.7 2.7 0 0 0 2.7 2.7h1.2"/><path d="M14.6 4.5h1.2a2.7 2.7 0 0 1 2.7 2.7v1.6a2.4 2.4 0 0 0 2.4 2.4 2.4 2.4 0 0 0-2.4 2.4v1.6a2.7 2.7 0 0 1-2.7 2.7h-1.2"/>',
    font: '<path d="M5.4 19.5 11 4.5l5.6 15"/><path d="M7.4 14.6h7.2"/><path d="M19.6 19.5v-5.8"/><path d="M19.6 15.6c1.9-1.4 2.9.2 2.9 1.8v2.1"/>',
    design: '<path d="M12 3.2a8.8 8.8 0 1 0 0 17.6c1.3 0 2-.9 2-2 0-1.6 1.2-2.3 2.4-2.3h1.7a2.7 2.7 0 0 0 2.7-2.7 8.8 8.8 0 0 0-8.8-10.6z"/><circle cx="8.4" cy="10" r="1.1"/><circle cx="12" cy="7.6" r="1.1"/><circle cx="15.6" cy="10" r="1.1"/>',
    model: '<path d="M12 3.2 3.8 7.6v8.8L12 20.8l8.2-4.4V7.6z"/><path d="M3.8 7.6 12 12l8.2-4.4"/><path d="M12 12v8.8"/>',
    disk: '<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="2.6"/><path d="M12 3.4v3.6"/>',
    exec: '<rect x="3" y="4.6" width="18" height="14.8" rx="2.6"/><path d="m7.4 10 2.9 2.4-2.9 2.4"/><path d="M13.2 14.8h3.6"/>',
    unknown: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><circle cx="9.6" cy="14.2" r=".95" fill="currentColor" stroke="none"/><circle cx="12" cy="14.2" r=".95" fill="currentColor" stroke="none"/><circle cx="14.4" cy="14.2" r=".95" fill="currentColor" stroke="none"/>',
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
    binary: 'unknown',
    dir: 'folder',
    link: 'link',
    video: 'video',
    audio: 'audio',
    subtitle: 'subtitle',
    code: 'code',
    data: 'data',
    font: 'font',
    design: 'design',
    model: 'model',
    disk: 'disk',
    exec: 'exec',
  }

  function iconSvg(name) {
    const body = ICON_PATHS[name] || ICON_PATHS.file
    return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
  }

  /* ─────────────────────────────── styles ─────────────────────────────── */

  const CSS = `
/* The pin is drawn, not typed: the ★/☆ text glyphs came from whatever font the
   page loaded, so their weight and size never matched the row icons. */
.dfa-pin{flex:none;display:grid;place-items:center;width:22px;height:22px;margin-left:6px;padding:0;
  border:0;border-radius:5px;background:transparent;color:inherit;font:inherit;cursor:pointer;
  opacity:.7;transition:opacity 90ms,background 90ms,color 90ms}
.dfa-pin svg{width:16px;height:16px}
.dfa-pin:hover,.dfa-pin:focus-visible{background:rgba(127,127,127,.22);opacity:1}
.dfa-pin:focus-visible{outline:1px solid currentColor;outline-offset:1px}
.dfa-pin[aria-pressed="true"]{color:#5b8cff;opacity:1}
.dfa-pin[aria-pressed="true"] svg path{fill:currentColor}

.dfa-menu{position:fixed;z-index:2147483000;
  /* Width follows the content between two bounds: a four-row link menu must not be
     as wide as a 25-app list, and a long absolute path must not stretch past 26em. */
  width:fit-content;min-width:15em;max-width:min(26em,calc(100vw - 16px));box-sizing:border-box;
  display:flex;flex-direction:column;
  /* Height is capped by the room on the chosen side (JS writes --dfa-maxh at open)
     and by a share of the viewport, so the panel never covers the pointer. */
  max-height:min(var(--dfa-maxh,74vh),520px);
  /* Children must be clipped to the rounded box: the sticky submenu header carries an
     opaque background and negative margins, so with overflow visible it paints the top
     corners square until the scroll fade masks them. */
  overflow:hidden;
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
  animation:dfa-in 110ms cubic-bezier(.2,.7,.3,1) both}
/* An explicit display on a row beats the UA [hidden] rule, so filtered rows need
   this to actually disappear. */
.dfa-menu [hidden]{display:none!important}
@keyframes dfa-in{from{opacity:0;transform:translateY(3px) scale(.985)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.dfa-menu{animation:none}.dfa-item{transition:none}}
/* The body is the scroll container so the fades can sit on its edges without
   fading the menu's own border and shadow. */
.dfa-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;
  padding:5px;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2,rgba(127,127,127,.4)) transparent}
.dfa-body[data-fade="both"]{mask-image:linear-gradient(to bottom,transparent 0,#000 16px,#000 calc(100% - 16px),transparent 100%)}
.dfa-body[data-fade="top"]{mask-image:linear-gradient(to bottom,transparent 0,#000 16px)}
.dfa-body[data-fade="bottom"]{mask-image:linear-gradient(to bottom,#000 calc(100% - 16px),transparent 100%)}
/* The preview is its own block: inside the content axis, clipped to a rounded box,
   and never able to grow into the header below it. A decoded video frame is taller
   than the box in most cases, so the image is absolutely fitted instead of relying
   on max-height percentages inside a grid. */
.dfa-thumb{position:relative;overflow:hidden;height:clamp(76px,15vh,118px);margin:0 7px 8px;border-radius:8px;
  border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.28));
  background:color-mix(in srgb,var(--dsw-static-neutral-00,#fff) 6%,transparent);
  color:var(--dsw-alias-label-tertiary,#888);font-size:.85em;display:grid;place-items:center}
.dfa-thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block}
.dfa-thumb.is-clickable{cursor:zoom-in}
.dfa-thumb.is-clickable:hover{border-color:var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4f8cff))}
.dfa-thumb.is-clickable:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4f8cff));outline-offset:1px}
.dfa-lightbox{position:fixed;inset:0;z-index:2147483003;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;
  padding:4vh 4vw;background:rgba(6,8,12,.78);cursor:zoom-out;opacity:0;transition:opacity .12s ease}
.dfa-lightbox[data-show="true"]{opacity:1}
.dfa-lightbox img{max-width:92vw;max-height:82vh;border-radius:10px;object-fit:contain;
  background:color-mix(in srgb,var(--dsw-static-neutral-00,#fff) 4%,transparent);box-shadow:0 20px 64px rgba(0,0,0,.55)}
.dfa-lightbox-hint{color:rgba(255,255,255,.72);font-size:.85em;line-height:1.4}
@media (prefers-reduced-motion:reduce){.dfa-lightbox{transition:none}}
.dfa-head{display:flex;align-items:center;gap:9px;padding:6px 0 8px;margin:0 7px 3px;min-width:0;
  border-bottom:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.28))}
.dfa-tile{flex:none;width:30px;height:30px;border-radius:9px;display:grid;place-items:center;
  color:var(--dfa-hue,#5b8cff);
  background:linear-gradient(150deg,color-mix(in srgb,var(--dfa-hue,#5b8cff) 24%,transparent),color-mix(in srgb,var(--dfa-hue,#5b8cff) 9%,transparent));
  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--dfa-hue,#5b8cff) 30%,transparent),0 1px 2px rgba(0,0,0,.08)}
.dfa-tile svg{width:17px;height:17px}
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
.dfa-tile[data-kind="video"]{--dfa-hue:#d94f8a}
.dfa-tile[data-kind="audio"]{--dfa-hue:#1fa39a}
.dfa-tile[data-kind="subtitle"]{--dfa-hue:#d08a2c}
.dfa-tile[data-kind="code"]{--dfa-hue:#3f7ae0}
.dfa-tile[data-kind="data"]{--dfa-hue:#8a63d2}
.dfa-tile[data-kind="font"]{--dfa-hue:#6b7c93}
.dfa-tile[data-kind="design"]{--dfa-hue:#c261c9}
.dfa-tile[data-kind="model"]{--dfa-hue:#6f5cff}
.dfa-tile[data-kind="disk"]{--dfa-hue:#a06a3a}
.dfa-tile[data-kind="exec"]{--dfa-hue:#5f6b7a}
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
.dfa-item{display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;min-height:30px;padding:4px 7px;
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
.dfa-sub{position:fixed;z-index:2147483001;
  /* Same sizing rule as the parent, one notch narrower: app names truncate before the
     list gets wide enough to cover the chat text it was opened from. */
  width:fit-content;min-width:17em;max-width:min(23em,calc(100vw - 16px));
  max-height:min(var(--dfa-maxh,56vh),400px)}
.dfa-subhead{position:sticky;top:-5px;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:8px;
  margin:-5px -5px 0;padding:6px 12px 5px;background:var(--dsw-alias-bg-layer-1,#24262b);
  border-bottom:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.28));
  font-size:.85em;line-height:1.4;color:var(--dsw-alias-label-tertiary,rgba(160,160,160,.95))}
.dfa-searchwrap{position:sticky;top:27px;z-index:1;margin:0 -5px 4px;padding:5px 12px 6px;
  background:var(--dsw-alias-bg-layer-1,#24262b);border-bottom:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.2))}
.dfa-search{width:100%;box-sizing:border-box;font:inherit;font-size:1em;line-height:1.4;padding:3px 7px;
  border-radius:5px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.4));
  background:var(--dsw-alias-bg-layer-2,transparent);color:inherit;outline:none}
.dfa-search:focus{border-color:var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4f8cff))}
.dfa-search::placeholder{color:var(--dsw-alias-label-tertiary,rgba(160,160,160,.95))}
.dfa-empty{padding:8px 7px;font-size:.85em;color:var(--dsw-alias-label-tertiary,rgba(160,160,160,.95))}
.dfa-foot{display:flex;justify-content:center;gap:12px;margin:6px 7px 0;padding:6px 0 2px;
  border-top:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.28));
  font-size:.85em;line-height:1.4;color:var(--dsw-alias-label-tertiary,rgba(160,160,160,.95))}

.dfa-reference-overlay{position:fixed;inset:0;z-index:2147483004;background:rgba(0,0,0,.38);display:flex;align-items:center;justify-content:center;padding:16px;font:1rem/1.5 system-ui,sans-serif}
.dfa-reference{background:var(--dfa-floor,Canvas);color:inherit;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:12px;box-shadow:0 16px 56px #0005;width:min(860px,100%);max-height:82vh;display:flex;flex-direction:column;overflow:hidden}
.dfa-reference-head{padding:16px 18px 12px;display:flex;align-items:flex-start;gap:12px;border-bottom:1px solid color-mix(in srgb,currentColor 15%,transparent)}
.dfa-reference-info{min-width:0;flex:1}.dfa-reference-title{font-weight:650}.dfa-reference-path{font: .8rem/1.5 Consolas,monospace;overflow-wrap:anywhere;opacity:.75;margin-top:4px}
.dfa-reference button{font:inherit;color:inherit;background:transparent;border:1px solid color-mix(in srgb,currentColor 25%,transparent);border-radius:6px;padding:6px 10px;cursor:pointer}
.dfa-reference button:focus-visible{outline:2px solid Highlight;outline-offset:2px}.dfa-reference button:disabled{opacity:.45;cursor:default}
.dfa-reference-body{overflow:auto;min-height:80px;max-height:56vh;overscroll-behavior:contain;padding:8px 0;font:.82rem/1.65 Consolas,"Microsoft YaHei",monospace;tab-size:4}
.dfa-reference-row{display:flex;min-width:100%;width:max-content;padding-right:18px}.dfa-reference-row[data-selected="true"]{background:color-mix(in srgb,Highlight 14%,transparent);box-shadow:inset 3px 0 Highlight}
.dfa-reference-number{position:sticky;left:0;flex:none;width:4.5em;text-align:right;padding-right:14px;opacity:.65;user-select:none;background:var(--dfa-floor,Canvas)}
.dfa-reference-code{white-space:pre}.dfa-reference-status{padding:14px 18px;white-space:normal;font: .875rem/1.6 system-ui,sans-serif}
.dfa-reference-footer{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:12px 18px;border-top:1px solid color-mix(in srgb,currentColor 15%,transparent)}
.dfa-reference-hint{font-size:.75rem;opacity:.7;flex:1;min-width:130px}.dfa-reference-actions{display:flex;gap:8px;flex-wrap:wrap}



.dfa-settings{--dfa-accent:var(--dsw-alias-brand,#367bf5);--dfa-line:var(--dsw-alias-border-l2,#8883);max-width:760px;padding:4px 0 20px;color:var(--dsw-alias-label-primary,inherit);font:.875rem/1.5 var(--dsw-font-family,system-ui,sans-serif)}
.dfa-settings *{box-sizing:border-box}.dfa-settings h2,.dfa-settings h3,.dfa-settings p{margin:0}.dfa-settings-header{display:flex;align-items:center;gap:12px;margin:0 0 22px}.dfa-settings-mark{display:grid;place-items:center;width:42px;height:42px;border:1px solid color-mix(in srgb,var(--dfa-accent) 20%,transparent);border-radius:12px;color:var(--dfa-accent);background:color-mix(in srgb,var(--dfa-accent) 10%,transparent);flex:none}
.dfa-settings-mark svg{width:25px;height:25px;stroke-width:1.6}.dfa-settings h2{font-size:1.08rem;font-weight:650;letter-spacing:-.02em;line-height:1.4}.dfa-settings-intro{font-size:.8rem;opacity:.65;margin-top:3px!important}
.dfa-project{margin:4px 0 16px;padding:16px 4px 0;border-top:1px solid var(--dfa-line)}.dfa-project h3{margin-bottom:5px!important}.dfa-project-links{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.dfa-settings .dfa-project-link{display:inline-flex;align-items:center;gap:7px;margin:0;padding:7px 10px;border:1px solid var(--dfa-line);border-radius:7px;background:var(--dsw-alias-bg-layer-2,Canvas);color:inherit;text-decoration:none;font-size:.78rem;line-height:1.5}.dfa-project-link svg{width:15px;height:15px;flex:none;opacity:.75}.dfa-project-link:hover{border-color:var(--dfa-accent)}.dfa-project-link:focus-visible{outline:2px solid var(--dfa-accent);outline-offset:2px}
.dfa-settings-card{background:var(--dfa-settings-floor,var(--dsw-alias-bg-layer-1,Canvas));border:1px solid var(--dfa-line);border-radius:12px;margin:0 0 14px;overflow:hidden}.dfa-settings-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 16px 8px}.dfa-settings h3{font-size:.86rem;font-weight:650;display:flex;align-items:center;gap:8px}.dfa-settings-card-head h3>svg{opacity:.55}.dfa-settings-note{font-size:.76rem;line-height:1.6;opacity:.62}.dfa-settings-row{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:14px 16px;border-top:1px solid var(--dfa-line)}
.dfa-settings-copy{min-width:0;flex:1}.dfa-settings label{font-weight:550;display:block;margin-bottom:4px}.dfa-settings button,.dfa-settings select{margin:0;font:inherit;line-height:1.45;color:inherit;max-width:100%;border:1px solid var(--dfa-line);border-radius:7px;background:var(--dsw-alias-bg-layer-2,Canvas);padding:7px 10px}
.dfa-settings select{min-width:126px;flex:none;font-size:.8rem}.dfa-settings button{cursor:pointer;font-size:.78rem;transition:background .12s,border-color .12s}.dfa-settings button:hover:not(:disabled){border-color:color-mix(in srgb,currentColor 32%,transparent);background:color-mix(in srgb,var(--dfa-accent) 6%,var(--dsw-alias-bg-layer-2,Canvas))}.dfa-settings button:disabled{opacity:.36;cursor:default}.dfa-settings :is(button,select):focus-visible{outline:2px solid var(--dfa-accent);outline-offset:2px}.dfa-settings .dfa-settings-ghost{border-color:transparent;background:transparent;padding:4px 6px;opacity:.7;white-space:nowrap}
.dfa-settings .dfa-select-trigger{display:flex;align-items:center;justify-content:space-between;gap:14px;min-width:126px;flex:none;text-align:left;font-size:.8rem;padding:8px 10px;transition:background .16s,border-color .16s,box-shadow .16s}.dfa-select-trigger>svg{width:14px;height:14px;opacity:.65;transform:rotate(90deg);transition:transform .16s cubic-bezier(.2,.7,.3,1)}.dfa-settings .dfa-select-trigger[aria-expanded="true"]{border-color:var(--dfa-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--dfa-accent) 12%,transparent)}.dfa-select-trigger[aria-expanded="true"]>svg{transform:rotate(270deg)}
.dfa-select-menu{position:fixed;z-index:2147483004;box-sizing:border-box;padding:5px;border:1px solid var(--dfa-line,#8883);border-radius:11px;background:var(--dfa-select-floor,Canvas);color:var(--dsw-alias-label-primary,CanvasText);box-shadow:0 4px 10px #0000000c,0 14px 34px #00000024;font:.8rem/1.5 var(--dsw-font-family,system-ui,sans-serif);overflow-y:auto;overscroll-behavior:contain;outline:none}.dfa-select-option{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:36px;padding:8px 10px;box-sizing:border-box;border-radius:7px;cursor:pointer;user-select:none;white-space:nowrap}.dfa-select-option>svg{width:15px;height:15px;flex:none;color:var(--dfa-accent,#367bf5);opacity:0}.dfa-select-option[aria-selected="true"]{color:var(--dfa-accent,#367bf5);font-weight:550}.dfa-select-option[aria-selected="true"]>svg{opacity:1}.dfa-select-option[data-active="true"]{background:color-mix(in srgb,var(--dfa-accent,#367bf5) 12%,transparent)}.dfa-select-menu[data-state="closing"]{pointer-events:none}
@media(prefers-reduced-motion:reduce){.dfa-settings .dfa-select-trigger,.dfa-select-trigger>svg{transition:none}}
.dfa-settings-count{border:1px solid var(--dfa-line);border-radius:5px;font-size:.68rem;font-weight:500;padding:0 5px;opacity:.7;line-height:1.6}.dfa-settings-app{display:flex;align-items:center;gap:12px;justify-content:space-between;padding:11px 16px;border-top:1px solid var(--dfa-line)}
.dfa-settings-app-info{min-width:0;display:flex;align-items:center;gap:12px;flex:1}.dfa-settings-app-info strong{display:inline-block;min-width:56px;padding:4px 7px;border-radius:5px;background:color-mix(in srgb,var(--dfa-accent) 7%,transparent);color:var(--dfa-accent);font:500 .73rem/1.5 Consolas,monospace}.dfa-settings-app-info span{overflow-wrap:anywhere;font-size:.8rem}.dfa-settings-empty{display:flex;align-items:center;gap:12px;padding:15px 16px 19px}.dfa-settings-empty>svg{flex:none;opacity:.4;width:25px;height:25px}.dfa-settings-empty strong{display:block;font-size:.8rem;font-weight:500;margin-bottom:4px}
.dfa-settings-cache{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:13px 4px 15px}.dfa-settings-cache-title{display:flex;gap:7px;align-items:center;font-size:.8rem;font-weight:550;margin-bottom:4px}.dfa-settings-cache-title>svg{opacity:.5}.dfa-settings-cache button{display:flex;align-items:center;gap:7px;white-space:nowrap;font-size:.76rem}.dfa-settings-footer{padding:12px 4px 0;border-top:1px solid var(--dfa-line);display:flex;align-items:flex-start;gap:7px;font-size:.72rem;line-height:1.6;opacity:.55}.dfa-settings-footer svg{width:13px;height:13px;flex:none;margin-top:2px}.dfa-settings-status{min-height:1.5em;margin-top:8px;font-size:.76rem;padding:0 4px;overflow-wrap:anywhere}.dfa-settings-status[data-error="true"]{color:var(--dsw-alias-danger,#b42318)}
button[data-dfa-nav-icon="file-actions"]>svg{display:none}button[data-dfa-nav-icon="file-actions"]::before{content:"";width:16px;height:16px;flex:none;background:currentColor;mask: url("data:image/svg+xml,${encodeURIComponent(iconSvg('fileActions').replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}") center/contain no-repeat}
@media(max-width:500px){.dfa-settings-header{gap:10px;margin-bottom:18px}.dfa-settings h2{font-size:1rem}.dfa-settings-row{padding:13px 14px;gap:10px;align-items:flex-start;flex-wrap:wrap}.dfa-settings-copy{flex-basis:140px}.dfa-settings select{min-width:0;max-width:100%;font-size:.78rem}.dfa-settings-card-head,.dfa-settings-app{padding-left:14px;padding-right:14px}.dfa-settings-app-info{gap:8px}.dfa-settings-app-info strong{min-width:48px}.dfa-settings-cache{align-items:flex-start;flex-wrap:wrap}.dfa-settings-cache>div{flex-basis:180px;flex-grow:1}}

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
          // The registry walk is the slowest part of the menu; fail fast enough to
          // offer a retry instead of leaving the row spinning.
          const result = await boundedCall(() => sessionApi.workspacePathApplications({ path }), 6000)
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
    const text = stripLocationSuffix(value).path
    if (text === '') return false
    if (isAbsolutePath(text)) return true
    return /\.[A-Za-z0-9]{1,10}$/.test(text) || isTextName(text)
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
    if (isEditable(target) || target.closest('.dfa-settings')) return null

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
      if (value && looksLikePath(value) && softPath(value)) {
        const inline = node.closest('code')
        const reference = inline && !inline.closest('pre') ? stripDecorations(inline.textContent) : ''
        const location = stripLocationSuffix(reference)
        const normalize = text => /^(?:[A-Za-z]:|\\\\|\/\/)/.test(value)
          ? normalizeSlashes(text).toLowerCase() : normalizeSlashes(text)
        const titledPath = normalize(value)
        const labelPath = normalize(location.path).replace(/^\.\//, '')
        // The Host keeps the resolved path in the tooltip but can leave the
        // location in the code label. Only combine labels naming this same file.
        if (labelPath && referenceRange(location) && (titledPath === labelPath || titledPath.endsWith(`/${labelPath}`))) {
          return { path: value + reference.slice(location.path.length), reference,
            source: 'title', element: node, explicit: true }
        }
        // A file tree keeps the absolute path in the row tooltip: that is a real
        // address, so a cold right-click may take it over immediately.
        return { path: value, source: 'title', element: node, explicit: isAbsolutePath(value) }
      }
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

    // Inline code in a transcript is a deliberate reference — the blue file names
    // the chat renders. Treat it as explicit so a cold right-click opens the menu
    // instead of falling through to the browser's own menu. Code inside a fenced
    // block is content, not a reference, so `pre code` stays a guess.
    const code = target.closest('code')
    if (code && !code.closest('pre')) {
      const text = stripDecorations(code.textContent)
      if (text && text.length <= 512 && looksLikePath(text) && softPath(text)) {
        return { path: text, source: 'code', element: code }
      }
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

  function mountSettings(root, controller, t) {
    const c = t.settings
    let message = '', failed = false
    let dropdown = null
    const closingDropdowns = new Map()
    const glyph = name => makeNode('span', { html: iconSvg(name) }).firstChild
    const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const closeDropdown = (animate = true) => {
      const current = dropdown
      if (!current) return
      dropdown = null
      current.stop()
      current.trigger.setAttribute('aria-expanded', 'false')
      current.trigger.removeAttribute('aria-activedescendant')
      const { popup } = current
      popup.setAttribute('aria-hidden', 'true')
      popup.removeAttribute('id')
      for (const row of popup.children) row.removeAttribute('id')
      popup.inert = true
      popup.dataset.state = 'closing'
      const style = getComputedStyle(popup)
      const from = { opacity: style.opacity, transform: style.transform }
      current.animation?.cancel()
      if (!animate || reducedMotion() || !popup.animate) { popup.remove(); return }
      const animation = popup.animate([from, { opacity: 0, transform: `translateY(${current.above ? 4 : -4}px) scale(.98)` }], { duration: 120, easing: 'ease-in', fill: 'forwards' })
      closingDropdowns.set(popup, animation)
      const finish = () => { popup.remove(); closingDropdowns.delete(popup) }
      animation.finished.then(finish, finish)
    }
    const openDropdown = (trigger, options, value, choose, initialIndex) => {
      closeDropdown()
      const popup = makeNode('div', { id: trigger.id + '-options', class: 'dfa-select-menu', role: 'listbox', 'aria-labelledby': trigger.id + '-label', 'data-state': 'opening' })
      const style = getComputedStyle(trigger)
      for (const name of ['--dfa-accent', '--dfa-line']) popup.style.setProperty(name, style.getPropertyValue(name))
      popup.style.color = style.color
      popup.style.fontFamily = style.fontFamily
      const floor = menuFloor()
      // The list overlays other controls, so keep their labels from showing through.
      if (floor) popup.style.setProperty('--dfa-select-floor', floor.replace(', 0.94)', ', 1)'))
      let active = initialIndex ?? Math.max(0, options.findIndex(([key]) => key === value))
      const current = { popup, trigger, above: false, animation: null, stop: () => {} }
      dropdown = current
      const rows = options.map(([key, text], index) => {
        const row = makeNode('div', { id: popup.id + '-' + index, class: 'dfa-select-option', role: 'option', 'aria-selected': String(key === value), 'data-value': key }, [makeNode('span', { text }), glyph('check')])
        row.addEventListener('pointermove', () => highlight(index))
        row.addEventListener('pointerdown', event => event.preventDefault())
        row.addEventListener('click', () => select(index))
        popup.appendChild(row)
        return row
      })
      const highlight = index => {
        active = (index + rows.length) % rows.length
        rows.forEach((row, i) => { row.dataset.active = String(i === active) })
        trigger.setAttribute('aria-activedescendant', rows[active].id)
        rows[active].scrollIntoView({ block: 'nearest' })
      }
      const select = index => { closeDropdown(); choose(options[index][0]) }
      const position = () => {
        const rect = trigger.getBoundingClientRect(), gap = 6, margin = 8
        popup.style.minWidth = Math.min(Math.max(rect.width, 164), innerWidth - margin * 2) + 'px'
        popup.style.maxWidth = Math.max(0, innerWidth - margin * 2) + 'px'
        popup.style.maxHeight = Math.max(0, innerHeight - margin * 2) + 'px'
        const height = popup.getBoundingClientRect().height
        const below = innerHeight - rect.bottom - gap - margin, above = rect.top - gap - margin
        current.above = below < height && above > below
        popup.style.maxHeight = Math.max(0, current.above ? above : below) + 'px'
        const box = popup.getBoundingClientRect()
        popup.style.left = Math.max(margin, Math.min(rect.right - box.width, innerWidth - margin - box.width)) + 'px'
        popup.style.top = Math.max(margin, current.above ? rect.top - gap - box.height : rect.bottom + gap) + 'px'
        popup.style.transformOrigin = current.above ? 'bottom right' : 'top right'
      }
      let search = '', searchedAt = 0
      const keydown = event => {
        if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return
        if (event.key === 'Tab') { closeDropdown(); return }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape'].includes(event.key)) {
          event.preventDefault(); event.stopPropagation()
          if (event.key === 'Escape') closeDropdown()
          else if (event.key === 'Enter' || event.key === ' ') select(active)
          else highlight(event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : active + (event.key === 'ArrowDown' ? 1 : -1))
        } else if (event.key.length === 1) {
          event.preventDefault(); event.stopPropagation()
          const now = Date.now(); search = (now - searchedAt < 700 ? search : '') + event.key.toLocaleLowerCase(); searchedAt = now
          const start = (active + 1) % rows.length
          const index = options.findIndex((_, offset) => options[(start + offset) % rows.length][1].toLocaleLowerCase().startsWith(search))
          if (index >= 0) highlight(start + index)
        }
      }
      const outside = event => { if (!trigger.contains(event.target) && !popup.contains(event.target)) closeDropdown() }
      const scroll = event => { if (!popup.contains(event.target)) closeDropdown() }
      document.addEventListener('pointerdown', outside, true)
      document.addEventListener('scroll', scroll, true)
      window.addEventListener('resize', position)
      trigger.addEventListener('keydown', keydown)
      current.stop = () => {
        document.removeEventListener('pointerdown', outside, true); document.removeEventListener('scroll', scroll, true)
        window.removeEventListener('resize', position); trigger.removeEventListener('keydown', keydown)
      }
      document.body.appendChild(popup)
      position()
      trigger.setAttribute('aria-expanded', 'true')
      highlight(active)
      if (!reducedMotion() && popup.animate) {
        current.animation = popup.animate([{ opacity: 0, transform: `translateY(${current.above ? 4 : -4}px) scale(.98)` }, { opacity: 1, transform: 'none' }], { duration: 160, easing: 'cubic-bezier(.2,.7,.3,1)' })
        current.animation.finished.then(() => { if (dropdown === current) popup.dataset.state = 'open' }, () => {})
      } else popup.dataset.state = 'open'
    }
    const button = (label, key, action, disabled = false, accessibleLabel = label, ghost = false) => {
      const node = makeNode('button', { type: 'button', text: label, 'data-dfa-setting': key, disabled,
        'aria-label': accessibleLabel, class: ghost ? 'dfa-settings-ghost' : undefined })
      node.addEventListener('click', () => commit(action, key))
      return node
    }
    const commit = (action, key) => {
      const ok = action()
      failed = !ok
      message = ok ? (key === 'cache' ? c.cacheCleared : key === 'defaults' ? c.reset : key.startsWith('app') ? c.removed : c.saved) : c.failed
      render()
    }
    function render() {
      closeDropdown()
      const focused = document.activeElement?.getAttribute('data-dfa-setting')
      const value = controller.config.get()
      const page = makeNode('div', { class: 'dfa-settings', 'data-dfa-settings': '1' })
      const floor = menuFloor()
      if (floor) page.style.setProperty('--dfa-settings-floor', floor)
      page.appendChild(makeNode('header', { class: 'dfa-settings-header' }, [
        makeNode('span', { class: 'dfa-settings-mark', 'aria-hidden': 'true' }, [glyph('fileActions')]),
        makeNode('div', {}, [makeNode('h2', { text: c.title }), makeNode('p', { class: 'dfa-settings-intro', text: c.intro })]),
      ]))
      const display = makeNode('section', { class: 'dfa-settings-card' }, [
        makeNode('div', { class: 'dfa-settings-card-head' }, [
          makeNode('h3', {}, [glyph('sliders'), c.display]),
          button(c.resetShort, 'defaults', () => controller.reset(), false, c.defaults, true),
        ]),
      ])
      for (const [key, label, help, options] of [
        ['menuMode', c.menuMode, c.menuHint, [['full', c.full], ['compact', c.compact]]],
        ['contextLines', c.contextLines, c.contextHint, [4, 8, 16].map(n => [String(n), c.contextOption.replace('{count}', n)])],
      ]) {
        const id = `dfa-setting-${key}`
        const selected = String(value[key])
        const select = makeNode('button', { type: 'button', id, class: 'dfa-select-trigger', role: 'combobox', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-controls': id + '-options', 'aria-labelledby': id + '-label', 'data-dfa-setting': key, 'data-value': selected, 'aria-describedby': id + '-help' }, [makeNode('span', { text: options.find(([option]) => option === selected)[1] }), glyph('chevron')])
        const open = index => openDropdown(select, options, selected, option => commit(() => controller.update({ [key]: key === 'contextLines' ? Number(option) : option }), key), index)
        select.addEventListener('click', () => { if (dropdown?.trigger === select) closeDropdown(); else open() })
        select.addEventListener('keydown', event => {
          if (dropdown?.trigger === select || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return
          if (['ArrowDown', 'ArrowUp', 'Enter', ' ', 'Home', 'End'].includes(event.key)) {
            event.preventDefault(); event.stopPropagation()
            open(event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : undefined)
          }
        })
        display.appendChild(makeNode('div', { class: 'dfa-settings-row' }, [
          makeNode('div', { class: 'dfa-settings-copy' }, [makeNode('label', { id: id + '-label', for: id, text: label }), makeNode('p', { id: id + '-help', class: 'dfa-settings-note', text: help })]), select,
        ]))
      }
      const rows = controller.apps.list()
      const apps = makeNode('section', { class: 'dfa-settings-card' }, [
        makeNode('div', { class: 'dfa-settings-card-head' }, [
          makeNode('h3', {}, [glyph('apps'), c.apps, makeNode('span', { class: 'dfa-settings-count', text: rows.length })]),
          button(c.clearShort, 'apps', () => controller.apps.clear(), !rows.length, c.clearApps, true),
        ]),
      ])
      if (!rows.length) apps.appendChild(makeNode('div', { class: 'dfa-settings-empty' }, [glyph('apps'), makeNode('div', {}, [
        makeNode('strong', { text: c.noApps }), makeNode('p', { class: 'dfa-settings-note', text: c.appsHelp }),
      ])]))
      for (const row of rows) {
        const name = controller.applicationName(row.appId)
        const typeLabel = row.type === '[no extension]' ? c.noExtension : row.type.startsWith('.') ? row.type : '.' + row.type
        apps.appendChild(makeNode('div', { class: 'dfa-settings-app' }, [
          makeNode('div', { class: 'dfa-settings-app-info' }, [makeNode('strong', { text: typeLabel }), makeNode('span', { text: name })]),
          button(c.removeShort, `app:${row.type}`, () => controller.apps.remove(row.type), false, `${c.remove}: ${typeLabel}`, true),
        ]))
      }
      const cacheButton = button(c.clearCache, 'cache', () => controller.clearCache())
      cacheButton.prepend(glyph('refresh'))
      const cache = makeNode('section', { class: 'dfa-settings-cache' }, [
        makeNode('div', {}, [makeNode('div', { class: 'dfa-settings-cache-title' }, [glyph('refresh'), c.cache,
          makeNode('span', { class: 'dfa-settings-count', text: controller.cacheCount(), 'aria-label': c.cacheCount.replace('{count}', controller.cacheCount()) })]),
          makeNode('p', { class: 'dfa-settings-note', text: c.cacheHint }),
        ]), cacheButton,
      ])
      page.appendChild(display); page.appendChild(apps); page.appendChild(cache)
      const project = makeNode('section', { class: 'dfa-project', 'aria-label': c.project }, [
        makeNode('h3', { text: c.project }), makeNode('p', { class: 'dfa-settings-note', text: c.projectHint }),
      ])
      const links = makeNode('div', { class: 'dfa-project-links' })
      for (const [label, href, icon] of [
        [c.github, 'https://github.com/jidekaixin2dian/dsh-file-actions', 'code'],
        [c.feedback, 'https://github.com/jidekaixin2dian/dsh-file-actions/issues/new', 'feedback'],
      ]) links.appendChild(makeNode('a', { class: 'dfa-project-link', href, target: '_blank', rel: 'noopener noreferrer' }, [glyph(icon), label]))
      project.appendChild(links); page.appendChild(project)
      page.appendChild(makeNode('footer', { class: 'dfa-settings-footer' }, [glyph('info'), c.scopeShort]))
      page.appendChild(makeNode('div', { class: 'dfa-settings-status', role: failed ? 'alert' : 'status', 'data-error': failed, text: message, 'aria-live': 'polite' }))
      root.replaceChildren(page)
      if (focused) [...root.querySelectorAll('[data-dfa-setting]')].find(node => node.getAttribute('data-dfa-setting') === focused)?.focus({ preventScroll: true })
    }
    render()
    const stop = controller.subscribe(render)
    return () => {
      stop(); closeDropdown(false)
      for (const [popup, animation] of closingDropdowns) { animation.cancel(); popup.remove() }
      closingDropdowns.clear(); root.replaceChildren()
    }
  }

  // rc.5 draws a fixed gear for third-party sections. Decorate only our unique,
  // exact-label row; body observation is shallow and nav observation stays local.
  function settingsNavigationIcon(slots) {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
    const navObserver = new MutationObserver(() => sync())
    const sync = () => {
      navObserver.disconnect()
      const labels = new Set([ZH.settings.nav, EN.settings.nav])
      const rows = slots.entries?.('settings.section') || []
      const own = rows.find(row => row.options?.id === 'file-actions')
      const unique = !rows.length || own && rows.filter(row => {
        const label = row.options?.label
        return labels.has(typeof label === 'function' ? label() : label)
      }).length === 1
      for (const nav of document.querySelectorAll('[role="dialog"] nav')) {
        for (const node of nav.querySelectorAll('button')) {
          const label = node.querySelector(':scope > span')?.textContent?.trim()
          if (unique && labels.has(label)) node.setAttribute('data-dfa-nav-icon', 'file-actions')
          else if (node.getAttribute('data-dfa-nav-icon') === 'file-actions') node.removeAttribute('data-dfa-nav-icon')
        }
        navObserver.observe(nav, { childList: true, subtree: true, characterData: true })
      }
    }
    const bodyObserver = new MutationObserver(sync)
    bodyObserver.observe(document.body, { childList: true })
    const off = slots.subscribe?.('settings.section', sync)
    sync()
    return () => {
      bodyObserver.disconnect(); navObserver.disconnect()
      if (typeof off === 'function') off()
      for (const node of document.querySelectorAll('[data-dfa-nav-icon="file-actions"]')) node.removeAttribute('data-dfa-nav-icon')
    }
  }

  function registerSettings(ctx, controller) {
    const slots = ctx.get?.('slots')
    if (!slots || typeof require !== 'function') return () => {}
    const React = require('react')
    function SettingsPage() {
      const root = React.useRef(null)
      const language = detectLanguage(ctx)
      React.useLayoutEffect(() => mountSettings(root.current, controller, messages(language)), [language])
      return React.createElement('div', { ref: root })
    }
    const dispose = slots.inject('settings.section', () => slots.register({
      name: 'settings.section', id: 'file-actions', order: 19,
      label: () => messages(detectLanguage(ctx)).settings.nav,
    }, SettingsPage))
    const stopIcon = settingsNavigationIcon(slots)
    return () => { stopIcon(); if (typeof dispose === 'function') dispose() }
  }

  class FileMenu {
    constructor(options) {
      this.model = options.model
      this.x = options.x
      this.y = options.y
      // The pointer position is kept separately: repaints and follow updates move the
      // painted box, while placement must always start from where the user clicked.
      this.pointer = { x: options.x, y: options.y }
      this.onPick = options.onPick
      this.onClose = options.onClose
      this.keyboard = options.keyboard === true
      this.anchor = options.anchor || null
      this.t = options.t || ZH
      this.root = null
      this.body = null
      this.thumbUrl = null
      this.thumbPath = null
      this.lightbox = null
      this.submenu = null
      this.submenuFor = null
      this.subOffset = null
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
      this.place(root, this.pointer.x, this.pointer.y)
      this.x = root.offsetLeft
      this.y = root.offsetTop
      // Record how the painted menu sits relative to its row, so scrolling can keep
      // exactly that relationship (including any edge clamping place() applied).
      this.captureAnchorOffset()
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
      const sub = this.submenu && {
        owner: this.submenuFor?.getAttribute(ITEM_ATTR),
        query: this.searchInput?.value || '',
        selected: this.subItems[this.subIndex]?.item.id,
        scrollTop: this.subBody?.scrollTop || 0,
        typing: document.activeElement === this.searchInput,
        start: this.searchInput?.selectionStart,
        end: this.searchInput?.selectionEnd,
      }
      this.closeSubmenu()
      const scrollTop = this.body.scrollTop
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
        // Re-place from the original pointer position, not from the painted box: the
        // pointer is the only stable anchor once the content grows or the menu flips.
        this.place(this.root, this.pointer.x, this.pointer.y, painted)
        this.x = this.root.offsetLeft
        this.y = this.root.offsetTop
        this.captureAnchorOffset()
      }
      this.root.setAttribute('aria-label', this.model.title)
      if (sub) {
        const owner = this.items.find(entry => entry.item.id === sub.owner && entry.item.children?.length)
        // A removed selection must not turn Enter into an open of another app.
        const stillVisible = item => item.id === sub.selected
          && String(item.label).toLowerCase().includes(sub.query.trim().toLowerCase())
        if (owner && (!sub.selected || owner.item.children.some(stillVisible))) {
          this.openSubmenu(owner)
          if (this.searchInput) this.searchInput.value = sub.query
          this.filterSubmenu()
          const selected = this.subVisible.findIndex(entry => entry.item.id === sub.selected)
          if (selected >= 0) this.focusSub(selected)
          if (this.subBody) this.subBody.scrollTop = sub.scrollTop
          if (sub.typing && this.searchInput) {
            this.searchInput.focus({ preventScroll: true })
            this.searchInput.setSelectionRange(sub.start, sub.end)
          }
        } else {
          // Repainting under a stationary pointer can fire mouseenter on the
          // replacement owner row. A removed selection must stay dismissed.
          this.blockHoverFor = owner?.item.id
          if (sub.typing) this.root.focus({ preventScroll: true })
        }
      }
      requestAnimationFrame(() => this.updateFade())
    }

    renderThumb() {
      const wrap = makeNode('div', { class: 'dfa-thumb' })
      // The preview only paints when it belongs to the file in the current model:
      // a late answer for a previously opened file must never show up here.
      const url = this.thumbPath && this.model && this.model.subtitle === this.thumbPath ? this.thumbUrl : null
      if (url) {
        wrap.appendChild(makeNode('img', { src: url, alt: this.model.title }))
        wrap.classList.add('is-clickable')
        wrap.setAttribute('role', 'button')
        wrap.setAttribute('tabindex', '0')
        wrap.setAttribute('aria-label', this.t.viewLarge)
        wrap.title = this.t.viewLarge
        wrap.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          this.openPreview()
        })
        wrap.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          event.stopPropagation()
          this.openPreview()
        })
      } else wrap.textContent = this.thumbnailDone ? this.t.previewUnavailable : this.t.previewLoading
      return wrap
    }

    async openReference(target, context) {
      this.closeReference()
      this.closeSubmenu()
      const overlay = makeNode('div', { class: 'dfa-reference-overlay' })
      const panel = makeNode('section', { class: 'dfa-reference', role: 'dialog', 'aria-modal': 'true', 'aria-label': this.t.referencePreview })
      const floor = menuFloor()
      if (floor) overlay.style.setProperty('--dfa-floor', floor.replace(/, 0\.94\)$/, ', 1)'))
      overlay.style.color = getComputedStyle(this.root).color
      const info = makeNode('div', { class: 'dfa-reference-info' }, [
        makeNode('div', { class: 'dfa-reference-title', text: this.t.referencePreview }),
        makeNode('div', { class: 'dfa-reference-path', text: `${target.displayPath || target.absolutePath} · ${formatLocation(target, this.t)}` }),
      ])
      const close = makeNode('button', { type: 'button', text: this.t.closePreview })
      const body = makeNode('div', { class: 'dfa-reference-body', tabindex: '0', 'aria-label': this.t.referencePreview })
      body.appendChild(makeNode('div', { class: 'dfa-reference-status', text: this.t.referenceLoading, role: 'status' }))
      const hint = makeNode('div', { class: 'dfa-reference-hint' })
      const copy = makeNode('button', { type: 'button', text: this.t.copySource, disabled: true })
      const open = makeNode('button', { type: 'button', text: this.t.open })
      panel.appendChild(makeNode('div', { class: 'dfa-reference-head' }, [info, close]))
      panel.appendChild(body)
      panel.appendChild(makeNode('div', { class: 'dfa-reference-footer' }, [hint, makeNode('div', { class: 'dfa-reference-actions' }, [open, copy])]))
      overlay.appendChild(panel)
      this.referencePreview = overlay
      const current = () => !this.closed && this.referencePreview === overlay && (!context.isCurrent || context.isCurrent())
      const readContext = { ...context, isCurrent: current, confirmMessage: this.t.confirmOutsidePreview }
      close.addEventListener('click', () => this.closeReference())
      overlay.addEventListener('click', event => { if (event.target === overlay) this.closeReference() })
      open.addEventListener('click', () => { if (current()) void dispatch({ action: 'open' }, target, readContext) })
      copy.addEventListener('click', async () => {
        if (!current() || copy.disabled) return
        copy.disabled = true
        // Re-read with the original version: never copy a file newer than the preview.
        await dispatch({ action: 'copySource' }, target, { ...readContext, outsideConfirmed: true })
        if (current()) copy.disabled = false
      })
      document.body.appendChild(overlay)
      close.focus({ preventScroll: true })
      const result = await readTextTarget(target, readContext)
      if (!current()) return
      if (!result) { this.closeReference(); return }
      const preview = result && !result.error ? referenceContext(result.text, target, context.contextLines) : null
      body.replaceChildren()
      if (!preview) {
        body.appendChild(makeNode('div', { class: 'dfa-reference-status', role: 'status', text: result?.error || this.t.invalidLines }))
        return
      }
      // A later copy must match the read even if the original carrier had no version.
      if (result.version !== undefined) target = { ...target, version: result.version }
      for (const row of preview.rows) body.appendChild(makeNode('div', { class: 'dfa-reference-row', 'data-selected': row.selected }, [
        makeNode('span', { class: 'dfa-reference-number', text: row.line, 'aria-hidden': 'true' }),
        makeNode('span', { class: 'dfa-reference-code', text: row.text || ' ' }),
      ]))
      hint.textContent = this.t.referenceWindow.replace('{from}', preview.from).replace('{to}', preview.to).replace('{total}', preview.total)
        + (preview.clipped ? ` · ${this.t.previewClipped}` : '')
      copy.disabled = false
      body.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'center' })
    }

    closeReference() {
      if (!this.referencePreview) return
      this.referencePreview.remove()
      this.referencePreview = null
      try { this.root?.focus({ preventScroll: true }) } catch { /* menu unmounted */ }
    }

    /** Show the same preview at full size; the menu stays open behind it. */
    openPreview() {
      if (!this.thumbUrl || this.lightbox) return
      const overlay = makeNode('div', { class: 'dfa-lightbox', role: 'dialog', 'aria-modal': 'true',
        'aria-label': this.model.title, tabindex: '-1' })
      overlay.appendChild(makeNode('img', { src: this.thumbUrl, alt: this.model.title }))
      overlay.appendChild(makeNode('div', { class: 'dfa-lightbox-hint',
        text: this.model.kind === 'video' ? this.t.previewVideoHint : this.t.previewHint }))
      overlay.addEventListener('click', () => this.closeLightbox())
      document.body.appendChild(overlay)
      requestAnimationFrame(() => overlay.setAttribute('data-show', 'true'))
      this.lightbox = overlay
      try { overlay.focus({ preventScroll: true }) } catch { /* older engine */ }
    }

    closeLightbox() {
      if (!this.lightbox) return
      this.lightbox.remove()
      this.lightbox = null
      try { this.root?.focus({ preventScroll: true }) } catch { /* the menu may be gone */ }
    }

    /** Drop a preview once its bytes have arrived, tagged with the file it belongs to. */
    setThumbnail(url, path) {
      if (this.closed) return
      // Tagged with the source file: an answer for another file is dropped here,
      // which keeps a slow decode from painting over the menu that replaced it.
      if (url && path !== undefined && this.model && this.model.subtitle !== path) return
      this.thumbUrl = url
      this.thumbPath = url ? (path ?? this.model?.subtitle ?? null) : null
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
        if (this.blockHoverFor === item.id) return
        this.focus(this.items.indexOf(entry))
        if (item.children) this.openSubmenu(entry)
        else this.closeSubmenu()
      })
      row.addEventListener('mouseleave', () => {
        if (this.blockHoverFor === item.id) this.blockHoverFor = null
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
        else icon.innerHTML = iconSvg('file')
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
            title: item.preferred ? this.t.unpinApp : this.t.pinApp })
          pin.innerHTML = iconSvg('star')
          pin.addEventListener('click', (event) => {
            event.preventDefault(); event.stopPropagation()
            this.close()
            this.onPick({ ...item, action: 'preferApp' })
          })
          row.appendChild(pin)
        }
        const record = { element: row, item, label: String(item.label).toLowerCase() }
        this.subItems.push(record)
        this.subVisible.push(record)
        row.addEventListener('mouseenter', () => {
          const visible = this.subVisible.indexOf(record)
          if (visible >= 0) this.focusSub(visible)
        })
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
      const box = row.getBoundingClientRect()
      const parent = this.root
        ? { left: this.root.offsetLeft, right: this.root.offsetLeft + this.root.offsetWidth }
        : { left: box.left, right: box.right }
      this.fitPanel(submenu, box.top, (size, opensAbove) => ({
        left: parent.right - 4 + size.width > window.innerWidth - 8 ? parent.left - size.width + 4 : parent.right - 4,
        top: opensAbove ? box.bottom - size.height + 4 : box.top - 4,
      }))
      // Where the panel sits relative to its row, so following the row later is a
      // pure translation with no second round of edge clamping.
      this.subOffset = { dx: submenu.offsetLeft - box.left, dy: submenu.offsetTop - box.top }
    }

    /**
     * Place a panel against its anchor: open on the roomier side, cap the height to
     * that side's room so a long list scrolls inside itself, then clamp into the
     * viewport. `origin(size, opensAbove)` returns the preferred top-left.
     */
    fitPanel(panel, anchorTop, origin) {
      const margin = 8
      const minRoom = 140
      panel.style.left = '0px'
      panel.style.top = '0px'
      panel.style.removeProperty('--dfa-maxh')
      // offsetWidth/Height ignore the entrance transform: this is the settled box.
      const natural = { width: panel.offsetWidth, height: panel.offsetHeight }
      const roomBelow = window.innerHeight - anchorTop - margin
      const roomAbove = anchorTop - margin
      const opensAbove = roomAbove > roomBelow
      panel.style.setProperty('--dfa-maxh', `${Math.round(Math.max(minRoom, opensAbove ? roomAbove : roomBelow))}px`)
      const size = { width: panel.offsetWidth || natural.width, height: panel.offsetHeight || natural.height }
      const raw = origin(size, opensAbove)
      const left = Math.min(Math.max(raw.left, margin), Math.max(margin, window.innerWidth - margin - size.width))
      const top = Math.min(Math.max(raw.top, margin), Math.max(margin, window.innerHeight - margin - size.height))
      panel.style.left = `${Math.round(left)}px`
      panel.style.top = `${Math.round(top)}px`
    }

    /** Keep the open submenu glued to its row while the page scrolls. */
    followSubmenu() {
      const submenu = this.submenu
      const row = this.submenuFor
      if (!submenu || !row || !row.isConnected) return
      if (!this.subOffset) { this.placeSubmenu(submenu, row); return }
      const rect = row.getBoundingClientRect()
      submenu.style.left = `${Math.round(rect.left + this.subOffset.dx)}px`
      submenu.style.top = `${Math.round(rect.top + this.subOffset.dy)}px`
    }

    closeSubmenu() {
      if (this.submenu) {
        this.submenuFor?.setAttribute('aria-expanded', 'false')
        this.submenu.remove()
        this.submenu = null
        this.submenuFor = null
      }
      this.subOffset = null
      this.subItems = []
      this.subVisible = []
      this.subIndex = -1
      this.searchInput = null
      this.subBody = null
      this.subEmpty = null
    }

    place(menu, x, y, preserveSide = false) {
      // Two pixels of air between the pointer and the panel: a menu glued to the
      // cursor edge reads as cramped, and the pixel under the pointer stays free.
      const gap = 2
      this.fitPanel(menu, y, (size, opensAbove) => ({
        left: x + gap + size.width > window.innerWidth - 8
          ? (preserveSide ? window.innerWidth - 8 - size.width : x - size.width - gap)
          : x + gap,
        top: opensAbove ? y - size.height - gap : y + gap,
      }))
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
      if (event.isComposing || event.keyCode === 229) return
      if (this.referencePreview) {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.closeReference() }
        if (event.key === 'Tab') {
          const controls = [...this.referencePreview.querySelectorAll('button:not(:disabled), [tabindex="0"]')]
          const at = controls.indexOf(document.activeElement)
          event.preventDefault()
          controls[(at + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus()
        }
        return
      }
      // The lightbox is modal: Escape dismisses it. Every other key is left alone so
      // the video transport (space, arrows) keeps working.
      if (this.lightbox) {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          this.closeLightbox()
        }
        return
      }
      const typing = this.searchInput && event.target === this.searchInput
      if (typing && !['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(event.key)) return
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
      if (event.key === 'Tab') {
        // Roving focus: without this, Tab walks out of the menu into the page and the
        // keyboard user loses the menu they just opened.
        event.preventDefault()
        if (this.submenu) this.moveSub(event.shiftKey ? -1 : 1)
        else this.move(event.shiftKey ? -1 : 1)
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
      if (target instanceof Node && (this.lightbox?.contains(target) || this.referencePreview?.contains(target))) return
      if (target instanceof Node && (this.root.contains(target) || (this.submenu && this.submenu.contains(target)))) return
      this.close()
    }

    /**
     * Follow the row the menu was opened on. The menu is moved by exactly the row's
     * own delta instead of being re-placed from a computed anchor point: re-placing
     * re-applied edge clamping on every tick, which is what made it drift and jump.
     */
    /** Remember how the painted menu sits relative to its row (edge clamping included). */
    captureAnchorOffset() {
      if (!this.root || !this.anchor || !this.anchor.isConnected) return
      const anchor = this.anchor.getBoundingClientRect()
      // offsetLeft/offsetTop ignore the entrance transform, so the captured offset is
      // the settled one even when this runs on the first frame.
      this.anchorOffset = { dx: this.root.offsetLeft - anchor.left, dy: this.root.offsetTop - anchor.top }
    }

    /**
     * Follow the row the menu was opened on: keep the offset captured when the menu
     * was painted and translate by the row movement. Calling place() again here would
     * re-apply edge clamping on every scroll tick, which is what made it drift.
     * The submenu keeps its own offset and follows the same way, so scrolling never
     * closes it.
     */
    followAnchor() {
      if (!this.root) return
      const anchor = this.anchor
      if (!anchor || !anchor.isConnected) { this.close(); return }
      const rect = anchor.getBoundingClientRect()
      if ((rect.width === 0 && rect.height === 0) || rect.bottom < 0 || rect.top > window.innerHeight) { this.close(); return }
      if (!this.anchorOffset) { this.captureAnchorOffset(); return }
      const left = Math.round(rect.left + this.anchorOffset.dx)
      const top = Math.round(rect.top + this.anchorOffset.dy)
      if (left === Math.round(this.x) && top === Math.round(this.y)) return
      this.x = left
      this.y = top
      this.root.style.left = left + 'px'
      this.root.style.top = top + 'px'
      this.followSubmenu()
    }

    close() {
      if (this.closed) return
      this.closed = true
      this.closeReference()
      this.closeLightbox()
      this.closeSubmenu()
      document.removeEventListener('keydown', this.handleKeyDown, true)
      document.removeEventListener('pointerdown', this.handlePointerDown, true)
      window.removeEventListener('resize', this.handlePointerDown, true)
      window.removeEventListener('blur', this.handlePointerDown, true)
      if (this.root) this.root.remove()
      this.root = null
      this.body = null
      this.thumbUrl = null
      this.thumbPath = null
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

  // One Host read is capped at a couple of megabytes, so a 5 MB video used to fail
  // "Save as" and "Open in browser" outright. Read in chunks until the Host reports
  // the end, and refuse anything past the total cap instead of filling memory.
  const READ_CHUNK_BYTES = 2 * 1024 * 1024
  const READ_TOTAL_MAX_BYTES = 64 * 1024 * 1024

  async function readAllBytes(bridge, sessionId, path) {
    const chunks = []
    let total = 0
    let identity
    for (let guard = 0; guard < 64; guard += 1) {
      const result = await bridge.readBytes(sessionId, path, { range: { offset: total, length: READ_CHUNK_BYTES } })
      if (!result || !(result.data instanceof Uint8Array)) return null
      if (typeof result.version !== 'string' || !result.version || typeof result.absolutePath !== 'string'
        || result.offset !== total || typeof result.eof !== 'boolean') return null
      if (!identity) identity = { version: result.version, path: result.absolutePath, bytes: result.bytes }
      else if (result.version !== identity.version || result.absolutePath !== identity.path
        || result.bytes !== identity.bytes) return { changed: true }
      if (result.data.byteLength === 0 && result.eof === false) return null
      if (total + result.data.byteLength > READ_TOTAL_MAX_BYTES || result.bytes > READ_TOTAL_MAX_BYTES) return { tooLarge: true }
      chunks.push(result.data)
      total += result.data.byteLength
      if (result.eof && typeof result.bytes === 'number' && total !== result.bytes) return { changed: true }
      if (result.eof !== false) {
        if (chunks.length === 1) return result.data
        const merged = new Uint8Array(total)
        let at = 0
        for (const chunk of chunks) { merged.set(chunk, at); at += chunk.byteLength }
        return merged
      }
      if (total >= READ_TOTAL_MAX_BYTES) return { tooLarge: true }
    }
    return null
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
  function fillBrowserWindow(win, bytes, mime, t = EN) {
    try {
      const blob = new Blob([bytes], { type: mime })
      const url = URL.createObjectURL(blob)
      win.opener = null
      const frame = win.document.createElement('iframe')
      frame.setAttribute('sandbox', '')
      frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0'
      const active = /^(?:text\/html|application\/xhtml\+xml|image\/svg\+xml)(?:;|$)/i.test(mime)
      if (active) {
        const bar = win.document.createElement('div')
        bar.style.cssText = 'position:fixed;inset:0 0 auto;height:56px;box-sizing:border-box;padding:8px;display:flex;gap:12px;align-items:center;overflow:auto;font:14px system-ui;background:#f2f2f2;color:#222'
        const label = win.document.createElement('span')
        label.textContent = t.previewSafe
        const button = win.document.createElement('button')
        button.textContent = t.previewTrust
        button.type = 'button'
        button.addEventListener('click', () => {
          // This opt-in belongs to this window only; the opaque-origin sandbox stays.
          frame.removeAttribute('srcdoc')
          frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-downloads allow-popups')
          frame.src = url
          label.textContent = t.previewTrusted
          button.remove()
        }, { once: true })
        bar.appendChild(label)
        bar.appendChild(button)
        frame.style.top = '56px'
        frame.style.height = 'calc(100% - 56px)'
        const policy = "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data: blob:; form-action 'none'; base-uri 'none'"
        // srcdoc puts the policy before any file markup. With scripts disabled,
        // sandbox also blocks automatic refresh; external embeds and forms stay off.
        frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="${policy}">` + new TextDecoder().decode(bytes)
        win.document.body.replaceChildren(bar, frame)
      } else {
        frame.setAttribute('sandbox', 'allow-scripts')
        frame.src = url
        win.document.body.replaceChildren(frame)
      }
      win.addEventListener?.('pagehide', () => URL.revokeObjectURL(url), { once: true })
      return true
    } catch {
      try { win.close() } catch { /* already gone */ }
      return false
    }
  }

  /* ─────────────────────────────── actions ─────────────────────────────── */

  const MAX_COPY_BYTES = 2 * 1024 * 1024

  async function readTextTarget(target, context) {
    const { bridge, t, sessionId } = context
    const current = () => !context.isCurrent || context.isCurrent()
    if (!current()) return null
    if (typeof target.bytes === 'number' && target.bytes > MAX_COPY_BYTES) return { error: t.tooLarge }
    if (target.outsideWorkspace === true && !context.outsideConfirmed) {
      const ask = context.confirm || (typeof confirm === 'function' ? confirm : null)
      try {
        if (!ask) return { error: t.confirmUnavailable }
        if (await ask((context.confirmMessage || t.confirmOutsideCopy).replace('{path}', target.absolutePath)) !== true) return null
      } catch { return { error: t.confirmUnavailable } }
    }
    if (!current()) return null
    let result
    try { result = await boundedCall(() => bridge.readBytes(sessionId, target.absolutePath, { range: { offset: 0, length: MAX_COPY_BYTES } })) }
    catch { if (current()) return { error: t.readFailed }; return null }
    if (!current()) return null
    if (!result || !(result.data instanceof Uint8Array)) return { error: t.readFailed }
    if (result.data.byteLength > MAX_COPY_BYTES || result.eof === false) return { error: t.tooLarge }
    if (target.version !== undefined && result.version !== target.version) {
      context.onFileChanged?.()
      return { error: t.fileChanged }
    }
    let text
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(result.data) }
    catch { return { error: t.invalidEncoding } }
    if (text.includes('\u0000')) return { error: t.binary }
    return { text, version: result.version }
  }

  async function dispatch(item, target, context) {
    const { bridge, t, sessionId } = context
    const path = target.absolutePath
    const copyingText = item.action === 'copyContents' || item.action === 'copyLines' || item.action === 'copySource'
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
      if (item.appId && context.validateApplication && !await context.validateApplication(path, item.appId)) {
        toast(t.appUnavailable, { error: true })
        return
      }
      const ok = await bridge.open(path, item.appId)
      if (!ok) {
        toast(t.openFailed, { error: true })
        context.onOpenFailed?.(path)
      }
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
    if (copyingText && typeof target.bytes === 'number' && target.bytes > MAX_COPY_BYTES) {
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
      const bytes = await readAllBytes(bridge, sessionId, path)
      if (!bytes || bytes.tooLarge || bytes.changed) {
        try { win.close() } catch { /* already gone */ }
        toast(bytes?.changed ? t.fileChanged : bytes?.tooLarge ? t.tooLarge : t.readFailed, { error: true })
        return
      }
      if (!fillBrowserWindow(win, bytes, mimeOf(path), t)) toast(t.popupBlocked, { error: true })
      return
    }
    if (item.action === 'saveAs') {
      const bytes = await readAllBytes(bridge, sessionId, path)
      if (!bytes || bytes.tooLarge || bytes.changed) {
        toast(bytes?.changed ? t.fileChanged : bytes?.tooLarge ? t.tooLarge : t.readFailed, { error: true })
        return
      }
      downloadBytes(bytes, basename(path), mimeOf(path))
      return
    }
    if (copyingText) {
      const result = await readTextTarget(target, context)
      if (!result) return
      if (result.error) { toast(result.error, { error: true }); return }
      let text = result.text
      if (item.action === 'copyLines') text = referencedText(text, target)
      if (item.action === 'copySource') text = sourceExcerpt(text, target)
      if (text === null) { toast(t.invalidLines, { error: true }); return }
      if (context.isCurrent && !context.isCurrent()) return
      const ok = await copyText(text)
      toast(ok ? (item.action === 'copyLines' ? t.copiedLines : item.action === 'copySource' ? t.copiedSource : t.copiedContents) : t.copyFailed, { error: !ok })
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
    let followFrame = 0
    let generation = 0
    let disposed = false

    function closeMenu() {
      generation++
      if (followFrame) { cancelAnimationFrame(followFrame); followFrame = 0 }
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
      if (!candidate || candidate.link) return
      const { session, path, key } = locate(candidate)
      if (!session || !path) return
      const guess = ['text', 'title'].includes(candidate.source) && candidate.explicit !== true
      if (!guess) {
        // An explicit carrier already names a real path, so the association query —
        // the slowest part of the menu — can start on hover instead of on click.
        void applicationsFor(path)
        return
      }
      if (cachedProbe(candidate) || probePending.has(key) || probePending.size >= 4) return
      const pending = bridge.probe(session.id, path).then((value) => {
        if (disposed) return
        if (probeCache.size >= 64) probeCache.delete(probeCache.keys().next().value)
        probeCache.set(key, { value, at: Date.now() })
        // The path is confirmed, so warm the association query as well.
        if (value && !value.isDir && !value.error) void applicationsFor(path)
      }).finally(() => probePending.delete(key))
      probePending.set(key, pending)
    }
    let preferenceStorage
    try { preferenceStorage = window.localStorage } catch { /* private storage may be disabled */ }
    const settingsViews = new Set()
    const notifySettings = () => { for (const render of settingsViews) render() }
    const config = clientPreferences(preferenceStorage)
    const preferences = applicationPreferences(preferenceStorage, notifySettings)

    async function openAt(candidate, x, y, keyboard) {
      if (disposed) return
      closeMenu()
      const attempt = ++generation
      let handle
      try {
        if (candidate.link) {
          const text = String(candidate.element?.textContent || '').trim().slice(0, 512)
          const target = { link: candidate.link, text }
          handle = new FileMenu({ model: buildLinkMenuModel({ url: candidate.link, text, t, menuMode: config.get().menuMode }),
            x, y, keyboard, anchor: candidate.element, t,
            onClose: () => { if (menu === handle) menu = null },
            onPick: (item) => { void dispatch(item, target, { bridge, t }) },
          })
          menu = handle
          handle.open()
          return
        }
        const { session, located, path } = locate(candidate)
        const modelInput = { absolutePath: path, displayPath: located.path, apps: [], appsState: 'loading',
          location: located, reference: candidate.reference || candidate.path, t, menuMode: config.get().menuMode }
        let target
        const activeSessionId = bridge.activeSession()?.id
        const isCurrent = () => !disposed && attempt === generation && bridge.activeSession()?.id === activeSessionId
        handle = new FileMenu({ model: buildStatusModel(path, t.checking, t),
          x, y, keyboard, anchor: candidate.element, t,
          onClose: () => { if (menu === handle) menu = null },
          onPick: (item) => {
            if (item.action === 'referencePreview' && target) { void handle.openReference(target, { bridge, t, sessionId: session.id, isCurrent, contextLines: config.get().contextLines, onFileChanged: () => probeCache.delete(locate(candidate).key) }); return }
            if (item.action === 'retry') { void openAt(candidate, x, y, keyboard); return }
            if (item.action === 'preferApp') {
              const appId = preferences.get(path) === item.appId ? '' : item.appId
              const saved = preferences.set(path, appId)
              toast(saved ? (appId ? t.preferenceSaved : t.preferenceCleared) : t.preferenceFailed, { error: !saved })
              return
            }
            if (target) void dispatch(item, target, { bridge, t, sessionId: session.id,
              onFileChanged: () => probeCache.delete(locate(candidate).key),
              validateApplication: async (file, id) => {
                const cached = appsCache.get(extname(file).toLowerCase())
                const result = await applicationsFor(file, cached?.needsValidation === true)
                return result.state === 'ready' && result.apps.some((app) => app.id === id)
              },
              onOpenFailed: (file) => {
                appsCache.delete(extname(file).toLowerCase())
                scheduleStoreWrite()
                void applicationsFor(file, true)
              },
            })
          },
        })
        menu = handle
        handle.open()
        if (!session) {
          handle.setModel(buildStatusModel(path, t.noSession, t, true))
          return
        }
        const probe = cachedProbe(candidate) || await bridge.probe(session.id, path)
        if (disposed || attempt !== generation || handle.closed) return
        if (!probe || probe.error) {
          handle.setModel(buildStatusModel(path, t[probe?.error] || t.probeFailed, t, true))
          return
        }
        const displayPath = relativeTo(session.cwd, probe.absolutePath) || probe.absolutePath
        Object.assign(modelInput, { absolutePath: probe.absolutePath, displayPath, isDir: probe.isDir,
          bytes: probe.bytes, outsideWorkspace: !isInside(session.cwd, probe.absolutePath),
          cwd: session.cwd, preferredId: preferences.get(probe.absolutePath) })
        target = { absolutePath: probe.absolutePath, displayPath,
          isDir: probe.isDir, version: probe.version, line: located.line, endLine: located.endLine, column: located.column, bytes: probe.bytes,
          reference: candidate.reference || candidate.path, outsideWorkspace: !isInside(session.cwd, probe.absolutePath) }
        handle.setModel(buildMenuModel(modelInput))
        if (!probe.isDir) void enrich(handle, modelInput)
        const previewKind = classify(probe.absolutePath, false).kind
        if (!probe.isDir && (previewKind === 'image' || previewKind === 'video' || extname(probe.absolutePath) === 'svg')) {
          void loadThumb(handle, session.id, probe.absolutePath, probe.bytes, probe.version)
        }
      } catch (error) {
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
    const APPS_EMPTY_TTL_MS = 15000
    // The Host walk costs ~1.2 s and an association list rarely changes, so the answer
    // is also stored across reloads: the first right-click of a session is instant.
    const APPS_STORE_KEY = 'dsh-file-actions.apps.v1'
    const APPS_STORE_TTL_MS = 24 * 60 * 60 * 1000
    const APPS_STORE_MAX_CHARS = 512 * 1024
    const APPS_STORE_RECORD_MAX_CHARS = 48 * 1024
    const appsCache = new Map()
    const appsPending = new Map()
    let appsEpoch = 0
    let storeTimer = 0

    function readAppsStore() {
      try {
        const raw = window.localStorage.getItem(APPS_STORE_KEY)
        const parsed = raw ? JSON.parse(raw) : null
        return parsed && typeof parsed === 'object' && parsed.entries && typeof parsed.entries === 'object'
          ? parsed.entries : {}
      } catch { return {} }
    }

    function writeAppsStore() {
      storeTimer = 0
      try {
        const entries = {}
        let chars = 0
        // Newest first: with a bounded budget, the extension asked about last is the
        // one most likely to be opened again next.
        for (const [key, value] of [...appsCache.entries()].sort((a, b) => b[1].at - a[1].at)) {
          // Empty answers are too volatile to persist; they expire in 15 s anyway.
          if (!value.result.apps.length) continue
          const shape = (withIcons) => ({ at: value.at, apps: value.result.apps.map((app) => ({
            id: app.id, name: app.name, default: app.default === true, icon: withIcons ? (app.icon || null) : null })) })
          let record = shape(true)
          let size = JSON.stringify(record).length
          // A heavy icon set is not worth more than the association itself.
          if (size > APPS_STORE_RECORD_MAX_CHARS) { record = shape(false); size = JSON.stringify(record).length }
          if (chars + size > APPS_STORE_MAX_CHARS) continue
          entries[key] = record
          chars += size
        }
        window.localStorage.setItem(APPS_STORE_KEY, JSON.stringify({ version: 1, entries }))
      } catch { /* storage blocked or full: the in-memory cache still works */ }
    }

    function scheduleStoreWrite() {
      if (storeTimer) return
      storeTimer = setTimeout(writeAppsStore, 400)
    }

    for (const [key, record] of Object.entries(readAppsStore())) {
      if (!record || typeof record.at !== 'number' || !Array.isArray(record.apps)) continue
      if (Date.now() - record.at > APPS_STORE_TTL_MS) continue
      // Storage is editable by the page, so only well-formed rows get in: a nameless
      // entry would render as an empty row in the submenu.
      const apps = record.apps.filter((app) => app && typeof app.id === 'string' && app.id !== ''
        && typeof app.name === 'string' && app.name !== '')
      if (!apps.length) continue
      appsCache.set(key, { result: { state: 'ready', apps }, at: record.at, ttl: APPS_STORE_TTL_MS, needsValidation: true })
    }
    /**
     * One association query per extension, shared by the hover prefetch and the
     * menu. Walking the OS registry is the slow part on Windows, so a second menu
     * for the same extension — or a menu opened while the hover query is still
     * running — must join the existing request instead of starting another one.
     */
    function applicationsFor(path, refresh = false) {
      const key = extname(path).toLowerCase()
      const cached = appsCache.get(key)
      if (!refresh && cached && Date.now() - cached.at < cached.ttl) return Promise.resolve(cached.result)
      const pending = appsPending.get(key)
      if (pending) return pending
      const epoch = appsEpoch
      const request = bridge.applications(path).then((result) => {
        if (disposed || epoch !== appsEpoch) return result
        // A successful empty answer is cached briefly: the OS may still be
        // registering a handler, but it is not worth a walk on every click.
        if (result.state === 'ready') {
          if (appsCache.size >= 64) appsCache.delete(appsCache.keys().next().value)
          appsCache.set(key, { result, at: Date.now(), ttl: result.apps.length ? APPS_TTL_MS : APPS_EMPTY_TTL_MS })
          scheduleStoreWrite()
          notifySettings()
        } else if (refresh) {
          appsCache.delete(key)
          scheduleStoreWrite()
        }
        return result
      }).finally(() => { if (appsPending.get(key) === request) appsPending.delete(key) })
      appsPending.set(key, request)
      return request
    }

    async function enrich(handle, input) {
      const needsValidation = appsCache.get(extname(input.absolutePath).toLowerCase())?.needsValidation === true
      const paint = (result) => {
        if (disposed || menu !== handle || handle.closed) return
        if (input.appsState === result.state && JSON.stringify(input.apps) === JSON.stringify(result.apps)) return
        Object.assign(input, { apps: result.apps, appsState: result.state })
        handle.setModel(buildMenuModel(input))
      }
      paint(await applicationsFor(input.absolutePath))
      if (needsValidation && !disposed) paint(await applicationsFor(input.absolutePath, true))
    }

    // A thumbnail is worth one bounded read; bigger files just keep the tile.
    const THUMB_MAX_BYTES = 8 * 1024 * 1024
    // Bound the cache by bytes, not entries: one poster or 4.9 MB still can hold
    // megabytes, and twelve of those would pin ~100 MB of object URLs for the page.
    const THUMB_CACHE_MAX_BYTES = 16 * 1024 * 1024
    const thumbCache = new Map()

    /**
     * Decode one frame of a video into a poster image. The bytes are already in
     * memory, so this costs a decoder spin, not another Host read; a file Chromium
     * cannot decode (or a codec it lacks) simply yields no poster.
     */
    function videoPoster(bytes, mime) {
      return new Promise((resolve) => {
        let settled = false
        let url = ''
        const finish = (value) => {
          if (settled) return
          settled = true
          if (url) URL.revokeObjectURL(url)
          resolve(value)
        }
        try {
          url = URL.createObjectURL(new Blob([bytes], { type: mime }))
          const video = document.createElement('video')
          video.muted = true
          video.playsInline = true
          video.preload = 'auto'
          video.onloadeddata = () => {
            // Ten percent in, capped: the first frames of a clip are often black or
            // a fade, and a poster of a black frame is worse than none.
            const span = Number(video.duration) || 1
            try { video.currentTime = Math.min(3, Math.max(0.2, span * 0.1)) } catch { finish(null) }
          }
          video.onseeked = () => {
            try {
              const width = video.videoWidth || 480
              const height = video.videoHeight || 270
              const scale = Math.min(1, 480 / Math.max(width, height))
              const canvas = document.createElement('canvas')
              canvas.width = Math.max(1, Math.round(width * scale))
              canvas.height = Math.max(1, Math.round(height * scale))
              canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
              finish(canvas.toDataURL('image/jpeg', 0.72))
            } catch {
              finish(null)
            }
          }
          video.onerror = () => finish(null)
          // A poster is a nicety: never keep the menu waiting on a stubborn file.
          setTimeout(() => finish(null), 4000)
          video.src = url
        } catch {
          finish(null)
        }
      })
    }

    async function loadThumb(handle, sessionId, absolutePath, bytes, version) {
      try {
        if (typeof bytes === 'number' && bytes > THUMB_MAX_BYTES) { handle.setThumbnail(null, absolutePath); return }
        const key = JSON.stringify([sessionId, absolutePath, version])
        const cached = version && thumbCache.get(key)
        if (cached) {
          if (menu === handle && !handle.closed) handle.setThumbnail(cached.url, absolutePath)
          return
        }
        const result = await bridge.readBytes(sessionId, absolutePath)
        if (disposed || menu !== handle || handle.closed) return
        if (!result || !(result.data instanceof Uint8Array) || result.eof === false || result.data.byteLength > THUMB_MAX_BYTES) {
          handle.setThumbnail(null, absolutePath)
          return
        }
        const mime = mimeOf(absolutePath)
        const url = classify(absolutePath, false).kind === 'video'
          ? await videoPoster(result.data, mime)
          : URL.createObjectURL(new Blob([result.data], { type: mime }))
        if (!url) { handle.setThumbnail(null, absolutePath); return }
        if (disposed) { URL.revokeObjectURL(url); return }
        const previous = thumbCache.get(key)
        if (previous) URL.revokeObjectURL(previous.url)
        thumbCache.set(key, { url, at: Date.now(), size: url.startsWith('blob:') ? result.data.byteLength : url.length * 2 })
        let total = 0
        for (const entry of thumbCache.values()) total += entry.size
        for (const [oldKey, entry] of thumbCache) {
          if (total <= THUMB_CACHE_MAX_BYTES && thumbCache.size <= 12) break
          if (oldKey === key) break
          URL.revokeObjectURL(entry.url)
          thumbCache.delete(oldKey)
          total -= entry.size
        }
        if (menu === handle && !handle.closed) handle.setThumbnail(url, absolutePath)
      } catch (error) {
        if (menu === handle && !handle.closed) handle.setThumbnail(null, absolutePath)
        console.warn('[dsh-file-actions] thumbnail failed:', error)
      }
    }

    /** Take the click and open our menu, unless the pointer sits on our own menu. */
    function openFromEvent(event) {
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
      if (['text', 'title'].includes(candidate.source) && candidate.explicit !== true) {
        const probe = cachedProbe(candidate)
        if (!probe || probe.error) { warmCandidate(candidate); return }
      }
      event.preventDefault()
      event.stopPropagation()
      void openAt(candidate, event.clientX, event.clientY, false)
    }

    // The Electron shell ships no native context menu, so a Shift-click that only
    // stepped aside would be a dead end. Remember the event here, let the page and
    // any other plugin answer in the bubble phase, and fall back to our own menu
    // when nobody did.
    let shiftEvent = null

    function onContextMenu(event) {
      if (event.target?.closest?.('.dfa-reference-overlay')) return
      if (event.defaultPrevented) return
      if (event.shiftKey) {
        shiftEvent = event
        closeMenu()
        return
      }
      openFromEvent(event)
    }

    function onContextMenuFallback(event) {
      if (event !== shiftEvent) return
      shiftEvent = null
      if (event.defaultPrevented) return
      openFromEvent(event)
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
      if (['text', 'title'].includes(candidate.source) && candidate.explicit !== true) {
        const probe = cachedProbe(candidate)
        if (!probe || probe.error) { warmCandidate(candidate); return }
      }
      event.preventDefault()
      void openAt(candidate, rect.left, rect.bottom, true)
    }

    function onWarm(event) {
      if (event.shiftKey || event.target?.closest?.(`[${MENU_ATTR}], .dfa-reference-overlay, .dfa-settings`)) return
      const rect = event.target?.getBoundingClientRect?.()
      warmCandidate(candidateFromEvent({ target: event.target,
        clientX: event.clientX ?? rect?.left, clientY: event.clientY ?? rect?.top }, document))
    }

    function onPointerDown(event) {
      const target = event.target
      if (target && target.closest && target.closest(`[${MENU_ATTR}], .dfa-lightbox, .dfa-reference-overlay`)) return
      closeMenu()
    }

    function onViewportChange(event) {
      // Scrolling the menu's own long lists (or the "open with" submenu) is not
      // the page moving; closing on it would make those lists unusable.
      const target = event && event.target
      if (target && target.closest && target.closest(`[${MENU_ATTR}], .dfa-reference-overlay`)) return
      if (!menu) return
      if (event && event.type === 'scroll') {
        // One read per frame: a scroll burst fires many events, and each follow()
        // reads a layout box. Coalescing keeps the glide smooth instead of jittery.
        if (followFrame) return
        followFrame = requestAnimationFrame(() => {
          followFrame = 0
          if (menu) menu.followAnchor()
        })
        return
      }
      closeMenu()
    }

    const install = () => {
      if (activeCleanup) activeCleanup()
      document.addEventListener('contextmenu', onContextMenu, true)
      window.addEventListener('contextmenu', onContextMenuFallback)
      document.addEventListener('pointerover', onWarm, true)
      document.addEventListener('focusin', onWarm, true)
      document.addEventListener('keydown', onKeyDown, true)
      document.addEventListener('pointerdown', onPointerDown, true)
      window.addEventListener('resize', onViewportChange)
      document.addEventListener('scroll', onViewportChange, true)
      // A DOM marker survives page-side identity quirks and gives the e2e driver
      // one stable readiness signal instead of guessing at boot timing.
      document.documentElement.setAttribute('data-dfa-ready', '1')
      let sessionId = bridge.activeSession()?.id
      let unsubscribe
      try { unsubscribe = ctx.sessions?.list?.subscribe?.(() => {
        const next = bridge.activeSession()?.id
        if (next !== sessionId) { sessionId = next; closeMenu() }
      }) } catch { /* optional observable */ }
      const settingsController = {
        config, apps: preferences,
        subscribe(render) { settingsViews.add(render); return () => settingsViews.delete(render) },
        update(patch) { const ok = config.set(patch); if (ok) { closeMenu(); notifySettings() } return ok },
        reset() { const ok = config.reset(); if (ok) { closeMenu(); notifySettings() } return ok },
        applicationName(id) {
          for (const { result } of appsCache.values()) { const app = result.apps.find(app => app.id === id); if (app) return app.name }
          return basename(id) || id
        },
        cacheCount: () => appsCache.size,
        clearCache() {
          try { preferenceStorage.removeItem(APPS_STORE_KEY) } catch { return false }
          if (storeTimer) { clearTimeout(storeTimer); storeTimer = 0 }
          appsEpoch++; appsCache.clear(); appsPending.clear(); closeMenu(); notifySettings()
          return true
        },
      }
      const disposeSettings = registerSettings(ctx, settingsController)
      const onStorage = event => {
        if (event.key === CLIENT_SETTINGS_KEY || event.key === 'dsh-file-actions.preferred-apps.v1' || event.key === null) { closeMenu(); notifySettings() }
        if (event.key === APPS_STORE_KEY || event.key === null) { appsEpoch++; appsCache.clear(); appsPending.clear(); notifySettings() }
      }
      window.addEventListener('storage', onStorage)
      const cleanup = () => {
        disposed = true
        disposeSettings()
        settingsViews.clear()
        window.removeEventListener('storage', onStorage)
        if (typeof unsubscribe === 'function') unsubscribe()
        document.documentElement.removeAttribute('data-dfa-ready')
        document.removeEventListener('contextmenu', onContextMenu, true)
        window.removeEventListener('contextmenu', onContextMenuFallback)
        document.removeEventListener('pointerover', onWarm, true)
        document.removeEventListener('focusin', onWarm, true)
        probeCache.clear()
        probePending.clear()
        document.removeEventListener('keydown', onKeyDown, true)
        document.removeEventListener('pointerdown', onPointerDown, true)
        window.removeEventListener('resize', onViewportChange)
        document.removeEventListener('scroll', onViewportChange, true)
        closeMenu()
        if (storeTimer) { clearTimeout(storeTimer); storeTimer = 0 }
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
      iconSvg,
      ICON_PATHS,
      KIND_ICONS,
      CSS,
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
      readAllBytes,
      mimeOf,
      pickEditor,
      orderApplications,
      applicationPreferences,
      clientPreferences,
      visibleMenuSections,
      mountSettings,
      registerSettings,
      buildStatusModel,
      FileMenu,
      buildMenuModel,
      buildLinkMenuModel,
      formatLocation,
      referencedText,
      referenceContext,
      sourceExcerpt,
      readTextTarget,
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
