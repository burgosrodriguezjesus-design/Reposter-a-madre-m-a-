#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  Prueba de humo tras un despliegue: /api/health (vida) y /api/health/ready (BD).
#  Uso:  .github/scripts/smoke-test.sh https://www.tudominio.es [intentos] [espera_s]
#  Variables opcionales:
#    VERCEL_AUTOMATION_BYPASS_SECRET  cabecera para saltar la Deployment Protection de Vercel
#                                     (necesaria en URLs de despliegue *.vercel.app protegidas).
#  Sale con 0 solo si /api/health/ready devuelve 200 y {"status":"ok"} de forma estable
#  (3 respuestas correctas seguidas), para no dar por bueno un arranque intermitente.
# ════════════════════════════════════════════════════════════════════
set -euo pipefail

URL="${1:?Uso: smoke-test.sh <url-base> [intentos] [espera_s]}"
URL="${URL%/}"
ATTEMPTS="${2:-20}"
WAIT="${3:-6}"
NEEDED_OK=3

headers=(-H "User-Agent: reposteria-smoke-test/1.0" -H "Cache-Control: no-cache")
if [ -n "${VERCEL_AUTOMATION_BYPASS_SECRET:-}" ]; then
  headers+=(-H "x-vercel-protection-bypass: ${VERCEL_AUTOMATION_BYPASS_SECRET}")
fi

case "$URL" in
  https://*|http://localhost*|http://127.0.0.1*) ;;
  *) echo "::error::La URL de la prueba de humo debe usar https://"; exit 2 ;;
esac

ok=0
for i in $(seq 1 "$ATTEMPTS"); do
  live="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${headers[@]}" "$URL/api/health" || echo 000)"
  body="$(curl -s --max-time 10 "${headers[@]}" -w '\n%{http_code}' "$URL/api/health/ready" || printf '\n000')"
  code="$(printf '%s' "$body" | tail -n 1)"
  json="$(printf '%s' "$body" | sed '$d')"
  status="$(printf '%s' "$json" | sed -n 's/.*"status"[[:space:]]*:[[:space:]]*"\([a-z]*\)".*/\1/p')"
  if [ "$live" = "200" ] && [ "$code" = "200" ] && [ "$status" = "ok" ]; then
    ok=$((ok + 1))
    echo "[$i/$ATTEMPTS] OK ($ok/$NEEDED_OK) health=$live ready=$code"
    if [ "$ok" -ge "$NEEDED_OK" ]; then
      echo "Prueba de humo superada: $URL"
      exit 0
    fi
    sleep 2
    continue
  fi
  ok=0
  echo "[$i/$ATTEMPTS] Aún no: health=$live ready=$code status=${status:-?}"
  sleep "$WAIT"
done

echo "::error::Prueba de humo FALLIDA en $URL (/api/health/ready no devolvió 200 de forma estable)"
exit 1
