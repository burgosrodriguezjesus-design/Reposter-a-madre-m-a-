#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  Copia de seguridad CIFRADA de la base de datos.
#   DATABASE_URL=<conexión directa, rol de solo lectura>  BACKUP_DIR=/backups \
#   BACKUP_AGE_RECIPIENT=age1...  [BACKUP_RETENTION_DAYS=35]  scripts/backup.sh
#
#  - pg_dump en formato custom → comprimido → cifrado con age (clave PÚBLICA en el servidor;
#    la clave privada se guarda FUERA del servidor, p. ej. en el gestor de contraseñas del dueño).
#  - Nunca se escribe en disco una copia sin cifrar.
#  - Genera la huella SHA-256 y borra las copias más antiguas que BACKUP_RETENTION_DAYS.
#  - Los datos personales ya van cifrados dentro de la BD (AES-256-GCM): doble capa.
# ════════════════════════════════════════════════════════════════════
set -euo pipefail
umask 077

: "${DATABASE_URL:?Falta DATABASE_URL}"
: "${BACKUP_DIR:?Falta BACKUP_DIR}"
: "${BACKUP_AGE_RECIPIENT:?Falta BACKUP_AGE_RECIPIENT (clave pública age1...)}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-35}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/reposteria-$STAMP.dump.age"
TMP="$OUT.partial"
trap 'rm -f "$TMP"' EXIT

# pg_dump -Fc ya comprime; se cifra en flujo (sin fichero intermedio en claro)
# --enable-row-security: el rol de copias lee a través de su política RLS (sin BYPASSRLS)
pg_dump --format=custom --compress=6 --no-owner --no-privileges --enable-row-security --dbname="$DATABASE_URL" \
  | age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$TMP"

# Una copia vacía o truncada no se da por buena
SIZE=$(stat -c %s "$TMP")
if [ "$SIZE" -lt 1024 ]; then
  echo "ERROR: la copia ocupa $SIZE bytes; algo ha fallado" >&2
  rm -f "$TMP"
  exit 1
fi
mv "$TMP" "$OUT"
sha256sum "$OUT" | awk '{print $1}' > "$OUT.sha256"

find "$BACKUP_DIR" -maxdepth 1 -name 'reposteria-*.dump.age*' -mtime +"$RETENTION_DAYS" -delete

echo "OK $OUT ($SIZE bytes) sha256=$(cat "$OUT.sha256")"
# Copia fuera del servidor (3-2-1): configura BACKUP_OFFSITE_CMD, p. ej.
#   BACKUP_OFFSITE_CMD='rclone copy "$OUT" remoto:copias-reposteria'
if [ -n "${BACKUP_OFFSITE_CMD:-}" ]; then
  OUT="$OUT" bash -c "$BACKUP_OFFSITE_CMD"
  OUT="$OUT.sha256" bash -c "$BACKUP_OFFSITE_CMD"
fi
