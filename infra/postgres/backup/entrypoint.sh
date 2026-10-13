#!/bin/sh
# ════════════════════════════════════════════════════════════════════
#  Arranque del servicio "backup" (como "postgres", uid 70): valida la configuración y lanza
#  supercronic
# ════════════════════════════════════════════════════════════════════
#  Aquí se escribe $BACKUP_ENV_FILE (por defecto /tmp/backup/env, en el tmpfs /tmp) con la
#  configuración NO secreta normalizada (destinatario age, retención,
#  directorios, host de la BD). La contraseña del rol de copias NO va en ese archivo: cada tarea
#  la lee del secreto de Docker en el momento de ejecutarse (ver job.sh).
# ════════════════════════════════════════════════════════════════════
set -eu

fail() { echo "backup: $*" >&2; exit 1; }

: "${BACKUP_AGE_RECIPIENT:?Define BACKUP_AGE_RECIPIENT (clave pública age1...)}"
case "$BACKUP_AGE_RECIPIENT" in
  age1*) ;;
  *) fail "BACKUP_AGE_RECIPIENT debe ser una clave pública age (age1...)" ;;
esac
[ -s "${BACKUP_DB_PASSWORD_FILE:-/run/secrets/postgres_backup_password}" ] \
  || fail "falta el secreto ${BACKUP_DB_PASSWORD_FILE:-/run/secrets/postgres_backup_password}"

retention="${BACKUP_RETENTION_DAYS:-35}"
case "$retention" in
  ''|*[!0-9]*) fail "BACKUP_RETENTION_DAYS debe ser un número de días" ;;
esac

# Solo valores sin comillas simples (se escriben entre comillas simples)
for v in "$BACKUP_AGE_RECIPIENT" "${BACKUP_PGHOST:-postgres}" "${BACKUP_PGDATABASE:-reposteria}" \
         "${BACKUP_PGUSER:-reposteria_backup}" "${TEXTFILE_DIR:-/textfile}"; do
  case "$v" in *\'*) fail "valor no válido: $v" ;; esac
done

env_file="${BACKUP_ENV_FILE:-/tmp/backup/env}"
mkdir -p "$(dirname "$env_file")"
umask 077
cat > "$env_file.tmp" <<EOF
export BACKUP_AGE_RECIPIENT='$BACKUP_AGE_RECIPIENT'
export BACKUP_RETENTION_DAYS='$retention'
export BACKUP_ROOT='/backups'
export BACKUP_DIR='/backups/dumps'
export BACKUP_BASE_DIR='/backups/base'
export BACKUP_WAL_DIR='/backups/wal'
export WAL_ARCHIVE_DIR='/wal-archive'
export BACKUP_SCRIPT='/usr/local/bin/backup.sh'
export TEXTFILE_DIR='${TEXTFILE_DIR:-/textfile}'
export BACKUP_DB_PASSWORD_FILE='${BACKUP_DB_PASSWORD_FILE:-/run/secrets/postgres_backup_password}'
export PGHOST='${BACKUP_PGHOST:-postgres}'
export PGPORT='${BACKUP_PGPORT:-5432}'
export PGDATABASE='${BACKUP_PGDATABASE:-reposteria}'
export PGUSER='${BACKUP_PGUSER:-reposteria_backup}'
export PGSSLMODE='${BACKUP_PGSSLMODE:-require}'
export PGCONNECT_TIMEOUT='10'
export PATH='/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
EOF
mv "$env_file.tmp" "$env_file"
export BACKUP_ENV_FILE="$env_file"

# Directorios de destino (el volumen /backups pertenece a postgres, uid 70, desde la imagen)
for d in /backups/dumps /backups/base /backups/wal; do
  [ -d "$d" ] || mkdir -p "$d"
done

echo "backup: supercronic iniciado (copia lógica :07 cada hora, copia base 02:41 UTC, WAL cada 5 min)"
exec "$@"
