import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadBundle } from './helpers/client-bundle.js'

const CHUNK = 2 * 1024 * 1024
const MiB = 1024 * 1024

// The poster path decodes through `<video>` and `<canvas>`; this stand-in makes the
// decode synchronous and observable so the read strategy is what the test measures.
function previewDom() {
  const decoded = { posters: 0, sources: [] }
  const createElement = (tag) => {
    if (tag === 'canvas') {
      return {
        width: 0, height: 0,
        getContext: () => ({ drawImage() {} }),
        toDataURL: () => { decoded.posters += 1; return 'data:image/jpeg;base64,AAAA' },
      }
    }
    const video = {
      muted: false, playsInline: false, preload: '', duration: 40, videoWidth: 1920, videoHeight: 1080,
      onloadeddata: null, onseeked: null, onerror: null,
      set src(value) {
        decoded.sources.push(value)
        this._src = value
        setTimeout(() => this.onloadeddata?.(), 0)
      },
      get src() { return this._src },
    }
    Object.defineProperty(video, 'currentTime', {
      set() { setTimeout(() => this.onseeked?.(), 0) },
      get() { return 0 },
    })
    return video
  }
  return { decoded, document: { createElement, body: { appendChild() {} }, querySelector: () => null } }
}

/** Serve a file of `size` bytes in Host-sized windows, like WorkspaceFiles does. */
function bridgeServing(size, { version = 'v1' } = {}) {
  const calls = []
  return {
    calls,
    async readBytes(sessionId, path, options) {
      calls.push(options?.range || null)
      const offset = options?.range?.offset ?? 0
      const length = options?.range?.length ?? size
      const end = Math.min(size, offset + length)
      return {
        data: new Uint8Array(Math.max(0, end - offset)), eof: end >= size, offset,
        absolutePath: path, version, bytes: size,
      }
    },
  }
}

function install() {
  const dom = previewDom()
  // The poster guard is a 4 s backstop; a passing test never needs it, and leaving
  // it armed would hold the test process open for as many seconds.
  const timers = []
  const plugin = loadBundle({
    document: dom.document,
    setTimeout: (fn, ms) => { const timer = setTimeout(fn, ms); timers.push(timer); return timer },
  })
  return { ...dom, api: plugin.__internals, disarm: () => { for (const timer of timers) clearTimeout(timer) } }
}

function handle() {
  const seen = []
  return { seen, closed: false, setThumbnail: (url, path) => seen.push({ url, path }) }
}

test('a 56 MB video is read in Host-sized windows instead of losing its poster', async () => {
  const { api, decoded, disarm } = install()
  const served = 5 * MiB
  const bridge = bridgeServing(served)
  const cache = api.createPreviewCache(bridge, () => true)
  const row = handle()
  try {
    await cache.load(row, 's1', 'D:\\video\\promo.mp4', 56 * MiB, 'v1')
  } finally { cache.dispose(); disarm() }
  // The old 8 MB cap answered "no thumbnail" without ever reading the file.
  assert.equal(bridge.calls.length, 3, 'expected the whole file in 2 MiB windows')
  assert.deepEqual(bridge.calls.map((range) => range.offset), [0, CHUNK, 2 * CHUNK])
  assert.deepEqual(bridge.calls.map((range) => range.length), [CHUNK, CHUNK, CHUNK])
  assert.equal(decoded.sources.length, 1, 'the container reached one decoder run')
  assert.equal(decoded.posters, 1)
  assert.equal(row.seen.length, 1)
  assert.match(row.seen[0].url, /^data:image\/jpeg/)
  assert.equal(row.seen[0].path, 'D:\\video\\promo.mp4')
})

test('the video poster is retained as the frame, not as the container bytes', async () => {
  const { api, disarm } = install()
  const cache = api.createPreviewCache(bridgeServing(5 * MiB), () => true)
  const row = handle()
  try {
    await cache.load(row, 's1', 'D:\\video\\promo.mp4', 56 * MiB, 'v1')
    assert.equal(row.seen[0].url.startsWith('blob:'), false)
  } finally { cache.dispose(); disarm() }
})

test('a video past the total read cap is not read at all', async () => {
  const { api, disarm } = install()
  const bridge = bridgeServing(5 * MiB)
  const cache = api.createPreviewCache(bridge, () => true)
  const row = handle()
  try {
    await cache.load(row, 's1', 'D:\\video\\huge.mp4', 200 * MiB, 'v1')
  } finally { cache.dispose(); disarm() }
  assert.equal(bridge.calls.length, 0)
  assert.deepEqual(row.seen, [{ url: null, path: 'D:\\video\\huge.mp4' }])
})

test('a container Chromium cannot demux is not read for a poster', async () => {
  const { api, disarm } = install()
  const bridge = bridgeServing(64 * MiB)
  const cache = api.createPreviewCache(bridge, () => true)
  const row = handle()
  try {
    await cache.load(row, 's1', 'D:\\video\\film.mkv', 40 * MiB, 'v1')
  } finally { cache.dispose(); disarm() }
  assert.equal(bridge.calls.length, 0, 'an MKV has no frame to decode')
  assert.deepEqual(row.seen, [{ url: null, path: 'D:\\video\\film.mkv' }])
})

test('an image keeps its single bounded read and its 8 MB ceiling', async () => {
  const { api, disarm } = install()
  const bridge = bridgeServing(9 * MiB)
  const cache = api.createPreviewCache(bridge, () => true)
  const row = handle()
  try {
    await cache.load(row, 's1', 'D:\\img\\big.png', 9 * MiB, 'v1')
  } finally { cache.dispose(); disarm() }
  assert.equal(bridge.calls.length, 0)
  assert.equal(row.seen[0].url, null)
})

test('switching files abandons the in-flight video read', async () => {
  const { api, disarm } = install()
  const bridge = bridgeServing(64 * MiB)
  let current = true
  const cache = api.createPreviewCache(bridge, () => current)
  const row = handle()
  const loading = cache.load(row, 's1', 'D:\\video\\long.mp4', 56 * MiB, 'v1')
  current = false
  try { await loading } finally { cache.dispose(); disarm() }
  assert.ok(bridge.calls.length <= 2, `kept reading after the menu moved: ${bridge.calls.length} windows`)
  assert.deepEqual(row.seen, [], 'a stale read must not paint a poster')
})
