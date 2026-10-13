#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  Arranca la app compilada en segundo plano y espera a que responda.
#  Uso (en CI, tras "npm run build"):  .github/scripts/start-app.sh [puerto]
#  Deja el PID en $RUNNER_TEMP/app.pid y el registro en $RUNNER_TEMP/app.log.
#
#  Se usa "npm start" (next start). Next avisa de que con output: "standalone" lo recomendado
#  es "node .next/standalone/server.js" (lo que hace la imagen Docker); para estas pruebas el
#  comportamiento HTTP es el mismo y evita copiar .next/static y public/ a mano.
# ════════════════════════════════════════════════════════════════════
set -euo pipefail

PORT="${1:-3000}"
TMP="${RUNNER_TEMP:-/tmp}"
LOG="$TMP/app.log"
PIDFILE="$TMP/app.pid"
BASE="http://127.0.0.1:${PORT}"

# setsid: la app (npm → next start → next-server) queda en su propio grupo de procesos para
# que stop-app.sh pueda terminarla entera (sin él, next-server sobrevive a npm).
export PORT
setsid nohup npm start -- -p "$PORT" >"$LOG" 2>&1 </dev/null &
echo $! >"$PIDFILE"

# Vida (/api/health, sin BD): hasta 90 s
for _ in $(seq 1 45); do
  if curl -fsS --max-time 2 "$BASE/api/health" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "::error::La aplicación terminó al arrancar"
    tail -n 100 "$LOG" || true
    exit 1
  fi
  sleep 2
done

if ! curl -fsS --max-time 5 "$BASE/api/health"; then
  echo "::error::/api/health no respondió a tiempo"
  tail -n 100 "$LOG" || true
  exit 1
fi
echo

# Preparada (/api/health/ready: BD). Debe dar 200 con la BD de pruebas.
for _ in $(seq 1 15); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$BASE/api/health/ready" || true)"
  [ "$code" = "200" ] && break
  sleep 2
done
curl -fsS --max-time 5 "$BASE/api/health/ready"
echo
echo "App lista en $BASE (PID $(cat "$PIDFILE"))"
