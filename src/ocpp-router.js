/**
 * OCPP Message Router
 * Handles routing logic for OCPP JSON messages (type 2, 3, 4)
 */

const { createLogger } = require('./logger')

class OcppRouter {
  constructor(clientId) {
    this.clientId = clientId
    this.log = createLogger('Router', clientId)
    // Maps messageId to the server that sent the CALL (type 2)
    // Used to route CALLRESULT (type 3) or CALLERROR (type 4) back to the right server
    this.messageIdToServer = new Map()

    // Tracks messageIds of CALLs originated by the client
    // Used to ensure only the primary server's response is relayed back
    this.clientCallIds = new Set()
  }

  /**
   * Parse an OCPP message
   * @param {string} data - Raw message data
   * @returns {object|null} Parsed message or null if invalid
   */
  parseMessage(data) {
    try {
      const message = JSON.parse(data)

      if (!Array.isArray(message) || message.length < 2) {
        return null
      }

      const messageType = message[0]
      const messageId = message[1]

      return { raw: data, type: messageType, messageId: messageId, parsed: message }
    } catch (error) {
      this.log.error(`Failed to parse OCPP message: ${error.message}`)
      return null
    }
  }

  /**
   * Register that the client sent a CALL message
   * @param {string} messageId
   */
  registerClientCall(messageId) {
    this.clientCallIds.add(messageId)
    this.log.debug(`Registered client CALL with messageId: ${messageId}`)
  }

  /**
   * Check if a server response (CALLRESULT/CALLERROR) to a client CALL should be relayed to the client.
   * Only the primary server's response is relayed; other responses are silently dropped.
   * @param {string} messageId
   * @param {string} serverName - Server that sent the response
   * @param {string} primaryServerName - Name of the primary server (server 1)
   * @returns {boolean} true if the response should be forwarded to the client
   */
  shouldRelayResponseToClient(messageId, serverName, primaryServerName) {
    if (!this.clientCallIds.has(messageId)) {
      // Not a response to a client-originated CALL → relay normally
      return true
    }

    if (serverName === primaryServerName) {
      // Primary server responded → relay
      // Note: we do NOT delete from clientCallIds here, because other servers
      // may still respond and we need to keep the entry to filter them out.
      // Cleanup happens via clear() on disconnect.
      this.log.info(`Relaying response from ${serverName} for messageId: ${messageId}`)
      return true
    }

    // Non-primary server responded → drop
    this.log.debug(`Dropping response from ${serverName} for messageId: ${messageId} (not primary server)`)
    return false
  }

  /**
   * Register that a server sent a CALL message to the client
   * @param {string} messageId
   * @param {string} serverName
   */
  registerServerCall(messageId, serverName) {
    this.messageIdToServer.set(messageId, serverName)
    this.log.debug(`Registered CALL from ${serverName} with messageId: ${messageId}`)
  }

  /**
   * Get which server sent the CALL for a given messageId
   * @param {string} messageId
   * @returns {string|null} Server name or null
   */
  getServerForResponse(messageId) {
    const serverName = this.messageIdToServer.get(messageId)
    if (serverName) {
      // Clean up the mapping after retrieving it
      this.messageIdToServer.delete(messageId)
      this.log.debug(`Response for messageId ${messageId} should go to ${serverName}`)
    }
    return serverName
  }

  /**
   * Determine routing for a message from client to servers
   * @param {object} message - Parsed message
   * @returns {object} Routing decision
   */
  routeClientMessage(message) {
    if (!message) {
      return { sendToAll: false, sendToServer: null }
    }

    switch (message.type) {
      case 2: // CALL - send to both servers
        this.log.info(`CALL from client (${message.messageId}) → routing to ALL servers`)
        return { sendToAll: true, sendToServer: null }

      case 3: // CALLRESULT - send to specific server
      case 4: {
        // CALLERROR - send to specific server
        const serverName = this.getServerForResponse(message.messageId)
        if (serverName) {
          this.log.info(
            `${message.type === 3 ? 'CALLRESULT' : 'CALLERROR'} from client (${message.messageId}) → routing to ${serverName}`
          )
          return { sendToAll: false, sendToServer: serverName }
        } else {
          this.log.warn(`No server mapping found for messageId ${message.messageId}`)
          return { sendToAll: false, sendToServer: null }
        }
      }

      default:
        this.log.warn(`Unknown message type ${message.type}`)
        return { sendToAll: false, sendToServer: null }
    }
  }

  /**
   * Handle a message from an upstream server
   * @param {object} message - Parsed message
   * @param {string} serverName - Name of the server that sent the message
   */
  handleServerMessage(message, serverName) {
    if (!message) {
      return
    }

    // If it's a CALL from server, register it
    if (message.type === 2) {
      this.registerServerCall(message.messageId, serverName)
    }

    this.log.debug(`Message from ${serverName} (type ${message.type}, id ${message.messageId})`)
  }

  /**
   * Clear all stored mappings
   */
  clear() {
    this.messageIdToServer.clear()
    this.clientCallIds.clear()
    this.log.debug('Cleared all message mappings')
  }
}

module.exports = OcppRouter
