#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  Copia base FÍSICA cifrada (pg_basebackup) para recuperación a un punto en el tiempo
# ════════════════════════════════════════════════════════════════════
#  Lo lanza backup-job (supercronic, diario). Variables (de $BACKUP_ENV_FILE y job.sh):
#    PGHOST PGPORT PGUSER PGSSLMODE PGPASSFILE  conexión de replicación (rol reposteria_backup)
#    BACKUP_BASE_DIR        destino (/backups/base)
#    BACKUP_AGE_RECIPIENT   clave pública age
#    BACKUP_RETENTION_DAYS  días que se conservan (35)
#
#  Resultado: reposteria-base-<UTC>.tar.gz.age + .sha256
#  El tar incluye el WAL necesario para que la copia sea consistente por sí sola (-X fetch).
#  Para recuperar a un instante posterior se aplica el WAL de /backups/wal (wal-ship.sh).
#  Procedimiento de restauración: infra/postgres/README.md.
# ════════════════════════════════════════════════════════════════════
set -euo pipefail

: "${BACKUP_BASE_DIR:?}" "${BACKUP_AGE_RECIPIENT:?}"
retention="${BACKUP_RETENTION_DAYS:-35}"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_BASE_DIR/reposteria-base-$ts.tar.gz.age"

mkdir -p "$BACKUP_BASE_DIR"
umask 077

# -D - -Ft: el tar sale por stdout (sin tablespaces adicionales); nada sin cifrar toca el disco.
pg_basebackup \
  --pgdata=- --format=tar --wal-method=fetch \
  --checkpoint=fast --label="reposteria-$ts" --no-password \
  | gzip -6 \
  | age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$out.partial"

mv "$out.partial" "$out"
( cd "$BACKUP_BASE_DIR" && sha256sum "$(basename "$out")" > "$(basename "$out").sha256" )

# Retención: borra copias base (y sus .sha256) más antiguas que BACKUP_RETENTION_DAYS
find "$BACKUP_BASE_DIR" -maxdepth 1 -type f \
  \( -name 'reposteria-base-*.tar.gz.age' -o -name 'reposteria-base-*.tar.gz.age.sha256' \) \
  -mtime +"$retention" -delete
# Restos de ejecuciones interrumpidas
find "$BACKUP_BASE_DIR" -maxdepth 1 -type f -name '*.partial' -mmin +1440 -delete

echo "copia base creada: $(basename "$out") ($(stat -c %s "$out") bytes)"
