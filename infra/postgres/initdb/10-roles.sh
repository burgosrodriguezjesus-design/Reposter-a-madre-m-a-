#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  Inicialización (solo la PRIMERA vez, con el volumen de datos vacío)
#  Roles con mínimo privilegio + base de datos de la repostería
# ════════════════════════════════════════════════════════════════════
#  Lo ejecuta docker-entrypoint.sh del contenedor "postgres" como usuario postgres, por el
#  socket local (peer). Si el volumen ya tiene datos NO se ejecuta: para cambiar contraseñas
#  después, usa "\password <rol>" en psql (ver infra/postgres/README.md).
#
#  Roles (los nombres están también en pg_hba.conf y pgbouncer; no los cambies solo aquí):
#   reposteria_owner   propietario del esquema; SOLO para "prisma migrate deploy" (servicio migrate)
#   reposteria_app     la app en ejecución, a través de PgBouncer; solo DML (sin DDL)
#   reposteria_backup  pg_dump + pg_basebackup: lectura de todo (pg_read_all_data), BYPASSRLS
#                      (pg_dump exige saltarse RLS para volcar tablas con RLS) y REPLICATION
#   monitoring         postgres_exporter: solo estadísticas (pg_monitor)
#
#  Privilegios sobre tablas: aquí solo se fijan PRIVILEGIOS POR DEFECTO para que las tablas que
#  creen las migraciones sean usables por la app (SELECT/INSERT/UPDATE/DELETE). Después de cada
#  "migrate deploy" se aplica prisma/sql/least-privilege.sql, que activa RLS, retira permisos
#  (p. ej. UPDATE/DELETE sobre la auditoría) y fija statement_timeout/lock_timeout por rol.
#
#  Las contraseñas se leen de secretos de Docker con el comando \set de psql (no aparecen en
#  la lista de procesos) y el registro de sentencias se desactiva en esta sesión para que el
#  CREATE ROLE ... PASSWORD no quede en el log (log_statement = 'ddl').
# ════════════════════════════════════════════════════════════════════
# docker-entrypoint.sh ejecuta este archivo si es ejecutable o lo carga con "." si no lo es
# (depende de los permisos con que se monte). Todo va dentro de una subshell para no alterar
# las opciones ni las variables del entrypoint en el segundo caso.
_reposteria_init_roles() (
set -euo pipefail

SECRETS=${PG_SECRETS_DIR:-/run/secrets}
for s in postgres_owner_password postgres_app_password postgres_backup_password postgres_monitoring_password; do
  if [ ! -s "$SECRETS/$s" ]; then
    echo "10-roles.sh: falta el secreto $SECRETS/$s" >&2
    exit 1
  fi
done

psql -v ON_ERROR_STOP=1 --no-psqlrc --username postgres --dbname postgres <<EOSQL
SET log_statement = 'none';
SET log_min_error_statement = 'panic';
SET log_min_duration_statement = -1;

\set owner_pw \`cat "$SECRETS/postgres_owner_password"\`
\set app_pw \`cat "$SECRETS/postgres_app_password"\`
\set backup_pw \`cat "$SECRETS/postgres_backup_password"\`
\set monitoring_pw \`cat "$SECRETS/postgres_monitoring_password"\`

CREATE ROLE reposteria_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT 5 PASSWORD :'owner_pw';
CREATE ROLE reposteria_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT 60 PASSWORD :'app_pw';
CREATE ROLE reposteria_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE REPLICATION BYPASSRLS
  CONNECTION LIMIT 4 PASSWORD :'backup_pw';
CREATE ROLE monitoring LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT 3 PASSWORD :'monitoring_pw';

\unset owner_pw
\unset app_pw
\unset backup_pw
\unset monitoring_pw

GRANT pg_read_all_data TO reposteria_backup;
GRANT pg_monitor TO monitoring;

CREATE DATABASE reposteria OWNER reposteria_owner ENCODING 'UTF8' TEMPLATE template0;
REVOKE ALL ON DATABASE reposteria FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE reposteria TO reposteria_app;
GRANT CONNECT ON DATABASE reposteria TO reposteria_backup, monitoring;
-- La BD "postgres" solo para administración y monitorización
REVOKE ALL ON DATABASE postgres FROM PUBLIC;
GRANT CONNECT ON DATABASE postgres TO monitoring;
EOSQL

psql -v ON_ERROR_STOP=1 --no-psqlrc --username postgres --dbname reposteria <<'EOSQL'
SET log_statement = 'none';

-- Estadísticas de consultas (normalizadas, sin valores) para monitorización
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Esquema public propiedad del rol de migraciones; nadie más crea objetos en él
ALTER SCHEMA public OWNER TO reposteria_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO reposteria_app, reposteria_backup, monitoring;

-- Privilegios por defecto sobre lo que creen las migraciones (las ejecuta reposteria_owner).
-- least-privilege.sql los recorta después tabla a tabla.
ALTER DEFAULT PRIVILEGES FOR ROLE reposteria_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO reposteria_app;
ALTER DEFAULT PRIVILEGES FOR ROLE reposteria_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO reposteria_app;
ALTER DEFAULT PRIVILEGES FOR ROLE reposteria_owner IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO reposteria_app;
ALTER DEFAULT PRIVILEGES FOR ROLE reposteria_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
EOSQL

echo "10-roles.sh: roles y base de datos 'reposteria' creados"
)

_reposteria_init_roles
