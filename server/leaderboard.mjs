#!/usr/bin/env node
import { createServer } from 'node:http'
import { join } from 'node:path'

import { createScoreRoute } from '../scoreboard.js'

/**
 * Public leaderboard service for dsh.gson.cn (or any Node host).
 *
 *   PORT=8787 DATA_FILE=/var/lib/whale-break/scores.json node server/leaderboard.mjs
 *
 * Then reverse-proxy `https://dsh.gson.cn/whale-break/` to it, so
 * `https://dsh.gson.cn/whale-break/scores` is the global board.
 */
const port = Number(process.env.PORT ?? 8787)
const host = process.env.HOST ?? '0.0.0.0'
const file = process.env.DATA_FILE ?? join(process.cwd(), 'whale-break-scores.json')
const route = createScoreRoute({ file, path: '/whale-break' })

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://local').pathname
  if (pathname !== route.path && !pathname.startsWith(`${route.path}/`)) {
    response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
    response.end('{"error":"not found"}')
    return
  }
  route.handler(request, response)
})

server.listen(port, host, () => {
  console.log(`whale-break scoreboard listening on http://${host}:${port}${route.path}/scores`)
  console.log(`data file: ${file}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
  })
}
