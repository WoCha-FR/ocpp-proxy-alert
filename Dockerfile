# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /app

# Copie des dépendances de production depuis le builder
COPY --from=builder /app/node_modules ./node_modules

# Copie des sources
COPY src/ ./src/
COPY lib/ ./lib/
COPY package.json ./

# Fichiers de configuration par défaut (copiés dans le volume au 1er démarrage)
COPY config/config.json        ./config-defaults/config.json
COPY config/clientIdToHuman.json ./config-defaults/clientIdToHuman.json

# Lien symbolique vers /config pour que le code trouve ses fichiers
# (l'application cherche ../config/ depuis src/)
RUN ln -s /config ./config

# Script d'entrée
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Répertoire de configuration monté en volume
VOLUME ["/config"]

EXPOSE 9000

# Utilisateur non-root pour la sécurité
RUN addgroup -S ocpp && adduser -S ocpp -G ocpp \
    && chown -R ocpp:ocpp /app
USER ocpp

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "src/index.js"]

LABEL org.opencontainers.image.title="OCPP Proxy Alert"
LABEL org.opencontainers.image.description="A 1 or 2 way ocpp proxy with alert system on ChargePoint events"
LABEL org.opencontainers.image.documentation="https://github.com/WoCha-FR/ocpp-proxy-alert#README.md"
LABEL org.opencontainers.image.licenses="GPL-3.0-only"
LABEL org.opencontainers.image.source="https://github.com/WoCha-FR/ocpp-proxy-alert"
LABEL org.opencontainers.image.url="https://github.com/WoCha-FR/ocpp-proxy-alert"