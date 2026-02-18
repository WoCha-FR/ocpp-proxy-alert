# OCPP-Proxy-Alert

WebSocket OCPP proxy that forwards charge point traffic to one or two upstream OCPP servers, with an optional alert system for connection events and `StatusNotification` messages.

## Features

- WebSocket proxy for OCPP JSON messages (`CALL`, `CALLRESULT`, `CALLERROR`).
- One or two upstreams: mandatory **primary** (PRI), optional **secondary** (SEC).
- Client `CALL` messages are forwarded to all connected upstreams.
- Only the primary upstream response is relayed back to the client for client-originated `CALL`s.
- Each upstream can send `CALL` messages directly to the client.
- If a client reconnects with the same ID as an existing connection, the old connection is closed.
- Client messages are buffered if no upstream is connected yet, and flushed automatically once at least one upstream is ready.
- Automatic upstream reconnection with exponential backoff (up to 10 attempts, max delay 60 s).
- If all upstreams disconnect, the client connection is closed gracefully.
- Configurable mapping between technical client IDs and human-readable names (`clientIdToHuman.json`).
- Notifications via email (SMTP via Nodemailer) and/or Pushover.
- Configurable log level via [Winston](https://github.com/winstonjs/winston).

## Requirements

- Node.js >= 18

## Install

```bash
npm install
```

or by [Docker deployment](./DOCKER.md)

## Quick start

1. Edit `config/config.json` with your URLs and settings.
2. Run the proxy:

   ```bash
   node src/index.js
   ```

## Configuration

### Main settings

| Key            | Required | Description                                          |
| -------------- | :------: | ---------------------------------------------------- |
| `proxy.host`   | ✔        | Proxy listening address (e.g. `0.0.0.0`)             |
| `proxy.port`   | ✔        | Proxy listening port (e.g. `9000`)                   |
| `primaryUrl`   | ✔        | Primary upstream WebSocket URL                       |
| `secondaryUrl` |          | Secondary upstream WebSocket URL                     |
| `logLevel`     |          | Log level: `error`, `warn`, `info`, `debug`          |

### Client connection

The client must connect to a path of the form `ws://<host>:<port>/<clientId>` where `<clientId>` is an alphanumeric string (letters, digits, underscores). Any connection with an invalid path is rejected immediately.

The proxy then opens an upstream connection to `<primaryUrl><clientId>` (and `<secondaryUrl><clientId>` if configured).

### Human-readable client names

The file `config/clientIdToHuman.json` maps a technical client ID to a display name used in notifications:

```json
{
  "STATION01": "North Parking — Charger 1",
  "STATION02": "South Parking — Charger 2"
}
```

If the file is missing or a given ID is not listed, the raw client ID is used.

### Notifications

Notifications are controlled by the `notify` object. Each event is enabled individually by setting its value to `true`.

#### Available events

| Key                        | Triggered when                                               |
| -------------------------- | ------------------------------------------------------------ |
| `connectedToProxy`         | A client connects to the proxy                              |
| `disconnectedFromProxy`    | A client disconnects from the proxy                         |
| `connectedToUpstream`      | The proxy connects to an upstream                           |
| `disconnectedFromUpstream` | The proxy disconnects from an upstream                      |
| `cpStatusAvailable`        | Charge point becomes `Available` (connectorId=0)            |
| `cpStatusUnavailable`      | Charge point becomes `Unavailable` (connectorId=0)          |
| `cpStatusFaulted`          | Charge point becomes `Faulted` (connectorId=0)              |
| `conStatusAvailable`       | A connector becomes `Available`                             |
| `conStatusPreparing`       | A connector becomes `Preparing`                             |
| `conStatusCharging`        | A connector becomes `Charging`                              |
| `conStatusSuspendedEVSE`   | A connector becomes `SuspendedEVSE`                         |
| `conStatusSuspendedEV`     | A connector becomes `SuspendedEV`                           |
| `conStatusFinishing`       | A connector becomes `Finishing`                             |
| `conStatusReserved`        | A connector becomes `Reserved`                              |
| `conStatusUnavailable`     | A connector becomes `Unavailable`                           |
| `conStatusFaulted`         | A connector becomes `Faulted`                               |
| `conStartTransaction`      | A `StartTransaction` is received on a connector             |
| `conStopTransaction`       | A `StopTransaction` is received on a connector              |

#### Notification channels

To enable email and/or Pushover, add the corresponding blocks inside `notify`:

```json
{
  "notify": {
    "connectedToProxy": true,
    "cpStatusFaulted": true,
    "email": {
      "from": "alerts@example.com",
      "to": "ops@example.com",
      "transporter": {
        "host": "smtp.example.com",
        "port": 587,
        "secure": false,
        "auth": { "user": "smtp-user", "pass": "smtp-pass" }
      }
    },
    "pushover": {
      "userKey": "YOUR_USER_KEY",
      "appToken": "YOUR_APP_TOKEN"
    }
  }
}
```

If a channel is missing or misconfigured, it is disabled at startup and a warning is logged.

#### Notes on email.transporter

Email is sent via [Nodemailer](https://nodemailer.com/). The `email.transporter` object must follow the same format as the argument to `nodemailer.createTransport({})`.

- [Sendmail transport](https://nodemailer.com/transports/sendmail) configuration
- [SMTP transport](https://nodemailer.com/smtp) configuration
- Simplified setup using [well-known services](https://nodemailer.com/smtp/well-known-services)

### Full configuration example with Gmail

```json
{
  "logLevel": "info",
  "primaryUrl": "ws://ws1.ocpp.fr/",
  "secondaryUrl": "ws://ws2.ocpp.fr/",
  "proxy": { "host": "0.0.0.0", "port": 9000 },
  "notify": {
    "connectedToProxy": false,
    "disconnectedFromProxy": false,
    "connectedToUpstream": false,
    "disconnectedFromUpstream": false,
    "cpStatusAvailable": false,
    "cpStatusUnavailable": false,
    "cpStatusFaulted": true,
    "conStatusAvailable": false,
    "conStatusPreparing": false,
    "conStatusCharging": true,
    "conStatusSuspendedEVSE": false,
    "conStatusSuspendedEV": false,
    "conStatusFinishing": false,
    "conStatusReserved": false,
    "conStatusUnavailable": false,
    "conStatusFaulted": true,
    "conStartTransaction": true,
    "conStopTransaction": true,
    "email": {
      "from": "alerts@example.com",
      "to": "ops@example.com",
      "transporter": {
        "service": "Gmail",
        "auth": { "user": "smtp-user", "pass": "smtp-pass" }
      }
    },
    "pushover": {
      "userKey": "YOUR_USER_KEY",
      "appToken": "YOUR_APP_TOKEN"
    }
  }
}
```

## Run

```bash
node src/index.js
```

Graceful shutdown on `SIGINT` / `SIGTERM` (all client and upstream connections are closed before exit).

## Architecture

```text
Client (OCPP charge point)
       │
       ▼
  OcppProxy  ──── OcppRouter (message routing, response filtering)
       │
       ├──► UpstreamConnection PRI  ──► Primary server
       └──► UpstreamConnection SEC  ──► Secondary server (optional)
```

| Component            | File                   | Role                                                         |
| -------------------- | ---------------------- | ------------------------------------------------------------ |
| `OcppProxy`          | `src/proxy.js`         | WebSocket server, client management and orchestration        |
| `OcppRouter`         | `src/ocpp-router.js`   | OCPP parsing, `messageId` tracking, response filtering       |
| `UpstreamConnection` | `src/upstream.js`      | Upstream connection, automatic reconnection with backoff     |
| `Notify`             | `src/notify.js`        | Alert triggering and delivery (email / Pushover)             |
