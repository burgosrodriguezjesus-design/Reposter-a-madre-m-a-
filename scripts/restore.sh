#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  Restauración de una copia cifrada.
#   BACKUP_AGE_IDENTITY=/ruta/segura/clave-age.txt  TARGET_DATABASE_URL=postgresql://...  \
#   scripts/restore.sh /backups/reposteria-AAAAMMDDTHHMMSSZ.dump.age
#
#  - Verifica la huella SHA-256 antes de restaurar.
#  - Restaura en la base de datos indicada (¡usa una BD NUEVA para simulacros!).
#  - Después: aplica prisma/sql/least-privilege.sql y ejecuta npm run db:check-security.
# ════════════════════════════════════════════════════════════════════
set -euo pipefail
umask 077

FILE="${1:?Uso: scripts/restore.sh <copia.dump.age>}"
: "${BACKUP_AGE_IDENTITY:?Falta BACKUP_AGE_IDENTITY (clave privada age)}"
: "${TARGET_DATABASE_URL:?Falta TARGET_DATABASE_URL}"

if [ -f "$FILE.sha256" ]; then
  EXPECTED="$(cat "$FILE.sha256")"
  ACTUAL="$(sha256sum "$FILE" | awk '{print $1}')"
  if [ "$EXPECTED" != "$ACTUAL" ]; then
    echo "ERROR: la huella no coincide; la copia está dañada o manipulada" >&2
    exit 1
  fi
  echo "Huella SHA-256 verificada"
else
  echo "AVISO: no hay fichero .sha256; no se puede verificar la integridad" >&2
fi

age --decrypt --identity "$BACKUP_AGE_IDENTITY" "$FILE" \
  | pg_restore --no-owner --no-privileges --exit-on-error --single-transaction --dbname="$TARGET_DATABASE_URL"
echo "Restauración completada en la base de datos de destino"
