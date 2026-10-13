# Recuperación ante desastres (DR)

> Todo lo marcado como **pendiente** no está implementado o no se ha ensayado. Los
> objetivos de RTO de este documento son **objetivos**, no tiempos medidos en producción.

## 1. Qué se ha probado de verdad

| Prueba | Resultado | Límites |
| --- | --- | --- |
| Simulacro de copia y restauración (`scripts/backup.sh` → `scripts/restore.sh`) | Filas idénticas tras restaurar; una clave age incorrecta y un archivo manipulado (huella SHA-256 distinta) se rechazan. Restauración medida: **0,58 s** (12/10/2026) | Conjunto de datos de prueba diminuto (copia de 110 KB): **el tiempo no es representativo** de una BD real. Registrado en §8. |
| `infra/postgres/test/validate-data-stack.sh` (PostgreSQL 16, PgBouncer, Redis y age locales, sin Docker) | **45/45**, incluida una **recuperación PITR completa**: una fila insertada antes de la copia base y otra después se recuperan en un clúster nuevo a partir de la copia base y el WAL cifrados | El paso de copia lógica de ese script usa su propio `pg_dump \| gzip \| age`, no `scripts/backup.sh`/`restore.sh`. Sin demonio Docker real (entrypoints, permisos de secretos y `read_only` de las imágenes, pendientes). |

No probado: restauración de un volumen real, pérdida de host o región, failover de BD
gestionada, restauración desde la copia fuera del servidor, PITR de Supabase/Neon.

## 2. Objetivos RPO / RTO por escenario

RPO = datos que se pueden perder. RTO = tiempo hasta volver a tomar pedidos.

| Escenario | Vercel + BD gestionada (Supabase/Neon) | Autoalojado (Compose/Kubernetes con BD propia) |
| --- | --- | --- |
| Caída de una instancia de la app | RPO 0 · RTO automático (plataforma) | RPO 0 · RTO automático con ≥ 2 réplicas sanas (ver §6.3 para Compose) |
| Error humano o corrupción lógica (borrado, migración mala) | RPO: el del PITR del plan contratado; si no hay PITR, la última copia lógica propia (≤ 1 h **solo si** existe un ejecutor horario, ver §3) · RTO objetivo ≤ 2 h | RPO ≤ 15 min con copia base + WAL; ≤ 1 h solo con copias lógicas · RTO objetivo ≤ 2 h (`infra/postgres/README.md`) |
| Pérdida del servidor de BD / del host | Responsabilidad del proveedor (HA según plan) | RPO = antigüedad de la última copia **ya sincronizada fuera del servidor** (ver §5: sincronización pendiente en Compose) · RTO objetivo ≤ 4 h (propuesto, no ensayado) |
| Pérdida de región o de proveedor | RPO = última copia lógica propia fuera del proveedor · RTO objetivo ≤ 4 h (propuesto, no ensayado; sin failover automático) | Igual que la fila anterior |
| Pérdida de Redis | RPO irrelevante (solo contadores de límites) · RTO 0: la app sigue funcionando | Igual |
| Caída de Stripe | Sin pérdida de pedidos confirmados; pagos con tarjeta no disponibles mientras dure (§6.8) | Igual |

Cómo se llega a ≤ 15 min autoalojado: `archive_timeout = 300` fuerza un segmento WAL cada
5 min y `wal-ship.sh` lo cifra cada 5 min (`infra/postgres/backup/crontab`). Si el host se
pierde, el RPO real lo fija la frecuencia de la sincronización externa, no esta cifra.

## 3. Copias: tipos y calendario

| Copia | Cuándo | Herramienta | Formato y destino | Retención |
| --- | --- | --- | --- | --- |
| Lógica | Cada hora, :07 | `scripts/backup.sh` vía `infra/monitoring/backup-with-metrics.sh` (contenedor `backup`) | `pg_dump -Fc --compress=6 --enable-row-security` → age → `/backups/dumps/reposteria-<UTC>.dump.age` + `.sha256`; rechaza copias < 1 KiB | 35 días (`BACKUP_RETENTION_DAYS`) |
| Base física | Diaria, 02:41 UTC | `infra/postgres/backup/basebackup.sh` (`pg_basebackup -Ft -X fetch`) | tar → gzip → age → `/backups/base/reposteria-base-<UTC>.tar.gz.age` + `.sha256` | 35 días |
| WAL | Segmento cada ≤ 5 min; traslado cada 5 min | `archive_command` + `infra/postgres/backup/wal-ship.sh` | `/backups/wal/<segmento>.gz.age`; el `.gz` sin cifrar se borra | 36 días |
| Lógica (Kubernetes) | Cada hora, :07 | CronJob `reposteria-backup` (`infra/k8s/cronjobs.yaml`) + contenedor rclone | PVC + bucket externo con versionado/bloqueo | 35 días en el bucket |
| Vercel + gestionada | Continuo | PITR del proveedor (según plan) | En el proveedor | Según plan |
| Vercel + gestionada (propia) | — | **Pendiente**: el repositorio no incluye un ejecutor para `backup.sh` en esta variante (Vercel no ejecuta tareas largas). Opciones: el CronJob de Kubernetes, un VPS con el timer de `infra/monitoring/README.md` o un runner de CI con secretos | — | — |

Todas las tareas escriben una línea JSON con el resultado (`infra/postgres/backup/job.sh`),
evitan solapes con `flock` y la copia lógica publica métricas `reposteria_backup_*` para
las alertas `ReposteriaBackupTooOld` (> 2 h) y `ReposteriaBackupFailed`.

## 4. Cifrado de las copias

- age con **clave pública** en el servidor (`BACKUP_AGE_RECIPIENT`, `age1…`); la **clave
  privada nunca está en el servidor** ni en el clúster: gestor de secretos o caja fuerte
  offline, con al menos dos custodios. Solo se usa para restaurar y en simulacros.
- Ninguna copia se escribe en claro: `pg_dump` y `pg_basebackup` cifran en flujo.
- Doble capa: los datos personales ya van cifrados dentro de la BD (AES-256-GCM,
  `src/lib/crypto.ts`). **Consecuencia para DR**: para leer esos campos tras restaurar
  hacen falta las claves `DATA_ENCRYPTION_KEYS` con las que se cifraron. Conserva las
  claves retiradas en custodia al menos tanto como la retención de copias (35 días), o
  las copias anteriores a una rotación serán ilegibles en esos campos.
- Integridad: `.sha256` junto a cada copia. `restore.sh` lo verifica y **se niega a
  restaurar si falta**, salvo que se asuma explícitamente con `ALLOW_MISSING_CHECKSUM=1`
  (age sigue rechazando una copia modificada, pero no detectaría su sustitución completa).

## 5. Copia fuera del servidor (obligatoria)

Una copia en el mismo disco o host no protege de su pérdida ni de un ransomware.

| Despliegue | Estado |
| --- | --- |
| Compose | **Pendiente**. `backup.sh` admite `BACKUP_OFFSITE_CMD` (p. ej. `rclone copy`), pero solo para la copia lógica y el servicio `backup` de `docker-compose.prod.yml` no lo configura. Las copias base y el WAL no salen del host. Hay que sincronizar el volumen `reposteria_backups` completo (restic/rclone) a otro proveedor o región, idealmente con bloqueo de objetos (inmutable). |
| Kubernetes | Plantilla: rclone a bucket externo con versionado/bloqueo y caducidad de 35 días (no probado). Sin WAL/PITR en esta variante salvo BD gestionada. |
| Vercel + gestionada | Pendiente (ver §3). |

## 6. Runbooks

### 6.1 Restaurar una copia lógica (`scripts/restore.sh`)

1. Declara el incidente y detén las escrituras: modo mantenimiento en el balanceador o
   app a 0 réplicas (y pausa el cron). Desactivar `onlineOrdersEnabled` en
   `/admin/ajustes` solo frena pedidos nuevos: webhooks, cron y panel siguen escribiendo.
2. Elige la copia (`/backups/dumps/reposteria-<UTC>.dump.age` o la del bucket externo) y
   su `.sha256` (formato custom de `pg_dump`, cifrado con age).
3. Recupera la clave privada age a un fichero `0600` en la máquina de administración
   (nunca en el servidor de producción) y bórralo al terminar.
4. Crea una **BD nueva y vacía** (nunca sobre la de producción) y restaura:
   ```bash
   BACKUP_AGE_IDENTITY=/ruta/segura/clave-age.txt \
   TARGET_DATABASE_URL=postgresql://<propietario>@<host>:5432/reposteria_restaurada?sslmode=require \
   scripts/restore.sh /backups/dumps/reposteria-<UTC>.dump.age
   ```
   `pg_restore --single-transaction --exit-on-error --no-owner --no-privileges`: o restaura
   todo o nada.
5. Aplica `prisma/sql/least-privilege.sql` (la restauración no lleva permisos ni RLS) y
   ejecuta `npm run db:check-security`.
6. Con las claves de datos de producción: `npm run db:encrypt -- --check` y comprueba
   recuentos (pedidos, clientes, trabajos) y una muestra de pedidos recientes.
7. Apunta la app a la BD restaurada (`DATABASE_URL`/`DIRECT_URL`, o PgBouncer `[databases]`)
   y reactiva los pedidos.
8. Después del corte:
   - Pagos de Stripe posteriores al instante de la copia: búscalos en el dashboard de
     Stripe; sus pedidos no existen en la BD restaurada (un reenvío del webhook acabará en
     `missing`). Concílialos a mano con el cliente.
   - Supresiones RGPD ejecutadas después del instante de la copia: vuelve a aplicarlas.
     **Pendiente**: no hay un mecanismo automático que las reaplique.
   - Lanza una copia nueva y anota el RTO real en §8.

### 6.2 Recuperación a un punto en el tiempo (PITR, autoalojado)

Procedimiento base en `infra/postgres/README.md`, ensayado por `validate-data-stack.sh`.

1. Detén las escrituras (paso 1 de §6.1) y fija el instante objetivo (UTC) justo antes del
   incidente (registro de auditoría, logs).
2. Asegura que la copia base anterior a ese instante y todo el WAL posterior están
   disponibles (localmente o descargados de la copia externa).
3. Clúster nuevo:
   ```bash
   mkdir -m 0700 /restore/pgdata
   age -d -i clave.txt /backups/base/reposteria-base-<UTC>.tar.gz.age | gunzip | tar -x -C /restore/pgdata
   # postgresql.conf o -c:
   #   restore_command = 'age -d -i /ruta/clave.txt /backups/wal/%f.gz.age | gunzip > %p'
   #   recovery_target_time = '<AAAA-MM-DD HH:MM:SS+00>'   # omitir = hasta el final del WAL
   #   recovery_target_action = 'promote'
   touch /restore/pgdata/recovery.signal
   ```
4. Arranca PostgreSQL 16 sobre ese directorio con la configuración del repositorio,
   comprueba los datos y apunta PgBouncer (`host=` en `infra/pgbouncer/pgbouncer.ini`) al
   nuevo servidor.
5. Tras la promoción empieza una nueva línea temporal: lanza **inmediatamente** una copia
   base nueva y comprueba que `pg_stat_archiver.failed_count` no crece.
6. Pasos 5–8 de §6.1 que apliquen (permisos, comprobaciones, Stripe, RGPD).

En Supabase/Neon: usa el PITR o la restauración del proveedor sobre un proyecto/rama nuevo
y cambia las cadenas de conexión; después, pasos 5–8 de §6.1.

### 6.3 Pérdida de una instancia de la app

| Despliegue | Qué ocurre | Acción |
| --- | --- | --- |
| Vercel | La plataforma sustituye la instancia | Ninguna. Si el fallo es de un despliegue: `vercel rollback` (lo hace `deploy.yml` si falla la prueba de humo). |
| Kubernetes | Liveness reinicia el pod; readiness lo saca del Service; el PDB mantiene ≥ 2 en mantenimientos voluntarios | Revisa `kubectl -n reposteria get pods` y logs; `kubectl rollout undo` si es un despliegue. |
| Compose | `restart: unless-stopped` solo reinicia si el proceso **termina**; un contenedor `unhealthy` sigue vivo y nginx lo esquiva tras 3 fallos en 10 s | `docker compose ps`; `docker compose restart app` o elimina el contenedor afectado. Comprueba que `ReposteriaInstanceDown` se resuelve. |

### 6.4 Pérdida de región o de proveedor

Requisitos previos (si faltan, este runbook no es ejecutable): copia lógica reciente
**fuera** del proveedor afectado, clave privada age accesible, y custodia externa de
`DATA_ENCRYPTION_KEYS`, `DATA_ENCRYPTION_ACTIVE_KEY` y `DATA_HASH_KEY` (sin ellas los
datos personales restaurados son ilegibles y los índices ciegos no coinciden).

1. Confirma el alcance (página de estado del proveedor, monitores externos desde varias
   regiones).
2. App en Vercel con región caída: cambia `regions` en `vercel.json` y redepliega; la BD
   debe ser alcanzable desde la nueva región.
3. BD gestionada caída sin fecha de vuelta: crea una BD en otro proveedor/región, restaura
   (§6.1) la última copia lógica externa, aplica migraciones si hiciera falta
   (`prisma migrate deploy` con `DIRECT_URL`) y cambia las variables.
4. Host autoalojado perdido: host nuevo, `docker-compose.prod.yml` con los **mismos**
   secretos de datos (no regeneres las claves de cifrado con `gen-secrets.sh`; las
   contraseñas internas sí pueden ser nuevas), restaura con PITR si la copia base y el WAL
   están fuera; si no, copia lógica.
5. Cambia el DNS (TTL bajo preparado de antemano), verifica `/api/health/ready`, un pedido
   de prueba y el webhook de Stripe (nueva URL de endpoint ⇒ nuevo `STRIPE_WEBHOOK_SECRET`).
6. §6.1 paso 8.

**Pendiente**: no hay failover automático entre regiones ni réplica en otra región.

### 6.5 Pérdida de Redis

1. La app sigue: límites en memoria por instancia (más laxos), readiness en 200 con
   `"redis": false`. No hay datos que recuperar (sin persistencia por diseño).
2. Autoalojado: `docker compose restart redis` (o recrear); Upstash: nueva base de datos,
   actualiza `REDIS_URL` y redepliega.
3. Verifica `redis_up 1` en `/api/metrics` de cada instancia.
4. Ojo en Compose: un arranque en frío de la app espera a que Redis esté sano
   (`depends_on`).
5. Mientras dure, vigila 429/abuso en el WAF/CDN: es la capa que sigue aplicando límites
   globales.

### 6.6 Clave de cifrado filtrada

| Clave | Acción inmediata | Después |
| --- | --- | --- |
| Clave privada **age** (copias) | Genera un par nuevo (`age-keygen`), cambia `BACKUP_AGE_RECIPIENT` (compose.env / secreto de Kubernetes) y lanza una copia lógica y una base nuevas | Cualquiera con la clave filtrada y acceso a copias antiguas puede descifrarlas: averigua si las copias también se expusieron; si sí, elimina las antiguas cuando existan copias nuevas verificadas y valora la notificación de brecha (RGPD, 72 h). |
| `DATA_ENCRYPTION_KEYS` (datos en la BD) | Añade una clave nueva, actívala (`DATA_ENCRYPTION_ACTIVE_KEY`), redepliega y ejecuta `npm run keys:rotate` hasta que `npm run db:encrypt -- --check` salga con 0 | Retira la clave filtrada del anillo de la app, pero consérvala en custodia mientras existan copias cifradas con ella (35 días) o destrúyelas. |
| `DATA_HASH_KEY` (índices ciegos) | Cámbiala y ejecuta `npm run keys:rotate` (recalcula los índices) | — |
| Otros secretos (`STRIPE_*`, `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`, `METRICS_TOKEN`, contraseñas de BD/Redis, `ALERT_WEBHOOK_URL`) | Rótalos en el proveedor y en el gestor de secretos; reinicia | Revisa el registro de auditoría y los logs de acceso del periodo expuesto. |

Registra el incidente y las rotaciones; cada entorno tiene claves distintas, así que solo
rota las del entorno afectado.

### 6.7 Ransomware o datos corruptos

1. Aísla: corta el acceso público (WAF/DNS) y las credenciales del host afectado; no
   borres nada (evidencias). No restaures sobre la infraestructura comprometida.
2. Determina el último instante limpio: registro de auditoría encadenado
   (`verifyAuditChain`; la alerta diaria `audit.anchor` envía la huella de la cabeza de la
   cadena, guárdala fuera), logs y métricas.
3. Restaura en **infraestructura nueva** desde la copia externa (idealmente inmutable):
   PITR a ese instante (§6.2) o copia lógica (§6.1).
4. Rota **todos** los secretos (§6.6) y verifica la cadena de auditoría tras restaurar.
5. Corrupción física: PostgreSQL se inicializa con `--data-checksums`
   (`docker-compose.prod.yml`), los errores de suma aparecen en sus logs; restaura igual.
6. Corrupción lógica por un fallo de la app o una migración: restaura en una BD paralela y
   copia solo las filas afectadas, o PITR si el daño es amplio.
7. Valora la notificación a la AEPD y a los afectados (RGPD arts. 33–34).

### 6.8 Caída de Stripe

Comportamiento del código:

- **Pedido nuevo con tarjeta**: si no se puede crear la sesión de Checkout, el pedido se
  **cancela** y se liberan stock y franja (`src/lib/checkout.ts`), el cliente ve "No hemos
  podido iniciar el pago…" y se cuenta `orders_failed_total{reason="stripe"}`. No queda
  ningún pedido "a medias".
- **Pedido con sesión creada y pago sin confirmar** (webhook no entregado): queda en
  `PENDING_PAYMENT`. Stripe reintenta el webhook. La conciliación de `/api/cron/jobs`
  revisa los pendientes de más de 40 min: si Stripe dice pagado → `markOrderPaid`
  (comprobando importe); si la sesión sigue abierta → espera; si la consulta a Stripe
  falla → se registra `cron.reconcile_failed` y el pedido **sigue pendiente** (no se
  caduca) hasta la siguiente ejecución.
- Un pago que llega después de caducar la reserva se marca como tardío y genera la alerta
  `payment.late` para revisión manual.

Acciones:

1. Confirma en status.stripe.com y en Developers → Webhooks.
2. Si va para largo: desactiva `cardPaymentEnabled` en `/admin/ajustes` (deja el pago en
   tienda si `payInStoreEnabled` está activo) para no frustrar clientes.
3. Al volver Stripe: comprueba que `/api/cron/jobs` se ejecuta (en Vercel hoy solo es
   **diario**, ver `alta-disponibilidad.md` §2(a); lánzalo a mano con
   `curl -H "Authorization: Bearer $CRON_SECRET" https://SITIO/api/cron/jobs`), revisa
   `webhook_events_total{result=~"error|missing|mismatch"}` y las alertas
   `payment.amount_mismatch`/`payment.late`.
4. Reactiva el pago con tarjeta.

## 7. Simulacro trimestral de restauración

Frecuencia: al menos cada trimestre (`infra/postgres/README.md`; `infra/monitoring/README.md`
y `infra/k8s/README.md` recomiendan mensual: si se puede, mensual). Responsable: quien esté
de guardia + un custodio de la clave age.

1. Elige al azar una copia de la **copia externa** (no la local), de entre 1 y 35 días.
2. Descarga copia y `.sha256` a una máquina aislada; verifica la huella.
3. Restaura con `scripts/restore.sh` en una BD temporal; cronometra desde "decidir
   restaurar" hasta "BD lista" (RTO).
4. Aplica `least-privilege.sql`, `npm run db:check-security`, `npm run db:encrypt -- --check`
   con las claves de datos en custodia.
5. Compara recuentos con producción en el instante de la copia (pedidos, clientes,
   `AuditLog.seq` máximo) y verifica la cadena de auditoría.
6. Una vez al semestre: PITR completo (§6.2) a un instante elegido, en autoalojado.
7. Prueba negativa: clave age incorrecta y copia con un byte cambiado deben fallar.
8. Destruye la BD temporal y la clave en la máquina de pruebas; anota el resultado.

### Registro de simulacros

| Fecha | Tipo (lógica / PITR) | Copia usada (nombre, origen) | Tamaño | Huella OK | RTO medido | Recuentos coinciden | Pruebas negativas | Incidencias / acciones | Responsable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-10-12 | Lógica | Conjunto de prueba (entorno de desarrollo) | 110 KB | Sí | 0,58 s (no representativo) | Sí | Clave incorrecta y archivo manipulado rechazados | Ninguna | Verificación automatizada |
| 2026-10-12 | PITR | `validate-data-stack.sh` (clúster temporal) | Diminuto | Sí | — | Sí (filas antes/después de la copia base) | — | Ninguna | Verificación automatizada |
| | | | | | | | | | |
| | | | | | | | | | |
