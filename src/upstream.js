/**
 * Upstream Connection Manager
 * Manages WebSocket connections to upstream servers with automatic reconnection
 */

const WebSocket = require('ws')
const { createLogger } = require('./logger')

class UpstreamConnection {
  constructor(name, baseUrl, clientId, protocol, clientIp) {
    this.name = name
    this.baseUrl = baseUrl
    this.clientId = clientId
    this.protocol = protocol
    this.clientIp = clientIp || null
    this.log = createLogger(name, clientId)
    this.ws = null
    this.isConnected = false
    this.wasEverConnected = false // Track if initial connection was established
    this.closed = false // When true, prevents any reconnection attempt
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 10
    this.reconnectTimer = null
    this.onMessageCallback = null
    this.onConnectedCallback = null
    this.onDisconnectedCallback = null
    this.onGaveUpCallback = null
  }

  /**
   * Get the full URL for this upstream connection
   */
  getUrl() {
    return `${this.baseUrl}${this.clientId}`
  }

  /**
   * Connect to the upstream server
   */
  async connect() {
    if (this.ws && this.isConnected) {
      this.log.debug('Already connected')
      return
    }

    const url = this.getUrl()
    this.log.debug(`Connecting to ${url}...`)

    try {
      const options = { headers: {} }
      if (this.clientIp) {
        options.headers['X-Forwarded-For'] = this.clientIp
        options.headers['X-Real-IP'] = this.clientIp
      }

      // Protocol must be passed as 2nd argument for proper WebSocket subprotocol negotiation
      this.ws = this.protocol
        ? new WebSocket(url, this.protocol, options)
        : new WebSocket(url, options)

      this.ws.on('open', () => {
        this.isConnected = true
        this.wasEverConnected = true
        this.reconnectAttempts = 0
        this.log.info(`Connected to ${url}`)

        if (this.onConnectedCallback) {
          this.onConnectedCallback(this.name)
        }
      })

      this.ws.on('message', (data) => {
        if (this.onMessageCallback) {
          this.onMessageCallback(data.toString(), this.name)
        }
      })

      this.ws.on('error', (error) => {
        this.log.error(`WebSocket error: ${error.message}`)
      })

      this.ws.on('close', () => {
        this.isConnected = false
        this.log.warn('Disconnected')

        if (this.onDisconnectedCallback) {
          this.onDisconnectedCallback(this.name)
        }

        // Only attempt reconnection if not explicitly closed
        if (!this.closed) {
          this.scheduleReconnect()
        }
      })
    } catch (error) {
      this.log.error(`Connection error: ${error.message}`)
      this.scheduleReconnect()
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  scheduleReconnect() {
    if (this.closed) {
      return // Connection was explicitly closed, do not reconnect
    }

    if (this.reconnectTimer) {
      return // Already scheduled
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.log.error('Max reconnection attempts reached')
      if (this.onGaveUpCallback) {
        this.onGaveUpCallback(this.name)
      }
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts - 1), 60000)
    const delaySeconds = (delay / 1000).toFixed(1)

    this.log.info(`Reconnecting in ${delaySeconds}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`)

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  /**
   * Send a message to the upstream server
   * @param {string} data
   */
  send(data) {
    if (!this.isConnected || !this.ws) {
      this.log.warn('Cannot send - not connected')
      return false
    }

    try {
      this.ws.send(data)
      return true
    } catch (error) {
      this.log.error(`Send error: ${error.message}`)
      return false
    }
  }

  /**
   * Close the connection
   */
  close() {
    this.closed = true // Prevent any future reconnection

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.isConnected = false
    this.log.info('Connection closed (no reconnect)')
  }

  /**
   * Set callback for received messages
   * @param {function} callback
   */
  onMessage(callback) {
    this.onMessageCallback = callback
  }

  /**
   * Set callback for connection established
   * @param {function} callback
   */
  onConnected(callback) {
    this.onConnectedCallback = callback
  }

  /**
   * Set callback for disconnection
   * @param {function} callback
   */
  onDisconnected(callback) {
    this.onDisconnectedCallback = callback
  }

  /**
   * Set callback for when reconnection attempts are exhausted
   * @param {function} callback
   */
  onGaveUp(callback) {
    this.onGaveUpCallback = callback
  }
}

module.exports = UpstreamConnection
