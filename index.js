import { createScoreRoute } from './scoreboard.js'

/**
 * Host half of dsh-whale-break.
 *
 * Serves the same-origin fallback board at `/dsh-whale-break/scores`; the
 * public board on dsh.gson.cn (see `server/leaderboard.mjs`) takes priority in
 * the browser and this route keeps the game playable when it is unreachable.
 */
export function apply(ctx) {
  const webServer = ctx.get('webServer')
  if (webServer === undefined) return
  const route = createScoreRoute()
  ctx.effect(() => webServer.register(route), 'whale-break: scoreboard route')
}
