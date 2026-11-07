import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'

import { createScoreRoute, mergeEntries, normalizeEntry } from '../scoreboard.js'

const dir = await mkdtemp(join(tmpdir(), 'dsh-whale-break-'))
const file = join(dir, 'scores.json')
const route = createScoreRoute({ file })

assert.equal(route.kind, 'prefix')
assert.equal(route.path, '/dsh-whale-break')

function call(method, body) {
  return new Promise((resolve, reject) => {
    const request = new Readable({ read() {} })
    request.method = method
    request.url = '/dsh-whale-break/scores'
    request.headers = {}
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

assert.deepEqual(JSON.parse((await call('GET')).body), { scores: [] })

const posted = await call('POST', { name: '  小鲸鱼1001  ', score: 42 })
assert.equal(posted.status, 200)
const scores = JSON.parse(posted.body).scores
assert.equal(scores.length, 1)
assert.equal(scores[0].name, '小鲸鱼1001')
assert.equal(scores[0].score, 42)
assert.equal(JSON.parse((await call('GET')).body).scores.length, 1)

await call('POST', { name: 'a', score: 100 })
await call('POST', { name: 'b', score: 7 })
const board = JSON.parse((await call('GET')).body).scores
assert.deepEqual(
  board.map((entry) => entry.score),
  [100, 42, 7],
  'board is sorted descending',
)

assert.equal((await call('POST', { score: -1 })).status, 400, 'negative scores are rejected')
assert.equal((await call('POST', { score: 10_000_000 })).status, 400, 'oversized scores are rejected')
assert.equal((await call('POST', { score: 'nope' })).status, 400, 'non-numeric scores are rejected')
assert.equal(normalizeEntry({ score: 5, name: 'x'.repeat(99) }).name.length, 16, 'names are truncated')
assert.equal(normalizeEntry({ score: 5 }).name, '匿名鲸鱼', 'missing names get a fallback')
assert.equal(mergeEntries([{ score: 1, at: 1 }], { score: 2, at: 2 }).length, 2)

console.log('whale-break scoreboard ok')
await rm(dir, { recursive: true, force: true })
