#!/bin/sh
# ════════════════════════════════════════════════════════════════════
#  Envoltorio del entrypoint oficial de postgres (servicio "postgres")
# ════════════════════════════════════════════════════════════════════
#  Se ejecuta como root (con capacidades mínimas, ver docker-compose.prod.yml) y:
#   1. Copia el certificado y la clave TLS desde los secretos de Docker a un tmpfs con
#      propietario postgres y permisos 0600/0644 (PostgreSQL exige que la clave no sea legible
#      por otros; los secretos de Compose se montan con los permisos del archivo del host).
#   2. Prepara el directorio del archivo WAL (volumen "pg-wal-archive") con propietario postgres.
#   3. Cede el control a docker-entrypoint.sh, que inicializa la BD la primera vez (scripts de
#      /docker-entrypoint-initdb.d) y arranca postgres como usuario "postgres" (su-exec/gosu).
# ════════════════════════════════════════════════════════════════════
set -eu

TLS_DIR=/var/lib/postgresql/tls
WAL_ARCHIVE=/var/lib/postgresql/wal-archive
CERT_SRC=${POSTGRES_TLS_CERT_FILE:-/run/secrets/postgres_tls_cert}
KEY_SRC=${POSTGRES_TLS_KEY_FILE:-/run/secrets/postgres_tls_key}

if [ "$(id -u)" != "0" ]; then
  echo "entrypoint.sh: debe arrancar como root (después cede privilegios a postgres)" >&2
  exit 1
fi

for f in "$CERT_SRC" "$KEY_SRC"; do
  if [ ! -s "$f" ]; then
    echo "entrypoint.sh: falta $f (genera los certificados con infra/postgres/gen-secrets.sh)" >&2
    exit 1
  fi
done

mkdir -p "$TLS_DIR"
chown postgres:postgres "$TLS_DIR"
chmod 0700 "$TLS_DIR"
cp "$CERT_SRC" "$TLS_DIR/server.crt"
cp "$KEY_SRC" "$TLS_DIR/server.key"
chown postgres:postgres "$TLS_DIR/server.crt" "$TLS_DIR/server.key"
chmod 0644 "$TLS_DIR/server.crt"
chmod 0600 "$TLS_DIR/server.key"

mkdir -p "$WAL_ARCHIVE"
chown postgres:postgres "$WAL_ARCHIVE"
chmod 0700 "$WAL_ARCHIVE"

exec docker-entrypoint.sh "$@"
