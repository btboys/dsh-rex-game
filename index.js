import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * Host half of dsh-whale-break: a tiny same-origin scoreboard.
 *
 * The page posts to `/dsh-whale-break/scores`; every browser pointed at this
 * Harness (another tab, the phone through dsh-app, a LAN peer) reads the same
 * board, so the ranking is shared without any external service.
 */
const ROUTE_PREFIX = '/dsh-whale-break'
const MAX_ENTRIES = 20
const MAX_SCORE = 9_999_999
const MAX_NAME = 16
const MAX_BODY = 4096

function dataFile() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
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

export async function readEntries(file = dataFile()) {
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

export async function addEntry(entry, file = dataFile()) {
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

/** The prefix route answering GET/POST /dsh-whale-break/scores. */
export function createScoreRoute({ file = dataFile() } = {}) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
  }
  const handler = async (request, response) => {
    try {
      if (request.method === 'OPTIONS') {
        response.writeHead(204, headers)
        response.end()
        return
      }
      if (request.method === 'GET') {
        send(response, 200, { scores: await readEntries(file) }, headers)
        return
      }
      if (request.method === 'POST') {
        const entry = normalizeEntry(await readJson(request))
        if (entry === undefined) {
          send(response, 400, { error: 'invalid score' }, headers)
          return
        }
        send(response, 200, { scores: await addEntry(entry, file) }, headers)
        return
      }
      response.writeHead(405, { ...headers, allow: 'GET,POST,OPTIONS' })
      response.end()
    } catch (_error) {
      response.writeHead(500, headers)
      response.end(JSON.stringify({ error: 'scoreboard failed' }))
    }
  }
  return { kind: 'prefix', path: ROUTE_PREFIX, handler }
}

export function apply(ctx) {
  const webServer = ctx.get('webServer')
  if (webServer === undefined) return
  const route = createScoreRoute()
  ctx.effect(() => webServer.register(route), 'whale-break: scoreboard route')
}
