# OCPP-Proxy-Alert

Proxy WebSocket OCPP qui relaie le trafic d'un point de charge vers un ou deux serveurs OCPP en amont, avec un système d'alertes optionnelles sur les événements de connexion et les `StatusNotification`.

## Fonctionnalités

- Proxy WebSocket pour les messages OCPP JSON (`CALL`, `CALLRESULT`, `CALLERROR`).
- Un ou deux upstreams : **primaire** (PRI) obligatoire, **secondaire** (SEC) optionnel.
- Les `CALL` client sont envoyés à tous les upstreams connectés.
- Seule la réponse de l'upstream primaire est renvoyée au client pour les `CALL` qu'il a émis.
- Chaque upstream peut envoyer des `CALL` directement au client.
- Si un client se connecte avec le même identifiant qu'une connexion existante, l'ancienne connexion est fermée.
- Mise en tampon des messages client si aucun upstream n'est encore connecté, avec vidage automatique dès qu'au moins un upstream est prêt.
- Reconnexion automatique des upstreams avec backoff exponentiel (jusqu'à 10 tentatives, délai max 60 s).
- Si tous les upstreams se déconnectent, le client est fermé proprement.
- Correspondance configurable entre l'identifiant technique du client et un nom lisible (`clientIdToHuman.json`).
- Notifications par e-mail (SMTP via Nodemailer) et/ou Pushover.
- Niveau de journalisation configurable via [Winston](https://github.com/winstonjs/winston).

## Prérequis

- Node.js >= 18

## Installation

```bash
npm install
```

ou par [déploiement Docker](./DOCKER.fr.md)

## Démarrage rapide

1. Modifier `config/config.json` avec vos URLs et paramètres.
2. Lancer le proxy :

   ```bash
   node src/index.js
   ```

## Configuration

### Paramètres principaux

| Clé            | Obligatoire | Description                                      |
| -------------- | :---------: | ------------------------------------------------ |
| `proxy.host`   | ✔           | Adresse d'écoute du proxy (ex. `0.0.0.0`)        |
| `proxy.port`   | ✔           | Port d'écoute du proxy (ex. `9000`)              |
| `primaryUrl`   | ✔           | URL WebSocket de l'upstream primaire             |
| `secondaryUrl` |             | URL WebSocket de l'upstream secondaire           |
| `logLevel`     |             | Niveau de log : `error`, `warn`, `info`, `debug` |

### Connexion client

Le client doit se connecter sur un chemin de la forme `ws://<host>:<port>/<clientId>` où `<clientId>` est une chaîne alphanumérique (lettres, chiffres, underscore, tiret). Toute connexion avec un chemin invalide est rejetée immédiatement.

Le proxy établit ensuite une connexion upstream à `<primaryUrl><clientId>` (et `<secondaryUrl><clientId>` si configuré).

### Noms lisibles des clients

Le fichier `config/clientIdToHuman.json` permet d'associer un identifiant technique à un nom affiché dans les notifications :

```json
{
  "STATION01": "Parking Nord — Borne 1",
  "STATION02": "Parking Sud — Borne 2"
}
```

Si le fichier est absent ou si un identifiant n'y figure pas, l'identifiant brut est utilisé.

### Notifications

Les notifications sont contrôlées par l'objet `notify`. Chaque événement est activé individuellement en passant sa valeur à `true`.

#### Événements disponibles

| Clé                        | Déclenchement                                             |
| -------------------------- | --------------------------------------------------------- |
| `connectedToProxy`         | Un client se connecte au proxy                           |
| `disconnectedFromProxy`    | Un client se déconnecte du proxy                         |
| `connectedToUpstream`      | Le proxy se connecte à un upstream                       |
| `disconnectedFromUpstream` | Le proxy se déconnecte d'un upstream                     |
| `cpStatusAvailable`        | Le point de charge passe en `Available` (connectorId=0)  |
| `cpStatusUnavailable`      | Le point de charge passe en `Unavailable` (connectorId=0)|
| `cpStatusFaulted`          | Le point de charge passe en `Faulted` (connectorId=0)    |
| `conStatusAvailable`       | Un connecteur passe en `Available`                       |
| `conStatusPreparing`       | Un connecteur passe en `Preparing`                       |
| `conStatusCharging`        | Un connecteur passe en `Charging`                        |
| `conStatusSuspendedEVSE`   | Un connecteur passe en `SuspendedEVSE`                   |
| `conStatusSuspendedEV`     | Un connecteur passe en `SuspendedEV`                     |
| `conStatusFinishing`       | Un connecteur passe en `Finishing`                       |
| `conStatusReserved`        | Un connecteur passe en `Reserved`                        |
| `conStatusUnavailable`     | Un connecteur passe en `Unavailable`                     |
| `conStatusFaulted`         | Un connecteur passe en `Faulted`                         |
| `conStartTransaction`      | Un `StartTransaction` est reçu sur un connecteur         |
| `conStopTransaction`       | Un `StopTransaction` est reçu sur un connecteur          |

#### Canaux de notification

Pour activer l'e-mail et/ou Pushover, ajoutez les blocs correspondants dans `notify` :

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

Si un canal est absent ou mal configuré, il est désactivé au démarrage et un avertissement est journalisé.

#### Particularités de l'élément email.transporter

L'envoie de mail est faite par la librairie [Nodemailer](https://nodemailer.com/), le contenue de l'élément email.transporter doit être au même format que quand vous utilisez la fonction `nodemailer.createTransport({})`

- Aide à la configuration pour un [transport Sendmail](https://nodemailer.com/transports/sendmail)
- Aide à la configuration pour un [transport SMTP](https://nodemailer.com/smtp)
- Configuration simplifié en utilisant les [services connus](https://nodemailer.com/smtp/well-known-services)

### Exemple de configuration complète avec un service GMAIL

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

## Lancement

```bash
node src/index.js
```

Arrêt propre sur `SIGINT` / `SIGTERM` (les connexions clients et upstreams sont fermées avant l'arrêt).

## Architecture

```text
Client (borne OCPP)
       │
       ▼
  OcppProxy  ──── OcppRouter (routage des messages, filtrage des réponses)
       │
       ├──► UpstreamConnection PRI  ──► Serveur primaire
       └──► UpstreamConnection SEC  ──► Serveur secondaire (optionnel)
```

| Composant            | Fichier                | Rôle                                                        |
| -------------------- | ---------------------- | ----------------------------------------------------------- |
| `OcppProxy`          | `src/proxy.js`         | Serveur WebSocket, gestion des clients et orchestration     |
| `OcppRouter`         | `src/ocpp-router.js`   | Parsing OCPP, suivi des `messageId`, filtrage des réponses  |
| `UpstreamConnection` | `src/upstream.js`      | Connexion upstream, reconnexion automatique avec backoff    |
| `Notify`             | `src/notify.js`        | Déclenchement et envoi des alertes (e-mail / Pushover)      |
