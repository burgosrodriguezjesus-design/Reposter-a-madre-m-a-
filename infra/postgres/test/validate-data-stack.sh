#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  Validación LOCAL (sin Docker) de PostgreSQL + PgBouncer + Redis + copias
# ════════════════════════════════════════════════════════════════════
#  Usa los binarios instalados en la máquina (PostgreSQL 16, pgbouncer, redis-server, age) con
#  LOS MISMOS archivos de configuración de infra/, adaptando solo rutas, puertos y la subred
#  (172.30.20.x → 127.0.0.1). Comprueba:
#   - initdb con los argumentos de docker-compose.prod.yml y initdb/10-roles.sh (roles, BD,
#     privilegios por defecto) sin que las contraseñas acaben en el log;
#   - pg_hba: TLS obligatorio, SCRAM, rechazo de conexiones sin TLS o de roles no previstos;
#   - migraciones reales de Prisma con el rol propietario (si MIGRATE_DIR apunta a un directorio
#     con node_modules/prisma y prisma/, como la imagen "migrate");
#   - PgBouncer en modo transacción con SCRAM, TLS hacia PostgreSQL y desde el cliente;
#   - Redis: ACL, comandos eliminados, operaciones que usa la app (también con ioredis si
#     IOREDIS_DIR apunta a un node_modules con ioredis);
#   - copias: pg_dump con RLS activo, pg_basebackup cifrado, envío del WAL cifrado y una
#     RECUPERACIÓN A UN PUNTO EN EL TIEMPO completa en un clúster nuevo;
#   - run-job.sh del planificador contra un servidor simulado.
#
#  Uso (como root; postgres y pgbouncer se ejecutan como el usuario "postgres" del sistema):
#    MIGRATE_DIR=/ruta/con/node_modules IOREDIS_DIR=$PWD/node_modules infra/postgres/test/validate-data-stack.sh
#  Variables opcionales: PG_BIN (por defecto /usr/lib/postgresql/16/bin), KEEP_WORKDIR=1.
# ════════════════════════════════════════════════════════════════════
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PGPORT_TEST="${PGPORT_TEST:-25432}"
PGPORT_PITR="${PGPORT_PITR:-25433}"
BOUNCER_PORT="${BOUNCER_PORT:-26432}"
REDIS_PORT="${REDIS_PORT:-26379}"
MOCK_PORT="${MOCK_PORT:-23998}"
RUN_AS="${RUN_AS:-postgres}"
export NO_PROXY="*" no_proxy="*"

[ "$(id -u)" = "0" ] || { echo "Ejecuta como root (se cambia al usuario $RUN_AS para postgres/pgbouncer)" >&2; exit 1; }
for b in "$PG_BIN/initdb" "$PG_BIN/pg_ctl" psql pgbouncer redis-server redis-cli age age-keygen curl python3 openssl; do
  command -v "$b" >/dev/null || { echo "Falta $b" >&2; exit 1; }
done

WORK="$(mktemp -d "${TMPDIR:-/tmp}/data-stack.XXXXXX")"
chmod 0755 "$WORK"
PIDS=()
cleanup() {
  set +e
  su -s /bin/sh "$RUN_AS" -c "'$PG_BIN/pg_ctl' -D '$WORK/pgdata' -m immediate stop" >/dev/null 2>&1
  su -s /bin/sh "$RUN_AS" -c "'$PG_BIN/pg_ctl' -D '$WORK/pitr' -m immediate stop" >/dev/null 2>&1
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done
  # su no siempre reenvía la señal: se terminan también los hijos por su archivo de configuración
  pkill -f "$WORK/bouncer/pgbouncer.ini" 2>/dev/null
  pkill -f "redis-server.*$REDIS_PORT" 2>/dev/null
  if [ "${KEEP_WORKDIR:-0}" = "1" ]; then echo "Directorio conservado: $WORK"; else rm -rf "$WORK"; fi
}
trap cleanup EXIT

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf '  \033[32mOK\033[0m    %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31mFALLO\033[0m %s\n' "$1"; [ -n "${2:-}" ] && printf '        %s\n' "$2"; }
check() { # check "descripción" esperado obtenido
  if [ "$2" = "$3" ]; then ok "$1 ($3)"; else bad "$1" "esperado=[$2] obtenido=[$3]"; fi
}
info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
as_pg() { su -s /bin/bash "$RUN_AS" -c "$*"; }

# ── Secretos con el generador real ──
info "Secretos (infra/postgres/gen-secrets.sh)"
SECRETS="$WORK/secrets"
SECRETS_DIR="$SECRETS" bash "$REPO/infra/postgres/gen-secrets.sh" >/dev/null 2>&1
chmod 0755 "$SECRETS"   # solo para la prueba: el usuario postgres local debe leerlos
pw() { cat "$SECRETS/$1"; }

# ── PostgreSQL ──
info "PostgreSQL: initdb con POSTGRES_INITDB_ARGS de docker-compose.prod.yml"
mkdir -p "$WORK/pgdata" "$WORK/etc" "$WORK/tls" "$WORK/wal-archive" "$WORK/run" "$WORK/backups/dumps" "$WORK/backups/base" "$WORK/backups/wal"
INITDB_ARGS="$(python3 -I -c 'import sys,re;t=open(sys.argv[1]).read();print(re.search(r"POSTGRES_INITDB_ARGS:\s*(.+)",t).group(1).strip())' "$REPO/docker-compose.prod.yml")"
cp "$SECRETS/postgres_superuser_password" "$WORK/pwfile"
chown -R "$RUN_AS" "$WORK"
as_pg "'$PG_BIN/initdb' -D '$WORK/pgdata' --username=postgres --pwfile='$WORK/pwfile' $INITDB_ARGS" > "$WORK/initdb.log" 2>&1 \
  && ok "initdb ($INITDB_ARGS)" || { bad "initdb" "$(tail -5 "$WORK/initdb.log")"; exit 1; }

sed -e "s#/var/lib/postgresql/tls#$WORK/tls#g" \
    -e "s#/var/lib/postgresql/wal-archive#$WORK/wal-archive#g" \
    -e "s#/var/run/postgresql#$WORK/run#g" \
    -e "s#^port = 5432#port = $PGPORT_TEST#" \
    -e "s#^listen_addresses = '\*'#listen_addresses = '127.0.0.1'#" \
    -e "s#^shared_buffers = 1GB#shared_buffers = 128MB#" \
    -e "s#^huge_pages = try#huge_pages = off#" \
    "$REPO/infra/postgres/postgresql.conf" > "$WORK/etc/postgresql.conf"
sed -e "s#172\.30\.20\.10/32#127.0.0.1/32#; s#172\.30\.20\.0/24#127.0.0.1/32#g" \
    "$REPO/infra/postgres/pg_hba.conf" > "$WORK/etc/pg_hba.conf"
install -o "$RUN_AS" -m 0644 "$SECRETS/postgres_tls_cert" "$WORK/tls/server.crt"
install -o "$RUN_AS" -m 0600 "$SECRETS/postgres_tls_key" "$WORK/tls/server.key"
chown -R "$RUN_AS" "$WORK/etc" "$WORK/tls" "$WORK/wal-archive" "$WORK/run"
chmod 0700 "$WORK/tls" "$WORK/wal-archive"

as_pg "'$PG_BIN/pg_ctl' -D '$WORK/pgdata' -l '$WORK/postgres.log' -w -t 30 start -o \"-c config_file=$WORK/etc/postgresql.conf -c hba_file=$WORK/etc/pg_hba.conf\"" >/dev/null \
  && ok "postgres arranca con postgresql.conf/pg_hba.conf del repositorio" || { bad "arranque" "$(tail -20 "$WORK/postgres.log")"; exit 1; }

info "initdb/10-roles.sh (como lo ejecuta docker-entrypoint.sh)"
if as_pg "PGHOST='$WORK/run' PGPORT=$PGPORT_TEST PG_SECRETS_DIR='$SECRETS' bash '$REPO/infra/postgres/initdb/10-roles.sh'" > "$WORK/roles.log" 2>&1; then
  ok "roles y base de datos creados"
else
  bad "10-roles.sh" "$(tail -5 "$WORK/roles.log")"; exit 1
fi
# El script también debe funcionar cargado con "." (permisos sin +x) sin alterar al llamador
leak=0
for s in postgres_owner_password postgres_app_password postgres_backup_password postgres_monitoring_password; do
  grep -qF "$(pw "$s")" "$WORK/postgres.log" && leak=1
done
check "ninguna contraseña aparece en el log de PostgreSQL" 0 "$leak"

SQL() { # SQL <rol> <sslmode> <bd> <sql>
  PGPASSWORD="$2" psql -X -qtA "host=127.0.0.1 port=$PGPORT_TEST dbname=$4 user=$1 sslmode=$3" -c "$5" 2>&1 || true
}
info "pg_hba.conf: TLS + SCRAM"
check "owner con TLS: conecta y la sesión va cifrada" "t" "$(SQL reposteria_owner "$(pw postgres_owner_password)" require reposteria 'select ssl from pg_stat_ssl where pid = pg_backend_pid()' | tr -d ' ')"
out="$(SQL reposteria_owner "$(pw postgres_owner_password)" disable reposteria 'select 1')"
check "owner SIN TLS: rechazado por pg_hba" 1 "$(echo "$out" | grep -c 'no pg_hba.conf entry\|rejects connection')"
out="$(SQL postgres "$(pw postgres_superuser_password)" require postgres 'select 1')"
check "superusuario por red: rechazado" 1 "$(echo "$out" | grep -c 'rejects connection\|no pg_hba.conf entry')"
out="$(SQL reposteria_app "incorrecta" require reposteria 'select 1')"
check "contraseña incorrecta: rechazada" 1 "$(echo "$out" | grep -c 'password authentication failed')"
check "contraseñas almacenadas como SCRAM" 4 "$(as_pg "psql -X -qtA -h '$WORK/run' -p $PGPORT_TEST -U postgres -d postgres -c \"select count(*) from pg_authid where rolname in ('reposteria_owner','reposteria_app','reposteria_backup','monitoring') and rolpassword like 'SCRAM-SHA-256\\\$%'\"")"
check "reposteria_backup: REPLICATION + BYPASSRLS" "t|t" "$(as_pg "psql -X -qtA -h '$WORK/run' -p $PGPORT_TEST -U postgres -d postgres -c \"select rolreplication, rolbypassrls from pg_roles where rolname='reposteria_backup'\"")"
check "colación ICU es-ES (ñ entre n y o)" "nandu|ñandú|oso" "$(SQL reposteria_owner "$(pw postgres_owner_password)" require reposteria "select string_agg(w, '|' order by w) from (values ('oso'),('ñandú'),('nandu')) v(w)")"

info "Migraciones de Prisma con el rol propietario"
if [ -n "${MIGRATE_DIR:-}" ] && [ -f "${MIGRATE_DIR}/node_modules/prisma/build/index.js" ]; then
  mkdir -p "$WORK/migrate" && cp -a "$REPO/prisma" "$WORK/migrate/prisma"
  OWNER_URL="postgresql://reposteria_owner:$(pw postgres_owner_password)@127.0.0.1:$PGPORT_TEST/reposteria?sslmode=require"
  if (cd "$WORK/migrate" && ln -s "$MIGRATE_DIR/node_modules" node_modules && env -i PATH="$PATH" HOME=/tmp CHECKPOINT_DISABLE=1 \
      DATABASE_URL="$OWNER_URL" DIRECT_URL="$OWNER_URL" node node_modules/prisma/build/index.js migrate deploy) > "$WORK/migrate.log" 2>&1; then
    ok "prisma migrate deploy ($(grep -c 'Applying migration' "$WORK/migrate.log") migraciones)"
  else
    bad "prisma migrate deploy" "$(tail -5 "$WORK/migrate.log")"
  fi
  TABLE="$(SQL reposteria_owner "$(pw postgres_owner_password)" require reposteria "select tablename from pg_tables where schemaname='public' and tablename <> '_prisma_migrations' order by 1 limit 1")"
else
  echo "  (MIGRATE_DIR sin definir: se crea una tabla de ejemplo con el rol propietario)"
  SQL reposteria_owner "$(pw postgres_owner_password)" require reposteria 'create table "Demo"(id serial primary key, nota text)' >/dev/null
  TABLE="Demo"
fi
APPPW="$(pw postgres_app_password)"
check "app puede leer tablas creadas por las migraciones (privilegios por defecto)" "t" \
  "$(SQL reposteria_app "$APPPW" require reposteria "select count(*) >= 0 from \"$TABLE\"")"
check "app NO puede crear tablas (sin DDL)" 1 "$(SQL reposteria_app "$APPPW" require reposteria 'create table x(id int)' | grep -c 'permission denied')"

# ── PgBouncer ──
info "PgBouncer (pgbouncer.ini del repositorio, modo transacción)"
mkdir -p "$WORK/bouncer"
sed -e "s#^reposteria = host=postgres port=5432#reposteria = host=127.0.0.1 port=$PGPORT_TEST#" \
    -e "s#^listen_addr = 0.0.0.0#listen_addr = 127.0.0.1#" \
    -e "s#^listen_port = 6432#listen_port = $BOUNCER_PORT#" \
    -e "s#/run/pgbouncer/userlist.txt#$WORK/bouncer/userlist.txt#" \
    -e "s#/run/secrets/pgbouncer_tls_cert#$SECRETS/pgbouncer_tls_cert#" \
    -e "s#/run/secrets/pgbouncer_tls_key#$SECRETS/pgbouncer_tls_key#" \
    "$REPO/infra/pgbouncer/pgbouncer.ini" > "$WORK/bouncer/pgbouncer.ini"
chown -R "$RUN_AS" "$WORK/bouncer"
as_pg "PGBOUNCER_CONFIG='$WORK/bouncer/pgbouncer.ini' PGBOUNCER_RUN_DIR='$WORK/bouncer' PGBOUNCER_APP_PASSWORD_FILE='$SECRETS/postgres_app_password' sh '$REPO/infra/pgbouncer/entrypoint.sh'" > "$WORK/pgbouncer.log" 2>&1 &
PIDS+=("$!")
for _ in $(seq 1 50); do (exec 3<>/dev/tcp/127.0.0.1/"$BOUNCER_PORT") 2>/dev/null && break; sleep 0.2; done
check "userlist.txt generado con permisos 0600" "600" "$(stat -c %a "$WORK/bouncer/userlist.txt")"
BQ() { PGPASSWORD="$2" psql -X -qtA "host=127.0.0.1 port=$BOUNCER_PORT dbname=reposteria user=$1 sslmode=${3:-require}" -c "$4" 2>&1 || true; }
check "app → PgBouncer (SCRAM + TLS cliente) → PostgreSQL" "1" "$(BQ reposteria_app "$APPPW" require 'select 1')"
check "PgBouncer → PostgreSQL va cifrado (pg_stat_ssl)" "t" "$(BQ reposteria_app "$APPPW" require 'select ssl from pg_stat_ssl where pid = pg_backend_pid()')"
check "contraseña incorrecta en PgBouncer: rechazada" 1 "$(BQ reposteria_app incorrecta require 'select 1' | grep -Ec 'authentication failed|SASL')"
check "rol no previsto (owner) por PgBouncer: rechazado" 1 "$(BQ reposteria_owner "$(pw postgres_owner_password)" require 'select 1' | grep -Ec 'authentication failed|no such user|SASL')"
check "pg_advisory_xact_lock dentro de una transacción (checkout.ts)" "t" \
  "$(PGPASSWORD="$APPPW" psql -X -qtA "host=127.0.0.1 port=$BOUNCER_PORT dbname=reposteria user=reposteria_app sslmode=require" -c 'begin' -c 'select pg_try_advisory_xact_lock(42)' -c 'commit' 2>&1 | grep -E '^(t|f)$')"

# ── Redis ──
info "Redis (redis.conf + entrypoint.sh del repositorio)"
mkdir -p "$WORK/redis"
sed -e "s#^bind 0.0.0.0#bind 127.0.0.1#" -e "s#^port 6379#port $REDIS_PORT#" \
    -e "s#^aclfile /data/users.acl#aclfile $WORK/redis/users.acl#" -e "s#^dir /data#dir $WORK/redis#" \
    "$REPO/infra/redis/redis.conf" > "$WORK/redis/redis.conf"
chown -R "$RUN_AS" "$WORK/redis"
as_pg "REDIS_CONFIG='$WORK/redis/redis.conf' REDIS_ACL_FILE='$WORK/redis/users.acl' REDIS_PASSWORD_FILE='$SECRETS/redis_password' REDIS_EXPORTER_PASSWORD_FILE='$SECRETS/redis_exporter_password' sh '$REPO/infra/redis/entrypoint.sh'" > "$WORK/redis.log" 2>&1 &
PIDS+=("$!")
for _ in $(seq 1 50); do redis-cli -p "$REDIS_PORT" PING >/dev/null 2>&1 && break; sleep 0.2; done
RPW="$(pw redis_password)"; EPW="$(pw redis_exporter_password)"
R()  { REDISCLI_AUTH="$RPW" redis-cli --no-auth-warning -p "$REDIS_PORT" "$@" 2>&1 || true; }
RE() { redis-cli --no-auth-warning -p "$REDIS_PORT" --user exporter --pass "$EPW" "$@" 2>&1 || true; }
check "sin contraseña: NOAUTH" 1 "$(redis-cli -p "$REDIS_PORT" GET x 2>&1 | grep -c NOAUTH)"
check "el aclfile no contiene la contraseña en claro" 0 "$(grep -c "$RPW" "$WORK/redis/users.acl" || true)"
check "app: MULTI INCR PEXPIRE GET EXEC (limiter.ts)" "1" "$(printf 'MULTI\nINCR rl:test\nPEXPIRE rl:test 60000\nGET rl:test\nEXEC\n' | REDISCLI_AUTH="$RPW" redis-cli --no-auth-warning -p "$REDIS_PORT" | tail -1)"
check "app: INFO permitido (comprobación de ioredis)" 1 "$(R INFO server | grep -c '^redis_version')"
check "app: CONFIG GET denegado por ACL" 1 "$(R CONFIG GET maxmemory | grep -c NOPERM)"
check "FLUSHALL eliminado" 1 "$(R FLUSHALL | grep -ci 'unknown command')"
check "KEYS eliminado" 1 "$(R KEYS '*' | grep -ci 'unknown command')"
check "EVAL (Lua) eliminado" 1 "$(R EVAL 'return 1' 0 | grep -ci 'unknown command')"
check "app: SUBSCRIBE denegado (sin canales)" 1 "$(timeout 3 redis-cli --no-auth-warning -p "$REDIS_PORT" -a "$RPW" SUBSCRIBE x 2>&1 | grep -c NOPERM || true)"
check "exporter: CONFIG GET maxmemory-policy = allkeys-lru" "allkeys-lru" "$(RE CONFIG GET maxmemory-policy | tail -1)"
check "exporter: sin acceso a claves" 1 "$(RE GET rl:test | grep -c NOPERM)"
check "maxmemory 256mb" "268435456" "$(RE CONFIG GET maxmemory | tail -1)"
check "sin persistencia (save vacío, appendonly no)" "|no" "$(RE CONFIG GET save | tail -1)|$(RE CONFIG GET appendonly | tail -1)"
if [ -n "${IOREDIS_DIR:-}" ] && [ -d "$IOREDIS_DIR/ioredis" ]; then
  out="$(NODE_PATH="$IOREDIS_DIR" REDIS_URL="redis://:$RPW@127.0.0.1:$REDIS_PORT/0" node -e '
    const Redis = require("ioredis");
    const r = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: true });
    r.on("error", () => {});
    (async () => {
      const res = await r.multi().incr("rl:io").pexpire("rl:io", 60000).get("rl:io").exec();
      const pong = await r.ping();
      console.log(r.status + "|" + pong + "|" + res.map(x => x[0] ? "ERR" : "ok").join(","));
      r.disconnect();
    })().catch(e => { console.log("ERROR " + e.message); process.exit(1); });' 2>&1)"
  check "ioredis (cliente real de la app) con la ACL" "ready|PONG|ok,ok,ok" "$out"
fi

# ── Copias de seguridad ──
info "Copias: pg_dump con RLS, pg_basebackup y WAL cifrados, recuperación PITR"
age-keygen -o "$WORK/age.key" 2>/dev/null
RECIPIENT="$(age-keygen -y "$WORK/age.key")"
chown -R "$RUN_AS" "$WORK/backups"
cat > "$WORK/backup.env" <<EOF
export BACKUP_AGE_RECIPIENT='$RECIPIENT'
export BACKUP_RETENTION_DAYS='35'
export BACKUP_DIR='$WORK/backups/dumps'
export BACKUP_BASE_DIR='$WORK/backups/base'
export BACKUP_WAL_DIR='$WORK/backups/wal'
export WAL_ARCHIVE_DIR='$WORK/wal-archive'
export BACKUP_DB_PASSWORD_FILE='$SECRETS/postgres_backup_password'
export PGHOST='127.0.0.1'
export PGPORT='$PGPORT_TEST'
export PGDATABASE='reposteria'
export PGUSER='reposteria_backup'
export PGSSLMODE='require'
export PGCONNECT_TIMEOUT='10'
EOF
chmod 0644 "$WORK/backup.env"
JOB() { as_pg "BACKUP_ENV_FILE='$WORK/backup.env' BACKUP_LOCK_DIR='$WORK/backups' PATH='$PG_BIN:$PATH' sh '$REPO/infra/postgres/backup/job.sh' $*" || true; }

# RLS activado en la tabla: pg_dump debe funcionar igualmente (BYPASSRLS + pg_read_all_data)
SQL reposteria_owner "$(pw postgres_owner_password)" require reposteria "alter table \"$TABLE\" enable row level security" >/dev/null
out="$(JOB dump sh -c "'pg_dump \"\$DATABASE_URL\" --no-owner | gzip | age -r \"\$BACKUP_AGE_RECIPIENT\" > \"\$BACKUP_DIR/prueba.sql.gz.age\"'" 2>&1)"
check "job.sh + pg_dump con RLS activo (rol reposteria_backup)" 1 "$(echo "$out" | grep -c '"level":"info"')"
check "volcado cifrado descifrable con la clave age" 1 "$(age -d -i "$WORK/age.key" "$WORK/backups/dumps/prueba.sql.gz.age" | gunzip | grep -c 'PostgreSQL database dump complete')"

# Datos antes de la copia base
SQL reposteria_owner "$(pw postgres_owner_password)" require reposteria 'create table pitr(id int primary key, momento text)' >/dev/null
SQL reposteria_owner "$(pw postgres_owner_password)" require reposteria "insert into pitr values (1, 'antes de la copia base')" >/dev/null
out="$(JOB basebackup bash "'$REPO/infra/postgres/backup/basebackup.sh'" 2>&1)"
BASE="$(ls "$WORK"/backups/base/reposteria-base-*.tar.gz.age 2>/dev/null | head -1)"
check "pg_basebackup cifrado (protocolo de replicación con TLS)" 1 "$( [ -s "$BASE" ] && echo "$out" | grep -c '"level":"info"' || echo 0)"
check "suma SHA-256 de la copia base correcta" "OK" "$(cd "$WORK/backups/base" && sha256sum -c "$(basename "$BASE").sha256" 2>/dev/null | awk '{print $2}')"

# Datos DESPUÉS de la copia base: solo se recuperan con el WAL
SQL reposteria_owner "$(pw postgres_owner_password)" require reposteria "insert into pitr values (2, 'después: solo en el WAL')" >/dev/null
# Cierra el segmento actual y espera a que archive_command lo haya archivado
SEG="$(as_pg "psql -X -qtA -h '$WORK/run' -p $PGPORT_TEST -U postgres -d postgres -c 'select pg_walfile_name(pg_switch_wal())'")"
for _ in $(seq 1 100); do
  [ "$(as_pg "psql -X -qtA -h '$WORK/run' -p $PGPORT_TEST -U postgres -d postgres -c 'select last_archived_wal from pg_stat_archiver'")" = "$SEG" ] && break
  sleep 0.2
done
check "archive_command deja segmentos comprimidos" 1 "$( [ "$(ls "$WORK"/wal-archive/*.gz 2>/dev/null | wc -l)" -ge 1 ] && echo 1 || echo 0)"
check "pg_stat_archiver sin fallos" 0 "$(as_pg "psql -X -qtA -h '$WORK/run' -p $PGPORT_TEST -U postgres -d postgres -c 'select failed_count from pg_stat_archiver'")"
out="$(JOB wal bash "'$REPO/infra/postgres/backup/wal-ship.sh'" 2>&1)"
check "wal-ship: segmentos cifrados y originales retirados" "0" "$(ls "$WORK"/wal-archive/*.gz 2>/dev/null | wc -l)"
check "wal-ship: .age en /backups/wal" 1 "$( [ "$(ls "$WORK"/backups/wal/*.gz.age 2>/dev/null | wc -l)" -ge 1 ] && echo 1 || echo 0)"

# Recuperación completa en un clúster nuevo (lo que se haría tras perder el servidor)
mkdir -p "$WORK/pitr" && chmod 0700 "$WORK/pitr"
age -d -i "$WORK/age.key" "$BASE" | gunzip | tar -x -C "$WORK/pitr"
chown -R "$RUN_AS" "$WORK/pitr"
cp "$WORK/age.key" "$WORK/pitr-age.key"; chown "$RUN_AS" "$WORK/pitr-age.key"
sed -e "s#^port = $PGPORT_TEST#port = $PGPORT_PITR#" -e "s#^archive_mode = on#archive_mode = off#" \
    "$WORK/etc/postgresql.conf" > "$WORK/etc/pitr.conf"
cat >> "$WORK/etc/pitr.conf" <<EOF
restore_command = 'age -d -i $WORK/pitr-age.key $WORK/backups/wal/%f.gz.age | gunzip > %p'
recovery_target_action = 'promote'
EOF
chown "$RUN_AS" "$WORK/etc/pitr.conf"
touch "$WORK/pitr/recovery.signal"; chown "$RUN_AS" "$WORK/pitr/recovery.signal"
if as_pg "'$PG_BIN/pg_ctl' -D '$WORK/pitr' -l '$WORK/pitr.log' -w -t 60 start -o \"-c config_file=$WORK/etc/pitr.conf -c hba_file=$WORK/etc/pg_hba.conf -c unix_socket_directories=$WORK/pitr\"" >/dev/null; then
  for _ in $(seq 1 50); do [ "$(as_pg "psql -X -qtA -h '$WORK/pitr' -p $PGPORT_PITR -U postgres -d postgres -c 'select pg_is_in_recovery()'" 2>/dev/null)" = "f" ] && break; sleep 0.2; done
  check "PITR: datos de antes y de después de la copia base recuperados" "1,2" \
    "$(as_pg "psql -X -qtA -h '$WORK/pitr' -p $PGPORT_PITR -U postgres -d reposteria -c 'select id from pitr order by id'" | paste -sd, -)"
else
  bad "PITR: arranque del clúster restaurado" "$(tail -10 "$WORK/pitr.log")"
fi

# ── Planificador ──
info "Planificador (infra/scheduler/run-job.sh contra un servidor simulado)"
python3 -I - "$MOCK_PORT" "$(pw cron_secret)" > "$WORK/mock.log" 2>&1 <<'PY' &
import http.server, sys
port, secret = int(sys.argv[1]), sys.argv[2]
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        ok = self.headers.get("Authorization") == "Bearer " + secret
        code = 200 if ok and self.path in ("/api/cron", "/api/cron/jobs") else 401
        self.send_response(code); self.send_header("Content-Length", "2"); self.end_headers(); self.wfile.write(b"{}")
    def log_message(self, *a): pass
http.server.HTTPServer(("127.0.0.1", port), H).serve_forever()
PY
PIDS+=("$!")
for _ in $(seq 1 50); do curl -s -o /dev/null "http://127.0.0.1:$MOCK_PORT/" && break; sleep 0.2; done
SJ() { SCHEDULER_TARGET_URL="http://127.0.0.1:$MOCK_PORT" CRON_SECRET_FILE="$1" SCHEDULER_LOCK_DIR="$WORK" sh "$REPO/infra/scheduler/run-job.sh" "${@:2}" 2>&1 || true; }
check "run-job.sh con el secreto correcto → ok" 1 "$(SJ "$SECRETS/cron_secret" jobs /api/cron/jobs 10 | grep -c '"level":"info"')"
echo -n "otro" > "$WORK/bad_secret"
out="$(SJ "$WORK/bad_secret" daily /api/cron 10 || true)"
check "run-job.sh con secreto incorrecto → error (401)" 1 "$(echo "$out" | grep -c '"http":"401"')"

echo
info "Resultado: $PASS correctas, $FAIL fallidas"
[ "$FAIL" -eq 0 ]
