#!/bin/sh
# ════════════════════════════════════════════════════════════════════
#  Arranque de Redis con usuarios ACL generados desde secretos de Docker
# ════════════════════════════════════════════════════════════════════
#  Se ejecuta como el usuario sin privilegios "redis" (user: en docker-compose.prod.yml).
#  Escribe /data/users.acl (tmpfs, 0600) con las contraseñas en forma de hash SHA-256 (#...):
#  ni el archivo ni la línea de comandos contienen las contraseñas en claro.
#
#  Usuarios:
#   default   la app (REDIS_URL=redis://:<redis_password>@redis:6379/0)
#             ~* claves, sin canales; todos los comandos salvo @dangerous, @scripting, @pubsub
#             y @blocking; +info porque ioredis lo usa para comprobar que Redis está listo.
#   exporter  redis_exporter (infra/monitoring): solo comandos de diagnóstico, sin acceso a claves.
# ════════════════════════════════════════════════════════════════════
set -eu

APP_PASSWORD_FILE="${REDIS_PASSWORD_FILE:-/run/secrets/redis_password}"
EXPORTER_PASSWORD_FILE="${REDIS_EXPORTER_PASSWORD_FILE:-/run/secrets/redis_exporter_password}"
CONFIG="${REDIS_CONFIG:-/usr/local/etc/redis/redis.conf}"
ACL_FILE="${REDIS_ACL_FILE:-/data/users.acl}"

if [ ! -s "$APP_PASSWORD_FILE" ]; then
  echo "redis: falta el secreto $APP_PASSWORD_FILE" >&2
  exit 1
fi

sha() { tr -d '\n' < "$1" | sha256sum | cut -d' ' -f1; }

# CLIENT SETINFO (lo envía ioredis ≥ 5.4 al conectar) existe desde Redis 7.2. En versiones
# anteriores una regla ACL con un subcomando desconocido impediría arrancar.
SETINFO=""
version="$(redis-server --version | sed -n 's/.* v=\([0-9]*\)\.\([0-9]*\).*/\1 \2/p')"
set -- $version
if [ "${1:-0}" -gt 7 ] || { [ "${1:-0}" -eq 7 ] && [ "${2:-0}" -ge 2 ]; }; then
  SETINFO="+client|setinfo"
fi

umask 077
{
  printf 'user default on #%s ~* resetchannels -@all +@read +@write +@keyspace +@string +@hash +@list +@set +@sortedset +@bitmap +@hyperloglog +@stream +@geo +@transaction +@connection +@fast +@slow -@dangerous -@scripting -@pubsub -@blocking -@admin +info +ping +select +client|setname +client|getname +client|id %s\n' "$(sha "$APP_PASSWORD_FILE")" "$SETINFO"
  if [ -s "$EXPORTER_PASSWORD_FILE" ]; then
    printf 'user exporter on #%s resetkeys resetchannels -@all +ping +info +select +dbsize +config|get +client|list +client|setname %s +slowlog|get +slowlog|len +latency|latest +memory|stats +cluster|info\n' "$(sha "$EXPORTER_PASSWORD_FILE")" "$SETINFO"
  fi
} > "$ACL_FILE.tmp"
mv "$ACL_FILE.tmp" "$ACL_FILE"

exec redis-server "$CONFIG"
