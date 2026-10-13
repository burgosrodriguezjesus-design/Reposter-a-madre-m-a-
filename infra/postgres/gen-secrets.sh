#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  Genera los secretos y certificados internos del despliegue autoalojado
# ════════════════════════════════════════════════════════════════════
#  Uso (en el servidor, como root, UNA vez antes del primer "docker compose up"):
#    SECRETS_DIR=/etc/reposteria/secrets infra/postgres/gen-secrets.sh
#
#  Crea en SECRETS_DIR (directorio 0700 de root, FUERA del repositorio):
#    postgres_superuser_password  postgres_owner_password  postgres_app_password
#    postgres_backup_password     postgres_monitoring_password
#    redis_password               redis_exporter_password   cron_secret
#    internal-ca.crt / internal-ca.key   CA interna (la clave: guárdala fuera del servidor)
#    postgres_tls_cert / postgres_tls_key     certificado de "postgres" (SAN DNS:postgres)
#    pgbouncer_tls_cert / pgbouncer_tls_key   certificado de "pgbouncer" (SAN DNS:pgbouncer)
#    migrate.env                  DATABASE_URL/DIRECT_URL del rol propietario (servicio migrate)
#    app.env.fragment             líneas para tu .env.production (DATABASE_URL, REDIS_URL, CRON_SECRET)
#
#  Permisos: los secretos que leen los contenedores quedan 0644 DENTRO de un directorio 0700 de
#  root. Docker Compose (sin Swarm) monta cada secreto como un bind mount del archivo con sus
#  permisos del host, y cada servicio declara solo los secretos que necesita; así los procesos sin
#  privilegios de cada contenedor pueden leer los suyos y nadie en el host (salvo root) los ve.
#  La clave de la CA y los .env quedan 0600.
#
#  No sobrescribe nada que ya exista (idempotente). Para rotar un secreto: bórralo, vuelve a
#  ejecutar el script y sigue el procedimiento de rotación de infra/postgres/README.md (las
#  contraseñas de PostgreSQL NO cambian solas: el volumen ya inicializado conserva las antiguas).
# ════════════════════════════════════════════════════════════════════
set -euo pipefail
umask 077

SECRETS_DIR="${SECRETS_DIR:-/etc/reposteria/secrets}"
DB_NAME=reposteria
CERT_DAYS="${CERT_DAYS:-825}"

command -v openssl >/dev/null || { echo "Falta openssl" >&2; exit 1; }

mkdir -p "$SECRETS_DIR"
chmod 0700 "$SECRETS_DIR"
cd "$SECRETS_DIR"

created=()

# Contraseña aleatoria de 256 bits en hexadecimal: sin caracteres que haya que escapar en URLs.
gen_password() {
  local name="$1"
  if [ ! -s "$name" ]; then
    openssl rand -hex 32 | tr -d '\n' > "$name"
    created+=("$name")
  fi
  chmod 0644 "$name"
}

for s in postgres_superuser_password postgres_owner_password postgres_app_password \
         postgres_backup_password postgres_monitoring_password \
         redis_password redis_exporter_password cron_secret; do
  gen_password "$s"
done

# ── CA interna (solo para TLS dentro de la red "data") ──
# Se decide por el CERTIFICADO de la CA: su clave puede haberse retirado del servidor.
if [ ! -s internal-ca.crt ]; then
  openssl ecparam -name prime256v1 -genkey -noout -out internal-ca.key
  openssl req -x509 -new -key internal-ca.key -sha256 -days 3650 \
    -subj "/CN=Reposteria CA interna" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -out internal-ca.crt
  created+=(internal-ca.key internal-ca.crt)
fi
[ -f internal-ca.key ] && chmod 0600 internal-ca.key
chmod 0644 internal-ca.crt

gen_cert() { # gen_cert <nombre-servicio> <prefijo-archivo>
  local cn="$1" prefix="$2"
  if [ ! -s "${prefix}_tls_key" ]; then
    if [ ! -s internal-ca.key ]; then
      echo "Falta internal-ca.key para emitir el certificado de $cn: recupérala de tu gestor de secretos" >&2
      exit 1
    fi
    openssl ecparam -name prime256v1 -genkey -noout -out "${prefix}_tls_key"
    openssl req -new -key "${prefix}_tls_key" -subj "/CN=$cn" -out "${prefix}.csr"
    printf 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:%s\n' "$cn" > "${prefix}.ext"
    openssl x509 -req -in "${prefix}.csr" -CA internal-ca.crt -CAkey internal-ca.key \
      -CAcreateserial -days "$CERT_DAYS" -sha256 -extfile "${prefix}.ext" -out "${prefix}_tls_cert"
    rm -f "${prefix}.csr" "${prefix}.ext"
    created+=("${prefix}_tls_key" "${prefix}_tls_cert")
  fi
  # 0644: el proceso del contenedor (no root) debe leerla; entrypoint.sh de postgres la copia a
  # un tmpfs con 0600 (PostgreSQL lo exige). Protegida por el directorio 0700 del host.
  chmod 0644 "${prefix}_tls_key" "${prefix}_tls_cert"
}
gen_cert postgres postgres
gen_cert pgbouncer pgbouncer

owner_pw="$(cat postgres_owner_password)"
app_pw="$(cat postgres_app_password)"
redis_pw="$(cat redis_password)"
cron="$(cat cron_secret)"

if [ ! -s migrate.env ]; then
  cat > migrate.env <<EOF
# Solo para el servicio "migrate" (rol propietario, conexión DIRECTA a postgres, sin PgBouncer)
DATABASE_URL=postgresql://reposteria_owner:${owner_pw}@postgres:5432/${DB_NAME}?sslmode=require
DIRECT_URL=postgresql://reposteria_owner:${owner_pw}@postgres:5432/${DB_NAME}?sslmode=require
EOF
  created+=(migrate.env)
fi
chmod 0600 migrate.env

cat > app.env.fragment <<EOF
# Copia estas líneas a tu .env.production (no versionado, 0600). La app NO recibe la
# contraseña del propietario: DIRECT_URL apunta al rol de la app (solo la usa Prisma para
# migraciones, que en este despliegue ejecuta el servicio "migrate").
DATABASE_URL=postgresql://reposteria_app:${app_pw}@pgbouncer:6432/${DB_NAME}?pgbouncer=true&connection_limit=10&sslmode=prefer
DIRECT_URL=postgresql://reposteria_app:${app_pw}@pgbouncer:6432/${DB_NAME}?pgbouncer=true&sslmode=prefer
REDIS_URL=redis://:${redis_pw}@redis:6379/0
CRON_SECRET=${cron}
EOF
chmod 0600 app.env.fragment

if [ "${#created[@]}" -gt 0 ]; then
  echo "Creados en $SECRETS_DIR: ${created[*]}"
else
  echo "No se ha creado nada nuevo en $SECRETS_DIR (ya existía todo)."
fi
echo "Siguiente paso: añade el contenido de $SECRETS_DIR/app.env.fragment a tu .env.production"
echo "y guarda internal-ca.key fuera del servidor (gestor de secretos) y bórrala de aquí."
