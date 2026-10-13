# syntax=docker/dockerfile:1.10
# ════════════════════════════════════════════════════════════════════
#  Copias de seguridad cifradas: pg_dump 16 + gzip + age + supercronic (sin root)
# ════════════════════════════════════════════════════════════════════
#  Contexto de construcción: RAÍZ del repositorio (usa scripts/backup.sh y scripts/restore.sh).
#  BuildKit aplica Dockerfile.dockerignore (junto a este archivo) en lugar del .dockerignore raíz.
#    docker build -f infra/postgres/backup/Dockerfile -t reposteria/backup .
#
#  Base postgres:16-alpine: trae pg_dump/pg_basebackup de la MISMA versión mayor que el servidor
#  y el usuario "postgres" con uid 70, el mismo que escribe el archivo WAL en el servidor
#  (también postgres:16-alpine), así que este contenedor puede leer y retirar esos segmentos.
#  El servidor PostgreSQL de esta imagen NO se ejecuta: solo se usan los clientes.
#
#  Tareas (crontab): copia lógica cada hora (scripts/backup.sh), copia base física diaria
#  (basebackup.sh, para recuperación a un punto en el tiempo) y envío del WAL cada 5 min
#  (wal-ship.sh). Todas cifradas con age para BACKUP_AGE_RECIPIENT (clave pública).
# ════════════════════════════════════════════════════════════════════
ARG POSTGRES_IMAGE=postgres:16-alpine
FROM ${POSTGRES_IMAGE}

ARG VERSION=0.0.0-dev
# supercronic: cron para contenedores que funciona sin root (ver infra/scheduler/Dockerfile)
ARG TARGETARCH=amd64
ARG SUPERCRONIC_VERSION=v0.2.49
ARG SUPERCRONIC_SHA256_AMD64=a53ae236602c7338aba3fbaff40bda6300eae3b9fedb8261eb06cfe3724430c1
ARG SUPERCRONIC_SHA256_ARM64=02aa0cb229ba09050cba6638059dadb9eedc2276632ea43d6a57a2f8c1629dd5
LABEL org.opencontainers.image.title="reposteria-backup" \
      org.opencontainers.image.description="Copias cifradas (age) de PostgreSQL 16: pg_dump horario, pg_basebackup diario y archivo WAL" \
      org.opencontainers.image.version="${VERSION}"

# age: cifrado de las copias. bash/coreutils/findutils: los scripts usan opciones GNU habituales.
RUN set -eux; \
    apk add --no-cache age bash coreutils findutils gzip flock ca-certificates curl; \
    case "$TARGETARCH" in \
      amd64) sum="$SUPERCRONIC_SHA256_AMD64" ;; \
      arm64) sum="$SUPERCRONIC_SHA256_ARM64" ;; \
      *) echo "arquitectura no soportada: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    curl -fsSLo /usr/local/bin/supercronic \
      "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-${TARGETARCH}"; \
    echo "${sum}  /usr/local/bin/supercronic" | sha256sum -c -; \
    chmod 0555 /usr/local/bin/supercronic; \
    apk del curl; \
    age --version; pg_dump --version; \
    rm -f /etc/crontabs/root; \
    install -d -o postgres -g postgres -m 0700 /backups /backups/dumps /backups/wal /backups/base

COPY --chmod=0555 scripts/backup.sh scripts/restore.sh /usr/local/bin/
COPY --chmod=0555 infra/monitoring/backup-with-metrics.sh /usr/local/bin/backup-with-metrics.sh
COPY --chmod=0555 infra/postgres/backup/entrypoint.sh /usr/local/bin/backup-entrypoint
COPY --chmod=0555 infra/postgres/backup/job.sh /usr/local/bin/backup-job
COPY --chmod=0555 infra/postgres/backup/basebackup.sh /usr/local/bin/basebackup.sh
COPY --chmod=0555 infra/postgres/backup/wal-ship.sh /usr/local/bin/wal-ship.sh
COPY --chmod=0444 infra/postgres/backup/crontab /etc/crontabs/postgres
RUN supercronic -test /etc/crontabs/postgres

VOLUME ["/backups"]
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 \
  CMD ["pgrep", "-x", "supercronic"]

# Todo el contenedor (entrypoint y tareas) se ejecuta como "postgres" (uid 70), sin capacidades.
USER 70:70
ENTRYPOINT ["/usr/local/bin/backup-entrypoint"]
CMD ["supercronic", "-passthrough-logs", "/etc/crontabs/postgres"]
