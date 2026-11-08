import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const hooks = []
let hookIndex = 0
let pendingEffects = []
let Dock
let animationFrame
let frameTime = 0
let nextStart = 0
const starts = Array.from({ length: 3 }, () => deferred())
const startsSeen = Array.from({ length: 3 }, () => deferred())
const submissions = []

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

const context2d = new Proxy({}, {
  get(target, key) {
    if (key in target) return target[key]
    return (...args) => {
      if (key === 'createLinearGradient') return { addColorStop() {} }
      if (key === 'measureText') return { width: 240 }
      if (key === 'fillText') return String(args[0])
      return undefined
    }
  },
  set(target, key, value) {
    target[key] = value
    return true
  },
})
const canvas = {
  width: 0,
  height: 0,
  getContext: () => context2d,
  getBoundingClientRect: () => ({ width: 640 }),
}
const React = {
  createElement(type, props, ...children) {
    if (type === 'canvas' && props.ref) props.ref.current = canvas
    return { type, props, children }
  },
  useRef(initial) {
    const index = hookIndex++
    if (!hooks[index]) hooks[index] = { current: initial }
    return hooks[index]
  },
  useState(initial) {
    const index = hookIndex++
    if (!hooks[index]) hooks[index] = [typeof initial === 'function' ? initial() : initial, () => {}]
    return hooks[index]
  },
  useEffect(effect, deps) {
    const index = hookIndex++
    const previous = hooks[index]
    const changed = !previous || deps.some((value, at) => !Object.is(value, previous.deps[at]))
    hooks[index] = { deps, cleanup: previous?.cleanup }
    if (changed) {
      pendingEffects.push(() => {
        previous?.cleanup?.()
        hooks[index].cleanup = effect()
      })
    }
  },
  useMemo(build) {
    hookIndex++
    return build()
  },
  useSyncExternalStore() {
    hookIndex++
    return true
  },
}

globalThis.window = {
  __ModuleLoader__: { load(definition) { globalThis.definition = definition } },
  addEventListener() {},
  removeEventListener() {},
}
globalThis.document = {
  body: {},
  head: { append() {} },
  createElement: () => ({}),
}
globalThis.localStorage = {
  getItem(key) {
    if (key === 'dsh-rex-user') return JSON.stringify({ id: 1, token: 'identity' })
    if (key === 'dsh-rex-device') return 'dev-hide-score-test'
    return null
  },
  setItem() {},
}
globalThis.requestAnimationFrame = (callback) => {
  animationFrame = callback
  return 1
}
globalThis.cancelAnimationFrame = () => {}
globalThis.fetch = async (url, options = {}) => {
  const path = new URL(url, 'https://board.test').pathname
  if (path.endsWith('/scores') && options.method === 'POST') {
    submissions.push(JSON.parse(options.body))
    return { ok: true, status: 200, json: async () => ({ scores: [] }) }
  }
  if (path.endsWith('/scores')) {
    return { ok: true, status: 200, json: async () => ({ scores: [] }) }
  }
  if (path.endsWith('/start')) {
    const index = nextStart++
    startsSeen[index].resolve()
    return starts[index].promise
  }
  throw new Error(`unexpected request: ${path}`)
}

new Function('window', source)(globalThis.window)
const plugin = globalThis.definition.factory((name) => ({ react: React, 'react-dom': { createPortal: (node) => node } })[name])
plugin.apply({
  effect: (effect) => effect(),
  locale: { register() {} },
  slots: {
    inject: (_slot, register) => register(),
    register(config, component) {
      if (config.id === 'whale-break') Dock = component
    },
  },
})

function render(waiting) {
  hookIndex = 0
  pendingEffects = []
  Dock({
    sessionId: 'session',
    locale: { bind: () => (key) => key },
    useSessionStatus: () => ({ running: waiting, pendingInteraction: undefined }),
  })
  for (const effect of pendingEffects) effect()
}

function runResponse(token) {
  return { ok: true, status: 200, json: async () => ({ run: token }) }
}
function flush() {
  return new Promise((resolve) => setImmediate(resolve))
}
function play() {
  for (let index = 0; index < 20; index += 1) {
    frameTime += 50
    animationFrame(frameTime)
  }
}

render(true)
await startsSeen[0].promise
play()
render(false)
starts[0].resolve(runResponse('run-0'))
await flush()

assert.equal(submissions.length, 1, 'hiding before the run token arrives still submits the score')
assert.ok(submissions[0].score > 0)

// A stale start must not replace the token belonging to the next game.
render(true)
await startsSeen[1].promise
render(false)
render(true)
await startsSeen[2].promise
starts[2].resolve(runResponse('run-2'))
await flush()
play()
starts[1].resolve(runResponse('run-1'))
await flush()
render(false)
await flush()

assert.equal(submissions.length, 2)
assert.equal(submissions[1].run, 'run-2', 'the current game keeps its own run token')
console.log('hide-score submission ok')
