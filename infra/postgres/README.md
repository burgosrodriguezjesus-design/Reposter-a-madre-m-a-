# Capa de datos autoalojada: PostgreSQL 16, PgBouncer, Redis y copias

Esta guía cubre la alternativa autoalojada (`docker-compose.prod.yml`). En el despliegue recomendado (Vercel + Supabase + Upstash), la base de datos, el cifrado en reposo y la recuperación a un punto en el tiempo (PITR) los gestiona Supabase.

| Archivo | Qué hace |
|---|---|
| `postgresql.conf` | TLS obligatorio, SCRAM, registro sin valores de parámetros (RGPD), archivado WAL, límites globales |
| `pg_hba.conf` | Solo `hostssl` + `scram-sha-256` desde la red `data`; el rol de la app, solo desde PgBouncer (172.30.20.10) |
| `entrypoint.sh` | Copia el certificado TLS a un tmpfs con permisos 0600 y prepara el archivo WAL; luego cede al entrypoint oficial |
| `initdb/10-roles.sh` | Primera inicialización: roles con mínimo privilegio, BD `reposteria` y privilegios por defecto |
| `gen-secrets.sh` | Contraseñas, CA interna y certificados de `postgres`/`pgbouncer`, `migrate.env` y `app.env.fragment` |
| `backup/` | Imagen `backup`: `pg_dump` cada hora, `pg_basebackup` diario y WAL cada 5 min, todo cifrado con age |
| `test/validate-data-stack.sh` | Prueba local (sin Docker) de todo lo anterior con los mismos archivos de configuración |

## Roles

| Rol | Uso | Privilegios |
|---|---|---|
| `postgres` | Administración | Superusuario. **Solo** por socket local (`docker compose exec postgres psql -U postgres`); por red se rechaza. |
| `reposteria_owner` | `prisma migrate deploy` (servicio `migrate`) | Propietario del esquema `public` y de la BD. Sin `CREATEDB`/`CREATEROLE`. |
| `reposteria_app` | La app, a través de PgBouncer | DML sobre las tablas (privilegios por defecto). Sin DDL. |
| `reposteria_backup` | `pg_dump` y `pg_basebackup` | `pg_read_all_data`, `BYPASSRLS` (pg_dump lo necesita para volcar tablas con RLS) y `REPLICATION`. |
| `monitoring` | `postgres_exporter` | `pg_monitor` (solo estadísticas). |

Después de **cada** `migrate deploy` hay que aplicar `prisma/sql/least-privilege.sql`, que activa RLS, recorta permisos (por ejemplo `UPDATE`/`DELETE` sobre la auditoría) y fija `statement_timeout`/`lock_timeout` por rol. Comprueba el resultado con `npm run db:check-security`:

```bash
docker compose --env-file /etc/reposteria/compose.env -f docker-compose.prod.yml \
  exec -T postgres psql -U postgres -d reposteria -v ON_ERROR_STOP=1 < prisma/sql/least-privilege.sql
```

Si cambias el nombre de un rol, cámbialo en `initdb/10-roles.sh`, `pg_hba.conf`, `infra/pgbouncer/` y `least-privilege.sql` a la vez.

## Cifrado

### En tránsito

- **App → PgBouncer**: TLS opcional (`client_tls_sslmode = prefer`). La red `data` es interna; `app.env.fragment` usa `sslmode=prefer`.
- **PgBouncer → PostgreSQL**: TLS obligatorio (`server_tls_sslmode = require`). Para verificar además el certificado, usa `verify-full` con la CA interna (comentado en `pgbouncer.ini`).
- **migrate / backup / monitorización → PostgreSQL**: `hostssl` en `pg_hba.conf`. Las conexiones sin TLS se rechazan.

### En reposo

PostgreSQL no cifra sus archivos de datos. Los datos personales ya van cifrados por la aplicación con AES-256-GCM, pero el resto (pedidos, importes, índices ciegos, sesiones, auditoría) no. Por eso el disco también debe ir cifrado:

1. **Disco cifrado del proveedor** (EBS/Hetzner Volumes/Persistent Disk con cifrado activado), o **LUKS** en el host:
   ```bash
   cryptsetup luksFormat --type luks2 /dev/sdb
   cryptsetup open /dev/sdb pgdata
   mkfs.ext4 /dev/mapper/pgdata
   mount /dev/mapper/pgdata /var/lib/docker/volumes   # o "data-root" de Docker en ese disco
   ```
   Desbloqueo al arrancar con `clevis`/TPM2 o manualmente. Nunca guardes la clave LUKS en el mismo disco.
2. Los volúmenes afectados son `reposteria_pgdata`, `reposteria_pg_wal_archive`, `reposteria_uploads` y `reposteria_backups`. Todos deben quedar en el disco cifrado.
3. Las **copias** van cifradas aparte con age (clave pública en `BACKUP_AGE_RECIPIENT`). La clave privada **no** se guarda en el servidor: va a un gestor de secretos o a una caja fuerte offline, y la usan solo `scripts/restore.sh` y los simulacros de restauración.
4. El archivo WAL sin cifrar (`*.gz` en `reposteria_pg_wal_archive`) solo vive hasta 5 minutos: `wal-ship.sh` lo cifra y lo borra.

### Contraseñas en los logs

Con `log_statement = 'ddl'`, un `ALTER ROLE ... PASSWORD '...'` quedaría en el log en claro. `10-roles.sh` desactiva el registro en su sesión. Para cambiar una contraseña después, usa `\password <rol>` en psql, que envía el hash SCRAM en lugar de la contraseña:

```bash
docker compose ... exec postgres psql -U postgres -c '\password reposteria_app'
```

Después actualiza el secreto (`postgres_app_password`) y `.env.production`, y reinicia `pgbouncer` y `app`.

## Copias y RPO/RTO

| Copia | Frecuencia | Herramienta | Destino |
|---|---|---|---|
| Lógica | Cada hora (:07) | `scripts/backup.sh` (vía `backup-with-metrics.sh`) | `/backups/dumps` |
| Base física | Diaria (02:41 UTC) | `backup/basebackup.sh` (`pg_basebackup -X fetch`) | `/backups/base` |
| WAL | Continuo (`archive_timeout = 300`), traslado cada 5 min | `archive_command` + `backup/wal-ship.sh` | `/backups/wal` |

- **RPO ≤ 15 min** con la copia base más el WAL. Solo con las copias lógicas, ≤ 1 h.
- **RTO ≤ 2 h**: depende del tamaño de la BD y de tener ensayado el procedimiento. Haz un simulacro al menos una vez al trimestre y anota el tiempo.
- El volumen `/backups` debe **salir del servidor** (restic o rclone a otro proveedor o región). Una copia en el mismo disco no protege frente a la pérdida del servidor.

### Restaurar una copia lógica

```bash
BACKUP_AGE_IDENTITY=/ruta/clave.txt TARGET_DATABASE_URL=postgresql://... scripts/restore.sh reposteria-<UTC>.dump.age   # con su .sha256 al lado
```

### Recuperación a un punto en el tiempo (PITR)

```bash
# 1. Clúster nuevo y vacío con la última copia base anterior al instante deseado
mkdir -m 0700 /restore/pgdata
age -d -i clave.txt /backups/base/reposteria-base-<UTC>.tar.gz.age | gunzip | tar -x -C /restore/pgdata
# 2. Configuración de recuperación (en postgresql.conf o con -c)
#    restore_command = 'age -d -i /ruta/clave.txt /backups/wal/%f.gz.age | gunzip > %p'
#    recovery_target_time = '2026-10-12 10:42:00+00'   # omítelo para llegar al final del WAL
#    recovery_target_action = 'promote'
touch /restore/pgdata/recovery.signal
# 3. Arranca PostgreSQL 16 sobre ese directorio, comprueba los datos y apunta los servicios a él
```

`test/validate-data-stack.sh` ensaya este procedimiento completo: inserta una fila antes de la copia base y otra después, y recupera las dos en un clúster nuevo.

## Validación

```bash
# Capa de datos con los binarios locales (PostgreSQL 16, pgbouncer, redis-server, age):
MIGRATE_DIR=/ruta/con/node_modules/prisma IOREDIS_DIR=$PWD/node_modules \
  infra/postgres/test/validate-data-stack.sh
# nginx (+ ModSecurity/CRS si tienes el módulo):
infra/nginx/test/validate.sh
# Compose:
docker compose --env-file /etc/reposteria/compose.env -f docker-compose.prod.yml config --quiet
```

Pendiente de probar con un demonio Docker real: los entrypoints dentro de las imágenes oficiales (`postgres:16-alpine`, `redis:7.4-alpine`, `owasp/modsecurity-crs:4-nginx-alpine`), los permisos de los secretos montados, `read_only` y las capacidades mínimas.

## Integración con la monitorización (`infra/monitoring`)

- Une la pila a la red de datos: `REPOSTERIA_APP_NETWORK=reposteria_data`.
- `postgres_exporter`: pg_hba exige TLS, así que su `DATA_SOURCE_URI` debe usar `sslmode=require` (no `disable`). Su contraseña es `postgres_monitoring_password`.
- `redis_exporter`: usa el usuario ACL `exporter` (`REDIS_USER=exporter`, `REDIS_PASSWORD=<redis_exporter_password>`). El usuario por defecto (el de la app) no tiene permiso para `CONFIG GET`.
- Alerta recomendada: `pg_stat_archiver.failed_count` creciendo. Si el archivado falla, el WAL se acumula en `pg_wal` hasta llenar el disco.
