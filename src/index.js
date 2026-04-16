/**
 * WebSocket OCPP Proxy — Entry Point
 */

const fs = require('fs')
const path = require('path')
const OcppProxy = require('./proxy')
const { createLogger, setLogLevel } = require('./logger')

const log = createLogger('Main')

// ─── Config loading ───────────────────────────────────────────────────────────

const configPathDev  = path.join(__dirname, '..', 'config', 'config.dev.json')
const configPathProd = path.join(__dirname, '..', 'config', 'config.json')
const configPath = fs.existsSync(configPathDev) ? configPathDev : configPathProd

let config
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  if (config.logLevel) setLogLevel(config.logLevel)
  log.info(`Configuration loaded from ${configPath}`)
} catch (err) {
  log.error(`Failed to load configuration: ${err.message}`)
  process.exit(1)
}

// ─── Validation ───────────────────────────────────────────────────────────────

if (!config.proxy?.host || !config.proxy?.port) {
  log.error('Invalid config: proxy.host and proxy.port are required')
  process.exit(1)
}
if (!config.primaryUrl) {
  log.error('Invalid config: primaryUrl is required')
  process.exit(1)
}

// ─── Build upstreams ──────────────────────────────────────────────────────────

config.upstreams = [{ name: 'PRI', url: config.primaryUrl }]
if (config.secondaryUrl) {
  config.upstreams.push({ name: 'SEC', url: config.secondaryUrl })
}

// ─── Start proxy ──────────────────────────────────────────────────────────────

const proxy = new OcppProxy(config)

log.debug('========================================')
log.debug('WebSocket OCPP Proxy')
log.debug('========================================')
log.debug(`Proxy : ${config.proxy.host}:${config.proxy.port}`)
log.debug(`PRI   : ${config.primaryUrl}`)
if (config.secondaryUrl) log.debug(`SEC   : ${config.secondaryUrl}`)

try {
  proxy.start()
} catch (err) {
  log.error(`Failed to start proxy: ${err.message}`)
  process.exit(1)
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

const shutdown = () => {
  log.info('Shutting down...')
  proxy.stop()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

process.on('uncaughtException', (err) => {
  log.error(`Uncaught exception: ${err}`)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  log.error(`Unhandled rejection at: ${promise}, reason: ${reason}`)
  process.exit(1)
})
