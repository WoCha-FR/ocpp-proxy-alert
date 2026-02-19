/**
 * Notify Manager
 * Handles notifications for various events
 */

const fs = require('fs')
const path = require('path')
const Mailer = require('../lib/mailer')
const Pushover = require('../lib/pushover')
const { createLogger } = require('./logger')

class Notify {
  constructor(config) {
    this.config = config
    this.pushover = null
    this.mailer = null
    this.clientNames = {}
    this.log = createLogger('Notify')
    this.init()
  }

  async init() {
    // Check email configuration
    if (
      this.config.email &&
      this.config.email.from &&
      this.config.email.to &&
      this.config.email.transporter instanceof Object
    ) {
      this.log.info('Email notifications enabled')
      this.mailer = new Mailer(this.config.email)
    } else {
      this.log.warn('Email notifications not configured properly, email notifications will be disabled')
    }
    // Check Pushover configuration
    if (this.config.pushover && this.config.pushover.userKey && this.config.pushover.appToken) {
      this.log.info('Pushover notifications enabled')
      this.pushover = new Pushover(this.config.pushover)
    } else {
      this.log.warn('Pushover notifications not configured properly, notifications will be disabled')
    }
    // Load clientId to name mapping
    const clientIdToHumanPath = path.join(__dirname, '..', 'config', 'clientIdToHuman.json')
    if (fs.existsSync(clientIdToHumanPath)) {
      try {
        const mappingFile = fs.readFileSync(clientIdToHumanPath, 'utf8')
        this.clientNames = JSON.parse(mappingFile)
        this.log.info(`Loaded client ID to human-readable name mapping from ${clientIdToHumanPath}`)
      } catch (error) {
        this.log.error(`Failed to load client ID mapping: ${error.message}`)
      }
    } else {
      this.log.warn(`Client ID mapping file not found at ${clientIdToHumanPath}, using raw client IDs in notifications`)
    }
  }

  /**
   * Notify about a new client connection to the proxy
   * @param {string} clientId
   */
  connectedToProxy(clientId) {
    if (this.config.connectedToProxy || false) {
      const clientName = this.clientNames[clientId] || clientId
      const title = `Client connected: ${clientName}`
      const message = `A new client has connected to the OCPP proxy.\nClient ID: ${clientName}`
      this.send(title, message).catch((err) => this.log.error(`Notification error: ${err.message}`))
    }
  }

  /**
   * Notify about a client disconnection from the proxy
   * @param {string} clientId
   */
  disconnectedFromProxy(clientId) {
    if (this.config.disconnectedFromProxy || false) {
      const clientName = this.clientNames[clientId] || clientId
      const title = `Client disconnected: ${clientName}`
      const message = `A client has disconnected from the OCPP proxy.\nClient ID: ${clientName}`
      this.send(title, message).catch((err) => this.log.error(`Notification error: ${err.message}`))
    }
  }

  /**
   * Notify about a connection to an upstream server
   * @param {string} clientId
   * @param {string} serverName
   */
  connectedToUpstream(clientId, serverName) {
    if (this.config.connectedToUpstream || false) {
      const clientName = this.clientNames[clientId] || clientId
      const title = `Connected to upstream: ${serverName}`
      const message = `The proxy has established a connection to the upstream OCPP server.\nClient ID: ${clientName}\nServer Name: ${serverName}`
      this.send(title, message).catch((err) => this.log.error(`Notification error: ${err.message}`))
    }
  }

  /**
   * Notify about a disconnection from an upstream server
   * @param {string} clientId
   * @param {string} serverName
   */
  disconnectedFromUpstream(clientId, serverName) {
    if (this.config.disconnectedFromUpstream || false) {
      const clientName = this.clientNames[clientId] || clientId
      const title = `Disconnected from upstream: ${serverName}`
      const message = `The proxy has disconnected from the upstream OCPP server.\nClient ID: ${clientName}\nServer Name: ${serverName}`
      this.send(title, message).catch((err) => this.log.error(`Notification error: ${err.message}`))
    }
  }

  /**
   * Notify about a CALL message from a client
   * @param {string} clientId
   * @param {string} data
   */
  callFromClient(clientId, data) {
    const payload = JSON.parse(data)
    const action = payload[2]
    const params = payload[3]
    // StatusNotification For ChargePoint
    if (action === 'StatusNotification' && params && params.connectorId === 0) {
      const status = params.status || 'unknown'
      switch (status) {
        case 'Available':
          if (this.config.cpStatusAvailable || false) {
            const clientName = this.clientNames[clientId] || clientId
            const title = `[${clientName}] ChargePoint is now Available`
            const message = `StatusNotification from client ${clientName}: ChargePoint status changed to Available.`
            this.send(title, message).catch((err) => this.log.error(`Notification error: ${err.message}`))
          }
          break
        case 'Unavailable':
          if (this.config.cpStatusUnavailable || false) {
            const clientName = this.clientNames[clientId] || clientId
            const title = `[${clientName}] ChargePoint is now Unavailable`
            const message = `StatusNotification from client ${clientName}: ChargePoint status changed to Unavailable.`
            this.send(title, message).catch((err) => this.log.error(`Notification error: ${err.message}`))
          }
          break
        case 'Faulted':
          if (this.config.cpStatusFaulted || false) {
            const clientName = this.clientNames[clientId] || clientId
            const errorCode = params.errorCode || 'unknown'
            const title = `[${clientName}] ChargePoint is now Faulted`
            const message = `StatusNotification from client ${clientName}: ChargePoint status changed to Faulted.\nError Code: ${errorCode}`
            this.send(title, message).catch((err) => this.log.error(`Notification error: ${err.message}`))
          }
          break
        default:
          this.log.debug(`Received StatusNotification with unhandled status: ${status}`)
      }
    }
    // StatusNotification For Connector
    if (action === 'StatusNotification' && params && params.connectorId !== undefined && params.connectorId > 0) {
      const status = params.status || 'unknown'
      const conId = `#${params.connectorId}`
      switch (status) {
        case 'Available':
          if (this.config.conStatusAvailable || false) {
            const clientName = this.clientNames[clientId] || clientId
            const title = `[${clientName}] Connector ${conId} is now Available`
            const message = `StatusNotification from client ${clientName}: Connector ${conId} status changed to Available.`
            this.send(title, message).catch((err) => this.log.error(`Notification error: ${err.message}`))
          }
          break
        case 'Preparing':
          if (this.config.conStatusPreparing || false) {
            const clientName = this.clientNames[clientId] || clientId
            const title = `[${clientName}] Connector ${conId} is now Preparing`
            const message = `StatusNotification from client ${clientName}: Connector ${conId} status changed to Preparing.`
            this.send(title, message).catch((err) => this.log.error(`Notification error: ${err.message}`))
          }
          break
        case 'Charging':
          if (this.config.conStatusCharging || false) {
            const clientName = this.clientNames[clientId] || clientId
            const title = `[${clientName}] Connector ${conId} is now Charging`
            const message = `StatusNotification from client ${clientName}: Connector ${conId} status changed to Charging.`
            this.send(title, message).catch((err) => this.log.error(`Notification error: ${err.message}`))
          }
          break
        case 'SuspendedEVSE':
          if (this.config.conStatusSuspendedEVSE || false) {
            const clientName = this.clientNames[clientId] || clientId
            const title = `[${clientName}] Connector ${conId} is now SuspendedEVSE`
            const message = `StatusNotification from client ${clientName}: Connector ${conId} status changed to SuspendedEVSE.`
            this.send(title, message).catch((err) => this.log.error(`Notification error: ${err.message}`))
          }
          break
        case 'SuspendedEV':
          if (this.config.conStatusSuspendedEV || false) {
            const clientName = this.clientNames[clientId] || clientId
            const title = `[${clientName}] Connector ${conId} is now SuspendedEV`
            const message = `StatusNotification from client ${clientName}: Connector ${conId} status changed to SuspendedEV.`
            this.send(title, message).catch((err) => this.log.error(`Notification error: ${err.message}`))
          }
          break
        case 'Finishing':
          if (this.config.conStatusFinishing || false) {
            const clientName = this.clientNames[clientId] || clientId
            const title = `[${clientName}] Connector ${conId} is now Finishing`
            const message = `StatusNotification from client ${clientName}: Connector ${conId} status changed to Finishing.`
            this.send(title, message).catch((err) => this.log.error(`Notification error: ${err.message}`))
          }
          break
        case 'Reserved':
          if (this.config.conStatusReserved || false) {
            const clientName = this.clientNames[clientId] || clientId
            const title = `[${clientName}] Connector ${conId} is now Reserved`
            const message = `StatusNotification from client ${clientName}: Connector ${conId} status changed to Reserved.`
            this.send(title, message).catch((err) => this.log.error(`Notification error: ${err.message}`))
          }
          break
        case 'Unavailable':
          if (this.config.conStatusUnavailable || false) {
            const clientName = this.clientNames[clientId] || clientId
            const title = `[${clientName}] Connector ${conId} is now Unavailable`
            const message = `StatusNotification from client ${clientName}: Connector ${conId} status changed to Unavailable.`
            this.send(title, message).catch((err) => this.log.error(`Notification error: ${err.message}`))
          }
          break
        case 'Faulted':
          if (this.config.conStatusFaulted || false) {
            const clientName = this.clientNames[clientId] || clientId
            const errorCode = params.errorCode || 'unknown'
            const title = `[${clientName}] Connector ${conId} is now Faulted`
            const message = `StatusNotification from client ${clientName}: Connector ${conId} status changed to Faulted.\nError Code: ${errorCode}`
            this.send(title, message).catch((err) => this.log.error(`Notification error: ${err.message}`))
          }
          break
        default:
          this.log.debug(`Received StatusNotification with unhandled status: ${status}`)
      }
    }
    // StartTransaction
    if (action === 'StartTransaction' && params && params.connectorId !== undefined && params.connectorId > 0) {
      if (this.config.conStartTransaction || false) {
        const clientName = this.clientNames[clientId] || clientId
        const title = `[${clientName}] Transaction Started`
        const message = `StartTransaction from client ${clientName}.\nConnector ID: #${params.connectorId}`
        this.send(title, message).catch((err) => this.log.error(`Notification error: ${err.message}`))
      }
    }
    // StopTransaction
    if (action === 'StopTransaction' && params && params.connectorId !== undefined && params.connectorId > 0) {
      if (this.config.conStopTransaction || false) {
        const clientName = this.clientNames[clientId] || clientId
        const title = `[${clientName}] Transaction Stopped`
        const message = `StopTransaction from client ${clientName}.\nConnector ID: #${params.connectorId}`
        this.send(title, message).catch((err) => this.log.error(`Notification error: ${err.message}`))
      }
    }
  }

  /**
   * Send a notification
   * @param {string} title
   * @param {string} message
   */
  async send(title, message) {
    const tasks = []
    if (this.mailer) {
      tasks.push(
        this.mailer.send(title, message).then((res) => {
          if (res.error) {
            this.log.error(`Failed to send notification via email: ${res.error}`)
          } else {
            this.log.debug(`Notification sent via email: ${res.response}`)
          }
        })
      )
    } else {
      this.log.warn('Cannot send notification: Email not configured')
    }

    if (this.pushover) {
      tasks.push(
        this.pushover.send(title, message).then((res) => {
          if (res.error) {
            this.log.error(`Failed to send notification via Pushover: ${res.error}`)
          } else {
            this.log.debug(`Notification sent via Pushover: ${res.status}`)
          }
        })
      )
    } else {
      this.log.warn('Cannot send notification: Pushover not configured')
    }

    if (tasks.length > 0) {
      await Promise.allSettled(tasks)
    }
  }

  replaceVars(str, replaceto) {
    for (let [oldStr, newStr] of Object.entries(replaceto)) {
      str = str.split(oldStr).join(newStr)
    }
    return str
  }
}

module.exports = Notify
