# syntax=docker/dockerfile:1.10
# ════════════════════════════════════════════════════════════════════
#  Planificador de tareas: Alpine + curl + supercronic (sin root)
# ════════════════════════════════════════════════════════════════════
#  Construcción: docker compose -f docker-compose.prod.yml build scheduler (contexto infra/scheduler).
#
#  Modelo de privilegios: TODO el contenedor se ejecuta como "scheduler" (uid 10004), sin
#  ninguna capacidad (cap_drop: ALL en Compose) y con no-new-privileges. Se usa supercronic
#  (cron pensado para contenedores, funciona sin root) en lugar de busybox crond, que necesita
#  root + CAP_SETUID/SETGID para cambiar de usuario. La salida de cada tarea va al stdout/stderr
#  del contenedor y supercronic no solapa ejecuciones de la misma tarea.
#
#  supercronic se descarga de la release oficial de GitHub y se verifica con SHA-256 (hash
#  calculado al fijar la versión, 2026-10-13; v0.2.49 publicada el 2026-08-14). Para
#  actualizar: descarga la nueva versión, comprueba su SHA1SUM con el publicado en la release,
#  calcula el SHA-256 y cambia los tres ARG.
# ════════════════════════════════════════════════════════════════════
ARG ALPINE_IMAGE=alpine:3.22
FROM ${ALPINE_IMAGE}

ARG VERSION=0.0.0-dev
ARG TARGETARCH=amd64
ARG SUPERCRONIC_VERSION=v0.2.49
ARG SUPERCRONIC_SHA256_AMD64=a53ae236602c7338aba3fbaff40bda6300eae3b9fedb8261eb06cfe3724430c1
ARG SUPERCRONIC_SHA256_ARM64=02aa0cb229ba09050cba6638059dadb9eedc2276632ea43d6a57a2f8c1629dd5
LABEL org.opencontainers.image.title="reposteria-scheduler" \
      org.opencontainers.image.description="Llamadas programadas a /api/cron y /api/cron/jobs" \
      org.opencontainers.image.version="${VERSION}"

RUN set -eux; \
    apk add --no-cache curl flock ca-certificates; \
    case "$TARGETARCH" in \
      amd64) sum="$SUPERCRONIC_SHA256_AMD64" ;; \
      arm64) sum="$SUPERCRONIC_SHA256_ARM64" ;; \
      *) echo "arquitectura no soportada: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    curl -fsSLo /usr/local/bin/supercronic \
      "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-${TARGETARCH}"; \
    echo "${sum}  /usr/local/bin/supercronic" | sha256sum -c -; \
    chmod 0555 /usr/local/bin/supercronic; \
    addgroup -S -g 10004 scheduler; \
    adduser -S -D -u 10004 -G scheduler -h /home/scheduler -s /sbin/nologin scheduler; \
    rm -f /etc/crontabs/root; \
    mkdir -p /etc/crontabs

# crontab propiedad de root (solo lectura para todos): el usuario de las tareas no puede editarlo
COPY --chmod=0444 crontab /etc/crontabs/scheduler
# Valida la sintaxis del crontab al construir la imagen
RUN supercronic -test /etc/crontabs/scheduler
COPY --chmod=0555 run-job.sh /usr/local/bin/run-job.sh

USER 10004:10004

# Comprobación: supercronic sigue vivo
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["pgrep", "-x", "supercronic"]

# -passthrough-logs: la salida de las tareas sale tal cual (ya es JSON de run-job.sh)
CMD ["supercronic", "-passthrough-logs", "/etc/crontabs/scheduler"]
