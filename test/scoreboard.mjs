import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'

import { createScoreRoute, maxScoreFor, mergeEntries, normalizeEntry } from '../scoreboard.js'

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

// Public read needs no token.
assert.deepEqual(json(await call('GET', '/scores')), { scores: [] })

// A submitted score requires a server-issued run token.
const missing = await call('POST', '/scores', { name: '小鲸鱼1001', score: 1 })
assert.equal(missing.status, 401, 'a bare API call cannot post a score')

const started = json(await call('POST', '/start'))
assert.equal(typeof started.run, 'string')

const submitted = await call('POST', '/scores', { name: '  小鲸鱼1001  ', score: 1, run: started.run })
assert.equal(submitted.status, 200)
const scores = json(submitted).scores
assert.equal(scores.length, 1)
assert.equal(scores[0].name, '小鲸鱼1001')
assert.equal(scores[0].score, 1)

const replay = await call('POST', '/scores', { name: 'x', score: 1, run: started.run })
assert.equal(replay.status, 401, 'a run token is single-use')

const forged = await call('POST', '/scores', { name: 'x', score: 1, run: 'ZmFrZQ.c2ln' })
assert.equal(forged.status, 401, 'forged run tokens are rejected')

const secondRun = json(await call('POST', '/start')).run
const inflated = await call('POST', '/scores', { name: 'x', score: 1_000_000, run: secondRun })
assert.equal(inflated.status, 400, 'a score beyond the run duration is rejected')

const thirdRun = json(await call('POST', '/start')).run
const stillHuge = await call('POST', '/scores', { name: 'x', score: maxScoreFor(60_000) + 1, run: thirdRun })
assert.equal(stillHuge.status, 400, 'even a maximal claim is bounded by elapsed time')

assert.equal(maxScoreFor(0) > 0, true)
assert.ok(maxScoreFor(60_000) >= 1_320, 'a minute of play allows the real scoring ceiling')
assert.ok(maxScoreFor(60_000) < 1_400, 'and not much more')

assert.equal((await call('POST', '/scores', { name: 'b', score: 7, run: json(await call('POST', '/start')).run })).status, 200)
assert.equal((await call('POST', '/scores', { name: 'a', score: 2, run: json(await call('POST', '/start')).run })).status, 200)
assert.deepEqual(
  json(await call('GET', '/scores')).scores.map((entry) => entry.score),
  [7, 2, 1],
  'board is sorted descending',
)

assert.equal((await call('POST', '/scores', { score: -1, run: json(await call('POST', '/start')).run })).status, 400)
assert.equal((await call('POST', '/scores', { score: 'nope', run: json(await call('POST', '/start')).run })).status, 400)
assert.equal(normalizeEntry({ score: 5, name: 'x'.repeat(99) }).name.length, 16, 'names are truncated')
assert.equal(normalizeEntry({ score: 5 }).name, '匿名鲸鱼', 'missing names get a fallback')
assert.equal(mergeEntries([{ score: 1, at: 1 }], { score: 2, at: 2 }).length, 2)
assert.equal((await call('POST', '/nope')).status, 404)

console.log('whale-break scoreboard ok')
await rm(dir, { recursive: true, force: true })
