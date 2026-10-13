# Monitorización y alertas

> Estado: la app expone salud y métricas (código probado). La pila Prometheus +
> Alertmanager + blackbox de `infra/monitoring/` es una plantilla **validada con las
> herramientas reales** (`promtool check config/rules`: 52 alertas + 29 reglas SLO;
> `amtool check-config` y prueba de enrutado), pero no desplegada. Los monitores externos de `infra/monitoring/uptime-checks.md` **no se han
> creado**. Detalle y runbooks largos: `infra/monitoring/README.md`.

## 1. Capas

| Capa | Qué vigila | Dónde |
| --- | --- | --- |
| Salud | Proceso vivo y dependencias | `/api/health`, `/api/health/ready` |
| Métricas de la app | HTTP, pedidos, pagos, webhooks, cola, límites, seguridad | `/api/metrics` (por instancia, con token) |
| Exporters | PostgreSQL, Redis, host (disco), copias | `postgres_exporter`, `redis_exporter`, `node_exporter` (+ textfile) |
| Sondas | Readiness de cada réplica y HTTPS público | `blackbox_exporter` (`blackbox.yml`) |
| Monitores externos | Caída total vista por un cliente (DNS, TLS, CDN, proveedor) | UptimeRobot / Better Stack (`uptime-checks.md`) |
| Alertas de la app | Eventos de seguridad y operación | `src/lib/alerts.ts` → email/webhook |
| Logs | Eventos estructurados y enmascarados | `src/lib/logger.ts`, nginx, PostgreSQL |

## 2. Endpoints de salud

| Ruta | Comprueba | Respuesta | Uso |
| --- | --- | --- | --- |
| `GET /api/health` | Nada externo | `200 {"status":"ok"}` | Liveness (Kubernetes), healthcheck de Compose, monitor "Vida" |
| `GET /api/health/ready` | `SELECT 1` (tope 2 s) y `PING` a Redis | `200` si la BD responde, `503` (`"status":"degraded"`) si no. Cuerpo: `database`, `redis` (`true`/`false`/`"not_configured"`), `eventLoopDelayMs`, `ms` | Readiness (Kubernetes), sonda `blackbox-ready`, monitor "Readiness" |

Ambas con `Cache-Control: no-store` y sin datos sensibles. **Redis caído no hace fallar la
readiness** (es opcional por diseño); varios textos de `infra/` dicen lo contrario (ver §10).

## 3. `/api/metrics`

- Formato Prometheus. Exige `Authorization: Bearer <METRICS_TOKEN>`; sin token o con un
  token de menos de 32 caracteres responde 401 (`src/app/api/metrics/route.ts`, comparación
  en tiempo constante). `checkEnvironment()` también rechaza un `METRICS_TOKEN` corto.
- Cerrada desde Internet: nginx devuelve 404 (`infra/nginx/conf.d/reposteria.conf.template`),
  Cloudflare la bloquea (`rp_internal_routes`) y Vercel Firewall solo la permite desde la IP
  de Prometheus.
- **Las métricas son por instancia** (contadores en memoria del proceso): se scrapea cada
  réplica por separado (DNS SD en Compose, Endpoints/ServiceMonitor en Kubernetes). Por la
  URL pública de Vercel se obtiene una instancia cualquiera: datos parciales. Los gauges
  `jobs_*` y `db_up` leen la BD y sí son globales. Un contador que aún no se ha
  incrementado no aparece en la salida.

### Métricas emitidas (revisado en el código)

| Métrica | Tipo | Etiquetas (valores) | Origen |
| --- | --- | --- | --- |
| `http_requests_total` | counter | `route` (normalizada: ids → `:id`, 404 → `unmatched`, máx. 300 rutas y 4 niveles, si no `other`), `method` (o `OTHER`), `status` | `src/lib/http-metrics.ts` |
| `http_request_duration_seconds` | histogram | `route`; buckets 0,05 · 0,1 · 0,25 · 0,5 · 1 · 2,5 · 5 · 10 s | `src/lib/http-metrics.ts`, `src/lib/metrics.ts` |
| `http_server_errors_total` | counter | `kind` (tipo de ruta de Next: `render`, `route`, `action`…) | `src/instrumentation-node.ts` |
| `orders_created_total` | counter | `payment` | `src/lib/checkout.ts` |
| `orders_failed_total` | counter | `reason` = `rejected` \| `error` \| `stripe` | `src/app/api/orders/route.ts`, `src/lib/checkout.ts` |
| `payments_succeeded_total` | counter | — | `src/lib/order-events.ts` |
| `payments_failed_total` | counter | `reason` = `amount_mismatch` \| `declined` | `src/lib/order-events.ts` |
| `webhook_events_total` | counter | `type` (evento de Stripe), `result` = `invalid_signature`, `ignored_mode`, `duplicate`, `error`, `missing`, `mismatch`, `paid`, `late`, `already`, `refund_recorded`… | `src/app/api/stripe/webhook/route.ts` |
| `jobs_processed_total` | counter | `type`, `result` = `ok` \| `retry` \| `failed` | `src/lib/jobs.ts` |
| `rate_limit_blocked_total` | counter | `scope` = `global-page` \| `global-api` \| `global-write` y los de ruta (`orders`, `quotes`, `upload`, `login-ip`, `login-email`…) | `src/lib/limiter.ts` |
| `load_shed_total` | counter | `kind` = `api` \| `page` | `src/proxy.ts` |
| `csrf_blocked_total` | counter | — | `src/proxy.ts` |
| `uploads_rejected_total` | counter | — | `src/app/api/uploads/route.ts` |
| `admin_login_failures_total` | counter | `stage` = `password` \| `mfa` | `src/app/admin/login/actions.ts`, `src/lib/mfa.ts` |
| `admin_login_success_total` | counter | — | `src/lib/mfa.ts` |
| `security_alerts_total` | counter | `type` (tipo de alerta, §6) | `src/lib/alerts.ts` |
| `security_alerts_direct_total` | counter | `result` (`ok`/`error`): alertas enviadas directamente al webhook porque la cola no estaba disponible | `src/lib/alerts.ts` |
| `jobs_pending` | gauge | — (PENDING + RUNNING, incluye programados a futuro) | `src/instrumentation-node.ts` |
| `jobs_failed` | gauge | — (FAILED) | `src/instrumentation-node.ts` |
| `jobs_oldest_pending_seconds` | gauge | — (antigüedad del pendiente vencido más antiguo; 0 si no hay) | `src/instrumentation-node.ts` |
| `db_up` | gauge | — (1/0) | `src/app/api/metrics/route.ts` |
| `redis_up` | gauge | — (1 / 0 / −1 = no configurado) | `src/app/api/metrics/route.ts` |
| `nodejs_eventloop_delay_p99_ms` | gauge | — | `src/app/api/metrics/route.ts` |
| `process_resident_memory_bytes`, `nodejs_heap_size_used_bytes`, `process_uptime_seconds` | gauge (sin línea `# TYPE`) | — | `src/lib/metrics.ts` |

Ninguna etiqueta lleva emails, IP, nombres ni identificadores de pedido.

### Métricas de copias (textfile de `node_exporter`)

`infra/monitoring/backup-with-metrics.sh` escribe en `reposteria_backup.prom`:
`reposteria_backup_last_run_timestamp_seconds`, `reposteria_backup_last_success_timestamp_seconds`,
`reposteria_backup_last_exit_code`, `reposteria_backup_last_duration_seconds`,
`reposteria_backup_last_size_bytes`, `reposteria_backup_files`. Solo cubre la copia lógica;
la copia base y el envío del WAL no publican métricas (**pendiente**; tampoco hay alerta
sobre `pg_stat_archiver.failed_count`, aunque `infra/postgres/postgresql.conf` la menciona).
En Kubernetes se usa `kube_cronjob_status_last_successful_time` del CronJob.

## 4. Sondas y monitores externos

| Origen | Objetivo | Frecuencia | Criterio |
| --- | --- | --- | --- |
| `blackbox-ready` (interno) | `http://<cada réplica>:3000/api/health/ready` | 15 s | 200 |
| `blackbox-public` | `https://SITIO/`, `/api/health`, `/api/health/ready` | 60 s | 200 con TLS válido; caducidad del certificado |
| Monitores externos (`uptime-checks.md`) | Portada (palabra clave), `/api/health` (`"status":"ok"`), `/api/health/ready`, certificado, heartbeat del Watchdog, heartbeat de copias (opcional) | 60 s desde ≥ 3 regiones; alerta tras 2 fallos confirmados | Son la referencia del informe mensual del SLO |

Lectura rápida: `/api/health` OK y `/ready` KO → BD; ambos KO → app, proxy o DNS; portada KO
y health OK → renderizado o catálogo.

## 5. SLO 99,95 % y alertas de *burn rate* (`infra/monitoring/slo.yml`)

SLI: peticiones sin 5xx sobre el total (sin `/api/health*`, `/api/metrics`, `/api/cron*`).
Presupuesto 0,05 % ≈ 21,6 min en 30 días. Se exige ≥ 100 peticiones en la última hora
para las alertas rápidas.

| Alerta | Ventanas | Factor | Ratio de error | Severidad |
| --- | --- | --- | --- | --- |
| `ReposteriaErrorBudgetBurn` (rápida) | 1 h y 5 min | 14,4 | > 0,72 % | critical |
| `ReposteriaErrorBudgetBurn` (rápida) | 6 h y 30 min | 6 | > 0,3 % | critical |
| `ReposteriaErrorBudgetBurn` (lenta) | 1 d y 2 h | 3 | > 0,15 % | warning |
| `ReposteriaErrorBudgetBurn` (lenta) | 3 d y 6 h | 1 | > 0,05 % | warning |
| `ReposteriaErrorBudgetExhausted` | 30 d | — | presupuesto < 0 | warning |

Requiere ≥ 30 días de retención en Prometheus (el compose de monitorización usa 45 d).

## 6. Enrutado de alertas

### Alertmanager (`infra/monitoring/alertmanager.yml`)

| Severidad | Receptor | Tiempos |
| --- | --- | --- |
| `critical` | `equipo-critico`: email + Slack (webhook; Discord/Teams comentados) | `group_wait` 10 s, `repeat_interval` 1 h |
| `warning` | `equipo-email`: email | Silenciadas de 00:00 a 07:30 (Europe/Madrid), `repeat_interval` 12 h |
| `none` (`Watchdog`) | `heartbeat` (servicio de uptime) | Cada minuto: si deja de llegar, la pila de alertas está caída |

Inhibiciones: la `critical` tapa la `warning` del mismo nombre; caída total
(`ReposteriaAllInstancesDown`, `ReposteriaSiteDownExternal`) tapa los síntomas derivados;
`PostgresDown`, `RedisDown` y `ReposteriaJobsStalled` tapan sus consecuencias. Secretos
(SMTP, webhook, heartbeat) desde ficheros en `/run/secrets/`.

### Alertas de la propia app (`src/lib/alerts.ts`)

- `securityAlert(type, message, meta)` incrementa `security_alerts_total{type}`, escribe
  `log.warn("alert", …)` y encola un trabajo `alert.send` (máx. 10 intentos).
- Agrupación: una alerta por tipo y clave de agrupación cada 10 min (`dedupeKey`).
- Entrega (`src/lib/job-handlers.ts`): `POST` JSON a `ALERT_WEBHOOK_URL` y/o email a
  `ALERT_EMAIL` (si falta, al email de notificaciones o del negocio de los ajustes). Un
  fallo de `alert.send` no genera otra alerta (evita bucles).
- Es la vía principal en Vercel, donde no hay Prometheus propio.
- Tras encolarla, `securityAlert` lanza la cola en el momento (`after()`), sin esperar al cron.
- Si no se puede encolar (p. ej. la BD ha caído, caso de `db.error`), se envía **directamente**
  a `ALERT_WEBHOOK_URL` (sin email: el email depende de los ajustes en la BD), con la misma
  agrupación de 10 minutos por proceso y la métrica `security_alerts_direct_total`. Sin
  webhook configurado, esa caída solo la detectan Prometheus (`ReposteriaDatabaseUnreachable`)
  o los monitores externos.

Tipos emitidos hoy: `admin.bruteforce`, `admin.login_locked`, `admin.mfa_failures`,
`admin.recovery_code_used`, `admin.new_device`, `admin.session_hijack_suspected`,
`admin.permission_denied`, `admin.user_changed`, `admin.export`, `payment.failed`,
`payment.amount_mismatch` (critical), `payment.late`, `webhook.invalid_signature`,
`jobs.failed`, `db.error` (critical), `audit.chain_broken` (critical), `audit.anchor`
(diaria), `privacy.request`.

### Regla: las alertas no llevan datos personales innecesarios

Solo tipo, mensaje genérico fijo, severidad, fecha y metadatos internos: identificadores
internos (`userId`, `orderId`, `jobId`, `giftCardId`, `requestId`), contadores, ruta,
permiso, etiqueta de navegador/SO (`admin.new_device`) o los primeros 12 caracteres de la
huella HMAC de la IP. Nunca email, teléfono, nombre, dirección ni IP. `meta` se trunca a
1.000 caracteres; el error de `jobs.failed` va enmascarado y truncado a 120.

Ejemplo real de forma (valores ilustrativos), alerta de fuerza bruta de
`src/app/admin/login/actions.ts`:

```json
// Trabajo encolado (tabla Job, type "alert.send")
{
  "type": "admin.bruteforce",
  "message": "Muchos intentos de acceso fallidos al panel desde la misma red.",
  "severity": "warning",
  "meta": "{\"ipHash\":\"3f9a1c0b7d2e\"}",
  "at": "2026-10-13T08:15:02.123Z"
}
```

```json
// Cuerpo enviado a ALERT_WEBHOOK_URL
{ "text": "<nombre del negocio>: [WARNING] admin.bruteforce · Muchos intentos de acceso fallidos al panel desde la misma red. · {\"ipHash\":\"3f9a1c0b7d2e\"} · 2026-10-13T08:15:02.123Z" }
```

El email lleva el mismo texto y un enlace a `/admin/auditoria?nivel=alertas`; el detalle se
consulta en el panel, con sesión y MFA. Las alertas de Alertmanager solo usan etiquetas de
métricas (instancia, ruta normalizada, tipo, ámbito), que tampoco contienen datos personales.

## 7. Logs

### Formato y enmascarado

- App (`src/lib/logger.ts`): una línea JSON por evento,
  `{"t":"<ISO>","level":"info|warn|error","event":"<nombre>", …campos}`; nivel con
  `LOG_LEVEL` (por defecto `info`). Se registran identificadores, nunca objetos completos.
- `maskString`: emails → `a***@dominio`; teléfonos → `***NN`; claves de Stripe, `whsec_`,
  `Bearer …`, JWT, valores cifrados `enc:v1:…` y URL `postgres://`/`redis://` → `[secreto]`.
- `redact` (modo estricto en logs técnicos): oculta (`[oculto]`) los campos cuyo nombre
  contiene `pass`, `secret`, `token`, `authorization`, `cookie`, `api key`, `totp`,
  `recovery`, `card`, `cvv`, `iban`, `email`, `phone`, `address`, `name`, salvo los que
  terminan en `id`/`Id` o contienen `count`/`hash`. Cadenas truncadas a 2.000 caracteres,
  profundidad 5, listas de 20.
- nginx (`infra/nginx/conf.d/logging.conf`): JSON `json_seguro`; ruta y Referer **sin query**
  (pueden llevar tokens), sin cookies ni `Authorization`; la IP se conserva (interés
  legítimo de seguridad). ModSecurity: auditoría solo de respuestas relevantes, partes
  `AFHZ` (sin cuerpos ni cabeceras de petición).
- PostgreSQL (`infra/postgres/postgresql.conf`): consultas lentas (> 500 ms) y DDL **sin
  valores de parámetros** (`log_parameter_max_length = 0`).
- Copias (`infra/postgres/backup/job.sh`): una línea JSON por tarea con resultado y
  duración.

### Retención

| Dónde | Retención | Estado |
| --- | --- | --- |
| Docker (Compose) | Rotación por tamaño: 20 MB × 5 ficheros por contenedor (`x-logging`) | Configurado; no es una retención por tiempo |
| Agregador de logs (Loki, Better Stack, Log Drains de Vercel…) | 30–90 días recomendados (`logging.conf`) | **Pendiente**: no hay agregador configurado en el repo |
| Vercel | Según plan; para conservar más, Log Drains | Pendiente de decidir |
| Prometheus | 45 días (`docker-compose.monitoring.yml`) | Plantilla |
| BD (`src/lib/privacy.ts`, `RETENTION`) | `AuditLog` 2 años, `LoginAttempt` 90 días, trabajos terminados 30 días, `StripeEvent` 90 días | Aplicado por `/api/cron` diario |

## 8. Guardia: alerta → significado → primeras acciones

| Alerta | Significa | Primeras acciones |
| --- | --- | --- |
| `ReposteriaSiteDownExternal` / monitor externo / `ReposteriaAllInstancesDown` (critical) | La web no responde | Comparar `/api/health` y `/ready`; estado del proveedor, DNS, certificado, WAF (¿Attack Challenge Mode?); logs de arranque (`checkEnvironment()` aborta si falta configuración); rollback si hubo despliegue. |
| `ReposteriaReadinessFailing` / `ReposteriaDatabaseUnreachable` / `PostgresDown` (critical) | Sin BD: no se toman pedidos | Estado de Postgres/proveedor, disco, PgBouncer (credenciales, `max_db_connections`); si hay daño de datos → `recuperacion-desastres.md` §6.1/6.2. |
| `PostgresConnectionsHigh` | Pool cerca del máximo | `pg_stat_activity` por estado; `idle in transaction`; revisar `connection_limit` × réplicas frente a PgBouncer. |
| `ReposteriaRedisUnreachable` / `RedisDown` | Límites solo locales | La app sigue; reiniciar/sustituir Redis (`recuperacion-desastres.md` §6.5); vigilar abuso en el WAF. |
| `ReposteriaErrorBudgetBurn` (critical) / `ReposteriaHigh5xxRate` | Muchos 5xx | Ruta afectada (`topk(5, sum by (route) (rate(http_requests_total{status=~"5.."}[5m])))`); ¿despliegue reciente? → rollback; congelar cambios. |
| `ReposteriaHighLatencyP95` / `ReposteriaEventLoopLag` / `ReposteriaLoadShedding` | Saturación | Escalar réplicas; CPU; comprobar si es un ataque (429, `rate_limit_blocked_total{scope}`). |
| `ReposteriaRateLimitSpike` / `ReposteriaHigh429Rate` | Abuso o límites demasiado bajos | Ámbito atacado; reglas WAF/Attack Challenge Mode; si son clientes reales, subir límites temporalmente. |
| `ReposteriaAdminLoginFailures` / `ReposteriaSecurityAlert` (`admin.*`) | Ataque al panel o cuenta comprometida | `/admin/auditoria`; revocar sesiones y forzar cambio de contraseña; challenge en `/admin/login`. |
| `ReposteriaPaymentFailures` / `ReposteriaWebhookErrors` | Pagos o webhooks fallan | status.stripe.com; `invalid_signature` → `STRIPE_WEBHOOK_SECRET`; `mismatch`/`missing` → revisar a mano; ráfagas pequeñas → *card testing* (Radar). |
| `payment.amount_mismatch` (app, critical) | Importe pagado ≠ total del pedido | No preparar el pedido; revisar en Stripe; reembolso si procede. |
| `ReposteriaJobsStalled` / `ReposteriaJobsDelayed` / `ReposteriaCronJobNotSucceeding` | Cola parada: emails sin enviar y pagos sin conciliar | ¿Se llama a `/api/cron/jobs`? (scheduler, CronJob o Vercel Cron, que hoy es diario); prueba manual con `CRON_SECRET`. |
| `ReposteriaJobsFailed` / `jobs.failed` | Trabajos con reintentos agotados | Corregir la causa (SMTP, credenciales) y reencolar: `UPDATE "Job" SET status='PENDING', attempts=0, "runAt"=now(), "lastError"=NULL WHERE id=…` (el panel no lo ofrece aún). |
| `audit.chain_broken` (critical) | Posible manipulación del registro de auditoría | Preservar evidencias; comparar con la última huella `audit.anchor` guardada fuera; tratar como incidente de seguridad. |
| `ReposteriaBackupTooOld` / `ReposteriaBackupFailed` / `ReposteriaBackupMetricsMissing` | RPO en riesgo | Log de la tarea (`journalctl -u reposteria-backup`, logs del contenedor `backup` o del Job); credenciales, disco, `BACKUP_AGE_RECIPIENT`; lanzar copia manual y verificar `.sha256`. |
| `HostDiskAlmostFull` / `HostDiskWillFillIn24h` | Disco | Copias locales, logs, volúmenes Docker; nunca borrar a mano ficheros de Postgres ni del WAL. |
| `ReposteriaTLSCertExpiringSoon` | Certificado a punto de caducar | Renovación (certbot/cert-manager/proveedor). |
| `ReposteriaInstanceDown` / `ReposteriaFrequentRestarts` / `ReposteriaHighMemory` | Réplica caída o en bucle (OOM) | Logs; límite de memoria (768 MiB); procesado de imágenes. |
| Falta el heartbeat del `Watchdog` | Prometheus o Alertmanager caídos | Restaurar la pila de monitorización; mientras tanto, solo hay monitores externos y alertas de la app. |

## 9. Puesta en marcha (pendiente)

1. Volver a pasar `promtool check config/rules` y `amtool check-config` tras cada cambio en
   `infra/monitoring/` (hechos el 13/10/2026 sin errores).
2. Crear los monitores externos y el heartbeat; sustituir `reposteria.example.com` y los
   emails de ejemplo.
3. Generar `METRICS_TOKEN` (≥ 32 caracteres) y definir `ALERT_EMAIL` y/o
   `ALERT_WEBHOOK_URL` (la app avisa al arrancar si faltan).
4. Provocar una alerta de prueba de cada canal y anotar que llega.

## 10. Incoherencias conocidas entre código y configuración

Las detectadas en la revisión (readiness «BD + Redis», «cachés» en Redis, cola diaria en
Vercel, reintento desde el panel) están corregidas. Quedan:

- Las copias base y el envío del WAL (autoalojado) no publican métricas propias y no hay alerta
  sobre `pg_stat_archiver` (`postgresql.conf` la menciona).
- No hay agregador de logs configurado: la retención de logs es la del proveedor.
