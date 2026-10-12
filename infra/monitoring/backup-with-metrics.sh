#!/usr/bin/env bash
# Ejecuta scripts/backup.sh y publica el resultado como métricas para node_exporter
# (textfile collector), que vigilan las alertas ReposteriaBackupTooOld/Failed.
#
# Uso (mismas variables que scripts/backup.sh):
#   DATABASE_URL=<directa> BACKUP_DIR=/backups BACKUP_AGE_RECIPIENT=age1... \
#     infra/monitoring/backup-with-metrics.sh
#
# Variables opcionales:
#   BACKUP_SCRIPT  ruta de backup.sh (por defecto <repo>/scripts/backup.sh)
#   TEXTFILE_DIR   directorio del textfile collector (por defecto /var/lib/node_exporter/textfile_collector)
#
# Programación recomendada: timer de systemd cada hora con las variables en un
# EnvironmentFile con permisos 0600 (no en el crontab, donde quedarían visibles).
# Ver infra/monitoring/README.md.
#
# Métricas escritas en $TEXTFILE_DIR/reposteria_backup.prom:
#   reposteria_backup_last_run_timestamp_seconds
#   reposteria_backup_last_success_timestamp_seconds   (se conserva la anterior si falla)
#   reposteria_backup_last_exit_code
#   reposteria_backup_last_duration_seconds
#   reposteria_backup_last_size_bytes                  (último .age; se conserva si falla)
#   reposteria_backup_files                            (copias .age en BACKUP_DIR)
set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_SCRIPT="${BACKUP_SCRIPT:-$REPO_DIR/scripts/backup.sh}"
TEXTFILE_DIR="${TEXTFILE_DIR:-/var/lib/node_exporter/textfile_collector}"
PROM="$TEXTFILE_DIR/reposteria_backup.prom"

if [ -z "${BACKUP_DIR:-}" ]; then
  echo "ERROR: BACKUP_DIR no está definido" >&2
  exit 2
fi

# Valor anterior de una métrica (0 si no existe)
previous() {
  local v=""
  [ -f "$PROM" ] && v="$(awk -v m="$1" '$1 == m { print $2 }' "$PROM")"
  printf '%s' "${v:-0}"
}

start="$(date +%s)"
"$BACKUP_SCRIPT"
rc=$?
end="$(date +%s)"

last_success="$(previous reposteria_backup_last_success_timestamp_seconds)"
size="$(previous reposteria_backup_last_size_bytes)"
if [ "$rc" -eq 0 ]; then
  last_success="$end"
  latest="$(ls -1t "$BACKUP_DIR"/reposteria-*.age 2>/dev/null | head -n 1)"
  if [ -n "$latest" ]; then
    size="$(stat -c %s "$latest")"
  fi
fi
files="$(find "$BACKUP_DIR" -maxdepth 1 -name 'reposteria-*.age' -type f 2>/dev/null | wc -l | tr -d ' ')"

mkdir -p "$TEXTFILE_DIR"
# Escritura atómica: node_exporter solo lee ficheros *.prom completos.
tmp="$(mktemp "$TEXTFILE_DIR/.reposteria_backup.XXXXXX")"
cat > "$tmp" <<EOF
# HELP reposteria_backup_last_run_timestamp_seconds Fin de la última ejecución de la copia (epoch).
# TYPE reposteria_backup_last_run_timestamp_seconds gauge
reposteria_backup_last_run_timestamp_seconds $end
# HELP reposteria_backup_last_success_timestamp_seconds Fin de la última copia correcta (epoch).
# TYPE reposteria_backup_last_success_timestamp_seconds gauge
reposteria_backup_last_success_timestamp_seconds $last_success
# HELP reposteria_backup_last_exit_code Código de salida de la última ejecución (0 = correcta).
# TYPE reposteria_backup_last_exit_code gauge
reposteria_backup_last_exit_code $rc
# HELP reposteria_backup_last_duration_seconds Duración de la última ejecución.
# TYPE reposteria_backup_last_duration_seconds gauge
reposteria_backup_last_duration_seconds $((end - start))
# HELP reposteria_backup_last_size_bytes Tamaño de la última copia cifrada correcta.
# TYPE reposteria_backup_last_size_bytes gauge
reposteria_backup_last_size_bytes $size
# HELP reposteria_backup_files Copias cifradas presentes en BACKUP_DIR.
# TYPE reposteria_backup_files gauge
reposteria_backup_files $files
EOF
chmod 0644 "$tmp"
mv -f "$tmp" "$PROM"

exit "$rc"
