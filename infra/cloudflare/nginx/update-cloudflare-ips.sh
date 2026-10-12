#!/usr/bin/env bash
# Regenera cloudflare-ips.conf (realip + mapa $from_cloudflare) con los rangos
# publicados por Cloudflare y, opcionalmente, valida y recarga nginx.
#
# Uso:
#   infra/cloudflare/nginx/update-cloudflare-ips.sh [/etc/nginx/snippets/cloudflare-ips.conf] [--reload]
#
# Variables opcionales (útiles para pruebas sin red):
#   CF_IPS_V4_URL (por defecto https://www.cloudflare.com/ips-v4)
#   CF_IPS_V6_URL (por defecto https://www.cloudflare.com/ips-v6)
#
# Programar con cron/systemd timer, p. ej. semanal:
#   17 5 * * 1 root /opt/reposteria/infra/cloudflare/nginx/update-cloudflare-ips.sh /etc/nginx/snippets/cloudflare-ips.conf --reload
set -euo pipefail

OUT="${1:-/etc/nginx/snippets/cloudflare-ips.conf}"
RELOAD="${2:-}"
V4_URL="${CF_IPS_V4_URL:-https://www.cloudflare.com/ips-v4}"
V6_URL="${CF_IPS_V6_URL:-https://www.cloudflare.com/ips-v6}"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

fetch() {
  curl -fsS --max-time 20 --retry 3 "$1" | tr -d '\r' | sed '/^[[:space:]]*$/d'
}

fetch "$V4_URL" > "$tmpdir/v4"
fetch "$V6_URL" > "$tmpdir/v6"

# Validación básica: formato CIDR y un mínimo de rangos (evita escribir un fichero
# vacío si Cloudflare o la red devuelven algo inesperado).
grep -Eqv '^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$' "$tmpdir/v4" && { echo "ERROR: rango IPv4 con formato inesperado" >&2; exit 1; }
grep -Eqv '^[0-9a-fA-F:]+/[0-9]{1,3}$' "$tmpdir/v6" && { echo "ERROR: rango IPv6 con formato inesperado" >&2; exit 1; }
if [ "$(wc -l < "$tmpdir/v4")" -lt 5 ] || [ "$(wc -l < "$tmpdir/v6")" -lt 3 ]; then
  echo "ERROR: demasiados pocos rangos recibidos; no se modifica $OUT" >&2
  exit 1
fi

{
  echo "# Rangos de IP de Cloudflare para el origen nginx (contexto http)."
  echo "# GENERADO por update-cloudflare-ips.sh el $(date -u +%Y-%m-%dT%H:%M:%SZ). No editar a mano."
  echo
  cat "$tmpdir/v4" "$tmpdir/v6" | sed 's/^/set_real_ip_from /; s/$/;/'
  echo "real_ip_header CF-Connecting-IP;"
  echo "real_ip_recursive off;"
  echo
  echo 'geo $realip_remote_addr $from_cloudflare {'
  echo "    default 0;"
  cat "$tmpdir/v4" "$tmpdir/v6" | sed 's/^/    /; s/$/ 1;/'
  echo "}"
} > "$tmpdir/cloudflare-ips.conf"

mkdir -p "$(dirname "$OUT")"
if [ -f "$OUT" ]; then
  cp -p "$OUT" "$OUT.bak"
fi
# Sustitución atómica
install -m 0644 "$tmpdir/cloudflare-ips.conf" "$OUT.new"
mv -f "$OUT.new" "$OUT"
echo "Escrito $OUT ($(wc -l < "$tmpdir/v4") rangos IPv4, $(wc -l < "$tmpdir/v6") IPv6)"

if [ "$RELOAD" = "--reload" ]; then
  if ! nginx -t; then
    echo "ERROR: nginx -t falla con el fichero nuevo; se restaura el anterior" >&2
    [ -f "$OUT.bak" ] && mv -f "$OUT.bak" "$OUT"
    exit 1
  fi
  nginx -s reload
  echo "nginx recargado"
fi
