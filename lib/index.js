/**
 * dsh-artex — host half.
 *
 * Keeps one ARTEX instance reachable for the Web GUI and publishes the address
 * the browser half embeds. With `managed: true` the plugin starts ARTEX itself
 * and stops it when the plugin unloads; with `managed: false` it only probes an
 * instance someone else runs (`/opt/artex/start.sh`, Docker, systemd, ...).
 *
 * The MCP tool surface is not registered here: pair this plugin with
 * `@deepseek-ai/dsh-mcp-client` pointed at `<baseUrl>/mcp`.
 */

import { spawn } from 'node:child_process'
import { closeSync, mkdirSync, openSync } from 'node:fs'
import { dirname } from 'node:path'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'artex'

/** The route the browser half reads its iframe target from. */
const INFO_PATH = '/artex/info'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Config defaults; a profile entry overrides any of them. */
const DEFAULTS = {
  baseUrl: 'http://127.0.0.1:8787',
  managed: false,
  binaryPath: '/opt/artex/artex',
  args: ['-addr', ':8787'],
  cwd: '/opt/artex',
  logFile: '',
  healthPath: '/api/health',
  startupTimeoutMs: 30000,
}

/** Merge a profile entry's config over {@link DEFAULTS}. */
function resolveConfig(raw) {
  const merged = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) }
  if (!Array.isArray(merged.args)) merged.args = [...DEFAULTS.args]
  return merged
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {any} config - resolved {@link Config}.
 */
export async function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig)
  const base = String(config.baseUrl).replace(/\/+$/, '')
  const healthUrl = `${base}${config.healthPath}`
  let child = null
  let childLogFd = null

  const note = (message) => {
    const logger = ctx.logger
    if (logger && typeof logger.info === 'function') logger.info(`[artex] ${message}`)
    else console.log(`[artex] ${message}`)
  }
  const warn = (message) => {
    const logger = ctx.logger
    if (logger && typeof logger.warn === 'function') logger.warn(`[artex] ${message}`)
    else console.warn(`[artex] ${message}`)
  }

  async function probe() {
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) })
      return response.ok
    } catch {
      return false
    }
  }

  function stopChild() {
    if (!child) return
    const proc = child
    child = null
    try {
      proc.kill('SIGTERM')
      const timer = setTimeout(() => proc.kill('SIGKILL'), 5000)
      timer.unref?.()
    } catch {
      /* already gone */
    }
  }

  async function startManaged() {
    if (!config.binaryPath) throw new Error('managed artex requires `binaryPath`')
    if (config.logFile) mkdirSync(dirname(config.logFile), { recursive: true })
    const out = config.logFile ? openSync(config.logFile, 'a') : 'ignore'
    if (typeof out === 'number') childLogFd = out
    note(`starting ${config.binaryPath} ${config.args.join(' ')}`)
    const proc = spawn(config.binaryPath, config.args, {
      cwd: config.cwd || undefined,
      stdio: ['ignore', out, out],
      env: process.env,
    })
    child = proc
    proc.once('exit', (code, signal) => {
      if (child === proc) child = null
      if (code === 0 && !signal) note('managed artex exited')
      else warn(`managed artex exited (code=${code} signal=${signal})`)
    })
    proc.once('error', (error) => {
      warn(`managed artex failed to spawn: ${error.message}`)
      if (child === proc) child = null
    })
    const deadline = Date.now() + config.startupTimeoutMs
    while (Date.now() < deadline) {
      if (await probe()) {
        note(`artex is up at ${base}`)
        return true
      }
      if (!child) return false
      await sleep(500)
    }
    warn(`artex did not answer ${healthUrl} within ${config.startupTimeoutMs} ms`)
    return false
  }

  async function ensure() {
    if (await probe()) {
      note(`using the running artex at ${base}`)
      return true
    }
    if (!config.managed) {
      warn(`no artex at ${base}; set managed: true to let dsh start it`)
      return false
    }
    return startManaged()
  }

  await ensure()

  ctx.effect(() => () => {
    stopChild()
    if (childLogFd !== null) {
      try {
        closeSync(childLogFd)
      } catch {
        /* ignore */
      }
      childLogFd = null
    }
  }, 'artex: managed process')

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(
      () =>
        webCtx.webServer.register({
          kind: 'exact',
          path: INFO_PATH,
          handler: async (_req, res) => {
            const ok = await probe()
            const body = JSON.stringify({
              url: base,
              ok,
              managed: Boolean(config.managed),
              mcpUrl: `${base}/mcp`,
            })
            res.writeHead(ok ? 200 : 503, {
              'content-type': 'application/json; charset=utf-8',
              'cache-control': 'no-store',
            })
            res.end(body)
          },
        }),
      'artex: info route',
    )
  })
}
