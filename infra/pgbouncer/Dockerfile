# syntax=docker/dockerfile:1.10
# ════════════════════════════════════════════════════════════════════
#  Imagen mínima de PgBouncer (Alpine + paquete oficial de la distribución)
# ════════════════════════════════════════════════════════════════════
#  Construcción: docker compose -f docker-compose.prod.yml build pgbouncer
#  (contexto: infra/pgbouncer). Fija la imagen base por digest en tu CI.
#  Requiere PgBouncer ≥ 1.21 (max_prepared_statements): Alpine 3.22 trae 1.24.x.
# ════════════════════════════════════════════════════════════════════
ARG ALPINE_IMAGE=alpine:3.22
FROM ${ALPINE_IMAGE}

ARG VERSION=0.0.0-dev
LABEL org.opencontainers.image.title="reposteria-pgbouncer" \
      org.opencontainers.image.description="PgBouncer (modo transacción, SCRAM, TLS) para la web de repostería" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.licenses="ISC"

# pgbouncer + certificados CA. Usuario sin privilegios con uid/gid fijos.
RUN set -eux; \
    apk add --no-cache pgbouncer ca-certificates; \
    pgbouncer --version; \
    addgroup -S -g 10002 bouncer; \
    adduser -S -D -H -u 10002 -G bouncer -h /nonexistent -s /sbin/nologin bouncer; \
    install -d -o bouncer -g bouncer -m 0700 /run/pgbouncer

COPY --chmod=0444 pgbouncer.ini /etc/pgbouncer/pgbouncer.ini
COPY --chmod=0555 entrypoint.sh /usr/local/bin/pgbouncer-entrypoint

USER 10002:10002
EXPOSE 6432
# Comprobación: el puerto acepta conexiones TCP (busybox nc)
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["nc", "-z", "127.0.0.1", "6432"]
STOPSIGNAL SIGINT
ENTRYPOINT ["/usr/local/bin/pgbouncer-entrypoint"]
