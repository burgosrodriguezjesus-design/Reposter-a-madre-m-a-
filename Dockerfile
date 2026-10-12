# syntax=docker/dockerfile:1.10
# check=error=true
# ════════════════════════════════════════════════════════════════════
#  Imagen de producción de la web de repostería (Next.js standalone)
# ════════════════════════════════════════════════════════════════════
#  Etapas:
#    base          node:22-bookworm-slim + OpenSSL 3 (Prisma) + certificados CA
#    deps          npm ci con el lockfile (incluye devDependencies para compilar)
#    build         prisma generate + next build  →  .next/standalone
#    migrate-deps  solo el CLI de Prisma y su árbol de dependencias (sacado del lockfile)
#    migrate       imagen one-shot para "prisma migrate deploy" (servicio "migrate")
#    runtime       imagen final mínima, usuario no root (uid 10001)   ← destino por defecto
#
#  Construcción (BuildKit obligatorio, viene por defecto en Docker ≥ 23):
#    docker build \
#      --build-arg NEXT_PUBLIC_SITE_URL=https://www.tudominio.es \
#      --build-arg SUPABASE_URL=https://xxxx.supabase.co \
#      --build-arg VERSION=1.4.0 --build-arg REVISION=$(git rev-parse HEAD) \
#      --build-arg CREATED=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
#      --secret id=next_server_actions_key,env=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \
#      -t reposteria/app:1.4.0 .
#    docker build --target migrate -t reposteria/migrate:1.4.0 .
#
#  IMPORTANTE (variables de compilación):
#  - NEXT_PUBLIC_SITE_URL se incrusta en el JavaScript del navegador durante "next build"
#    y next.config.ts la usa para decidir HSTS/CSP: es un argumento de compilación, no de arranque.
#  - SUPABASE_URL también se lee en next.config.ts (images.remotePatterns) y queda fijada al compilar.
#  - "next build" prerenderiza las páginas ISR (inicio, alérgenos, dónde estamos, sitemap...) y esas
#    páginas consultan la base de datos. Si la app no tolera la ausencia de BD durante la compilación,
#    pasa una URL de solo lectura como secreto de BuildKit (nunca como ARG/ENV, quedaría en la imagen):
#      --secret id=build_database_url,env=BUILD_DATABASE_URL  (y red con acceso a esa BD)
#  - Con varias réplicas, todas deben compartir la clave de cifrado de Server Actions. Una misma imagen
#    ya la comparte; para despliegues graduales entre versiones fija NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
#    (base64 de 32 bytes) con el secreto "next_server_actions_key". Next la incrusta en la salida de
#    compilación, así que trata la imagen como material sensible (registro privado).
#
#  Fija la imagen base por digest en tu registro/CI (Renovate o Dependabot la mantendrán al día):
#    --build-arg NODE_IMAGE=node:22-bookworm-slim@sha256:<digest>
# ════════════════════════════════════════════════════════════════════

ARG NODE_IMAGE=node:22-bookworm-slim

# ─────────────────────────────── base ───────────────────────────────
FROM ${NODE_IMAGE} AS base
ENV NEXT_TELEMETRY_DISABLED=1 \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1
# Prisma detecta OpenSSL 3 (motor debian-openssl-3.0.x); ca-certificates para TLS saliente
# (Stripe, SMTP, Supabase). Nada más: sin compiladores ni utilidades de depuración.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ─────────────────────────────── deps ───────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
# El "postinstall" del proyecto ejecuta "prisma generate", que necesita el esquema.
COPY prisma ./prisma
# npm ci respeta el lockfile al byte. @prisma/engines descarga en su postinstall los motores
# para esta plataforma (debian-openssl-3.0.x), que luego reutilizan "build" y "migrate".
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --no-audit --no-fund

# ─────────────────────────────── build ──────────────────────────────
FROM base AS build
ARG NEXT_PUBLIC_SITE_URL
ARG SUPABASE_URL=""
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    SUPABASE_URL=${SUPABASE_URL}
# Los secretos opcionales solo existen durante este RUN (no quedan en capas ni en el historial).
RUN --mount=type=secret,id=next_server_actions_key,env=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \
    --mount=type=secret,id=build_database_url,env=BUILD_DATABASE_URL \
    --mount=type=cache,target=/app/.next/cache,sharing=locked \
    set -eu; \
    case "${NEXT_PUBLIC_SITE_URL:-}" in \
      https://*) ;; \
      *) echo "ERROR: --build-arg NEXT_PUBLIC_SITE_URL=https://... es obligatorio en producción" >&2; exit 1 ;; \
    esac; \
    if [ -n "${BUILD_DATABASE_URL:-}" ]; then export DATABASE_URL="$BUILD_DATABASE_URL" DIRECT_URL="$BUILD_DATABASE_URL"; fi; \
    npx --no prisma generate; \
    npx --no next build; \
    if [ ! -f .next/standalone/server.js ]; then \
      echo "ERROR: falta .next/standalone/server.js. Añade output: 'standalone' en next.config.ts" >&2; exit 1; \
    fi

# ─────────────────────────── migrate-deps ───────────────────────────
# Copia exactamente el CLI "prisma" y su cierre de dependencias tal como los instaló "npm ci"
# (versiones del lockfile), sin next/react/sharp ni el resto de devDependencies.
FROM deps AS migrate-deps
RUN set -eu; \
    mkdir -p /opt/migrate/node_modules/.bin; \
    npm query '#prisma, #prisma *' \
      | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const l of new Set(JSON.parse(s).map(x=>x.location))){if(!/(^|\/)typescript$/.test(l))console.log(l)}})' \
      > /tmp/prisma-closure.txt; \
    test -s /tmp/prisma-closure.txt; \
    while IFS= read -r loc; do \
      mkdir -p "/opt/migrate/$loc"; \
      cp -a "$loc/." "/opt/migrate/$loc/"; \
    done < /tmp/prisma-closure.txt; \
    ln -s ../prisma/build/index.js /opt/migrate/node_modules/.bin/prisma; \
    ls /opt/migrate/node_modules/@prisma/engines/ | grep -q '^schema-engine-'

# ───────────────────────────── migrate ──────────────────────────────
# Uso: docker run --rm -e DATABASE_URL=... -e DIRECT_URL=... reposteria/migrate
# Equivale a "npx prisma migrate deploy" pero sin npm/npx ni acceso a Internet en ejecución.
FROM base AS migrate
ARG VERSION=0.0.0-dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="reposteria-madre-mia-migrate" \
      org.opencontainers.image.description="Aplicación one-shot de migraciones Prisma (prisma migrate deploy)" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"
ENV NODE_ENV=production \
    HOME=/tmp
COPY --from=migrate-deps --chown=root:root /opt/migrate/node_modules ./node_modules
COPY --chown=root:root prisma ./prisma
USER 10001:10001
ENTRYPOINT ["node", "node_modules/prisma/build/index.js"]
CMD ["migrate", "deploy"]

# ───────────────────────────── runtime ──────────────────────────────
FROM ${NODE_IMAGE} AS runtime
ARG NODE_IMAGE
ARG VERSION=0.0.0-dev
ARG REVISION=unknown
ARG CREATED=unknown
ARG SOURCE_URL=""
LABEL org.opencontainers.image.title="reposteria-madre-mia" \
      org.opencontainers.image.description="Web de repostería con pedidos online (Next.js standalone)" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.created="${CREATED}" \
      org.opencontainers.image.source="${SOURCE_URL}" \
      org.opencontainers.image.licenses="UNLICENSED" \
      org.opencontainers.image.vendor="Repostería Madre Mía" \
      org.opencontainers.image.base.name="${NODE_IMAGE}"

# - openssl/ca-certificates: Prisma y TLS saliente.
# - libjemalloc2: sharp (libvips) fragmenta mucho la memoria con el malloc de glibc; jemalloc
#   lo evita (recomendación de sharp para Linux glibc). Se precarga con un enlace independiente
#   de la arquitectura. Para desactivarlo: LD_PRELOAD= en el entorno del contenedor.
# - Se eliminan npm, npx, corepack y yarn: la imagen final solo ejecuta "node server.js".
# - Usuario sin privilegios, sin shell de inicio ni home.
RUN set -eu; \
    apt-get update; \
    apt-get install -y --no-install-recommends openssl ca-certificates libjemalloc2; \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/* /var/log/apt /var/log/dpkg.log; \
    ln -s "$(find /usr/lib -name 'libjemalloc.so.2' -print -quit)" /usr/local/lib/libjemalloc.so.2; \
    test -e /usr/local/lib/libjemalloc.so.2; \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*; \
    groupadd --system --gid 10001 app; \
    useradd --system --uid 10001 --gid 10001 --no-create-home --home-dir /nonexistent \
            --shell /usr/sbin/nologin app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    KEEP_ALIVE_TIMEOUT=65000 \
    LD_PRELOAD=/usr/local/lib/libjemalloc.so.2

WORKDIR /app
# Todo el código pertenece a root y es de solo lectura para el proceso (uid 10001).
# Solo .next/cache (caché de imágenes optimizadas / ISR de datos) es escribible; en
# docker-compose.prod.yml se monta como tmpfs porque el sistema de archivos es read_only.
COPY --from=build --chown=root:root /app/.next/standalone ./
COPY --from=build --chown=root:root /app/.next/static ./.next/static
COPY --from=build --chown=root:root /app/public ./public
COPY --from=build --chown=root:root /app/prisma ./prisma
COPY --from=build --chown=root:root /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=root:root /app/node_modules/@prisma/client ./node_modules/@prisma/client
RUN install -d -o 10001 -g 10001 -m 0700 /app/.next/cache

USER 10001:10001
EXPOSE 3000

# Comprobación de vida (sin BD): /api/health. La disponibilidad real (BD + Redis) es
# /api/health/ready, que usa el orquestador/monitorización externa.
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

# Next gestiona SIGTERM/SIGINT (termina peticiones en curso y callbacks after()).
# En Compose se usa "init: true" para reenviar señales y recoger procesos huérfanos.
STOPSIGNAL SIGTERM
CMD ["node", "server.js"]
