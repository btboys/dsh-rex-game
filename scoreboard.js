import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * Score store shared by the plugin's Host route (same-origin fallback) and the
 * standalone `server/leaderboard.mjs` service that can be deployed publicly.
 *
 * Wire format is intentionally tiny:
 *   GET  <base>          -> { scores: [{ name, score, at }] }
 *   POST <base> {name, score} -> { scores: [...] } (400 on invalid input)
 */
export const MAX_ENTRIES = 20
export const MAX_SCORE = 9_999_999
export const MAX_NAME = 16
const MAX_BODY = 4096
const RATE_WINDOW_MS = 60_000
const RATE_MAX_POSTS = 30

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

const postHits = new Map()

/** Cheap per-IP post throttle; the board is a toy, not a target. */
function allowPost(key) {
  const now = Date.now()
  const hits = (postHits.get(key) ?? []).filter((at) => now - at < RATE_WINDOW_MS)
  if (hits.length >= RATE_MAX_POSTS) {
    postHits.set(key, hits)
    return false
  }
  hits.push(now)
  postHits.set(key, hits)
  if (postHits.size > 5000) postHits.clear()
  return true
}

function send(response, status, body, headers) {
  response.writeHead(status, headers)
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
      if (request.method === 'GET') {
        send(response, 200, { scores: await readEntries(file) }, CORS_HEADERS)
        return
      }
      if (request.method === 'POST') {
        const ip = request.socket?.remoteAddress ?? 'unknown'
        if (!allowPost(ip)) {
          send(response, 429, { error: 'too many scores' }, CORS_HEADERS)
          return
        }
        const entry = normalizeEntry(await readJson(request))
        if (entry === undefined) {
          send(response, 400, { error: 'invalid score' }, CORS_HEADERS)
          return
        }
        send(response, 200, { scores: await addEntry(entry, file) }, CORS_HEADERS)
        return
      }
      response.writeHead(405, { ...CORS_HEADERS, allow: 'GET,POST,OPTIONS' })
      response.end()
    } catch (_error) {
      send(response, 500, { error: 'scoreboard failed' }, CORS_HEADERS)
    }
  }
  return { kind: 'prefix', path, handler }
}
