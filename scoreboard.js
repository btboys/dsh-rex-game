import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * Score store shared by the plugin's Host route (same-origin fallback) and the
 * standalone `server/leaderboard.mjs` service that can be deployed publicly.
 *
 * Anti-cheat model: the browser cannot be trusted, so a score is accepted only
 * with a server-issued, single-use run token, and only up to the maximum the
 * game's own scoring rate allows for the run's real duration:
 *
 *   POST <base>/start                 -> { run }        issue a run token
 *   GET  <base>/scores                -> { scores }     public board
 *   POST <base>/scores {run,name,score} -> { scores }   accept a finished run
 *
 * A manual caller can still wait out a run and submit a maximal score, but it
 * can no longer post arbitrary values instantly, replay a token, or backfill a
 * forged history.
 */
export const MAX_ENTRIES = 20
export const MAX_SCORE = 9_999_999
export const MAX_NAME = 16
const MAX_BODY = 4096
const RATE_WINDOW_MS = 60_000
const RATE_MAX_POSTS = 20
const RATE_MAX_STARTS = 40
const RUN_TTL_MS = 15 * 60_000
// The game awards `speed * 0.06` points per second and caps speed at 320 px/s,
// so 19.2 points/s is the physical ceiling; keep a small margin for rounding.
const MAX_SCORE_RATE = 22
const SCORE_GRACE = 60

export function defaultDataFile(home = process.env.DSH_HOME ?? join(homedir(), '.dsh')) {
  return join(home, 'plugin-data', 'dsh-whale-break', 'scores.json')
}

function normalizeName(value) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[\u0000-\u001f\u007f]/gu, '')
    .trim()
    .slice(0, MAX_NAME)
}

/** Accept only a bounded integer score and a short printable name. */
export function normalizeEntry(input) {
  if (input === null || typeof input !== 'object') return undefined
  const score = Math.floor(Number(input.score))
  if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) return undefined
  const name = normalizeName(input.name) || '匿名鲸鱼'
  return { name, score, at: Date.now() }
}

/** Keep the board descending; ties keep the older entry first. */
export function mergeEntries(entries, entry) {
  return [...entries, entry].sort((a, b) => b.score - a.score || a.at - b.at).slice(0, MAX_ENTRIES)
}

function sanitizeStored(item) {
  const entry = normalizeEntry(item)
  if (entry === undefined) return undefined
  if (typeof item.at === 'number' && Number.isFinite(item.at)) entry.at = item.at
  return entry
}

export async function readEntries(file) {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(sanitizeStored)
      .filter((entry) => entry !== undefined)
      .sort((a, b) => b.score - a.score || a.at - b.at)
      .slice(0, MAX_ENTRIES)
  } catch (_error) {
    return []
  }
}

// Writes are serialized so two concurrent posts cannot drop one another.
let writing = Promise.resolve()

export async function addEntry(entry, file) {
  const run = async () => {
    const entries = mergeEntries(await readEntries(file), entry)
    await mkdir(dirname(file), { recursive: true })
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`
    await writeFile(temp, JSON.stringify(entries))
    await rename(temp, file)
    return entries
  }
  const next = writing.then(run, run)
  writing = next.catch(() => {})
  return next
}

// ---------------------------------------------------------------- run tokens

const secrets = new Map()

async function secretFor(file) {
  if (process.env.SCOREBOARD_SECRET) return process.env.SCOREBOARD_SECRET
  const cached = secrets.get(file)
  if (cached !== undefined) return cached
  const path = join(dirname(file), 'secret')
  let secret
  try {
    secret = (await readFile(path, 'utf8')).trim()
  } catch (_error) {
    secret = randomBytes(32).toString('hex')
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, secret, { mode: 0o600 })
  }
  secrets.set(file, secret)
  return secret
}

function sign(secret, body) {
  return createHmac('sha256', secret).update(body).digest('base64url')
}

/** Issue a single-use run token; the server remembers only its id until expiry. */
export async function issueRun(file) {
  const secret = await secretFor(file)
  const body = Buffer.from(
    JSON.stringify({ id: randomBytes(12).toString('base64url'), iat: Date.now() }),
  ).toString('base64url')
  return `${body}.${sign(secret, body)}`
}

const usedRuns = new Map()

function pruneUsed(now = Date.now()) {
  for (const [id, expiresAt] of usedRuns) if (expiresAt <= now) usedRuns.delete(id)
}

/**
 * Verify a run token and consume it, returning the run's real duration.
 * @returns `{ elapsedMs }`, or `undefined` for a forged, expired or reused run.
 */
export async function consumeRun(token, file) {
  const secret = await secretFor(file)
  if (typeof token !== 'string') return undefined
  const [body, mac] = token.split('.')
  if (body === undefined || mac === undefined) return undefined
  const expected = sign(secret, body)
  if (mac.length !== expected.length) return undefined
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return undefined
  let payload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch (_error) {
    return undefined
  }
  if (typeof payload?.id !== 'string' || typeof payload?.iat !== 'number') return undefined
  const now = Date.now()
  const elapsedMs = now - payload.iat
  if (elapsedMs < 0 || elapsedMs > RUN_TTL_MS) return undefined
  pruneUsed(now)
  if (usedRuns.has(payload.id)) return undefined
  usedRuns.set(payload.id, payload.iat + RUN_TTL_MS)
  return { elapsedMs }
}

/** The largest score the game could have produced in `elapsedMs`. */
export function maxScoreFor(elapsedMs) {
  const elapsed = Math.max(0, elapsedMs) / 1000
  return Math.min(MAX_SCORE, Math.floor(elapsed * MAX_SCORE_RATE) + SCORE_GRACE)
}

// ---------------------------------------------------------------- HTTP face

const hits = new Map()

/**
 * Real client address: behind nginx/uuwaf the socket belongs to the proxy, so
 * the left-most X-Forwarded-For hop is used when present. A client can forge
 * that header to dodge its own throttle, which is an acceptable trade for a
 * toy board; scores still need a valid run token.
 */
function clientIp(request) {
  const forwarded = request.headers?.['x-forwarded-for']
  if (typeof forwarded === 'string') {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  const realIp = request.headers?.['x-real-ip']
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim()
  return request.socket?.remoteAddress ?? 'unknown'
}

/** Cheap per-IP throttle; the board is a toy, not a target. */
function allowPost(key, limit = RATE_MAX_POSTS) {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((at) => now - at < RATE_WINDOW_MS)
  if (recent.length >= limit) {
    hits.set(key, recent)
    return false
  }
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 5000) hits.clear()
  return true
}

function send(response, status, body) {
  response.writeHead(status, CORS_HEADERS)
  response.end(JSON.stringify(body))
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('body too large'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch (error) {
        reject(error)
      }
    })
    request.on('error', reject)
  })
}

export const CORS_HEADERS = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
})

/**
 * A Node `http` request handler for one scoreboard base path.
 * @returns `{ kind: 'prefix', path, handler }`, registerable on `ctx.webServer`.
 */
export function createScoreRoute({ file = defaultDataFile(), path = '/dsh-whale-break' } = {}) {
  const handler = async (request, response) => {
    try {
      if (request.method === 'OPTIONS') {
        response.writeHead(204, CORS_HEADERS)
        response.end()
        return
      }
      const pathname = new URL(request.url ?? '/', 'http://local').pathname
      const ip = clientIp(request)
      const isStart = pathname.endsWith('/start')
      const isScores = pathname.endsWith('/scores')
      if (!isStart && !isScores) {
        send(response, 404, { error: 'not found' })
        return
      }

      if (isStart && request.method === 'POST') {
        if (!allowPost(ip, RATE_MAX_STARTS)) {
          send(response, 429, { error: 'too many runs' })
          return
        }
        send(response, 200, { run: await issueRun(file) })
        return
      }

      if (isScores && request.method === 'GET') {
        send(response, 200, { scores: await readEntries(file) })
        return
      }

      if (isScores && request.method === 'POST') {
        if (!allowPost(ip)) {
          send(response, 429, { error: 'too many scores' })
          return
        }
        const body = await readJson(request)
        const entry = normalizeEntry(body)
        if (entry === undefined) {
          send(response, 400, { error: 'invalid score' })
          return
        }
        const run = await consumeRun(body.run, file)
        if (run === undefined) {
          send(response, 401, { error: 'run token required' })
          return
        }
        if (entry.score > maxScoreFor(run.elapsedMs)) {
          send(response, 400, { error: 'score exceeds the run duration' })
          return
        }
        send(response, 200, { scores: await addEntry(entry, file) })
        return
      }

      response.writeHead(405, { ...CORS_HEADERS, allow: 'GET,POST,OPTIONS' })
      response.end()
    } catch (_error) {
      send(response, 500, { error: 'scoreboard failed' })
    }
  }
  return { kind: 'prefix', path, handler }
}
