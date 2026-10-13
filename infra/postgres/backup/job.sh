#!/bin/sh
# ════════════════════════════════════════════════════════════════════
#  Envoltorio de cada tarea de copia (se ejecuta como "postgres", uid 70)
# ════════════════════════════════════════════════════════════════════
#  Uso: backup-job <nombre> <orden> [args...]
#   - Carga $BACKUP_ENV_FILE (configuración no secreta, ver entrypoint.sh).
#   - Lee la contraseña del rol de copias del secreto de Docker y la expone SOLO a esta tarea:
#       DATABASE_URL  (contrato de scripts/backup.sh)
#       PGPASSFILE    (pg_basebackup), archivo temporal 0600 que se borra al terminar
#   - flock -n: si la ejecución anterior sigue en marcha, esta se omite.
#   - Una línea JSON con el resultado en stdout/stderr del contenedor.
# ════════════════════════════════════════════════════════════════════
set -eu

name="${1:?nombre de la tarea}"
shift
[ "$#" -gt 0 ] || { echo "backup-job: falta la orden" >&2; exit 2; }

# shellcheck disable=SC1090
. "${BACKUP_ENV_FILE:-/tmp/backup/env}"

log() { # log <nivel> <mensaje> [extra-json]
  printf '{"ts":"%s","level":"%s","job":"backup-%s","msg":"%s"%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$name" "$2" "${3:-}"
}

exec 9>"${BACKUP_LOCK_DIR:-/tmp}/backup-$name.lock"
if ! flock -n 9; then
  log warn "ejecución anterior todavía en curso; se omite" >&2
  exit 0
fi

umask 077
password="$(tr -d '\n' < "$BACKUP_DB_PASSWORD_FILE")"
PGPASSFILE="$(mktemp "${BACKUP_LOCK_DIR:-/tmp}/pgpass.XXXXXX")"
trap 'rm -f "$PGPASSFILE"' EXIT INT TERM
printf '%s:%s:*:%s:%s\n' "$PGHOST" "$PGPORT" "$PGUSER" "$password" > "$PGPASSFILE"
export PGPASSFILE
# La contraseña es hexadecimal (gen-secrets.sh): no necesita codificarse en la URL.
DATABASE_URL="postgresql://${PGUSER}:${password}@${PGHOST}:${PGPORT}/${PGDATABASE}?sslmode=${PGSSLMODE}"
export DATABASE_URL
unset password

start=$(date +%s)
set +e
"$@"
rc=$?
set -e
elapsed=$(( $(date +%s) - start ))

if [ "$rc" -ne 0 ]; then
  log error "la tarea ha fallado" ",\"exit\":$rc,\"seconds\":$elapsed" >&2
  exit "$rc"
fi
log info "ok" ",\"seconds\":$elapsed"
