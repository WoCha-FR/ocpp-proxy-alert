#!/bin/sh
# Copie les fichiers de configuration par défaut dans le volume si absents
for f in config.json clientIdToHuman.json; do
  if [ ! -f "/config/$f" ]; then
    echo "[entrypoint] Copie du fichier par défaut : $f"
    cp "/app/config-defaults/$f" "/config/$f"
  fi
done

exec "$@"
