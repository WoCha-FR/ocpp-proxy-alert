# ocpp-proxy-alert — Docker Deployment

This document describes how to build and run **ocpp-proxy-alert** using Docker or Docker Compose.

---

## Prerequisites

- Docker ≥ 20.10
- Docker Compose ≥ 2.x (optional)

---

## Building the image

```bash
docker build -t ocpp-proxy-alert .
```

---

## Quick start (docker run)

```bash
docker run -d \
  --name ocpp-proxy-alert \
  -p 9000:9000 \
  -v ./my-config:/config \
  --restart unless-stopped \
  ocpp-proxy-alert
```

On the **first start**, if the `my-config/` directory is empty, the default configuration files are automatically copied into it:

| File | Purpose |
|---|---|
| `config.json` | Main configuration |
| `clientIdToHuman.json` | Charge point ID → human-readable name mapping |

Edit them to match your setup, then restart the container.

---

## Launch with Docker Compose

Create a `docker-compose.yml` file at the root of the project:

```yaml
services:
  ocpp-proxy-alert:
    build: .
    # image: ocpp-proxy-alert   # uncomment if the image is already built
    container_name: ocpp-proxy-alert
    restart: unless-stopped
    ports:
      - "9000:9000"
    volumes:
      - ./my-config:/config
```

Then start:

```bash
docker compose up -d
```

View the logs:

```bash
docker compose logs -f ocpp-proxy-alert
```

---

## `config.json` reference

```jsonc
{
  // Log level: error | warn | info | debug
  "logLevel": "info",

  // WebSocket URL of the primary OCPP server (required)
  "primaryUrl": "ws://primary-ocpp-server/",

  // WebSocket URL of the secondary OCPP server (optional, mirroring mode)
  "secondaryUrl": "ws://secondary-ocpp-server/",

  // Incoming proxy settings
  "proxy": {
    "host": "0.0.0.0",
    "port": 9000
  },

  // E-mail notifications (optional)
  "email": {
    "from": "ocpp@mydomain.com",
    "to": "admin@mydomain.com",
    "transporter": {
      // Nodemailer options: https://nodemailer.com/smtp/
      "host": "smtp.mydomain.com",
      "port": 587,
      "secure": false,
      "auth": {
        "user": "ocpp@mydomain.com",
        "pass": "password"
      }
    }
  },

  // Pushover notifications (optional)
  "pushover": {
    "userKey": "YOUR_USER_KEY",
    "appToken": "YOUR_APP_TOKEN"
  },

  // Events that trigger a notification (true = enabled)
  "notify": {
    "connectedToProxy":          false,
    "disconnectedFromProxy":     false,
    "connectedToUpstream":       false,
    "disconnectedFromUpstream":  false,
    "cpStatusAvailable":         false,
    "cpStatusUnavailable":       false,
    "cpStatusFaulted":           false,
    "conStatusAvailable":        false,
    "conStatusPreparing":        false,
    "conStatusCharging":         false,
    "conStatusSuspendedEVSE":    false,
    "conStatusSuspendedEV":      false,
    "conStatusFinishing":        false,
    "conStatusReserved":         false,
    "conStatusUnavailable":      false,
    "conStatusFaulted":          false,
    "conStartTransaction":       false,
    "conStopTransaction":        false
  }
}
```

## `clientIdToHuman.json` reference

Maps the OCPP charge point identifier (as received in messages) to a human-readable name used in notifications.

```json
{
  "STATION01": "North Parking — Charger 1",
  "STATION02": "South Parking — Charger 2"
}
```

---

## `/config` volume structure

```text
/config
├── config.json             ← main configuration (required)
└── clientIdToHuman.json    ← ID mapping (optional)
```

> Files already present in the volume are **never overwritten** on restart. The default files are only copied on the very first start when the volume is empty.
