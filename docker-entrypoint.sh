#!/bin/sh
# Corrige les permissions du volume /config
chown ocpp:ocpp /config

# Copie les fichiers de configuration par défaut dans le volume si absents
for f in config.json clientIdToHuman.json; do
  if [ ! -f "/config/$f" ]; then
    echo "[entrypoint] Copie du fichier par défaut : $f"
    cp "/app/config-defaults/$f" "/config/$f"
    chown ocpp:ocpp "/config/$f"
  fi
done

# Bascule vers l'utilisateur non-root pour exécuter l'application
exec su-exec ocpp "$@"
