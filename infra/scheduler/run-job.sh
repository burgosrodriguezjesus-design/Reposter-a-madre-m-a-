#!/bin/sh
# ════════════════════════════════════════════════════════════════════
#  Llama a un endpoint de tareas de la app con "Authorization: Bearer $CRON_SECRET"
# ════════════════════════════════════════════════════════════════════
#  Uso (desde crontab): run-job.sh <nombre> <ruta> <timeout-segundos>
#    run-job.sh jobs  /api/cron/jobs 55
#    run-job.sh daily /api/cron      600
#
#  - El secreto se lee del archivo del secreto de Docker y se pasa a curl por stdin (-K -):
#    nunca aparece en la línea de comandos (ps) ni en el entorno del proceso.
#  - flock -n evita solapes: si la ejecución anterior sigue en marcha, esta se salta (la cola de
#    trabajos de la app ya es transaccional; el solape solo malgastaría conexiones).
#  - Va directo a http://app:3000 por la red interna "app": nginx/WAF bloquea /api/cron* desde
#    Internet y no hace falta TLS dentro de la red privada del host.
#  - Salida: una línea JSON por ejecución en stdout/stderr del contenedor (docker logs).
# ════════════════════════════════════════════════════════════════════
set -eu

name="${1:?nombre}"
path="${2:?ruta}"
max_time="${3:-55}"
base="${SCHEDULER_TARGET_URL:-http://app:3000}"
secret_file="${CRON_SECRET_FILE:-/run/secrets/cron_secret}"
lock_dir="${SCHEDULER_LOCK_DIR:-/tmp}"

log() { # log <nivel> <mensaje> [extra-json]
  printf '{"ts":"%s","level":"%s","job":"%s","path":"%s","msg":"%s"%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$name" "$path" "$2" "${3:-}"
}

if [ ! -s "$secret_file" ]; then
  log error "falta el secreto $secret_file" >&2
  exit 1
fi

exec 9>"$lock_dir/scheduler-$name.lock"
if ! flock -n 9; then
  log warn "ejecución anterior todavía en curso; se omite" >&2
  exit 0
fi

start=$(date +%s)
set +e
code=$(
  {
    printf 'header = "Authorization: Bearer %s"\n' "$(tr -d '\n' < "$secret_file")"
  } | curl --config - \
      --silent --show-error --output /dev/null --write-out '%{http_code}' \
      --max-time "$max_time" --connect-timeout 5 \
      --retry 2 --retry-delay 2 --retry-connrefused \
      --user-agent "reposteria-scheduler/1.0" \
      --header "Accept: application/json" \
      "$base$path"
)
rc=$?
set -e
elapsed=$(( $(date +%s) - start ))

if [ "$rc" -ne 0 ] || [ "${code:-000}" -lt 200 ] || [ "${code:-000}" -ge 300 ]; then
  log error "fallo al llamar al endpoint" ",\"http\":\"${code:-000}\",\"curl_exit\":$rc,\"seconds\":$elapsed" >&2
  exit 1
fi
log info "ok" ",\"http\":\"$code\",\"seconds\":$elapsed"
