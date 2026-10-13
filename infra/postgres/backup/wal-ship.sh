#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  Cifra el WAL archivado y lo traslada al volumen de copias
# ════════════════════════════════════════════════════════════════════
#  PostgreSQL (archive_command) deja cada segmento comprimido en el volumen "pg-wal-archive"
#  (<segmento>.gz, propietario postgres, uid 70). Esta tarea (cada 5 min, como postgres):
#   1. cifra cada <segmento>.gz con age → /backups/wal/<segmento>.gz.age (escritura atómica);
#   2. borra el original sin cifrar;
#   3. elimina del destino los segmentos más antiguos que BACKUP_RETENTION_DAYS + 1 días
#      (las copias base más antiguas que se conservan siguen pudiendo avanzar con el WAL).
#  Los archivos *.gz.tmp (aún escribiéndose) se ignoran.
# ════════════════════════════════════════════════════════════════════
set -euo pipefail
shopt -s nullglob

: "${WAL_ARCHIVE_DIR:?}" "${BACKUP_WAL_DIR:?}" "${BACKUP_AGE_RECIPIENT:?}"
retention="${BACKUP_RETENTION_DAYS:-35}"

mkdir -p "$BACKUP_WAL_DIR"
umask 077

shipped=0
for src in "$WAL_ARCHIVE_DIR"/*.gz; do
  name="$(basename "$src")"
  dst="$BACKUP_WAL_DIR/$name.age"
  if [ -s "$dst" ]; then
    # Ya cifrado en una ejecución anterior que no llegó a borrar el original
    rm -f "$src"
    continue
  fi
  age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$dst.partial" "$src"
  mv "$dst.partial" "$dst"
  rm -f "$src"
  shipped=$((shipped + 1))
done

find "$BACKUP_WAL_DIR" -maxdepth 1 -type f -name '*.gz.age' -mtime +"$((retention + 1))" -delete
find "$BACKUP_WAL_DIR" -maxdepth 1 -type f -name '*.partial' -mmin +60 -delete

echo "segmentos WAL cifrados y trasladados: $shipped"
