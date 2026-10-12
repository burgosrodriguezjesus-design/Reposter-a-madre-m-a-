#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  Validación local de la configuración de nginx (+ ModSecurity/CRS opcional)
# ════════════════════════════════════════════════════════════════════
#  Uso básico (solo sintaxis, sin WAF):
#    infra/nginx/test/validate.sh
#  Con ModSecurity v3 + OWASP CRS reales y pruebas funcionales (curl contra un backend simulado):
#    MODSEC_MODULE=/ruta/ngx_http_modsecurity_module.so \
#    MODSEC_LD_LIBRARY_PATH=/ruta/libs \
#    CRS_DIR=/ruta/coreruleset-4.x  UNICODE_MAPPING=/ruta/unicode.mapping \
#    RUN_FUNCTIONAL=1 infra/nginx/test/validate.sh
#
#  Qué hace:
#   1. Copia infra/nginx a un directorio temporal, sustituye ${SERVER_NAME} (como el entrypoint
#      de la imagen) y reescribe las rutas absolutas /etc/nginx/... a ese directorio.
#   2. Genera un certificado autofirmado temporal.
#   3. Adapta lo que un nginx local antiguo no soporta (se avisa en la salida):
#        "http2 on;" (≥ 1.25.1) → "listen ... http2";  "resolve" en upstream (≥ 1.27.3) → se quita;
#      y apunta el upstream "app:3000" al backend simulado (127.0.0.1:$BACKEND_PORT).
#   4. nginx -t. Con MODSEC_MODULE, además carga ModSecurity con un modsecurity.conf equivalente
#      al de la imagen CRS (con los valores de docker-compose.prod.yml), crs-setup.conf con la
#      misma configuración que aplican las variables de entorno, las reglas CRS y nuestras
#      exclusiones.
#   5. Con RUN_FUNCTIONAL=1 arranca nginx + un backend Python y comprueba respuestas esperadas.
#  No modifica nada fuera del directorio temporal.
# ════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$(cd "$SCRIPT_DIR/.." && pwd)"
NGINX_BIN="${NGINX_BIN:-nginx}"
SERVER_NAME="${SERVER_NAME:-reposteria.test}"
HTTP_PORT="${TEST_HTTP_PORT:-8080}"
HTTPS_PORT="${TEST_HTTPS_PORT:-8443}"
BACKEND_PORT="${BACKEND_PORT:-3999}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/nginx-validate.XXXXXX")"
# Las peticiones de prueba van siempre directas a 127.0.0.1 (nunca por un proxy HTTP(S) del entorno)
export NO_PROXY="*" no_proxy="*"
ETC="$WORK/etc-nginx"
PIDS=()

cleanup() {
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null || true; done
  if [ -f "$WORK/nginx.pid" ]; then kill "$(cat "$WORK/nginx.pid")" 2>/dev/null || true; fi
  if [ "${KEEP_WORKDIR:-0}" != "1" ]; then rm -rf "$WORK"; else echo "Directorio conservado: $WORK"; fi
}
trap cleanup EXIT

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[aviso]\033[0m %s\n' "$*"; }

version_ge() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]; }

NGINX_VERSION="$("$NGINX_BIN" -v 2>&1 | sed -n 's#.*nginx/\([0-9.]*\).*#\1#p')"
info "nginx local: $NGINX_VERSION ($NGINX_BIN)"

# ── 1. Copia y renderizado de plantillas ──
mkdir -p "$ETC/conf.d" "$ETC/snippets" "$ETC/tls" "$ETC/modules-enabled" "$WORK/acme" "$WORK/modsec"
cp "$SRC/nginx.conf" "$ETC/nginx.conf"
cp "$SRC"/snippets/*.conf "$ETC/snippets/"
cp "$SRC/conf.d/logging.conf" "$ETC/conf.d/logging.conf"
# Equivalente a envsubst con solo SERVER_NAME definido
sed "s/\${SERVER_NAME}/$SERVER_NAME/g" "$SRC/conf.d/reposteria.conf.template" > "$ETC/conf.d/default.conf"
if grep -q '\${' "$ETC/conf.d/default.conf"; then
  echo "ERROR: quedan variables sin sustituir en la plantilla" >&2; exit 1
fi
if [ -f /etc/nginx/mime.types ]; then cp /etc/nginx/mime.types "$ETC/mime.types"; else
  printf 'types { text/html html; text/css css; application/javascript js; }\n' > "$ETC/mime.types"; fi

# ── 2. Certificado autofirmado temporal ──
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 2 \
  -subj "/CN=$SERVER_NAME" -addext "subjectAltName=DNS:$SERVER_NAME" \
  -keyout "$ETC/tls/privkey.pem" -out "$ETC/tls/fullchain.pem" 2>/dev/null
cp "$ETC/tls/fullchain.pem" "$ETC/tls/chain.pem"

# ── 3. Adaptaciones para el entorno local ──
grep -rl '/etc/nginx/' "$ETC" | xargs sed -i "s#/etc/nginx/#$ETC/#g"
sed -i "s#/var/www/acme#$WORK/acme#g" "$ETC/conf.d/default.conf"
sed -i "s#pid /tmp/nginx.pid;#pid $WORK/nginx.pid;#" "$ETC/nginx.conf"
for d in client-body proxy fastcgi uwsgi scgi; do sed -i "s#/tmp/nginx-$d#$WORK/tmp-$d#" "$ETC/nginx.conf"; done
sed -i "s#/tmp/nginx-cache-#$WORK/cache-#g" "$ETC/snippets/http-cache.conf"
sed -i "s#resolver 127.0.0.11 #resolver 127.0.0.1 #" "$ETC/nginx.conf"
sed -i "s#server app:3000#server 127.0.0.1:$BACKEND_PORT#" "$ETC/snippets/http-upstream.conf"
sed -i "s#listen 8080 #listen $HTTP_PORT #; s#listen 8443 #listen $HTTPS_PORT #" "$ETC/conf.d/default.conf"
if ! version_ge "$NGINX_VERSION" "1.25.1"; then
  warn "nginx < 1.25.1: 'http2 on;' se convierte en 'listen ... ssl http2' solo para esta prueba"
  sed -i '/^\s*http2 on;/d' "$ETC/conf.d/default.conf"
  sed -i "s#listen $HTTPS_PORT ssl;#listen $HTTPS_PORT ssl http2;#" "$ETC/conf.d/default.conf"
fi
if ! version_ge "$NGINX_VERSION" "1.27.3"; then
  warn "nginx < 1.27.3: se quita 'resolve' del upstream solo para esta prueba (la imagen CRS usa 1.30)"
  sed -i 's# resolve max_fails# max_fails#' "$ETC/snippets/http-upstream.conf"
fi

# ── 4. ModSecurity + CRS (opcional) ──
if [ -n "${MODSEC_MODULE:-}" ]; then
  : "${CRS_DIR:?Define CRS_DIR con el directorio del Core Rule Set v4}"
  : "${UNICODE_MAPPING:?Define UNICODE_MAPPING con la ruta de unicode.mapping}"
  info "ModSecurity: $MODSEC_MODULE  CRS: $CRS_DIR"
  echo "load_module $MODSEC_MODULE;" > "$ETC/modules-enabled/50-modsecurity.conf"
  mkdir -p "$WORK/modsec/tmp" "$WORK/modsec/data" "$WORK/modsec/upload" "$WORK/modsec/crs"
  cp -r "$CRS_DIR/rules" "$WORK/modsec/crs/rules"
  cp "$SRC/modsecurity/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf" "$WORK/modsec/crs/rules/"
  cp "$SRC/modsecurity/RESPONSE-999-EXCLUSION-RULES-AFTER-CRS.conf" "$WORK/modsec/crs/rules/"
  cp "$UNICODE_MAPPING" "$WORK/modsec/unicode.mapping"
  # Equivalente al modsecurity.conf de la imagen con los valores de docker-compose.prod.yml
  cat > "$WORK/modsec/modsecurity.conf" <<EOF
SecRuleEngine On
SecRequestBodyAccess On
SecRequestBodyLimit 13107200
SecRequestBodyNoFilesLimit 1048576
SecRequestBodyLimitAction Reject
SecRequestBodyJsonDepthLimit 512
SecArgumentsLimit 1000
SecPcreMatchLimit 100000
SecPcreMatchLimitRecursion 100000
SecResponseBodyAccess Off
SecTmpDir $WORK/modsec/tmp
SecDataDir $WORK/modsec/data
SecAuditEngine RelevantOnly
SecAuditLogRelevantStatus "^5"
SecAuditLogParts AFHZ
SecAuditLogType Serial
SecAuditLogFormat JSON
SecAuditLog $WORK/modsec/audit.log
SecArgumentSeparator &
SecCookieFormat 0
SecUnicodeMapFile unicode.mapping 20127
SecStatusEngine Off
SecRule REQUEST_HEADERS:Content-Type "^(?:application(?:/soap\+|/)|text/)xml" "id:'200000',phase:1,t:none,t:lowercase,pass,nolog,ctl:requestBodyProcessor=XML"
SecRule REQUEST_HEADERS:Content-Type "^application/json" "id:'200001',phase:1,t:none,t:lowercase,pass,nolog,ctl:requestBodyProcessor=JSON"
SecRule REQUEST_HEADERS:Content-Type "^application/[a-z0-9.-]+[+]json" "id:'200006',phase:1,t:none,t:lowercase,pass,nolog,ctl:requestBodyProcessor=JSON"
SecRule &ARGS "@ge 1000" "id:'200007',phase:2,t:none,log,deny,status:400,msg:'Failed to fully parse request body due to large argument count',severity:2"
SecRule REQBODY_ERROR "!@eq 0" "id:'200002',phase:2,t:none,log,deny,status:400,msg:'Failed to parse request body.',logdata:'%{reqbody_error_msg}',severity:2"
SecRule MULTIPART_STRICT_ERROR "!@eq 0" "id:'200003',phase:2,t:none,log,deny,status:400,msg:'Multipart request body failed strict validation'"
SecRule MULTIPART_UNMATCHED_BOUNDARY "@eq 1" "id:'200004',phase:2,t:none,log,deny,msg:'Multipart parser detected a possible unmatched boundary.'"
SecRule TX:/^MSC_/ "!@streq 0" "id:'200005',phase:2,t:none,log,deny,msg:'ModSecurity internal error flagged: %{MATCHED_VAR_NAME}'"
EOF
  # crs-setup.conf con lo que fijan las variables de entorno del servicio "waf"
  cp "$CRS_DIR/crs-setup.conf.example" "$WORK/modsec/crs/crs-setup.conf"
  cat >> "$WORK/modsec/crs/crs-setup.conf" <<'EOF'
SecAction "id:900000,phase:1,pass,t:none,nolog,setvar:tx.blocking_paranoia_level=1"
SecAction "id:900001,phase:1,pass,t:none,nolog,setvar:tx.detection_paranoia_level=1"
SecAction "id:900110,phase:1,pass,t:none,nolog,setvar:tx.inbound_anomaly_score_threshold=5,setvar:tx.outbound_anomaly_score_threshold=4"
SecAction "id:900200,phase:1,pass,t:none,nolog,setvar:'tx.allowed_methods=GET HEAD POST PUT PATCH DELETE OPTIONS'"
SecAction "id:900220,phase:1,pass,t:none,nolog,setvar:'tx.allowed_request_content_type=|application/x-www-form-urlencoded| |multipart/form-data| |application/json| |application/csp-report| |application/reports+json|'"
EOF
  cat > "$WORK/modsec/setup.conf" <<EOF
Include $WORK/modsec/modsecurity.conf
Include $WORK/modsec/crs/crs-setup.conf
Include $WORK/modsec/crs/rules/*.conf
EOF
  sed "s#/etc/modsecurity.d/setup.conf#$WORK/modsec/setup.conf#" "$SRC/modsecurity/modsecurity.conf" > "$ETC/conf.d/modsecurity.conf"
  export LD_LIBRARY_PATH="${MODSEC_LD_LIBRARY_PATH:-}${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
else
  warn "Sin MODSEC_MODULE: se valida solo nginx (las directivas de ModSecurity no se cargan)"
fi

# Directivas globales solo para la prueba. Si se ejecuta como root, los workers usarían "nobody",
# que no puede escribir en $WORK (caché, temporales): se ejecutan como root SOLO en esta prueba.
# (En la imagen CRS nginx corre ya sin privilegios y la directiva "user" no aplica.)
GLOBAL_DIRECTIVES="error_log $WORK/error.log warn;"
[ "$(id -u)" = "0" ] && GLOBAL_DIRECTIVES="$GLOBAL_DIRECTIVES user root;"

# ── 5. nginx -t ──
info "nginx -t -c $ETC/nginx.conf"
"$NGINX_BIN" -t -p "$WORK" -c "$ETC/nginx.conf" -g "$GLOBAL_DIRECTIVES" 2>&1 | sed 's/^/    /'
"$NGINX_BIN" -t -q -p "$WORK" -c "$ETC/nginx.conf" -g "$GLOBAL_DIRECTIVES"
info "Sintaxis correcta"

[ "${RUN_FUNCTIONAL:-0}" = "1" ] || exit 0

# ── 6. Pruebas funcionales ──
info "Arrancando backend simulado en 127.0.0.1:$BACKEND_PORT"
python3 -I - "$BACKEND_PORT" > "$WORK/backend.log" 2>&1 <<'PY' &
import http.server, json, sys
hits = {}
class H(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def _reply(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n) if n else b""
        hits[self.path] = hits.get(self.path, 0) + 1
        p = self.path.split("?")[0]
        if p.startswith("/_next/static/"):
            cc = "public, max-age=31536000, immutable"
        elif p.startswith("/_next/image") or p.startswith("/demo/"):
            cc = "public, max-age=60"
        else:
            cc = "private, no-cache, no-store, max-age=0, must-revalidate"
        out = json.dumps({
            "path": self.path, "method": self.command, "hits": hits[self.path],
            "x_real_ip": self.headers.get("X-Real-IP"),
            "xff": self.headers.get("X-Forwarded-For"),
            "host": self.headers.get("Host"),
            "xfh": self.headers.get("X-Forwarded-Host"),
            "xfp": self.headers.get("X-Forwarded-Proto"),
            "mw_subrequest": self.headers.get("X-Middleware-Subrequest"),
            "accept": self.headers.get("Accept"),
            "req_id": self.headers.get("X-Request-Id"),
            "body_len": len(body),
        }).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", cc)
        if p.startswith("/_next/image"):
            self.send_header("Vary", "Accept")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(out)
    do_GET = do_POST = do_HEAD = do_PUT = do_PATCH = do_DELETE = do_OPTIONS = _reply
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
PY
PIDS+=("$!")

info "Arrancando nginx"
"$NGINX_BIN" -p "$WORK" -c "$ETC/nginx.conf" -g "$GLOBAL_DIRECTIVES" > "$WORK/access.log" 2>&1
for _ in $(seq 1 50); do
  curl --noproxy '*' -s -o /dev/null "http://127.0.0.1:$BACKEND_PORT/" \
    && curl --noproxy '*' -s -o /dev/null "http://127.0.0.1:$HTTP_PORT/" && break
  sleep 0.1
done

PASS=0; FAIL=0
R=(--noproxy '*' -m 10 --resolve "$SERVER_NAME:$HTTPS_PORT:127.0.0.1" --resolve "$SERVER_NAME:$HTTP_PORT:127.0.0.1" -k -s)
BASE="https://$SERVER_NAME:$HTTPS_PORT"
check() { # check "descripción" esperado obtenido
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf '  \033[32mOK\033[0m   %-62s %s\n' "$1" "$3"
  else FAIL=$((FAIL+1)); printf '  \033[31mFALLO\033[0m %-61s esperado=%s obtenido=%s\n' "$1" "$2" "$3"; fi
}
code() { curl "${R[@]}" -o /dev/null -w '%{http_code}' "$@"; }
body() { curl "${R[@]}" "$@"; }
hdr()  { curl "${R[@]}" -D - -o /dev/null "$@"; }
WAF_ON=0; [ -n "${MODSEC_MODULE:-}" ] && WAF_ON=1

echo "Redirección y TLS"
check "HTTP → HTTPS (301)" 301 "$(code "http://$SERVER_NAME:$HTTP_PORT/productos?x=1")"
check "Location al host canónico" "https://$SERVER_NAME/productos?x=1" \
  "$(hdr -H 'Host: evil.example' "http://127.0.0.1:$HTTP_PORT/productos?x=1" | tr -d '\r' | sed -n 's/^[Ll]ocation: //p')"
check "SNI desconocido: handshake rechazado (curl 000)" 000 \
  "$(curl --noproxy '*' -k -s -o /dev/null -w '%{http_code}' --resolve "otro.example:$HTTPS_PORT:127.0.0.1" "https://otro.example:$HTTPS_PORT/")"
check "TLS 1.1 rechazado" 000 "$(code --tlsv1.1 --tls-max 1.1 "$BASE/")"
check "TLS 1.2 aceptado" 200 "$(code --tlsv1.2 --tls-max 1.2 "$BASE/")"
check "HTTP/2 negociado" 2 "$(curl "${R[@]}" --http2 -o /dev/null -w '%{http_version}' "$BASE/")"

echo "Cabeceras hacia la app"
J="$(body -H 'X-Forwarded-For: 6.6.6.6' -H 'X-Real-IP: 6.6.6.6' "$BASE/")"
check "X-Real-IP = IP real" "127.0.0.1" "$(echo "$J" | python3 -c 'import sys,json;print(json.load(sys.stdin)["x_real_ip"])')"
check "X-Forwarded-For sobrescrito" "127.0.0.1" "$(echo "$J" | python3 -c 'import sys,json;print(json.load(sys.stdin)["xff"])')"
# x-middleware-subrequest (CVE-2025-29927): con WAF, CRS 4 lo rechaza (regla 920450); sin WAF,
# nginx lo vacía antes de llegar a la app. En ambos casos la app nunca lo recibe.
if [ -n "${MODSEC_MODULE:-}" ]; then
  check "x-middleware-subrequest rechazado por el WAF (920450)" 403 "$(code -H 'x-middleware-subrequest: middleware' "$BASE/")"
else
  check "x-middleware-subrequest eliminado" "None" "$(body -H 'x-middleware-subrequest: middleware' "$BASE/" | python3 -c 'import sys,json;print(json.load(sys.stdin)["mw_subrequest"])')"
fi
check "Host / X-Forwarded-Host públicos" "$SERVER_NAME/$SERVER_NAME" "$(echo "$J" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["host"]+"/"+d["xfh"])')"
check "X-Forwarded-Proto https" "https" "$(echo "$J" | python3 -c 'import sys,json;print(json.load(sys.stdin)["xfp"])')"
H="$(hdr "$BASE/" | tr -d '\r')"
check "HSTS de respaldo presente" 1 "$(echo "$H" | grep -ci '^strict-transport-security: max-age=63072000')"
check "X-Content-Type-Options presente" 1 "$(echo "$H" | grep -ci '^x-content-type-options: nosniff')"

echo "Rutas bloqueadas"
for p in /.env /.git/config /_next/static/chunks/app.js.map /static/x.js.map /wp-login.php /backup.sql /x.php /api/cron /api/cron/jobs /api/metrics; do
  check "GET $p → 404" 404 "$(code "$BASE$p")"
done
check "TRACE → 405" 405 "$(code -X TRACE "$BASE/")"
check "GET /api/stripe/webhook → 403 (solo POST)" 403 "$(code "$BASE/api/stripe/webhook")"
check "/healthz desde 127.0.0.1" 200 "$(code "$BASE/healthz")"
check "/healthz por HTTP (healthcheck del contenedor)" 200 "$(code "http://127.0.0.1:$HTTP_PORT/healthz")"

echo "Caché"
code "$BASE/_next/static/chunks/main-abc123.js" > /dev/null
check "/_next/static 2ª petición HIT" HIT "$(hdr "$BASE/_next/static/chunks/main-abc123.js" | tr -d '\r' | sed -n 's/^[Xx]-[Cc]ache-[Ss]tatus: //p')"
check "/_next/static Cache-Control inmutable (sin duplicar)" 1 "$(hdr "$BASE/_next/static/chunks/main-abc123.js" | grep -ci '^cache-control: public, max-age=31536000, immutable')"
IMG="$BASE/_next/image?url=%2Fdemo%2Ftarta.jpg&w=640&q=75"
code -H 'Accept: image/avif,image/webp,*/*' "$IMG" > /dev/null
check "/_next/image AVIF 2ª petición HIT" HIT "$(hdr -H 'Accept: image/avif,image/webp,image/apng,*/*;q=0.8' "$IMG" | tr -d '\r' | sed -n 's/^[Xx]-[Cc]ache-[Ss]tatus: //p')"
check "/_next/image WebP es otra variante (MISS)" MISS "$(hdr -H 'Accept: image/webp,*/*' "$IMG" | tr -d '\r' | sed -n 's/^[Xx]-[Cc]ache-[Ss]tatus: //p')"
check "Accept normalizado hacia la app" "image/avif,image/webp,*/*" "$(body -H 'Accept: image/avif,foo/bar' "$IMG&nc=1" | python3 -c 'import sys,json;print(json.load(sys.stdin)["accept"])')"
code "$BASE/pedido/RMM-1" > /dev/null
check "/pedido nunca se cachea (backend cuenta 2 visitas)" 2 "$(body "$BASE/pedido/RMM-1" | python3 -c 'import sys,json;print(json.load(sys.stdin)["hits"])')"
code "$BASE/api/orders/1" > /dev/null
check "/api nunca se cachea" 2 "$(body "$BASE/api/orders/1" | python3 -c 'import sys,json;print(json.load(sys.stdin)["hits"])')"

echo "Límites de tasa"
codes=""; for _ in $(seq 1 8); do codes="$codes $(code -X POST -H 'Content-Type: application/x-www-form-urlencoded' -d 'a=1' "$BASE/admin/login")"; done
check "POST /admin/login: 6 permitidos y luego 429" " 200 200 200 200 200 200 429 429" "$codes"
check "GET /admin/login no consume el límite de login" 200 "$(code "$BASE/admin/login")"
sleep 3   # vacía la zona req_orders (las pruebas de caché de /api/orders/1 ya consumieron cupo)
codes=""; for _ in $(seq 1 7); do codes="$codes $(code -X POST -H 'Content-Type: application/json' -d '{}' "$BASE/api/orders")"; done
check "POST /api/orders: 5 permitidos (2 r/s ráfaga 4) y luego 429" " 200 200 200 200 200 429 429" "$codes"

if [ "$WAF_ON" = "1" ]; then
  echo "WAF (ModSecurity + OWASP CRS)"
  check "SQLi en query → 403" 403 "$(code "$BASE/productos?q=1%27%20OR%20%271%27%3D%271")"
  check "XSS en query → 403" 403 "$(code "$BASE/productos?q=%3Cscript%3Ealert(1)%3C/script%3E")"
  check "Path traversal → 400/403/404" 0 "$(c=$(code --path-as-is "$BASE/uploads/../../etc/passwd"); [ "$c" = 403 ] || [ "$c" = 404 ] || [ "$c" = 400 ]; echo $?; )"
  check "Path traversal codificado → 400/403/404" 0 "$(c=$(code --path-as-is "$BASE/uploads/..%2f..%2f..%2fetc%2fpasswd"); [ "$c" = 403 ] || [ "$c" = 404 ] || [ "$c" = 400 ]; echo $?; )"
  check "Página de bloqueo con código de referencia" 1 "$(body "$BASE/productos?q=%3Cscript%3Ealert(1)%3C/script%3E" | grep -c 'Solicitud bloqueada')"
  AID="6080c4009eeb3d274dafe40639d86a3204d4ac74cf"
  TREE='%5B%22%22%2C%7B%22children%22%3A%5B%22(site)%22%2C%7B%22children%22%3A%5B%22producto%22%2C%7B%7D%5D%7D%5D%7D%2Cnull%2Cnull%2Ctrue%5D'
  check "RSC/prefetch con Next-Router-State-Tree → 200" 200 "$(code -H 'RSC: 1' -H "Next-Router-State-Tree: $TREE" -H 'Next-Router-Prefetch: 1' -H 'Next-Url: /productos' "$BASE/producto/tarta-de-queso?_rsc=1x2y3")"
  check "Server Action text/plain (JSON) → 200" 200 "$(code -X POST -H "Next-Action: $AID" -H 'Content-Type: text/plain;charset=UTF-8' -H 'Accept: text/x-component' -H "Next-Router-State-Tree: $TREE" -H "Origin: https://$SERVER_NAME" --data-raw '[{"productId":"cm1x2y3z","quantity":2,"note":"Feliz cumpleaños, Lucía! 🎂"},"$undefined","$K1"]' "$BASE/carrito")"
  check "Server Action con SQLi en el JSON → 403" 403 "$(code -X POST -H "Next-Action: $AID" -H 'Content-Type: text/plain;charset=UTF-8' --data-raw '[{"q":"1 UNION SELECT password FROM admin_users--"}]' "$BASE/carrito")"
  check "Server Action con cuerpo no-JSON → 400" 400 "$(code -X POST -H "Next-Action: $AID" -H 'Content-Type: text/plain;charset=UTF-8' --data-raw 'no es json' "$BASE/carrito")"
  check "text/plain SIN Next-Action → 403 (920420)" 403 "$(code -X POST -H 'Content-Type: text/plain' --data-raw 'hola' "$BASE/carrito")"
  check "Server Action multipart (foto + campos \$ACTION) → 200" 200 "$(printf 'GIF89a\x01\x00\x01\x00' > "$WORK/foto.gif"; code -X POST -H "Next-Action: $AID" -F "1_\$ACTION_ID_$AID=" -F '1_name=Lucía García' -F '1_email=lucia@example.com' -F '1_message=Tarta de 2 pisos, sin frutos secos (alergia)' -F "1_photo=@$WORK/foto.gif;type=image/gif" -F '0=["$K1"]' "$BASE/presupuesto")"
  check "Formulario urlencoded normal → 200" 200 "$(code -X POST -H 'Content-Type: application/x-www-form-urlencoded' --data-urlencode 'email=ana@example.com' --data-urlencode 'nombre=Ana Pérez' "$BASE/baja")"
  check "Cookie de consentimiento JSON → 200" 200 "$(code -b 'cookie_consent={"necessary":true,"analytics":false}; __Host-rmm_admin=abc.def.ghi' "$BASE/")"
  check "JSON de pedido normal → 200" 200 "$(code -X POST -H 'Content-Type: application/json' -H "Idempotency-Key: 6f1c" --data-raw '{"items":[{"productId":"cm1","qty":1}],"customer":{"name":"José O'"'"'Neill","email":"jose@example.com","phone":"+34 600 000 000"},"notes":"Entregar después de las 18:00; llamar antes"}' "$BASE/api/quotes")"
  SIG="t=1760270000,v1=$(printf '%064d' 0)"
  STRIPE='{"id":"evt_1","type":"checkout.session.completed","data":{"object":{"customer_details":{"name":"Robert'"'"'); DROP TABLE orders;--","address":{"line1":"<script>alert(1)</script>"}}}}}'
  check "Webhook Stripe firmado con texto 'peligroso' → 200" 200 "$(code -X POST -H 'Content-Type: application/json; charset=utf-8' -H "Stripe-Signature: $SIG" --data-raw "$STRIPE" "$BASE/api/stripe/webhook")"
  check "Webhook Stripe firmado: cuerpo íntegro (longitud)" "${#STRIPE}" "$(body -X POST -H 'Content-Type: application/json; charset=utf-8' -H "Stripe-Signature: $SIG" --data-raw "$STRIPE" "$BASE/api/stripe/webhook" | python3 -c 'import sys,json;print(json.load(sys.stdin)["body_len"])')"
  check "Mismo cuerpo SIN firma → 403" 403 "$(code -X POST -H 'Content-Type: application/json' --data-raw "$STRIPE" "$BASE/api/stripe/webhook")"
  check "Escáner por User-Agent (nikto) → 403" 403 "$(code -A 'Mozilla/5.00 (Nikto/2.1.6) (Evasions:None) (Test:007360)' "$BASE/")"
fi

echo
info "Resultado: $PASS correctas, $FAIL fallidas"
if [ "$FAIL" -gt 0 ]; then
  echo "--- error.log ---"; tail -n 30 "$WORK/error.log" || true
  [ -f "$WORK/modsec/audit.log" ] && { echo "--- audit.log (últimas) ---"; tail -n 5 "$WORK/modsec/audit.log"; }
  exit 1
fi
