# ocpp-proxy-alert — Déploiement Docker

Ce document décrit comment construire et exécuter **ocpp-proxy-alert** via Docker ou Docker Compose.

---

## Prérequis

- Docker ≥ 20.10
- Docker Compose ≥ 2.x (optionnel)

---

## Construction de l'image

```bash
docker build -t ocpp-proxy-alert .
```

---

## Lancement rapide (docker run)

```bash
docker run -d \
  --name ocpp-proxy-alert \
  -p 9000:9000 \
  -v ./my-config:/config \
  --restart unless-stopped \
  ocpp-proxy-alert
```

Au **premier démarrage**, si le répertoire `my-config/` est vide, les fichiers de configuration par défaut y sont copiés automatiquement :

| Fichier | Rôle |
|---|---|
| `config.json` | Configuration principale |
| `clientIdToHuman.json` | Correspondance identifiant → nom lisible |

Modifiez-les ensuite selon vos besoins et redémarrez le conteneur.

---

## Lancement avec Docker Compose

Créez un fichier `docker-compose.yml` à la racine du projet :

```yaml
services:
  ocpp-proxy-alert:
    build: .
    # image: ocpp-proxy-alert   # décommenter si image déjà construite
    container_name: ocpp-proxy-alert
    restart: unless-stopped
    ports:
      - "9000:9000"
    volumes:
      - ./my-config:/config
```

Puis démarrez :

```bash
docker compose up -d
```

Consultez les logs :

```bash
docker compose logs -f ocpp-proxy-alert
```

---

## Référence de `config.json`

```jsonc
{
  // Niveau de log : error | warn | info | debug
  "logLevel": "info",

  // URL WebSocket du serveur OCPP principal (obligatoire)
  "primaryUrl": "ws://serveur-ocpp-principal/",

  // URL WebSocket du serveur OCPP secondaire (optionnel, mode mirroring)
  "secondaryUrl": "ws://serveur-ocpp-secondaire/",

  // Configuration du proxy entrant
  "proxy": {
    "host": "0.0.0.0",
    "port": 9000
  },

  // Notifications e-mail (optionnel)
  "email": {
    "from": "ocpp@mondomaine.fr",
    "to": "admin@mondomaine.fr",
    "transporter": {
      // Options Nodemailer : https://nodemailer.com/smtp/
      "host": "smtp.mondomaine.fr",
      "port": 587,
      "secure": false,
      "auth": {
        "user": "ocpp@mondomaine.fr",
        "pass": "motdepasse"
      }
    }
  },

  // Notifications Pushover (optionnel)
  "pushover": {
    "userKey": "VOTRE_USER_KEY",
    "appToken": "VOTRE_APP_TOKEN"
  },

  // Événements déclenchant une notification (true = activé)
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

## Référence de `clientIdToHuman.json`

Fichier de correspondance entre l'identifiant OCPP de la borne (tel que reçu dans les messages) et un nom lisible utilisé dans les notifications.

```json
{
  "STATION01": "Parking Nord — Borne 1",
  "STATION02": "Parking Sud — Borne 2"
}
```

---

## Structure du volume `/config`

```text
/config
├── config.json             ← configuration principale (obligatoire)
└── clientIdToHuman.json    ← mapping identifiants (optionnel)
```

> Les fichiers présents dans le volume **ne sont jamais écrasés** au redémarrage. Seule une initialisation sur un volume vide déclenche la copie des valeurs par défaut.
