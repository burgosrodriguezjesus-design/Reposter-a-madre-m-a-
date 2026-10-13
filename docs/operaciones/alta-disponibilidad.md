# Alta disponibilidad y escalabilidad

> Estado: documento de operación. Todo lo marcado como **pendiente** no está implementado
> o no se ha probado. Las plantillas de `infra/` (Kubernetes, Cloudflare, Vercel Firewall,
> Prometheus/Alertmanager, Docker Compose de producción) **no se han probado en un entorno
> real** (lo indican sus propias cabeceras); solo se ha validado su sintaxis y, en algunos
> casos, partes concretas con binarios locales.

## 1. Objetivo: 99,95 %

| Ventana | Indisponibilidad permitida |
| --- | --- |
| 30 días (ventana del SLO en `infra/monitoring/slo.yml`) | ≈ 21,6 min |
| Mes medio (30,44 días) | ≈ 21,9 min |
| 1 año | ≈ 4 h 23 min |

- SLI del lado servidor: proporción de peticiones de clientes que no terminan en 5xx
  (excluye `/api/health*`, `/api/metrics`, `/api/cron*`; los 4xx/429 no consumen
  presupuesto). Ver `infra/monitoring/slo.yml`.
- Fuente de verdad para el informe mensual: los monitores externos
  (`infra/monitoring/uptime-checks.md`), porque una caída total no genera peticiones
  que contar. **Pendiente**: no se ha creado ningún monitor real.
- El 99,95 % es un **objetivo**, no un resultado medido. Una sola caída de 22 minutos
  (un reinicio del host, una migración larga, un fallo del proveedor) agota el mes.

### Qué hace falta de verdad para llegar

| Requisito | Por qué | Estado en este repositorio |
| --- | --- | --- |
| ≥ 2 instancias de la app en ≥ 2 zonas de disponibilidad | Un fallo de nodo o zona no debe tirar el servicio | Vercel: gestionado por la plataforma, pero `vercel.json` fija **una sola región** (`cdg1`). Kubernetes: HPA 3–20 + `topologySpreadConstraints` por zona (`infra/k8s/deployment.yaml`, plantilla no probada). Compose: 3 réplicas **en un único host**. |
| PostgreSQL gestionado con alta disponibilidad (réplica en espera + failover automático) | La BD es el punto único de fallo: sin BD no hay pedidos (`/api/health/ready` devuelve 503) | **Pendiente**: el repo no aprovisiona ninguna réplica. Compose tiene un único `postgres`; Kubernetes asume una BD externa. Hay que contratarlo (Supabase/Neon con HA, RDS Multi-AZ, etc.). |
| Redis gestionado | Límites de peticiones compartidos entre instancias | Opcional por diseño (ver §6). Upstash o similar en Vercel; contenedor sin persistencia en Compose. |
| CDN/WAF delante | DDoS, bots, abuso | Vercel Firewall (`infra/vercel/`), Cloudflare (`infra/cloudflare/`, solo para autoalojado) o ModSecurity + OWASP CRS (`infra/nginx/`). Ninguna regla publicada en una cuenta real. |
| Despliegues sin corte y con vuelta atrás | Los despliegues son la causa más habitual de caídas | Vercel: `.github/workflows/deploy.yml` (staging → aprobación → despliegue sin dominio → humo → `promote` → humo → rollback automático). Kubernetes: `RollingUpdate` con `maxUnavailable: 0`. Compose: `docker compose up -d` recrea **todas** las réplicas a la vez (aviso en `docker-compose.prod.yml`). |
| Monitorización y guardia | Detectar en ~2 min y actuar | Reglas en `infra/monitoring/` (plantilla no probada con Prometheus real). Ver `monitorizacion-y-alertas.md`. |
| Restauración ensayada | Un incidente de datos no puede durar horas | Simulacro realizado una vez; ver `recuperacion-desastres.md`. |

**Un único host Docker no alcanza el 99,95 %**: cualquier reinicio del servidor, de
Docker o un fallo de disco es una caída total, y Postgres, Redis y el WAF también son
únicos. `docker-compose.prod.yml` solo da redundancia de **proceso** (lo dice su
cabecera).

## 2. Arquitecturas de referencia

### (a) Vercel + Postgres gestionado (Supabase/Neon) + Upstash Redis + Cloudflare DNS — recomendada

| Capa | Pieza | Notas |
| --- | --- | --- |
| DNS | Cloudflare en modo *DNS only* (nube gris) | `infra/cloudflare/README.md`: **no** poner el proxy de Cloudflare delante de Vercel (Vercel lo desaconseja: su DDoS, firewall y caché dejan de ver al cliente). |
| Borde, CDN y WAF | Vercel (CDN + Firewall) | `infra/vercel/firewall.json`: CRS gestionado, bot protection, rate limits por ruta, `/api/metrics` solo desde la IP de Prometheus. |
| App | Funciones de Vercel | Escalado automático. `vercel.json` → `regions: ["cdg1"]` (una región). |
| BD | Supabase/Neon | `DATABASE_URL` = *transaction pooler* (6543) con `?pgbouncer=true&sslmode=require`; `DIRECT_URL` solo para migraciones (`.env.example`). Alta disponibilidad y PITR según el plan contratado. |
| Redis | Upstash | Solo límites de peticiones (§6). |
| Trabajos | `/api/cron/jobs` + `kickJobs()` | `vercel.json` programa `/api/cron/jobs` una vez al día (límite del plan Hobby); `.github/workflows/cron-jobs.yml` lo llama **cada 5 minutos** (entorno `cron` con `CRON_SECRET` y `PRODUCTION_URL`). Con el plan Pro: `* * * * *` en `vercel.json` y `CRON_VIA_GITHUB=false`. Además `kickJobs()` procesa la cola tras cada petición que encola y tras cada alerta. |

Límites de esta variante: una sola región de Vercel y una sola región de BD. La pérdida
de región o de proveedor no tiene failover automático (**pendiente**; ver
`recuperacion-desastres.md`).

### (b) Kubernetes (`infra/k8s/`)

| Pieza | Fichero | Configuración |
| --- | --- | --- |
| Deployment | `deployment.yaml` | Sin `replicas` (lo gestiona el HPA); `RollingUpdate` `maxUnavailable: 0`, `maxSurge: 25%`; reparto por zona (`ScheduleAnyway`) y por nodo (`DoNotSchedule`); `preStop` 5 s; límites 1 CPU / 768 Mi. |
| Sondas | `deployment.yaml` | `startupProbe` y `livenessProbe` → `/api/health` (no toca la BD: un fallo de BD no reinicia pods); `readinessProbe` → `/api/health/ready` (sin BD el pod sale del Service). |
| HPA | `hpa.yaml` | 3–20 réplicas; CPU 65 %, memoria 75 %; subida hasta +100 % o +4 pods cada 30 s; bajada con ventana de 5 min y como mucho 10 %/min. Requiere metrics-server. |
| PDB | `pdb.yaml` | `minAvailable: 2`, `unhealthyPodEvictionPolicy: AlwaysAllow`. |
| NetworkPolicy | `networkpolicy.yaml` | Denegar todo + DNS, ingress→app, Prometheus→app, cron→app, app→PgBouncer/Redis, app→Internet 443/587/465 sin rangos privados ni metadatos. Requiere un CNI que las aplique. |
| CronJobs | `cronjobs.yaml` | `reposteria-jobs` cada minuto, `reposteria-daily` 04:17 (Europe/Madrid), `reposteria-backup` cada hora (:07) con subida rclone fuera del clúster. |
| Ingress | `ingress.yaml` | ingress-nginx. **Pendiente**: el propio fichero avisa de que ingress-nginx está retirado (mantenimiento hasta marzo de 2026); hay que migrar a otro controlador o a Gateway API. |

PostgreSQL, PgBouncer y Redis no se despliegan aquí: se asumen en el namespace
`reposteria-data` o gestionados. La imagen del CronJob de copias **no** la construye
este repositorio (aviso en `cronjobs.yaml`). Todo es plantilla no probada en un clúster.

### (c) Docker Compose en un único host (`docker-compose.prod.yml`) — modo degradado

`waf` (nginx + ModSecurity/CRS, único servicio con puertos) → `app` ×3 → `pgbouncer` →
`postgres` 16; `redis`; `scheduler` (supercronic: `/api/cron/jobs` cada minuto,
`/api/cron` 03:17 UTC); `backup` (supercronic). Redes internas, `read_only`,
`cap_drop: ALL`, `no-new-privileges`, usuarios no root.

Limitaciones que impiden el objetivo: un host, un Postgres sin réplica, un Redis, un WAF;
`up -d` recrea las 3 réplicas a la vez; Docker sin Swarm **no reinicia contenedores
`unhealthy`** (solo los que terminan), así que una réplica colgada sigue en el
balanceador hasta que nginx la marca caída por fallos pasivos (`max_fails=3
fail_timeout=10s`). Para acercarse: ≥ 2 hosts con balanceador o IP flotante, réplica de
Postgres en otro host y copias fuera del servidor.

## 3. Balanceo de carga

| Despliegue | Balanceador | Detalle |
| --- | --- | --- |
| Compose | nginx (`infra/nginx/snippets/http-upstream.conf`) | `least_conn`; `server app:3000 resolve` (re-resuelve las IP de Docker cada 10 s); `max_fails=3 fail_timeout=10s`; `keepalive 32` hacia Node. Reintento en otra réplica solo para `GET /_next/static/` (incluido 404 durante despliegues graduales); el webhook de Stripe con `proxy_next_upstream off`. |
| Kubernetes | Service + ingress-nginx | La readiness saca del Service los pods sin BD. |
| Vercel | Plataforma | Sin configuración propia. |

Las métricas de la app son **por instancia**: Prometheus scrapea cada réplica, nunca a
través del balanceador (`infra/monitoring/prometheus.yml`).

## 4. Autoescalado

- Kubernetes: HPA de §2(b). Señales para revisar los umbrales: `ReposteriaEventLoopLag`,
  `ReposteriaLoadShedding`, p95 por ruta (alertas en `infra/monitoring/alerts.yml`).
- Vercel: automático; vigilar el gasto (Spend Management, `infra/vercel/README.md`) y
  las conexiones a la BD (cada instancia abre su propio pool).
- Compose: no hay autoescalado. Escalado manual (`--scale app=N`) limitado por la CPU del
  único host.

## 5. Política de CDN y caché

Regla: **solo se cachea contenido público o estático; nunca datos personales ni
respuestas de sesión.**

| Contenido | Cabecera de la app | Caché compartida |
| --- | --- | --- |
| `/_next/static/*` (con hash) | La de Next.js (inmutable) | Cloudflare `rp_cache_next_static` (respeta el origen); nginx `static_cache` 30 d. |
| `/_next/image` | La de Next.js | nginx `public_cache` 1 d con clave URL + formato; respeta `Cache-Control` y `Set-Cookie`. |
| `/demo/*` | `public, max-age=604800, stale-while-revalidate=86400` (`next.config.ts`) | nginx `public_cache` 1 d. |
| `/uploads/{products,site,categories}/*.webp` | `public, max-age=31536000, immutable` (`src/app/uploads/[...path]/route.ts`; solo fotos públicas) | Cloudflare la excluye (`/uploads/` está en `rp_cache_bypass_private`). |
| Páginas públicas (inicio, categoría, producto…) | ISR: `revalidate` 300–600 s | No se fuerzan en el CDN. |
| Panel y páginas con datos personales (`/admin`, `/finalizar-pedido`, `/carrito`, `/pedido/`, `/presupuesto/`, `/seguimiento`, `/recordatorios`, `/baja`, `/tarjetas-regalo`, `/privacidad/derechos`) | `private, no-store, max-age=0` + `X-Robots-Tag: noindex` (`src/proxy.ts`) | Cloudflare: bypass explícito de todas salvo `/tarjetas-regalo` y `/privacidad/derechos` (no se cachean igualmente: Cloudflare no cachea HTML por defecto y la app envía `no-store`). |
| API | `PRIVATE_NO_STORE` (`src/lib/http.ts`) en pedidos, subidas y WebAuthn; `no-store`/`private, no-store` en las demás rutas GET; las rutas sin cabecera explícita solo atienden POST/DELETE (no cacheables) | Cloudflare: bypass de `/api/*`. |
| `/api/media` (fotos privadas, URL firmada) | `private, max-age=300` | Nunca en caché compartida. |
| Cualquier petición con cookie `__Host-` | — | Cloudflare: bypass. |

Microcaché en memoria por instancia con *single-flight* (`src/lib/micro-cache.ts`) solo
para datos públicos o agregados: ajustes 15 s, categorías y productos 30 s, ventas por
producto 5 min, horario y bloqueos 30 s, ocupación agregada 5 s.

## 6. Redis: papel y degradación

- Uso: **solo** límites de peticiones y penalizaciones por IP compartidos entre
  instancias (`src/lib/limiter.ts`). Las claves son huellas HMAC, no IP. No guarda
  sesiones, caché ni colas.
- Cliente (`src/lib/redis.ts`): `commandTimeout` 300 ms, `connectTimeout` 2 s,
  `maxRetriesPerRequest: 1`, sin cola offline.
- Configuración autoalojada (`infra/redis/redis.conf`): sin persistencia (`save ""`,
  `appendonly no`), `maxmemory 256mb` con `allkeys-lru`, ACL y comandos peligrosos
  desactivados.
- **Si Redis cae**: cada instancia pasa a contadores en memoria. Consecuencia: el límite
  efectivo por IP se multiplica por el número de instancias y se pierden las
  penalizaciones acumuladas. Pedidos, pagos y panel siguen funcionando.
  `/api/health/ready` sigue devolviendo **200** con `"redis": false` (la readiness solo
  depende de la BD). Lo detectan `redis_up` (0 = caído, −1 = no configurado) y las
  alertas `ReposteriaRedisUnreachable` / `RedisDown`.
- Compose: la app tiene `depends_on: redis: service_healthy`, así que un arranque en frío
  de toda la pila sí necesita Redis.

## 7. Pool de conexiones a la base de datos

| Elemento | Valor | Fichero |
| --- | --- | --- |
| PgBouncer | `pool_mode = transaction`, `max_client_conn = 500`, `default_pool_size = 20`, `reserve_pool_size = 5`, `max_db_connections = 40`, `reposteria_app max_user_connections = 40`, `query_wait_timeout = 15`, `idle_transaction_timeout = 60`, `max_prepared_statements = 200`; TLS obligatorio hacia Postgres | `infra/pgbouncer/pgbouncer.ini` |
| Prisma (Compose) | `?pgbouncer=true&connection_limit=10` por instancia | `infra/postgres/gen-secrets.sh` (`app.env.fragment`) |
| Prisma (Kubernetes) | `?pgbouncer=true&connection_limit=10` (comentario) | `infra/k8s/externalsecret.yaml` |
| Prisma (Vercel + Supabase) | pooler de transacción + `?pgbouncer=true`; **no se fija `connection_limit`** en la documentación del repo. En serverless conviene empezar con `connection_limit=1` y ajustar midiendo | `.env.example`, `README.md` |
| PostgreSQL | `max_connections = 100`, `idle_in_transaction_session_timeout = 60s`; `statement_timeout`/`lock_timeout` por rol | `infra/postgres/postgresql.conf`, `prisma/sql/least-privilege.sql` |

Regla de dimensionado: `réplicas × connection_limit ≤ max_client_conn` de PgBouncer, y
`max_db_connections` + migraciones (directas) + copias (rol `reposteria_backup`,
`CONNECTION LIMIT 4`) + monitorización `< max_connections`. Con el HPA a 20 réplicas son
200 conexiones de cliente: caben en PgBouncer, que encola (hasta 15 s) sobre 40
conexiones reales. En las pruebas de carga el máximo observado fue 41 conexiones a
Postgres en todos los niveles (§10). Las migraciones usan `DIRECT_URL` (DDL no funciona
con PgBouncer en modo transacción).

## 8. Índices relevantes (`prisma/schema.prisma`)

- `Order`: únicos en `number`, `accessToken`, `stripeSessionId`, `idempotencyKey`,
  `quoteRequestId`; índices en `status`, `(scheduledDate, scheduledTime)`,
  `(status, createdAt)`, `customerEmailHash`, `customerPhoneHash`, `createdAt`.
- `Job`: `dedupeKey` único; `(status, runAt)` para la reserva de trabajos.
- `Product`: `slug` único; `categoryId`; `(active, archived, categoryId)`.
- `LoginAttempt`: `(ipHash, createdAt)`, `(emailHash, createdAt)`.
- `AuditLog`: `seq` único; `createdAt`, `(actorId, createdAt)`, `(action, createdAt)`,
  `(entity, entityId)`.
- Otros: `OrderItem(orderId|productId)`, `StripeEvent(processedAt)`,
  `Review(status, createdAt)`, `AbandonedCart(recoveredAt, emailSentAt, updatedAt)`,
  `GiftCard(purchaserEmailHash|recipientEmailHash)`, `DataRequest(status|emailHash)`.

Las búsquedas por email/teléfono usan índices ciegos HMAC (los campos van cifrados).

## 9. Cola asíncrona (outbox) y descarte de carga

### Cola de trabajos (`src/lib/jobs.ts`)

- Emails, WhatsApp y alertas se encolan en la **misma transacción** que el cambio que los
  origina: sin transacción confirmada no hay aviso; con ella, el aviso sale aunque el
  proceso caiga después.
- Reserva con `FOR UPDATE SKIP LOCKED` (varios procesadores sin duplicar); trabajos
  `RUNNING` abandonados > 5 min se reclaman.
- Reintentos: espera `30 s · 2^(intento−1)` (máx. 6 h) + hasta 20 % aleatorio;
  `maxAttempts` 8 por defecto (10 para alertas). Agotados → `FAILED` + alerta
  `jobs.failed`.
- Procesadores: `/api/cron/jobs` (cada minuto en Compose y Kubernetes; cada 5 minutos en
  Vercel Hobby con `cron-jobs.yml`, ver §2(a)) y `kickJobs()` tras la respuesta de las
  peticiones que encolan.
- Los trabajos `FAILED` se ven y se reintentan desde el panel: Registro de actividad →
  «Trabajos fallidos» (solo propietario; queda auditado `jobs.retried`).

### Descarte de carga (`src/lib/load.ts`, `src/proxy.ts`)

| Mecanismo | Disparo | Efecto |
| --- | --- | --- |
| Factor de carga | p99 del retardo del bucle de eventos (ventana ~10 s) > 200 ms / > 500 ms | Los límites por IP se multiplican por 0,5 / 0,25 |
| Descarte | p99 > `LOAD_SHED_DELAY_MS` (por defecto 1000 ms) | 503 + `Retry-After: 5` en rutas no críticas; métrica `load_shed_total{kind}` |
| Rutas que nunca se descartan | `/api/orders`, `/api/stripe/webhook`, `/api/health`, `/finalizar-pedido`, `/pedido/`, `/admin`, `/api/cron`, `/api/checkout` | — |
| Límite global por IP | 600 páginas / 240 API / 60 escrituras por minuto | 429; penalizaciones crecientes a IP que insisten |

Observación de las pruebas: a 5.000 y 10.000 VU hubo ~21.000 y ~40.000 respuestas 502 del
balanceador y solo 5 respuestas 503 de descarte. Es decir, la saturación se manifestó
como fallos/timeout de upstream antes de que el retardo del bucle de eventos superase el
umbral. **Pendiente**: investigar (umbral, señal de carga o límite de conexiones) en la
próxima prueba en staging.

## 10. Pruebas de carga reales

Fuente: `loadtest/results/local-4cpu-vu*.json`, generados con `loadtest/harness.mjs`.

**Advertencia**: se ejecutaron en **una sola máquina de 4 CPU** donde corrían a la vez las
3 instancias de la app, PgBouncer, PostgreSQL, Redis, nginx **y el propio generador de
carga** (que llegó a consumir hasta ~1 núcleo). El balanceador fue
`loadtest/results/nginx-loadtest.conf` (sin WAF ni `limit_req`; IP simulada con
`X-Loadtest-IP`). Los pedidos fueron de pago en tienda (sin Stripe). Duraciones de 60–90 s.
**No es una cifra de capacidad de producción.** Los JSON no registran la versión ni los
valores de `RATE_LIMIT_MULTIPLIER` o `LOAD_SHED_DELAY_MS` usados.

| VU | Duración (s) | Peticiones | req/s | Errores | Páginas p50 / p95 / p99 (ms) | API p95 (ms) | Pedidos p95 (ms) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 100 | 70 | 2.355 | 33 | 0 % | 9 / 49 / 107 | 28 | 109 |
| 500 | 73 | 10.095 | 139 | 0 % | 113 / 820 / 1.189 | 456 | 1.372 |
| 1.000 | 73 | 14.457 | 198 | 0,01 % (1 error de red) | 538 / 2.397 / 5.082 | 1.218 | 6.680 |
| 5.000 | 133 | 48.835 | 367 | **52,96 %** | 510 / 16.886 / 19.268 | 16.423 | 15.108 |
| 10.000 | 128 | 67.585 | 528 | **64,45 %** | 56 / 18.905 / 21.985 | 18.336 | 15.028 |

Las latencias incluyen las peticiones fallidas (por eso el p50 de 10.000 VU es bajo: muchos
502 rápidos).

| VU | Pedidos intentados | Confirmados al cliente | En BD | Perdidos (confirmados y no en BD) | Duplicados (misma Idempotency-Key) | En BD sin confirmación al cliente |
| --- | --- | --- | --- | --- | --- | --- |
| 100 | 39 | 39 | 39 | 0 | 0 | 0 |
| 500 | 159 | 159 | 159 | 0 | 0 | 0 |
| 1.000 | 223 | 223 | 223 | 0 | 0 | 0 |
| 5.000 | 350 | 274 | 275 | 0 | 0 | 1 |
| 10.000 | 372 | 240 | 240 | 0 | 0 | 0 |

Errores a 5.000 VU: 20.880 respuestas 502, 4.980 errores de red/timeout, 1 respuesta 429.
A 10.000 VU: 40.114 respuestas 502, 3.440 errores de red/timeout, 5 respuestas 503.
El arnés reintenta una vez cada pedido con la misma `Idempotency-Key` ante error de red o
5xx. El pedido "en BD sin confirmación" de 5.000 VU se creó, pero el cliente no recibió la
respuesta: no hay pérdida ni duplicado, pero el cliente no sabe que existe hasta que
reintente con la misma clave o reciba el email.

Conclusiones:

- Esa máquina satura en torno a **1.000 usuarios concurrentes** (p95 de páginas 2,4 s).
- **5.000 y 10.000 VU no se sostuvieron** (53 % y 64 % de errores). No se ha demostrado
  esa capacidad en ningún entorno.
- En **todos** los niveles: ningún pedido confirmado perdido ni duplicado.
- El cuello de botella fue la CPU de la app (media 181–225 % de núcleo para las 3
  instancias desde 500 VU); Postgres no pasó del 34 % de un núcleo y Redis del 3 %.

## 11. Plan de capacidad

### Qué escalar, en este orden

1. **Instancias de la app** (CPU): es el recurso que se agotó. En Kubernetes, `maxReplicas`
   y nodos; en Compose, más hosts (no más réplicas en el mismo host).
2. **Pool de PgBouncer y `connection_limit`** si `PostgresConnectionsHigh` o colas en
   PgBouncer (`query_wait_timeout`).
3. **PostgreSQL** (CPU/IOPS) y réplica de lectura solo si las métricas lo justifican.
4. **Redis**: carga despreciable en las pruebas; priorizar alta disponibilidad, no tamaño.
5. **CDN**: maximizar aciertos en estáticos e imágenes públicas.

### Cómo repetir las pruebas (solo en staging autorizado)

Reglas: nunca contra producción; entorno con datos de prueba; generador de carga en
**máquinas separadas** de la app; pedidos con pago en tienda o Stripe en modo test;
avisar a quien opere el WAF/CDN.

```bash
BASE_URL=https://staging.example DATABASE_URL=<bd de staging> DIRECT_URL=<directa> \
VUS=500 DURATION=300 RAMP=60 \
node loadtest/harness.mjs > loadtest/results/staging-<fecha>-vu500.json
```

- `loadtest/harness.mjs` necesita acceso a la BD (`DATABASE_URL` para el catálogo,
  `DIRECT_URL` para la comprobación de integridad y el muestreo de conexiones) y que el
  balanceador de pruebas traduzca `X-Loadtest-IP` a la IP del cliente (como
  `nginx-loadtest.conf`). Detrás de un WAF real, todas las peticiones salen de pocas IP y
  los límites por IP actuarán: documenta si se usa `RATE_LIMIT_MULTIPLIER` (ignorado si
  `APP_ENV=production`).
- El muestreo de CPU del arnés lee `/proc` local: solo es válido si el generador está en
  la misma máquina que la app. Con generador separado, usa las métricas de Prometheus.
- Escenarios k6 en `loadtest/k6/tienda.js` (perfiles `humo`, 100, 500, 1000, 5000, 10000, con
  umbrales y la guarda `-e AUTORIZADO=si`), catálogo con `export-catalog.mjs` e integridad con
  `verify-orders.mjs`. En este entorno solo se ejecutó el perfil `humo` (5 VU): 0 % errores,
  umbrales cumplidos y el pedido confirmado verificado en la BD.

Escalones sugeridos: 100 → 500 → 1.000 → 2.000 → 5.000 VU, 5–10 min por escalón.
Criterios de aceptación por escalón: errores 5xx < 0,05 % (presupuesto del SLO),
p95 < 1 s (umbral de `ReposteriaHighLatencyP95`), integridad con 0 perdidos y
0 duplicados, sin `ReposteriaLoadShedding` sostenido. Anota en cada JSON la versión, el
número de instancias, los límites y la topología.
