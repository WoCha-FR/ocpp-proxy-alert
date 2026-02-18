/**
 * WebSocket OCPP Proxy - Entry Point
 * Starts the proxy server with configuration
 */

const fs = require('fs')
const path = require('path')
const OcppProxy = require('./proxy')
const { createLogger, setLogLevel } = require('./logger')

const log = createLogger('Main')

// Load configuration
const configPathDev = path.join(__dirname, '..', 'config', 'config.dev.json')
const configPathProd = path.join(__dirname, '..', 'config', 'config.json')
const configPath = fs.existsSync(configPathDev) ? configPathDev : configPathProd
let config

try {
  const configFile = fs.readFileSync(configPath, 'utf8')
  config = JSON.parse(configFile)
  if (config.logLevel) {
    setLogLevel(config.logLevel)
  }
  log.info(`Configuration loaded from ${configPath}`)
} catch (error) {
  log.error(`Failed to load configuration: ${error.message}`)
  process.exit(1)
}

// Validate configuration
if (!config.proxy || !config.proxy.host || !config.proxy.port) {
  log.error('Invalid configuration: proxy settings missing')
  process.exit(1)
}

if (!config.primaryUrl) {
  log.error('Invalid configuration: primaryUrl is required')
  process.exit(1)
}

// Build upstreams array from simplified config
config.upstreams = [{ name: 'PRI', url: config.primaryUrl }]
if (config.secondaryUrl) {
  config.upstreams.push({ name: 'SEC', url: config.secondaryUrl })
}

// Create and start proxy
const proxy = new OcppProxy(config)

log.debug('========================================')
log.debug('WebSocket OCPP Proxy Server')
log.debug('========================================')
log.debug(`Proxy: ${config.proxy.host}:${config.proxy.port}`)
log.debug(`Primary (PRI): ${config.primaryUrl}`)
if (config.secondaryUrl) {
  log.debug(`Secondary (SEC): ${config.secondaryUrl}`)
}
log.info('Starting server...')

try {
  proxy.start()
} catch (error) {
  log.error(`Failed to start proxy: ${error.message}`)
  process.exit(1)
}

// Graceful shutdown
const shutdown = () => {
  log.info('Shutting down...')
  proxy.stop()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// Error handling
process.on('uncaughtException', (error) => {
  log.error(`Uncaught exception: ${error}`)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  log.error(`Unhandled rejection at: ${promise}, reason: ${reason}`)
  process.exit(1)
})
