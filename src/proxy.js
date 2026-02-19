/**
 * WebSocket OCPP Proxy
 * Main proxy logic that handles client connections and message routing
 */

const WebSocket = require('ws')
const OcppRouter = require('./ocpp-router')
const UpstreamConnection = require('./upstream')
const Notify = require('./notify')
const { createLogger } = require('./logger')

const log = createLogger('Proxy')

class OcppProxy {
  constructor(config) {
    this.config = config
    this.server = null
    this.notifier = null
    this.clientConnections = new Map() // Maps client connection to its upstreams
  }

  /**
   * Start the proxy server
   */
  start() {
    const { host, port } = this.config.proxy

    this.server = new WebSocket.Server({
      host,
      port,
      // eslint-disable-next-line no-unused-vars
      handleProtocols: (protocols, request) => {
        // Support OCPP protocols
        // protocols is a Set in ws library
        const protocolsArray = Array.isArray(protocols) ? protocols : Array.from(protocols)
        const ocppProtocols = protocolsArray.filter((p) => p.startsWith('ocpp'))
        if (ocppProtocols.length > 0) return ocppProtocols[0]
        // Default to ocpp1.6 if no Sec-WebSocket-Protocol header was sent
        if (protocolsArray.length === 0) return 'ocpp1.6'
        return false
      },
    })

    this.server.on('connection', (ws, request) => {
      this.handleClientConnection(ws, request)
    })

    this.server.on('error', (error) => {
      log.error(`Server error: ${error.message}`)
    })

    if (this.config.notify && this.config.notify instanceof Object) {
      this.notifier = new Notify(this.config.notify)
    } else {
      log.warn('Notify configuration missing or invalid, notifications will be disabled')
    }

    log.info(`WebSocket proxy listening on ${host}:${port}`)
  }

  /**
   * Handle a new client connection
   * @param {WebSocket} clientWs
   * @param {object} request
   */
  handleClientConnection(clientWs, request) {
    const rawPath = request.url || '/'
    // Extract single-level alphanumeric path (strip leading slashes and extra segments)
    const match = rawPath.replace(/^\/+/, '').match(/^([a-zA-Z0-9_-]+)$/)
    if (!match) {
      log.warn(`Rejected client connection: invalid path "${rawPath}" (must be single-level alphanumeric, underscore, or hyphen)`)
      clientWs.close(1008, 'Invalid path: must be single-level alphanumeric, underscore, or hyphen')
      return
    }
    const clientId = match[1]
    const protocol = clientWs.protocol || 'ocpp1.6'

    // Create a child logger with the clientId
    const clog = createLogger('Proxy', clientId)

    // If a client with this ID is already connected, close the existing one
    for (const [existingWs, connInfo] of this.clientConnections) {
      if (connInfo.clientId === clientId) {
        clog.warn('Client ID already in use — closing existing connection')
        this.cleanupClientConnection(existingWs)
        existingWs.close(1001, 'Replaced by a new connection')
        break
      }
    }

    clog.debug('========================================')
    clog.debug(`New client connection: ${clientId}`)
    clog.debug(`Protocol: ${protocol || 'none'}`)
    clog.debug('========================================')

    // Notify about new connection
    if (this.notifier) {
      this.notifier.connectedToProxy(clientId)
    }
    // Create router for this client
    const router = new OcppRouter(clientId)

    // Determine the real client IP (support X-Forwarded-For if proxy is behind another proxy)
    const clientIp = (request.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || request.socket.remoteAddress

    clog.debug(`Client IP: ${clientIp}`)

    // Extract forwarded headers (Authorization, User-Agent) if present
    const forwardedHeaders = {}
    if (request.headers['authorization']) {
      forwardedHeaders['Authorization'] = request.headers['authorization']
    }
    if (request.headers['user-agent']) {
      forwardedHeaders['User-Agent'] = request.headers['user-agent']
    }

    // Create upstream connections
    const upstreams = this.config.upstreams.map((upstreamConfig) => {
      const upstream = new UpstreamConnection(upstreamConfig.name, upstreamConfig.url, clientId, protocol, clientIp, forwardedHeaders)
      return upstream
    })

    // Store connection info
    const connectionInfo = {
      clientWs,
      upstreams,
      router,
      clientId,
      protocol,
      messageBuffer: [], // Buffer for messages received before upstreams are ready
    }
    this.clientConnections.set(clientWs, connectionInfo)

    // Set up upstream message handlers
    upstreams.forEach((upstream) => {
      upstream.onMessage((data, serverName) => {
        this.handleUpstreamMessage(clientWs, data, serverName, router)
      })

      upstream.onConnected((serverName) => {
        // When an upstream connects, send buffered messages to it
        // and flush the buffer once all upstreams are connected
        this.sendBufferToUpstream(clientWs, upstream)
        this.flushMessageBufferIfAllConnected(clientWs)
        if (this.notifier) {
          this.notifier.connectedToUpstream(clientId, serverName)
        }
      })

      upstream.onDisconnected((serverName) => {
        this.checkUpstreamsStatus(clientWs)
        if (this.notifier) {
          this.notifier.disconnectedFromUpstream(clientId, serverName)
        }
      })

      // eslint-disable-next-line no-unused-vars
      upstream.onGaveUp((serverName) => {
        this.flushMessageBufferIfAllConnected(clientWs)
        this.checkUpstreamsStatus(clientWs)
      })

      // Connect to upstream
      upstream.connect()
    })

    // Handle client messages
    clientWs.on('message', (data) => {
      const msg = data.toString()
      const connInfo = this.clientConnections.get(clientWs)

      // If no upstream is connected yet, buffer the message
      if (connInfo && !upstreams.some((u) => u.isConnected)) {
        clog.info(`No upstream connected yet, buffering message (${connInfo.messageBuffer.length + 1} in buffer)`)
        connInfo.messageBuffer.push(msg)
        return
      }

      this.handleClientMessage(clientWs, msg, upstreams, router)
    })

    // Handle client disconnection
    clientWs.on('close', () => {
      clog.info('Client disconnected')
      if (this.notifier) {
        this.notifier.disconnectedFromProxy(clientId)
      }
      this.cleanupClientConnection(clientWs)
    })

    clientWs.on('error', (error) => {
      clog.error(`Client error: ${error.message}`)
    })
  }

  /**
   * Handle a message from the client
   * @param {WebSocket} clientWs
   * @param {string} data
   * @param {Array} upstreams
   * @param {OcppRouter} router
   */
  handleClientMessage(clientWs, data, upstreams, router) {
    const connectionInfo = this.clientConnections.get(clientWs)
    const clog = createLogger('Proxy', connectionInfo ? connectionInfo.clientId : '?')
    const message = router.parseMessage(data)

    if (!message) {
      clog.warn('Received invalid message from client, ignoring')
      return
    }

    const routing = router.routeClientMessage(message)

    if (routing.sendToAll) {
      // Register client CALL so we can filter responses later
      if (message.type === 2) {
        router.registerClientCall(message.messageId)
        if (this.notifier) {
          this.notifier.callFromClient(connectionInfo.clientId, data)
        }
      }
      // Send to all upstream servers
      upstreams.forEach((upstream) => {
        if (upstream.isConnected) {
          upstream.send(data)
        } else {
          clog.warn(`Cannot send to ${upstream.name} - not connected`)
        }
      })
    } else if (routing.sendToServer) {
      // Send to specific server
      const targetUpstream = upstreams.find((u) => u.name === routing.sendToServer)
      if (targetUpstream && targetUpstream.isConnected) {
        targetUpstream.send(data)
      } else {
        clog.warn(`Target server ${routing.sendToServer} not found or not connected`)
      }
    }
  }

  /**
   * Handle a message from an upstream server
   * @param {WebSocket} clientWs
   * @param {string} data
   * @param {string} serverName
   * @param {OcppRouter} router
   */
  handleUpstreamMessage(clientWs, data, serverName, router) {
    const message = router.parseMessage(data)

    if (message) {
      router.handleServerMessage(message, serverName)
    }

    // For CALLRESULT/CALLERROR responses to client-originated CALLs,
    // only relay the response from the primary server (first upstream)
    if (message && (message.type === 3 || message.type === 4)) {
      const connectionInfo = this.clientConnections.get(clientWs)
      const primaryServerName = connectionInfo ? connectionInfo.upstreams[0].name : null

      if (!router.shouldRelayResponseToClient(message.messageId, serverName, primaryServerName)) {
        return // Drop this response (not from primary server)
      }
    }

    // Relay to client
    if (clientWs.readyState === WebSocket.OPEN) {
      try {
        clientWs.send(data)
      } catch (error) {
        const connInfo = this.clientConnections.get(clientWs)
        const clog = createLogger('Proxy', connInfo ? connInfo.clientId : '?')
        clog.error(`Error sending to client: ${error.message}`)
      }
    }
  }

  /**
   * Send buffered messages to an upstream that just connected.
   * For the primary server (first in config), route through handleClientMessage
   * so that CALL registrations happen in the router.
   * For secondary servers, send raw messages directly.
   * @param {WebSocket} clientWs
   * @param {UpstreamConnection} upstream
   */
  sendBufferToUpstream(clientWs, upstream) {
    const connectionInfo = this.clientConnections.get(clientWs)
    if (!connectionInfo || connectionInfo.messageBuffer.length === 0) {
      return
    }

    const { upstreams, router, clientId } = connectionInfo
    const clog = createLogger('Proxy', clientId)
    const primaryServer = upstreams[0]

    if (upstream === primaryServer) {
      // Primary server — route through handleClientMessage
      // so CALL registrations happen in the router
      clog.info(
        `Primary server connected (${upstream.name}) — routing ${connectionInfo.messageBuffer.length} buffered message(s) through router`
      )
      const messages = [...connectionInfo.messageBuffer]
      for (const msg of messages) {
        this.handleClientMessage(clientWs, msg, upstreams, router)
      }
    } else {
      // Secondary server — send raw messages directly
      clog.info(`Sending ${connectionInfo.messageBuffer.length} buffered message(s) to ${upstream.name}`)
      for (const msg of connectionInfo.messageBuffer) {
        upstream.send(msg)
      }
    }
  }

  /**
   * Clear the message buffer once all upstreams are connected
   * @param {WebSocket} clientWs
   */
  flushMessageBufferIfAllConnected(clientWs) {
    const connectionInfo = this.clientConnections.get(clientWs)
    if (!connectionInfo || connectionInfo.messageBuffer.length === 0) {
      return
    }

    const { upstreams, clientId } = connectionInfo
    // Consider an upstream "done" if it's connected or has exhausted reconnection attempts
    const allResolved = upstreams.every((u) => u.isConnected || u.reconnectAttempts >= u.maxReconnectAttempts)

    if (allResolved) {
      const clog = createLogger('Proxy', clientId)
      clog.info(`All upstreams connected — clearing message buffer (${connectionInfo.messageBuffer.length} message(s))`)
      connectionInfo.messageBuffer = []
    }
  }

  /**
   * Check if both upstreams are disconnected, close client if so
   * @param {WebSocket} clientWs
   */
  checkUpstreamsStatus(clientWs) {
    const connectionInfo = this.clientConnections.get(clientWs)
    if (!connectionInfo) {
      return
    }

    const { upstreams } = connectionInfo
    const clog = createLogger('Proxy', connectionInfo.clientId)

    // Don't close the client if some upstreams are still attempting their initial connection
    const someStillConnecting = upstreams.some(
      (u) => !u.isConnected && !u.wasEverConnected && u.reconnectAttempts < u.maxReconnectAttempts
    )
    if (someStillConnecting) {
      clog.info('Some upstream servers still attempting initial connection, keeping client alive')
      return
    }

    const allDisconnected = upstreams.every((u) => !u.isConnected)

    if (allDisconnected) {
      clog.info('All upstream servers disconnected - closing client connection')
      clientWs.close(1001, 'All upstream servers unavailable')
      this.cleanupClientConnection(clientWs)
    }
  }

  /**
   * Clean up resources for a client connection
   * @param {WebSocket} clientWs
   */
  cleanupClientConnection(clientWs) {
    const connectionInfo = this.clientConnections.get(clientWs)
    if (!connectionInfo) {
      return
    }

    const { upstreams, router } = connectionInfo

    // Close all upstream connections
    upstreams.forEach((upstream) => {
      upstream.close()
    })

    // Clear router state
    router.clear()

    // Remove from map
    this.clientConnections.delete(clientWs)

    createLogger('Proxy', connectionInfo.clientId).info('Client connection cleanup complete')
  }

  /**
   * Stop the proxy server
   */
  stop() {
    if (this.server) {
      // Clean up all client connections
      this.clientConnections.forEach((_, clientWs) => {
        this.cleanupClientConnection(clientWs)
      })

      this.server.close(() => {
        log.info('Server stopped')
      })
    }
  }
}

module.exports = OcppProxy
