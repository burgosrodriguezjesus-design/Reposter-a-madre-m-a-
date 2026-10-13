#!/usr/bin/env bash
# Aplica la configuración de Cloudflare de esta carpeta a una zona mediante la API.
# PLANTILLA NO PROBADA CONTRA LA API REAL DE CLOUDFLARE.
#
# Uso:
#   CF_API_TOKEN=... CF_ZONE_ID=... CF_ACCOUNT_ID=... infra/cloudflare/apply.sh [opciones]
#
# Opciones:
#   --apply                 Aplica de verdad. Sin ella solo valida los JSON, adapta las
#                           reglas al plan y muestra lo que haría (modo prueba).
#   --plan free|pro|business
#                           Adapta las reglas a los límites del plan (por defecto: pro).
#                             free: 5 reglas personalizadas, 1 de rate limit (10 s), sin
#                                   conjuntos gestionados ni Super Bot Fight Mode.
#                             pro:  Super Bot Fight Mode; 2 reglas de rate limit.
#                             business: todas las reglas.
#   --skip-aop              No activa Authenticated Origin Pulls (tls_client_auth).
#   --out DIR               Guarda en DIR los JSON finales que se enviarían.
#
# Permisos del token (mínimos): Zone Settings:Edit, Zone WAF:Edit, Cache Rules:Edit,
# Bot Management:Edit (o Zone:Edit en Free), Account Filter Lists:Edit, SSL and Certificates:Edit.
#
# ATENCIÓN: PUT sobre el "entrypoint" de cada fase SUSTITUYE todas las reglas de esa
# fase. Antes de aplicar se guarda la configuración actual en ./cloudflare-backup-<fecha>/.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API="https://api.cloudflare.com/client/v4"
APPLY=0
PLAN="pro"
SKIP_AOP=0
OUT=""

while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --plan) PLAN="${2:?falta free|pro|business}"; shift ;;
    --skip-aop) SKIP_AOP=1 ;;
    --out) OUT="${2:?falta el directorio}"; shift ;;
    -h|--help) sed -n '2,27p' "$0"; exit 0 ;;
    *) echo "Opción desconocida: $1" >&2; exit 2 ;;
  esac
  shift
done

case "$PLAN" in free|pro|business) ;; *) echo "--plan debe ser free, pro o business" >&2; exit 2 ;; esac
command -v jq >/dev/null || { echo "Se necesita jq" >&2; exit 1; }
command -v curl >/dev/null || { echo "Se necesita curl" >&2; exit 1; }

BOT_FILE="bot-management.pro.json"
[ "$PLAN" = "free" ] && BOT_FILE="bot-management.free.json"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# --- 1) Validación local de los JSON -------------------------------------------------
FILES=(zone-settings.json "$BOT_FILE")
for p in "$DIR"/rulesets/*.json; do
  [ -e "$p" ] && FILES+=("rulesets/${p##*/}")
done
for f in "${FILES[@]}"; do
  jq empty "$DIR/$f" || { echo "JSON inválido: $f" >&2; exit 1; }
done
for f in "$DIR"/rulesets/*.json; do
  jq -e '.rules | type == "array" and length > 0
         and all(.[]; has("ref") and has("expression") and has("action") and has("description"))
         and ((map(.ref) | unique | length) == length)' "$f" >/dev/null \
    || { echo "Estructura de reglas inválida (ref/expression/action/description o ref duplicado): $f" >&2; exit 1; }
done
echo "OK  JSON válidos: ${FILES[*]}"

# --- 2) Adaptación al plan -------------------------------------------------------------
# Fases a aplicar: fase:fichero
RULESETS=(
  "http_request_firewall_custom:custom-rules.json"
  "http_ratelimit:rate-limiting.json"
  "http_request_cache_settings:cache-rules.json"
)
[ "$PLAN" != "free" ] && RULESETS+=("http_request_firewall_managed:managed-rules.json")

prepare() {
  # prepare fichero -> escribe $tmp/<fichero> con {description, rules} adaptado al plan
  local file="$1" filter='{description, rules}'
  case "$PLAN:$file" in
    free:custom-rules.json)
      # Máx. 5 reglas personalizadas y sin fase de Super Bot Fight Mode
      filter='{description, rules: [.rules[]
                | select(.ref | IN("rp_stripe_webhook_skip","rp_sensitive_paths","rp_internal_routes","rp_webhook_post_only","rp_http_methods"))
                | if .action == "skip" then .action_parameters.phases |= map(select(. != "http_request_sbfm")) else . end]}'
      ;;
    free:rate-limiting.json)
      # 1 regla, periodo y bloqueo de 10 s: se conserva solo la del login del panel
      filter='{description, rules: [.rules[] | select(.ref == "rp_rl_admin_login")
                | .ratelimit.period = 10 | .ratelimit.requests_per_period = 3 | .ratelimit.mitigation_timeout = 10]}'
      ;;
    pro:rate-limiting.json)
      filter='{description, rules: [.rules[] | select(.ref | IN("rp_rl_admin_login","rp_rl_orders_checkout"))]}'
      ;;
  esac
  jq "$filter" "$DIR/rulesets/$file" > "$tmp/$file"
}

for entry in "${RULESETS[@]}"; do
  prepare "${entry#*:}"
done
cp "$DIR/$BOT_FILE" "$tmp/$BOT_FILE"
if [ "$SKIP_AOP" -eq 1 ]; then
  jq '.items |= map(select(.id != "tls_client_auth"))' "$DIR/zone-settings.json" > "$tmp/zone-settings.json"
else
  cp "$DIR/zone-settings.json" "$tmp/zone-settings.json"
fi
if [ -n "$OUT" ]; then
  mkdir -p "$OUT"
  cp "$tmp"/*.json "$OUT"/
  echo "JSON finales guardados en $OUT"
fi

echo
echo "Plan: $PLAN"
echo " - Ajustes de zona: $(jq -r '[.items[].id] | join(", ")' "$tmp/zone-settings.json")"
echo " - Lista de IPs de cuenta \$stripe_webhooks (crear si no existe y sincronizar con Stripe)"
for entry in "${RULESETS[@]}"; do
  phase="${entry%%:*}" file="${entry#*:}"
  echo " - Fase $phase <- $file: $(jq -r '[.rules[].ref] | join(", ")' "$tmp/$file")"
done
echo " - Bot management <- $BOT_FILE"

if [ "$APPLY" -eq 0 ]; then
  echo
  echo "Modo prueba: no se ha llamado a la API. Repite con --apply para aplicar."
  exit 0
fi

: "${CF_API_TOKEN:?Define CF_API_TOKEN}"
: "${CF_ZONE_ID:?Define CF_ZONE_ID}"
: "${CF_ACCOUNT_ID:?Define CF_ACCOUNT_ID (para la lista de IPs de Stripe)}"

cf() {
  # cf MÉTODO RUTA [fichero-json]
  local method="$1" path="$2" body="${3:-}" out
  if [ -n "$body" ]; then
    out="$(curl -sS -X "$method" "$API$path" -H "Authorization: Bearer $CF_API_TOKEN" \
      -H "Content-Type: application/json" --data @"$body")"
  else
    out="$(curl -sS -X "$method" "$API$path" -H "Authorization: Bearer $CF_API_TOKEN")"
  fi
  if [ "$(jq -r '.success' <<<"$out" 2>/dev/null)" != "true" ]; then
    echo "ERROR en $method $path:" >&2
    jq '.errors' <<<"$out" >&2 2>/dev/null || printf '%s\n' "$out" >&2
    return 1
  fi
  printf '%s' "$out"
}

BACKUP="cloudflare-backup-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP"
echo
echo "Copia de la configuración actual en ./$BACKUP"
cf GET "/zones/$CF_ZONE_ID/settings" > "$BACKUP/zone-settings.json" || true
for entry in "${RULESETS[@]}"; do
  phase="${entry%%:*}"
  cf GET "/zones/$CF_ZONE_ID/rulesets/phases/$phase/entrypoint" > "$BACKUP/$phase.json" 2>/dev/null \
    || echo "  (fase $phase sin reglas previas)"
done
cf GET "/zones/$CF_ZONE_ID/bot_management" > "$BACKUP/bot_management.json" || true

# --- 3) Ajustes de zona (Full strict, TLS >= 1.2, HSTS, AOP...) ------------------------
SETTINGS_FAILED=0
while read -r item; do
  id="$(jq -r '.id' <<<"$item")"
  jq '{value: .value}' <<<"$item" > "$tmp/setting.json"
  # Algunos ajustes no existen en todos los planes: se avisa y se sigue.
  if cf PATCH "/zones/$CF_ZONE_ID/settings/$id" "$tmp/setting.json" >/dev/null; then
    echo "OK  ajuste $id"
  else
    echo "AVISO: no se pudo aplicar el ajuste $id" >&2
    SETTINGS_FAILED=1
  fi
done < <(jq -c '.items[]' "$tmp/zone-settings.json")
[ "$SETTINGS_FAILED" -eq 0 ] || echo "AVISO: revisa los ajustes que han fallado" >&2

# --- 4) Lista de IPs de webhooks de Stripe (la usan las reglas) -----------------------
list_id="$(cf GET "/accounts/$CF_ACCOUNT_ID/rules/lists" | jq -r '.result[] | select(.name=="stripe_webhooks") | .id')"
if [ -z "$list_id" ]; then
  jq -n '{name:"stripe_webhooks", kind:"ip", description:"IPs de webhooks de Stripe (https://stripe.com/files/ips/ips_webhooks.json)"}' > "$tmp/list.json"
  list_id="$(cf POST "/accounts/$CF_ACCOUNT_ID/rules/lists" "$tmp/list.json" | jq -r '.result.id')"
  echo "OK  lista stripe_webhooks creada ($list_id)"
fi
curl -fsS --max-time 20 https://stripe.com/files/ips/ips_webhooks.json \
  | jq '[.WEBHOOKS[] | {ip: ., comment: "Stripe webhooks"}]' > "$tmp/items.json"
[ "$(jq length "$tmp/items.json")" -ge 5 ] || { echo "Lista de IPs de Stripe sospechosamente corta" >&2; exit 1; }
cf PUT "/accounts/$CF_ACCOUNT_ID/rules/lists/$list_id/items" "$tmp/items.json" >/dev/null
echo "OK  lista stripe_webhooks actualizada ($(jq length "$tmp/items.json") IPs)"

# --- 5) Reglas por fase ----------------------------------------------------------------
for entry in "${RULESETS[@]}"; do
  phase="${entry%%:*}" file="${entry#*:}"
  cf PUT "/zones/$CF_ZONE_ID/rulesets/phases/$phase/entrypoint" "$tmp/$file" >/dev/null
  echo "OK  fase $phase ($file)"
done

# --- 6) Bots ---------------------------------------------------------------------------
cf PUT "/zones/$CF_ZONE_ID/bot_management" "$tmp/$BOT_FILE" >/dev/null
echo "OK  bot management ($BOT_FILE)"

echo
echo "Hecho. Comprueba con los comandos de la sección 'Verificación' del README."
