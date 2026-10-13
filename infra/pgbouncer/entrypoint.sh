#!/bin/sh
# ════════════════════════════════════════════════════════════════════
#  Arranque de PgBouncer (usuario sin privilegios, sistema de archivos de solo lectura)
# ════════════════════════════════════════════════════════════════════
#  Genera /run/pgbouncer/userlist.txt (tmpfs, 0600) a partir del secreto de Docker
#  postgres_app_password y arranca pgbouncer en primer plano.
#  Con auth_type = scram-sha-256 y la contraseña en claro en auth_file, PgBouncer autentica al
#  cliente con SCRAM y también se autentica con SCRAM contra PostgreSQL. La contraseña vive solo
#  en memoria (tmpfs) dentro de este contenedor.
# ════════════════════════════════════════════════════════════════════
set -eu

APP_USER="${PGBOUNCER_APP_USER:-reposteria_app}"
APP_PASSWORD_FILE="${PGBOUNCER_APP_PASSWORD_FILE:-/run/secrets/postgres_app_password}"
RUN_DIR="${PGBOUNCER_RUN_DIR:-/run/pgbouncer}"   # debe coincidir con auth_file de pgbouncer.ini
CONFIG="${PGBOUNCER_CONFIG:-/etc/pgbouncer/pgbouncer.ini}"

if [ ! -s "$APP_PASSWORD_FILE" ]; then
  echo "pgbouncer: falta el secreto $APP_PASSWORD_FILE" >&2
  exit 1
fi

umask 077
mkdir -p "$RUN_DIR"
password="$(cat "$APP_PASSWORD_FILE")"
case "$password" in
  *\"*) echo "pgbouncer: la contraseña no puede contener comillas dobles" >&2; exit 1 ;;
esac
printf '"%s" "%s"\n' "$APP_USER" "$password" > "$RUN_DIR/userlist.txt.tmp"
mv "$RUN_DIR/userlist.txt.tmp" "$RUN_DIR/userlist.txt"
unset password

exec pgbouncer "$CONFIG"
