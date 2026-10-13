# Gestión de secretos

Inventario de variables de entorno y secretos, dónde vive cada uno, quién puede leerlo, cómo se rota
y qué hacer si se filtra. Fuentes verificadas: `.env.example`, `src/lib/env.ts`, `src/lib/crypto.ts`,
`src/lib/taint.ts`, `scripts/generate-keys.ts`, `scripts/encrypt-data.ts`, `.github/workflows/deploy.yml`,
`.github/actions/prepare-test-env/action.yml`, `docker-compose.prod.yml`, `infra/postgres/gen-secrets.sh`,
`infra/k8s/externalsecret.yaml`, `infra/k8s/configmap.yaml`, `infra/monitoring/`.

Documentos relacionados: [Arquitectura y amenazas](../seguridad/arquitectura-y-amenazas.md) ·
[Despliegue seguro](./despliegue-seguro.md).

---

## 1. Reglas

1. **Nada secreto en el repositorio.** `.env`, `.env.local` y `.env.*.local` están en `.gitignore`;
   solo se versiona `.env.example` sin valores. Gitleaks (historial completo) y Trivy `secret` bloquean
   el CI (`.github/workflows/security.yml`, reglas en `.gitleaks.toml`).
2. **Nada secreto en el navegador.** Solo las variables `NEXT_PUBLIC_*` se incrustan en el JavaScript
   del cliente, y la única que existe es `NEXT_PUBLIC_SITE_URL` (URL pública, no secreta). Ver §5.
3. **Claves distintas por entorno** (desarrollo, staging, producción). `src/lib/env.ts` rechaza claves
   `sk_live_`/`rk_live_` de Stripe fuera de producción.
4. **Mínimo privilegio:** cada consumidor recibe solo lo que necesita (ver columnas "Quién lo lee").
5. **CI sin secretos reales:** `.github/actions/prepare-test-env` genera claves aleatorias en cada
   ejecución y las enmascara (`::add-mask::`). Solo `deploy.yml` usa secretos reales, a través de
   GitHub Environments.
6. Los secretos se generan con `npm run keys:generate` (`scripts/generate-keys.ts`) o
   `infra/postgres/gen-secrets.sh` (autoalojado). No se envían por email ni chat.

## 2. Dónde vive cada secreto según la plataforma

| Plataforma | Secretos de la aplicación | Secretos de despliegue | Secretos de infraestructura |
| --- | --- | --- | --- |
| Vercel (principal) | Project → Settings → Environment Variables, separados por Production / Preview (staging) / Development. Recomendado: marcarlos como *Sensitive*. | GitHub → Settings → Environments `staging` y `production` (§3.2) | Los gestiona el proveedor (Supabase/Neon, Upstash). |
| Docker Compose autoalojado | `env_file` no versionado `/etc/reposteria/.env.production` (0600) para la app; `/etc/reposteria/secrets/migrate.env` para el servicio `migrate` | — | Secretos de Docker en `SECRETS_DIR` (por defecto `/etc/reposteria/secrets`, directorio 0700) generados por `infra/postgres/gen-secrets.sh`; montados en `/run/secrets/<nombre>` solo en los servicios que los usan. |
| Kubernetes | `ExternalSecret` → Secret `reposteria-app-secrets` desde el gestor externo (`reposteria/production/app`), `refreshInterval: 1h`; **sin** `DIRECT_URL` (los pods no tienen el rol propietario) | Job de CI/CD con `DIRECT_URL` del propietario | `reposteria-cron-auth`, `reposteria-metrics-token`, `reposteria-backup-secrets`, `reposteria-backup-offsite` (`infra/k8s/externalsecret.yaml`). Configuración no secreta en `infra/k8s/configmap.yaml`. |
| Monitorización autoalojada | — | — | `infra/monitoring/secrets/` (ignorado por git): `metrics_token`, `smtp_password`, `alert_webhook_url`, `heartbeat_url`, `postgres_exporter_password`, `redis-exporter.env`. |

Mecanismo `*_FILE`: `src/lib/crypto.ts` lee `DATA_ENCRYPTION_KEYS_FILE`, `DATA_ENCRYPTION_ACTIVE_KEY_FILE`
y `DATA_HASH_KEY_FILE` (útil para secretos montados como archivo). **Solo esas tres** admiten `*_FILE`;
el resto de variables de la app se leen de `process.env` (en Compose la app recibe un `env_file`, cuyos
valores son visibles con `docker inspect`: proteger el socket de Docker como acceso root).

## 3. Inventario

Leyenda de "Secreto": **S** = secreto; **C** = configuración sensible (no secreta pero no pública);
**P** = pública. Rotación: frecuencia recomendada (no automatizada en el código salvo que se diga).

### 3.1 Aplicación

| Variable | S/C/P | Propósito | Quién la lee | Rotación |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | P | URL canónica, HSTS/CSP, emails, Stripe. Se incrusta al compilar (`Dockerfile` la exige `https://`). | Navegador, servidor | Solo al cambiar de dominio (requiere nueva build). |
| `APP_ENV` | C | `development` / `staging` / `production`; activa el modo fail-closed (`src/lib/env.ts`). | Servidor | — |
| `DATABASE_URL` | S | Conexión de la app con el rol `reposteria_app` (sin DDL). Producción: `sslmode=require` (si falta, `checkEnvironment` solo avisa). | Servidor | Contraseña del rol: anual o ante sospecha. |
| `DIRECT_URL` | S | Conexión directa para `prisma migrate deploy`. Con rol propietario **solo** en el job de migraciones; la app no la necesita en tiempo de ejecución (comprobado con Prisma 6): no la definas en el entorno de la app o apúntala al rol de la app (así lo hace `infra/postgres/gen-secrets.sh`). | CI/CD (migraciones); Prisma | Igual que la contraseña del rol al que apunte. |
| `DATA_ENCRYPTION_KEYS` | S | Anillo de claves AES-256-GCM `kid:base64,kid2:base64`, 32 bytes cada una. Obligatoria en todos los entornos (si falta, la app no arranca). | Servidor, `scripts/encrypt-data.ts` | Anual o ante sospecha (§4.1). |
| `DATA_ENCRYPTION_ACTIVE_KEY` | C | `kid` con el que se cifra lo nuevo (por defecto, el último del anillo). | Servidor | Con cada rotación. |
| `DATA_HASH_KEY` | S | Clave HMAC de índices ciegos y huellas (IP, user-agent, email de login, firma de `/api/media`). | Servidor, `scripts/encrypt-data.ts` | Solo ante sospecha de filtración (§4.2: tiene efectos colaterales). |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | S | Clave de cifrado de Server Actions compartida entre instancias. En Docker se pasa como secreto de BuildKit `next_server_actions_key` y Next la incrusta en la salida de compilación (tratar la imagen como sensible). | Build | Con cada cambio de versión mayor o ante sospecha (invalida formularios abiertos). |
| `CRON_SECRET` | S | `Authorization: Bearer` de `/api/cron` y `/api/cron/jobs` (comparación en tiempo constante, `src/lib/http.ts`). ≥ 32 caracteres en producción. | Servidor, Vercel Cron / CronJobs / `infra/scheduler` | Semestral (§4.4). |
| `METRICS_TOKEN` | S | Bearer de `/api/metrics`. Si se define, ≥ 32 caracteres (error en cualquier entorno). | Servidor, Prometheus | Semestral. |
| `STRIPE_SECRET_KEY` | S | API de Stripe (`sk_`/`rk_`). Recomendado: clave restringida `rk_`. | Servidor | Anual o ante sospecha (§4.3). |
| `STRIPE_WEBHOOK_SECRET` | S | Verificación de firma del webhook. Obligatorio si hay `STRIPE_SECRET_KEY`. | Servidor | Anual o ante sospecha (§4.3). |
| `SMTP_HOST`, `SMTP_PORT`, `EMAIL_FROM` | C | Servidor de correo. | Servidor | — |
| `SMTP_USER` | C | Usuario SMTP. | Servidor | Con la contraseña. |
| `SMTP_PASSWORD` | S | Contraseña/clave API SMTP. | Servidor | Anual o ante sospecha. |
| `SMTP_ALLOW_PLAINTEXT` | C | Documentada en `.env.example` (`false`). `true` desactiva el STARTTLS obligatorio (`src/lib/email.ts`); solo para desarrollo: **en producción `checkEnvironment` impide arrancar**.  Servidor | — |
| `STORAGE_DRIVER`, `SUPABASE_URL`, `SUPABASE_STORAGE_BUCKET`, `SUPABASE_PRIVATE_BUCKET`, `UPLOAD_DIR` | C | Almacenamiento de imágenes. En Vercel, `STORAGE_DRIVER=supabase` o `database` es obligatorio (con `database` no hace falta `SUPABASE_SERVICE_ROLE_KEY`). `SUPABASE_URL` se fija también al compilar (`next.config.ts`). | Servidor | — |
| `SUPABASE_SERVICE_ROLE_KEY` | S | Clave de servicio de Supabase (acceso total al proyecto). | Servidor | Anual o ante sospecha. |
| `REDIS_URL` | S | Incluye la contraseña de Redis. | Servidor | Anual. |
| `TRUST_PROXY` | C | De qué cabecera tomar la IP (`vercel`/`cloudflare`/`nginx`/`none`). | Servidor | — |
| `RATE_LIMIT_MULTIPLIER`, `LOAD_SHED_DELAY_MS`, `LOG_LEVEL` | C | Ajustes de límites y registros. El multiplicador se ignora con `APP_ENV=production`.  | Servidor | — |
| `ALERT_EMAIL` | C | Destino de alertas. | Servidor | — |
| `ALERT_WEBHOOK_URL` | S | URL de webhook (Slack/Teams…) que suele contener un token; incluida en `src/lib/taint.ts`. También la usa el envío directo de alertas cuando la BD no está disponible. | Servidor; GitHub `production` (aviso de despliegue fallido) | Anual o ante sospecha. |
| `WHATSAPP_TOKEN` | S | Token de la Cloud API de Meta. No está en `infra/k8s/externalsecret.yaml`. | Servidor | Según caducidad del token de Meta. |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NEW_ORDER`, `WHATSAPP_TEMPLATE_LANG`, `WHATSAPP_API_VERSION` | C | Configuración de WhatsApp . | Servidor | — |
| `ADMIN_SESSION_IDLE_MINUTES`, `ADMIN_SESSION_MAX_HOURS`, `WEBAUTHN_RP_ID`, `PASSWORD_BREACH_CHECK` | C | Política de sesiones y autenticación del panel. | Servidor | — |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | S (contraseña) | Solo para `npm run db:seed` (crea el primer propietario). `checkEnvironment` avisa si `ADMIN_PASSWORD` sigue definida en producción. | `prisma/seed.ts` | Borrar tras el primer acceso (§4.5). |
| `SECURITY_CONTACT`, `SECURITY_POLICY_URL`, `SECURITY_ENCRYPTION_URL` | P | Contenido de `/.well-known/security.txt` (`src/app/.well-known/security.txt/route.ts`); sin `SECURITY_CONTACT` la ruta responde 404. | Público | Al cambiar el contacto o la clave PGP. |
| `HSTS_PRELOAD` | P | `true` añade `preload` a HSTS (`next.config.ts`). Casi irreversible: solo cuando todos los subdominios sirvan HTTPS. Por defecto `false`. | Servidor | — |
| `SEED_DEMO` | C | `false` evita crear el catálogo de demostración al sembrar. | `prisma/seed.ts` | — |

### 3.2 Despliegue (GitHub Environments, `deploy.yml`)

| Nombre | Tipo | Entorno | Propósito |
| --- | --- | --- | --- |
| `VERCEL_TOKEN` | Secreto | staging, production | CLI de Vercel. Token con alcance limitado al equipo/proyecto y con caducidad. |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | Secreto | staging, production | Identifican el proyecto. |
| `DIRECT_URL` | Secreto | staging, production | `prisma migrate deploy` con el rol propietario de cada BD. |
| `ADMIN_DATABASE_URL` | Secreto (opcional) | staging, production | Reaplica `prisma/sql/least-privilege.sql` (`npm run db:least-privilege`). Rol con privilegios de administración. |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Secreto (opcional) | staging, production | Saltar la Deployment Protection en la prueba de humo. |
| `ALERT_WEBHOOK_URL` | Secreto (opcional) | production | Aviso de despliegue fallido. |
| `VERCEL_STAGING_TARGET`, `STAGING_DAST`, `PRODUCTION_URL` | Variables | staging / production | Destino de staging, DAST contra staging, URL pública. |

Quién los lee: solo los jobs que declaran `environment: staging|production` en `deploy.yml`. El job
de producción espera la aprobación de los revisores del entorno antes de recibir los secretos. Los
administradores del repositorio pueden sobrescribirlos pero no leerlos.

### 3.3 Infraestructura autoalojada

| Secreto | Dónde | Consumidor |
| --- | --- | --- |
| `postgres_superuser_password`, `postgres_owner_password`, `postgres_app_password`, `postgres_backup_password`, `postgres_monitoring_password` | Secretos de Docker (`docker-compose.prod.yml`) | postgres, migrate, backup, exporters |
| `postgres_tls_cert/key`, `pgbouncer_tls_cert/key` | Secretos de Docker | postgres, pgbouncer |
| `redis_password`, `redis_exporter_password` | Secretos de Docker | redis, exporter |
| `cron_secret` | Secreto de Docker; **debe coincidir** con `CRON_SECRET` de `.env.production` | scheduler |
| `BACKUP_AGE_RECIPIENT` | Clave **pública** age (no secreta) | `scripts/backup.sh`, `infra/postgres/backup/` |
| Clave privada age (`BACKUP_AGE_IDENTITY`) | **Fuera de los servidores** (gestor de contraseñas / almacenamiento offline) | Solo `scripts/restore.sh` al restaurar |
| `BACKUP_DATABASE_URL`, `RCLONE_CONF` | Gestor externo → `reposteria-backup-secrets`, `reposteria-backup-offsite` (k8s) | CronJob de copia |

## 4. Procedimientos de rotación

Antes de cualquier rotación: anotar en la auditoría interna quién, cuándo y por qué; hacerlo primero
en staging; tener una copia de seguridad reciente y verificada.

### 4.1 `DATA_ENCRYPTION_KEYS` / `DATA_ENCRYPTION_ACTIVE_KEY`

Cada valor cifrado lleva su `kid`, así que la app descifra con cualquier clave del anillo.

1. `npm run keys:generate` y tomar la nueva línea `kid:base64` (los `kid` son `kAAAAMMDD`).
2. **Fase 1:** añadir la clave nueva al anillo sin activarla (`DATA_ENCRYPTION_KEYS=k_antigua:…,k_nueva:…`,
   `DATA_ENCRYPTION_ACTIVE_KEY=k_antigua`) y desplegar. Así ninguna instancia antigua encuentra datos
   cifrados con una clave que no conoce durante un despliegue gradual (k8s/Compose).
3. **Fase 2:** `DATA_ENCRYPTION_ACTIVE_KEY=k_nueva` y desplegar.
4. Re-cifrar: `npm run keys:rotate` (alias de `npm run db:encrypt`, `scripts/encrypt-data.ts`) con las
   mismas variables y `DATABASE_URL` con un rol que pueda leer y actualizar las tablas. Es idempotente y
   se puede relanzar. Incluye `AdminUser.totpSecret`.
5. Comprobar: `npm run db:encrypt -- --check` debe terminar con código 0; `npm run db:check-security`.
6. Retirar la clave antigua de `DATA_ENCRYPTION_KEYS` y desplegar.
7. **Conservar la clave retirada en el gestor de secretos (no en la app)** al menos durante la retención
   de copias (`BACKUP_RETENTION_DAYS`, 35 días por defecto, y el periodo de PITR): restaurar una copia
   antigua exige esa clave.

Notas: `scripts/generate-keys.ts` describe un único paso (añadir y activar a la vez), válido en
Vercel, donde el cambio de versión es atómico; con despliegues graduales usar las dos fases. Las
sesiones pendientes de MFA guardan el secreto TOTP en `AdminSession.challenge` (no lo re-cifra el
script); al retirar la clave antigua, un alta de MFA en curso de hace menos de 10 minutos falla y hay que
repetirla.

### 4.2 `DATA_HASH_KEY`

`scripts/encrypt-data.ts` **sí recalcula** los índices ciegos de `BLIND_INDEXES` (emails y teléfonos de
`Order`, `QuoteRequest`, `Customer`, `AbandonedCart`, `GiftCard`, `DataRequest`) a partir del dato
descifrado; no necesita la clave antigua. No hay periodo de doble clave: la app usa una sola
`DATA_HASH_KEY`. Efectos de cambiarla:

| Efecto | Causa (código) | Consecuencia |
| --- | --- | --- |
| Búsquedas por email/teléfono fallan hasta terminar el script | `blindIndex` | `/seguimiento`, verificación de opiniones, derechos RGPD, búsqueda en `/admin/clientes` no encuentran registros antiguos. |
| Posibles duplicados y conflicto de unicidad | `Customer.emailHash` y `AbandonedCart.emailHash` son `@unique`; un `upsert` durante la ventana crea un registro nuevo con el hash nuevo | Al recalcular el registro antiguo, `update` falla por unicidad y el script se detiene; hay que fusionar a mano. |
| Todas las sesiones del panel se revocan | `AdminSession.deviceHash = keyedHash("ua", …)` deja de coincidir (`src/lib/session.ts`) | Revocación por "cambio de navegador" y alertas `admin.session_hijack_suspected` (falsas). En el siguiente acceso, aviso de "dispositivo nuevo". |
| Historial no correlacionable | `LoginAttempt.ipHash/emailHash`, `AuditLog.ipHash` no se recalculan | Las huellas anteriores no se relacionan con las nuevas (aceptable). |
| URLs firmadas de `/api/media` caducan | Firma derivada de `keyedHash("media-key", "v1")` (`src/lib/storage.ts`) | Vistas previas abiertas dejan de cargarse (caducan en ≤ 24 h igualmente). |
| Contadores de límites se reinician | Claves de `src/lib/limiter.ts` con `keyedHash("ip", …)` | Ventana de 1 periodo sin acumulado. |

Procedimiento (solo ante sospecha de filtración, en ventana de mantenimiento):
1. Avisar al personal (sus sesiones se cerrarán) y silenciar temporalmente las alertas de sesión.
2. Desplegar con la nueva `DATA_HASH_KEY` y ejecutar inmediatamente `npm run db:encrypt` con la misma clave.
3. Si el script se detiene por unicidad, fusionar los registros duplicados de `Customer`/`AbandonedCart` y relanzar.
4. `npm run db:encrypt -- --check` → código 0.
5. Tras restaurar una copia anterior a la rotación, volver a ejecutar `npm run db:encrypt` (los índices
   de la copia están calculados con la clave antigua).

**Pendiente (código):** soporte de clave de índice anterior (`DATA_HASH_KEY_PREVIOUS`) para buscar con
ambas durante la transición, y manejo de duplicados en el script.

### 4.3 Stripe

- **`STRIPE_SECRET_KEY`:** en el panel de Stripe, *Roll key* con un periodo de caducidad de la clave
  antigua (p. ej. 12–24 h); actualizar la variable en el entorno, desplegar, verificar un pago de prueba
  en staging/producción y dejar caducar la antigua. Las claves de idempotencia (`checkout-session-<id>`,
  `refund-<id>`) no dependen de la clave.
- **`STRIPE_WEBHOOK_SECRET`:** *Roll secret* del endpoint con periodo de solapamiento; durante ese
  periodo Stripe firma con ambos secretos y `constructEvent` acepta cualquiera de las firmas válidas.
  Actualizar la variable y desplegar dentro del periodo. Comprobar en Stripe que los eventos se entregan
  (200) y en la métrica `webhook_events_total{result="invalid_signature"}`.
- Si un evento falla durante la rotación, Stripe lo reintenta; la deduplicación (`StripeEvent`) evita
  dobles efectos.

### 4.4 `CRON_SECRET` y `METRICS_TOKEN`

- Generar con `npm run keys:generate` (base64url de 32 bytes).
- Vercel: cambiar la variable y desplegar (Vercel Cron envía la cabecera con el valor del entorno).
- Compose: actualizar a la vez `cron_secret` (secreto de Docker del scheduler) y `CRON_SECRET` de
  `.env.production`; recrear `app` y `scheduler`.
- Kubernetes: actualizar en el gestor externo; ESO sincroniza en ≤ 1 h y la anotación
  `secret.reloader.stakater.com/reload` de `infra/k8s/deployment.yaml` reinicia los pods si Reloader está
  instalado. Entre la sincronización de los CronJobs y el reinicio de la app puede haber llamadas 401
  (se reintentan en la siguiente ejecución).
- `METRICS_TOKEN`: actualizar también `infra/monitoring/secrets/metrics_token` o el Secret
  `reposteria-metrics-token`.

### 4.5 Contraseñas del panel y `ADMIN_PASSWORD`

- `ADMIN_PASSWORD` solo se usa para sembrar el primer propietario: borrarla del entorno después.
- Cada usuario cambia su contraseña en `/admin/seguridad`; `passwordChangedAt` invalida todas sus sesiones
  anteriores (`src/lib/session.ts`). No se fuerza caducidad periódica (cambio ante sospecha).
- Las contraseñas provisionales de usuarios nuevos se muestran una sola vez; hasta cambiarla
  (`mustChangePassword`), el usuario solo puede entrar a «Mi cuenta y seguridad» y la API del panel
  responde 403.
- Ante compromiso de una cuenta: un OWNER la desactiva, revoca sus sesiones o restablece su MFA desde
  `/admin/usuarios` (acciones `deactivate`, `sessions`, `reset-mfa` en
  `src/app/admin/(panel)/usuarios/actions.ts`); el propio usuario puede cerrar sus otras sesiones, quitar
  passkeys y regenerar códigos de recuperación en `/admin/seguridad`.

### 4.6 Base de datos, Redis, SMTP, Supabase, Vercel

| Secreto | Procedimiento |
| --- | --- |
| Contraseñas de roles PostgreSQL | `ALTER ROLE … PASSWORD` con el rol administrador, actualizar `DATABASE_URL`/`DIRECT_URL` o el secreto de Docker y desplegar; en Compose ver `infra/postgres/README.md`. |
| `REDIS_URL` | Cambiar el ACL/contraseña en Redis (`infra/redis/`) y la URL a la vez. Sin Redis la app sigue con límites locales. |
| `SMTP_PASSWORD` | Generar nueva clave en el proveedor, actualizar, desplegar, revocar la antigua. Los correos pendientes siguen en la cola y se reintentan. |
| `SUPABASE_SERVICE_ROLE_KEY` | Rotar en Supabase (invalida la antigua), actualizar y desplegar inmediatamente; las subidas fallan entre ambos pasos. |
| `VERCEL_TOKEN` | Crear token nuevo con caducidad, actualizar los dos entornos de GitHub, revocar el antiguo. Recomendado: caducidad ≤ 90 días. |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Nueva build con la nueva clave; los formularios abiertos con la versión anterior fallan una vez. |

## 5. Nada secreto en el frontend

- Variables públicas existentes: **solo `NEXT_PUBLIC_SITE_URL`** (verificado en `src/`, `next.config.ts`,
  `.env.example`, `infra/k8s/configmap.yaml`). El identificador de Google Analytics llega de los ajustes en
  BD, no de una variable de entorno.
- Toda variable nueva que deba llegar al navegador tiene que ser **pública por naturaleza**; nunca se
  renombra un secreto con prefijo `NEXT_PUBLIC_`.
- Defensa adicional: `next.config.ts` activa `experimental.taint` y `src/lib/taint.ts` (importado en
  `src/app/layout.tsx`) marca con `experimental_taintUniqueValue` los valores de: `DATA_ENCRYPTION_KEYS`,
  `DATA_HASH_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SMTP_PASSWORD`,
  `SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_TOKEN`, `CRON_SECRET`, `METRICS_TOKEN`, `DATABASE_URL`,
  `DIRECT_URL`, `REDIS_URL`, `ADMIN_PASSWORD`, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, `ALERT_WEBHOOK_URL`, y
  también el valor leído de archivo cuando se usa `NOMBRE_FILE`. Si uno de esos
  valores exactos se pasa a un Componente de Cliente, el renderizado falla.
- Límites del *taint*: es una API experimental; protege el valor completo (no fragmentos, como una sola
  clave del anillo o la contraseña dentro de `DATABASE_URL`). No
  protege registros ni respuestas de API: para eso están `src/lib/logger.ts` (`maskString`, `redact`) y las
  revisiones (regla Semgrep `reposteria.console-log-personal-data`).

## 6. Si se filtra un secreto

1. **Contener (minutos):** rotar el secreto afectado (§4) y desplegar. Si es una credencial de un tercero,
   revocarla en su panel. No esperar a confirmar el uso indebido.
2. **Valorar el alcance:** qué permitía (tabla siguiente), desde cuándo pudo estar expuesto, registros
   del proveedor, `AuditLog` (`/admin/auditoria`, verificar integridad), métricas y alertas.
3. **Limpiar la fuente:** si llegó a git, rotar igualmente (reescribir el historial no basta: puede
   haber copias); revisar artefactos de CI, imágenes de contenedor y registros.
4. **Notificar:** si hay datos personales afectados, valorar la notificación a la AEPD en 72 h y a los
   interesados (`SECURITY.md`).
5. **Documentar** causa y acciones, y añadir una regla a `.gitleaks.toml` si el patrón no se detectó.

| Secreto filtrado | Impacto principal | Acciones adicionales |
| --- | --- | --- |
| `DATA_ENCRYPTION_KEYS` | Con una copia de la BD, lectura de todos los datos personales cifrados | Rotar (§4.1), retirar la clave comprometida tras re-cifrar; considerar comprometidas las copias cifradas con ella si también se filtraron. |
| `DATA_HASH_KEY` | Confirmar si un email/teléfono concreto existe (fuerza bruta sobre índices) | §4.2. |
| `DATABASE_URL` / `DIRECT_URL` | Lectura/escritura de la BD (con propietario, también DDL) | Cambiar contraseña del rol, revisar conexiones activas y `AuditLog`, restringir red si es posible. |
| `STRIPE_SECRET_KEY` | Operaciones en la cuenta de Stripe (reembolsos, consultas) | *Roll key* inmediato sin periodo de gracia, revisar eventos y reembolsos en Stripe. |
| `STRIPE_WEBHOOK_SECRET` | Eventos falsos aceptados (el importe se sigue comprobando contra el pedido) | Rotar, revisar pedidos marcados pagados contra el panel de Stripe. |
| `CRON_SECRET` | Ejecutar tareas programadas a voluntad (carga, envíos de recordatorios) | Rotar (§4.4). |
| `METRICS_TOKEN` | Lectura de métricas (sin datos personales) | Rotar. |
| `SUPABASE_SERVICE_ROLE_KEY` | Acceso total a Supabase, incluido el bucket privado de fotos de clientes | Rotar, revisar registros de Storage. |
| `SMTP_PASSWORD` | Envío de correo suplantando a la tienda | Rotar, revisar SPF/DKIM/DMARC y el registro de envíos del proveedor. |
| `VERCEL_TOKEN` | Desplegar o leer configuración del proyecto | Revocar, revisar despliegues y variables en Vercel. |
| Clave privada age | Descifrar copias de seguridad | Generar par nuevo, re-cifrar o destruir copias existentes según el riesgo. |
| `ADMIN_PASSWORD` | Acceso si la cuenta sigue con esa contraseña (MFA sigue siendo necesario) | Cambiar la contraseña del propietario y revocar sesiones. |

## 7. Comprobaciones periódicas

| Frecuencia | Comprobación |
| --- | --- |
| Cada despliegue | `checkEnvironment` (arranque), Gitleaks y Trivy en CI. |
| Mensual | `npm run db:encrypt -- --check` y `npm run db:check-security` en producción; revisar que `ADMIN_PASSWORD` no está definida; caducidad de `VERCEL_TOKEN`. |
| Trimestral | Quién tiene acceso a Vercel, a los entornos de GitHub, al gestor de secretos y al servidor. |
| Anual | Rotación de claves de cifrado, Stripe, SMTP, Supabase, contraseñas de roles de BD; simulacro de restauración con la clave privada age. |
