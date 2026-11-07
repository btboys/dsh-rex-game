import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

let factory
globalThis.window = { __ModuleLoader__: { load: (definition) => { factory = definition.factory } } }
globalThis.__REX_SELFTEST__ = (core) => { globalThis.__rex = core }

const stubs = {
  react: {
    createElement: () => null,
    useRef: () => ({ current: null }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {},
    useMemo: (build) => build(),
    useSyncExternalStore: () => {},
  },
  'react-dom': { createPortal: () => null },
}

new Function('window', source)(globalThis.window)
factory((name) => stubs[name] ?? {})

const { createWorld, jump, stepWorld, FLOOR_Y, GROUND, whaleBox, coralBox, paintWorld } = globalThis.__rex

// A fresh world waits on the sea floor until the first input.
const world = createWorld()
assert.equal(world.phase, 'ready')
assert.equal(world.y, FLOOR_Y)

jump(world)
assert.equal(world.phase, 'run')
assert.ok(world.vy < 0, 'jump gives upward velocity')

let peak = world.y
for (let i = 0; i < 30; i += 1) {
  stepWorld(world, 1 / 60)
  peak = Math.min(peak, world.y)
}
assert.ok(peak < FLOOR_Y - 20, 'whale leaves the sea floor')
assert.ok(world.score > 0, 'score grows while running')

// Standing still in front of a coral ends the run and records the best score.
const crashing = createWorld()
crashing.phase = 'run'
crashing.corals.push({ x: 40, h: 30 })
for (let i = 0; i < 10; i += 1) stepWorld(crashing, 1 / 60)
assert.equal(crashing.phase, 'over', 'coral at the whale ends the run')
assert.ok(crashing.best >= Math.floor(crashing.score), 'best score is recorded on game over')

// A jump timed as the coral approaches clears it.
const cleared = createWorld()
cleared.phase = 'run'
cleared.corals.push({ x: 90, h: 30 })
for (let i = 0; i < 120; i += 1) {
  const coral = cleared.corals[0]
  if (coral && coral.x - whaleBox(cleared).x < 72 && cleared.y === FLOOR_Y) jump(cleared)
  stepWorld(cleared, 1 / 60)
  assert.notEqual(cleared.phase, 'over', `coral should be cleared (frame ${i}, coral ${coral?.x})`)
}

// Hit boxes stay inside the playfield.
const box = whaleBox(cleared)
assert.ok(box.y >= 0 && box.y + box.h <= GROUND, 'whale hit box above the sea floor')
assert.ok(coralBox({ x: 200, h: 40 }).y >= 0, 'coral box inside the playfield')

// The drawing pass touches a real 2D context and draws the HUD / game-over text.
const calls = []
const context2d = new Proxy(
  {},
  {
    get(target, key) {
      if (key in target) return target[key]
      return () => {
        calls.push(String(key))
        if (String(key) === 'createLinearGradient') return { addColorStop() {} }
      }
    },
    set(target, key, value) {
      target[key] = value
      return true
    },
  },
)
const drawn = createWorld()
drawn.phase = 'run'
drawn.corals.push({ x: 100, h: 30, tint: 1 })
paintWorld(context2d, drawn, 2)
assert.equal(calls.filter((call) => call === 'fillText').length, 1, 'running scene draws the score line')
assert.ok(calls.includes('ellipse'), 'running scene draws the whale')
assert.ok(calls.includes('stroke'), 'running scene draws the coral / sea floor')
drawn.phase = 'over'
calls.length = 0
paintWorld(context2d, drawn, 2)
assert.equal(calls.filter((call) => call === 'fillText').length, 2, 'game over draws score and GAME OVER')

console.log('rex-game selfcheck ok')
