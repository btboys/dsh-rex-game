import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'

import { createScoreRoute, maxScoreFor, mergeEntries, normalizeDevice, normalizeScore } from '../scoreboard.js'

const dir = await mkdtemp(join(tmpdir(), 'dsh-whale-break-'))
const file = join(dir, 'scores.json')
const route = createScoreRoute({ file })

assert.equal(route.kind, 'prefix')
assert.equal(route.path, '/dsh-whale-break')

function call(method, path, body) {
  return new Promise((resolve, reject) => {
    const request = new Readable({ read() {} })
    request.method = method
    request.url = '/dsh-whale-break' + path
    request.headers = {}
    request.socket = { remoteAddress: '127.0.0.1' }
    const response = {
      status: 0,
      body: '',
      writeHead(status) {
        this.status = status
      },
      end(text) {
        this.body = text ?? ''
        resolve(this)
      },
    }
    Promise.resolve(route.handler(request, response)).catch(reject)
    if (body !== undefined) request.push(JSON.stringify(body))
    request.push(null)
  })
}

const json = (response) => JSON.parse(response.body)

// Public read needs no identity.
assert.deepEqual(json(await call('GET', '/scores')), { scores: [] })

// Device registration hands out sequential user numbers from 1.
const first = json(await call('POST', '/register', { device: 'device-aaaaaaaa-1' }))
assert.equal(first.user.id, 1)
assert.equal(first.user.name, '用户1')
assert.equal(typeof first.token, 'string')

const firstAgain = json(await call('POST', '/register', { device: 'device-aaaaaaaa-1' }))
assert.equal(firstAgain.user.id, 1, 'the same device keeps its number')

const second = json(await call('POST', '/register', { device: 'device-bbbbbbbb-2' }))
assert.equal(second.user.id, 2, 'numbers increment in registration order')

assert.equal((await call('POST', '/register', { device: 'bad' })).status, 400, 'malformed device codes are rejected')

// A run needs a registered identity.
assert.equal((await call('POST', '/start', {})).status, 401, 'no identity means no run')
assert.equal((await call('POST', '/start', { token: 'forged.token' })).status, 401)

const started = json(await call('POST', '/start', { token: first.token }))
assert.equal(typeof started.run, 'string')

// A score needs a run token; the server owns the name and user number.
const submitted = await call('POST', '/scores', { run: started.run, score: 1 })
assert.equal(submitted.status, 200)
const scores = json(submitted).scores
assert.equal(scores.length, 1)
assert.equal(scores[0].uid, 1)
assert.equal(scores[0].name, '用户1')
assert.equal(scores[0].score, 1)

assert.equal((await call('POST', '/scores', { run: started.run, score: 1 })).status, 401, 'run tokens are single-use')

const secondRun = json(await call('POST', '/start', { token: second.token })).run
const inflated = await call('POST', '/scores', { run: secondRun, score: 1_000_000 })
assert.equal(inflated.status, 400, 'a score beyond the run duration is rejected')

const thirdRun = json(await call('POST', '/start', { token: second.token })).run
assert.equal((await call('POST', '/scores', { run: thirdRun, score: 5 })).status, 200)
const board = json(await call('GET', '/scores')).scores
assert.deepEqual(
  board.map((entry) => [entry.uid, entry.score]),
  [
    [2, 5],
    [1, 1],
  ],
  'board is sorted and keeps one row per user',
)

// Replaying the same user with a lower score keeps the best result.
const fourthRun = json(await call('POST', '/start', { token: first.token })).run
assert.equal((await call('POST', '/scores', { run: fourthRun, score: 2 })).status, 200)
const best = json(await call('GET', '/scores')).scores
assert.deepEqual(
  best.map((entry) => [entry.uid, entry.score]),
  [
    [2, 5],
    [1, 2],
  ],
  'a lower follow-up score does not overwrite the best',
)
assert.equal(best.length, 2, 'one row per user')

const merged = mergeEntries([{ uid: 1, score: 9 }, { uid: 2, score: 3 }], { uid: 1, score: 1 })
assert.equal(merged.length, 2, 'one row per user')
assert.equal(merged.find((entry) => entry.uid === 1).score, 9, 'a lower follow-up keeps the best')
assert.equal(normalizeScore(-1), undefined)
assert.equal(normalizeScore(10_000_000), undefined)
assert.equal(normalizeScore('nope'), undefined)
assert.equal(normalizeScore(12.9), 12)
assert.equal(normalizeDevice('x'.repeat(65)), undefined)
assert.equal(normalizeDevice('short'), undefined)

assert.equal(maxScoreFor(0) > 0, true)
assert.ok(maxScoreFor(60_000) >= 1_320, 'a minute of play allows the real scoring ceiling')
assert.ok(maxScoreFor(60_000) < 1_400, 'and not much more')
assert.equal((await call('POST', '/nope')).status, 404)

console.log('whale-break scoreboard ok')
await rm(dir, { recursive: true, force: true })
