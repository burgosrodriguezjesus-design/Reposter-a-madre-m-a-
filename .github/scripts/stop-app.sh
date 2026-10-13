#!/usr/bin/env bash
# Detiene la app arrancada por start-app.sh: SIGTERM a todo su grupo de procesos (npm, next
# start y next-server) y, si no termina en 15 s, SIGKILL. Nunca falla.
set -uo pipefail
PIDFILE="${RUNNER_TEMP:-/tmp}/app.pid"
[ -f "$PIDFILE" ] || exit 0
PID="$(cat "$PIDFILE")"
# start-app.sh usa setsid: el PID es también el identificador del grupo de procesos
kill -TERM -- "-$PID" 2>/dev/null || kill -TERM "$PID" 2>/dev/null || true
for _ in $(seq 1 15); do
  pgrep -g "$PID" >/dev/null 2>&1 || break
  sleep 1
done
kill -KILL -- "-$PID" 2>/dev/null || true
rm -f "$PIDFILE"
exit 0
