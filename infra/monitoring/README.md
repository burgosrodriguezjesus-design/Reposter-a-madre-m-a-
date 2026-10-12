# Monitorización y alertas

> **Plantilla no probada con Prometheus/Alertmanager reales.** En este entorno solo se
> ha comprobado que los YAML parsean (`python3` + `yaml.safe_load`), que
> `docker compose config` acepta `docker-compose.monitoring.yml`, que
> `backup-with-metrics.sh` pasa `bash -n` y unas comprobaciones propias de coherencia
> (nombres de métricas, etiquetas `severity`, anclas de runbook). **`promtool` y
> `amtool` no están disponibles aquí**, así que la sintaxis PromQL y la configuración
> de Alertmanager no se han validado con las herramientas oficiales. Antes de
> desplegar:
>
> ```bash
> promtool check config prometheus.yml
> promtool check rules alerts.yml slo.yml
> amtool check-config alertmanager.yml
> ```

## Contenido

| Fichero | Qué hace |
| --- | --- |
| `prometheus.yml` | Scrape de `/api/metrics` de **cada réplica** con `Authorization: Bearer` (token leído de fichero), sondas blackbox (readiness interna y HTTPS pública), `postgres_exporter`, `redis_exporter`, `node_exporter` y la propia pila. Variantes comentadas para Kubernetes, PgBouncer y Supabase. |
| `alerts.yml` | Reglas de alerta (ver tabla de abajo). |
| `slo.yml` | SLO de disponibilidad **99,95 %** a 30 días: reglas de registro y alertas de *burn rate* multi-ventana. |
| `alertmanager.yml` | Rutas por severidad, silencio nocturno de avisos, inhibiciones, email + webhook de chat (Slack; Discord/Teams comentados) y *heartbeat* del Watchdog. |
| `blackbox.yml` | Módulos de `blackbox_exporter`. |
| `docker-compose.monitoring.yml` | Pila autoalojada (Prometheus, Alertmanager, blackbox, node, postgres y redis exporters) endurecida y escuchando solo en `127.0.0.1`. |
| `backup-with-metrics.sh` | Envuelve `scripts/backup.sh` y publica métricas de la copia para `node_exporter` (textfile). |
| `uptime-checks.md` | Monitores externos (UptimeRobot / Better Stack) cada minuto desde varias regiones y cómo encajan con el SLO. |
| `secrets/` | Ficheros de secretos de la pila (ignorados por git). |

## Métricas de la app que se usan

`/api/metrics` (formato Prometheus, por instancia, exige `Bearer $METRICS_TOKEN`):

| Métrica | Tipo | Uso |
| --- | --- | --- |
| `http_requests_total{route,method,status}` | counter | Tasa de 5xx, 429 y SLO |
| `http_request_duration_seconds{route}` | histogram | Latencia p95 |
| `orders_created_total`, `orders_failed_total{reason}` | counter | Pedidos fallidos |
| `payments_succeeded_total`, `payments_failed_total` | counter | Fallos de pago |
| `webhook_events_total{type,result}` | counter | Webhooks de Stripe con error |
| `jobs_processed_total{type,result}`, `jobs_pending`, `jobs_failed` | counter/gauge | Cola de trabajos |
| `jobs_oldest_pending_seconds` | gauge | Atraso de la cola (extra, ya expuesta por la app) |
| `rate_limit_blocked_total{scope}` | counter | Picos de bloqueos |
| `admin_login_failures_total`, `admin_login_success_total` | counter | Fuerza bruta al panel |
| `security_alerts_total{type}` | counter | Alertas de seguridad de la app |
| `db_up`, `redis_up` | gauge | Dependencias vistas desde la app (`redis_up = -1`: Redis no configurado) |
| `load_shed_total{kind}` | counter | Descarte de carga (extra) |
| `process_*`, `nodejs_*` | gauge | Memoria, reinicios, event loop |

> Si `http_requests_total` / `http_request_duration_seconds` aún no aparecen en la
> salida de `/api/metrics`, las alertas de latencia, 5xx y SLO **no pueden saltar**
> (no hay series). Compruébalo con
> `curl -s -H "Authorization: Bearer $METRICS_TOKEN" http://app:3000/api/metrics | grep ^http_`.

Las métricas son **por proceso**: cada réplica se scrapea por separado (DNS SD en
Compose, Endpoints/ServiceMonitor en Kubernetes). Scrapear a través del balanceador
mezclaría réplicas al azar. Los gauges de la cola (`jobs_*`) son globales (leen la BD)
y se repiten en cada réplica: las reglas usan `max()`.

## Alertas

| Grupo | Alertas (warning / critical) |
| --- | --- |
| Disponibilidad | `ReposteriaInstanceDown`, `ReposteriaAllInstancesDown`, `ReposteriaCapacityDegraded`, `ReposteriaReadinessFailing` (una / todas), `ReposteriaDatabaseUnreachable`, `ReposteriaRedisUnreachable`, `ReposteriaSiteDownExternal`, `ReposteriaTLSCertExpiringSoon`, `ReposteriaFrequentRestarts` |
| Rendimiento | `ReposteriaHighLatencyP95` (p95 > 1 s), `ReposteriaRouteHighLatencyP95`, `ReposteriaHigh5xxRate` (> 2 %), `ReposteriaHighMemory`, `ReposteriaEventLoopLag`, `ReposteriaLoadShedding` |
| Seguridad | `ReposteriaRateLimitSpike`, `ReposteriaHigh429Rate`, `ReposteriaAdminLoginFailures` (> 10 / > 50 en 15 min), `ReposteriaSecurityAlert` |
| Pedidos y pagos | `ReposteriaPaymentFailures`, `ReposteriaOrderCreationFailures`, `ReposteriaWebhookErrors` |
| Cola de trabajos | `ReposteriaJobsFailed`, `ReposteriaJobsFailingRate`, `ReposteriaJobsBacklog`, `ReposteriaJobsDelayed`, `ReposteriaJobsStalled`, `ReposteriaCronJobNotSucceeding` (Kubernetes) |
| Infraestructura | `PostgresDown`, `PostgresConnectionsHigh` (> 80 % / > 95 %), `RedisDown`, `RedisMemoryHigh` (> 80 %), `HostDiskAlmostFull` (> 85 % / > 95 %), `HostDiskWillFillIn24h` |
| Copias | `ReposteriaBackupTooOld` (> 2 h), `ReposteriaBackupFailed`, `ReposteriaBackupMetricsMissing` |
| SLO (`slo.yml`) | `ReposteriaErrorBudgetBurn` (rápida: critical / lenta: warning), `ReposteriaErrorBudgetExhausted` |
| Pila | `Watchdog`, `MonitoringTargetDown`, `PrometheusRuleEvaluationFailures`, `AlertmanagerNotificationsFailing` |

Severidades: **critical** llega al momento por email + chat; **warning** por email y
se retiene de 00:00 a 07:30 (Europe/Madrid). Las alertas con el mismo nombre y
distinta severidad se inhiben entre sí y una caída total inhibe los síntomas
derivados (ver `inhibit_rules`).

## SLO 99,95 %

- SLI: proporción de peticiones de clientes (sin `/api/health*`, `/api/metrics`,
  `/api/cron*`) que **no** terminan en 5xx. Los 4xx/429 no consumen presupuesto.
- Presupuesto: 0,05 % ≈ **21,6 min de caída total en 30 días**.
- Alertas multi-ventana (SRE Workbook):

  | Tipo | Ventanas | Factor de quema | Umbral de ratio de error | Severidad |
  | --- | --- | --- | --- | --- |
  | Rápida | 1 h y 5 min | 14,4 | 0,72 % | critical |
  | Rápida | 6 h y 30 min | 6 | 0,3 % | critical |
  | Lenta | 1 d y 2 h | 3 | 0,15 % | warning |
  | Lenta | 3 d y 6 h | 1 | 0,05 % | warning |

- Consultas (consola de Prometheus o Grafana):

  ```promql
  # Disponibilidad a 30 días (lado servidor)
  reposteria:slo_availability:ratio30d
  # Presupuesto restante (1 = intacto, < 0 = SLO incumplido)
  reposteria:slo_error_budget_remaining:ratio30d
  # Burn rate de la última hora (1 = se agota justo en 30 días)
  reposteria:slo_error_ratio:rate1h / 0.0005
  # Disponibilidad vista por las sondas HTTPS públicas
  reposteria:slo_probe_availability:ratio30d
  ```

- Limitación: si la app está totalmente caída no hay peticiones que contar; esa
  indisponibilidad la miden las sondas (`blackbox-public`) y los monitores externos de
  `uptime-checks.md`, que son la referencia para el informe mensual del SLO.
- El 99,95 % es un **objetivo** sujeto a presupuesto y pruebas: con una sola región,
  un único Postgres primario o un único host de Docker no es alcanzable de forma
  realista (cualquier mantenimiento de 22 min lo consume).

## Despliegue

### Autoalojado (Docker Compose)

```bash
cd infra/monitoring
install -d -m 0700 secrets
printf '%s' "$METRICS_TOKEN"     > secrets/metrics_token
printf '%s' "$SMTP_PASSWORD"     > secrets/smtp_password
printf '%s' "$ALERT_WEBHOOK_URL" > secrets/alert_webhook_url
printf '%s' "https://uptime.betterstack.com/api/v1/heartbeat/XXXX" > secrets/heartbeat_url
printf '%s' "contraseña-del-rol-monitoring" > secrets/postgres_exporter_password
chmod 0644 secrets/*        # los contenedores corren como nobody (65534)
REPOSTERIA_APP_NETWORK=reposteria_default docker compose -f docker-compose.monitoring.yml up -d
```

- Sustituye `reposteria.example.com`, los emails de `alertmanager.yml` y el
  `smtp_smarthost`.
- Rol de PostgreSQL para el exporter (no uses el de la app):
  `CREATE ROLE monitoring LOGIN PASSWORD '...'; GRANT pg_monitor TO monitoring;`
- Accede a Prometheus/Alertmanager por túnel SSH; no los publiques.
- `ReposteriaInstanceDown` solo ve réplicas que siguen en el DNS de Docker: una
  réplica eliminada desaparece del objetivo. `ReposteriaAllInstancesDown` y
  `ReposteriaCapacityDegraded` cubren ese caso.

### Kubernetes

- Con kube-prometheus-stack: `infra/k8s/optional/servicemonitor.yaml` para el scrape y
  las reglas de `alerts.yml`/`slo.yml` envueltas en un `PrometheusRule`
  (`spec.groups` = el contenido de `groups`). La etiqueta `job` será
  `reposteria-app` (nombre del Service).
- kube-state-metrics aporta `kube_cronjob_status_last_successful_time` para
  `ReposteriaCronJobNotSucceeding` y `ReposteriaBackupTooOld`.
- `node_exporter` del clúster cubre el disco de los nodos; el volumen de copias
  (`reposteria-backups`) se vigila con `kubelet_volume_stats_*` si tu Prometheus las
  recoge.

### Vercel + Supabase + Upstash (recomendado)

- En Vercel cada invocación puede caer en una instancia distinta y los contadores
  en memoria no son globales: scrapear `/api/metrics` por la URL pública da datos
  parciales. Usa **Vercel Observability** / *Log Drains* para latencia y errores, los
  **monitores externos** (`uptime-checks.md`) para disponibilidad y las alertas por
  email/webhook que emite la propia app (`ALERT_EMAIL`, `ALERT_WEBHOOK_URL`).
- Supabase: endpoint de métricas del proyecto (variante comentada en
  `prometheus.yml`; los nombres difieren de `postgres_exporter`) y alertas de uso en
  su dashboard. Upstash: alertas de uso/memoria en su consola.
- Las alertas de cola y pagos siguen siendo útiles si un Prometheus externo scrapea
  `/api/metrics` (los gauges `jobs_*` y `db_up` leen la BD, así que son globales
  aunque la instancia cambie). Restringe esa ruta a su IP en `infra/vercel/firewall.json`.

### Copias de seguridad (autoalojado)

`backup-with-metrics.sh` ejecuta `scripts/backup.sh` y escribe
`reposteria_backup_*` en el directorio del textfile collector. Ejemplo con systemd:

```ini
# /etc/systemd/system/reposteria-backup.service
[Service]
Type=oneshot
EnvironmentFile=/etc/reposteria/backup.env   # 0600: DATABASE_URL (directa), BACKUP_DIR, BACKUP_AGE_RECIPIENT, BACKUP_RETENTION_DAYS
ExecStart=/opt/reposteria/infra/monitoring/backup-with-metrics.sh

# /etc/systemd/system/reposteria-backup.timer
[Timer]
OnCalendar=hourly
RandomizedDelaySec=300
Persistent=true
[Install]
WantedBy=timers.target
```

## Runbooks

<a id="app-caida-o-sin-readiness"></a>
### App caída o sin readiness

1. ¿Afecta a una réplica o a todas? `docker compose ps` / `kubectl -n reposteria get pods`.
2. `/api/health` (vida, sin BD) vs `/api/health/ready` (BD + Redis): si solo falla
   readiness, sigue con [Base de datos](#base-de-datos) o [Redis](#redis).
3. Logs de la réplica (errores de arranque: la app **falla al arrancar** si falta una
   variable obligatoria en producción, ver `src/lib/env.ts`).
4. Reinicios frecuentes (`ReposteriaFrequentRestarts`, `ReposteriaHighMemory`): OOM;
   sube el límite de memoria o revisa la subida/procesado de imágenes.
5. Si todo está caído desde fuera pero dentro va bien: DNS, certificado, proxy/WAF
   (Cloudflare/Vercel Firewall) o Attack Challenge Mode bloqueando los monitores.

<a id="base-de-datos"></a>
### Base de datos

1. `PostgresDown`: estado del servicio/contenedor, disco lleno ([Disco](#disco)),
   logs de PostgreSQL. En Supabase: página de estado y dashboard del proyecto.
2. `PostgresConnectionsHigh`: `SELECT state, count(*) FROM pg_stat_activity GROUP BY 1;`.
   Muchas `idle in transaction` → consultas colgadas; revisa `connection_limit` de
   `DATABASE_URL` × réplicas frente al pool de PgBouncer y `max_connections`.
3. Si hay que restaurar: `scripts/restore.sh` (ver README principal) o PITR de Supabase.

<a id="redis"></a>
### Redis

1. Sin Redis el rate limit global y las cachés se degradan y la readiness falla.
2. `RedisMemoryHigh`: `INFO memory`; fija `maxmemory` y `maxmemory-policy`
   (`volatile-lru` si solo hay claves con TTL). En Upstash, revisa el plan.

<a id="latencia-o-errores-5xx"></a>
### Latencia o errores 5xx

1. ¿Una ruta o todas? `ReposteriaRouteHighLatencyP95` indica la ruta.
2. Consulta: `topk(5, sum by (route) (rate(http_requests_total{status=~"5.."}[5m])))`.
3. ¿Despliegue reciente? Vuelve a la versión anterior (rollback en Vercel o
   `kubectl rollout undo`).
4. Saturación (`ReposteriaEventLoopLag`, `ReposteriaLoadShedding`): escala réplicas y
   comprueba si es un ataque ([Picos de 429](#picos-de-429-o-ataque)).
5. Si se quema el presupuesto del SLO, congela cambios no urgentes.

<a id="picos-de-429-o-ataque"></a>
### Picos de 429 o ataque

1. `sum by (scope) (rate(rate_limit_blocked_total[5m]))` para ver qué se ataca.
2. Vercel: **Firewall → Traffic** y, si hace falta, **Attack Challenge Mode**
   (`infra/vercel/README.md`). Cloudflare: **Security → Events** y nivel de seguridad
   *I'm Under Attack* (`infra/cloudflare/README.md`). Autoalojado: logs del proxy y
   bloqueo de IP/ASN en el WAF.
3. Si son clientes reales (p. ej. campaña), sube los límites de forma temporal.

<a id="fallos-de-login-en-el-panel"></a>
### Fallos de login en el panel

1. Revisa el registro de auditoría y los intentos de acceso en `/admin`.
2. ¿Una cuenta concreta? Fuerza el cambio de contraseña y **revoca sus sesiones**.
3. Muchas IPs (credential stuffing): regla de challenge en `/admin/login` en el WAF.
4. `ReposteriaSecurityAlert`: el tipo indica qué ha detectado la app (pago tardío,
   firma inválida, etc.).

<a id="pagos-y-webhooks"></a>
### Pagos y webhooks

1. Estado de Stripe (status.stripe.com) y **Developers → Webhooks** (entregas fallidas).
2. `invalid_signature`: `STRIPE_WEBHOOK_SECRET` no coincide con el endpoint (¿rotado?)
   o alguien envía peticiones falsas.
3. `mismatch`/`missing`: importe o pedido que no cuadra; revisa el pedido a mano
   antes de prepararlo.
4. La conciliación de `/api/cron/jobs` recupera pagos cuyos webhooks se perdieron:
   comprueba que el cron se ejecuta ([Cola de trabajos](#cola-de-trabajos)).
5. Muchos pagos fallidos pequeños y seguidos: posible *card testing*; activa Radar
   rules en Stripe y endurece el rate limit de `/api/orders`.

<a id="cola-de-trabajos"></a>
### Cola de trabajos

1. ¿Se llama a `/api/cron/jobs` cada minuto? Kubernetes: `kubectl -n reposteria get
   cronjob,jobs`; Vercel Cron (cada minuto requiere plan Pro) o planificador externo.
2. Prueba manual: `curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://SITIO/api/cron/jobs`.
3. `jobs_failed > 0`: trabajos con reintentos agotados (SMTP caído, credenciales).
   Corrige la causa y reencólalos (función `retryJob` de `src/lib/jobs.ts`; si el
   panel aún no la expone, `UPDATE` del trabajo a `PENDING` con `attempts = 0`).
4. `ReposteriaCronJobNotSucceeding` para `reposteria-daily`: la retención RGPD y los
   recordatorios no se están ejecutando.

<a id="disco"></a>
### Disco

1. `du -xh --max-depth=1 / | sort -h`; candidatos: copias locales (`BACKUP_DIR`),
   logs, imágenes y volúmenes de Docker (`docker system df`).
2. No borres a mano ficheros de PostgreSQL ni del WAL.

<a id="copias-de-seguridad"></a>
### Copias de seguridad

1. Último log de `reposteria-backup.service` (`journalctl -u reposteria-backup`) o del
   Job de Kubernetes.
2. Causas típicas: credenciales de `DATABASE_URL`, `pg_dump` más antiguo que el
   servidor, disco lleno, `BACKUP_AGE_RECIPIENT` vacío.
3. Lanza una copia manual y verifica el `.sha256`.
4. Prueba de restauración mensual con `scripts/restore.sh` contra una BD temporal y
   anota el RTO real.
