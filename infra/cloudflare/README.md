# Cloudflare delante del origen autoalojado (alternativa a Vercel Firewall)

> **Plantilla no probada contra la API real de Cloudflare.** Validado en este entorno:
> JSON con `jq`, estructura y expresiones con un lint propio (paréntesis, comillas,
> campos, funciones, acciones y fases conocidos), simulación de la regla de caché
> sobre 19 rutas, `bash -n` y ejecución en modo prueba de `apply.sh` para los planes
> free/pro/business, `nginx -t` de los fragmentos del origen y una prueba funcional
> con nginx real (IP real, mTLS, cierre a quien no sea Cloudflare, rutas internas).
> Ninguna regla se ha publicado en una zona de Cloudflare.

## Cuándo usar esto

- **Sí**: despliegue autoalojado (Docker Compose o Kubernetes) con el origen nginx
  expuesto a Internet. Cloudflare aporta DDoS, WAF, rate limiting, bots y caché
  antes de que el tráfico llegue a tu servidor.
- **No delante de Vercel**: Vercel desaconseja poner otro proxy inverso delante
  (empeora su mitigación DDoS, su firewall y su caché, que dejan de ver al cliente
  real). Con Vercel usa `infra/vercel/`. Cloudflare puede seguir siendo tu DNS en modo
  *DNS only* (nube gris).

## Contenido

| Fichero | Qué hace |
| --- | --- |
| `zone-settings.json` | SSL **Full (strict)**, **TLS mínimo 1.2**, TLS 1.3, 0-RTT desactivado, HTTPS siempre, **HSTS** (2 años, subdominios, sin preload), **Authenticated Origin Pulls** (`tls_client_auth`), Browser Integrity Check, sin Rocket Loader ni ofuscación de emails (rompen la CSP/hidratación de Next.js). |
| `rulesets/managed-rules.json` | **Cloudflare Managed Ruleset** + **OWASP Core Ruleset** (PL1, umbral de anomalía 40, bloquear) con excepción del OWASP para el webhook de Stripe desde IPs de Stripe. |
| `rulesets/custom-rules.json` | Skip para el webhook de Stripe (IPs oficiales) y para las sondas `/api/health*`; bloqueo de rutas sensibles (`/.env`, `/.git`, `wp-*`, `.php`, `.sql`...); `/api/metrics` y `/api/cron` cerradas al exterior; webhook solo POST; métodos no usados; challenge a `/admin` fuera de España; challenge a páginas sin User-Agent. |
| `rulesets/rate-limiting.json` | Login del panel (5/min, bloqueo 10 min), pedidos/checkout (10/min), subidas (10/min), formularios públicos (20/min), picos generales (300/min → Managed Challenge). Respuestas 429 en JSON para la API. |
| `rulesets/cache-rules.json` | Caché de `/_next/static/*` respetando el origen y **nunca caché** para `/admin`, `/api`, `/pedido`, `/presupuesto`, `/finalizar-pedido` (y además `/carrito`, `/seguimiento`, `/uploads`, `/baja`, `/recordatorios`, `/tarjetas-regalo`, `/privacidad/derechos` y cualquier petición con cookie `__Host-` o `acc_`). |
| `bot-management.free.json` / `bot-management.pro.json` | Bot Fight Mode (Free) o Super Bot Fight Mode (Pro+: bloquear automatizados, permitir bots verificados, bloquear bots de IA). |
| `apply.sh` | Valida, adapta al plan (`--plan free\|pro\|business`), guarda copia de la configuración actual y aplica por API. Sin `--apply` es un ensayo. |
| `nginx/cloudflare-ips.conf` | Rangos de Cloudflare para `set_real_ip_from` (IP real desde `CF-Connecting-IP`) y mapa `$from_cloudflare`. |
| `nginx/update-cloudflare-ips.sh` | Regenera el fichero anterior desde cloudflare.com, valida el formato y recarga nginx (restaura el anterior si `nginx -t` falla). |
| `nginx/authenticated-origin-pulls.conf` | mTLS en el origen: solo acepta conexiones con el certificado de cliente de Cloudflare. |
| `nginx/origin-server.example.conf` | Bloque `server` de ejemplo que lo une todo y pasa la IP real a la app. |

## Límites por plan (orientativos, verifica los vigentes)

| | Free | Pro | Business |
| --- | --- | --- | --- |
| Reglas personalizadas | 5 | 20 | 100 |
| Reglas de rate limiting | 1 (periodo 10 s) | 2 | 5 |
| Managed Ruleset / OWASP | No (solo Free Managed Ruleset automático) | Sí | Sí |
| Bots | Bot Fight Mode | Super Bot Fight Mode | SBFM + "likely automated" |
| Expresiones regulares (`matches`) | No | No | Sí |

Las reglas no usan `matches` para funcionar en todos los planes. `apply.sh --plan`
elige qué reglas enviar:

- **free**: 5 reglas personalizadas (skip Stripe, rutas sensibles, rutas internas,
  webhook solo POST, métodos), 1 de rate limit (login, 3 peticiones/10 s) y sin
  conjuntos gestionados. Bot Fight Mode **no se puede omitir** con reglas y puede
  desafiar al webhook de Stripe y a los monitores: vigila los fallos de entrega en
  el dashboard de Stripe o desactívalo si ocurre.
- **pro**: todas las personalizadas, conjuntos gestionados, SBFM y 2 reglas de rate
  limit (login y pedidos).
- **business**: todo.

## Requisitos previos (en este orden)

1. DNS del dominio en Cloudflare con el registro del sitio **proxied** (nube naranja).
2. Certificado válido en el origen (Cloudflare Origin CA o Let's Encrypt) para el
   modo **Full (strict)**. Sin él, al aplicar `ssl: strict` el sitio devuelve 526.
3. Cortafuegos del host/proveedor: puertos 80/443 abiertos **solo** a los rangos de
   Cloudflare (`nginx/cloudflare-ips.conf`). El `return 444` de nginx es una segunda
   barrera, no la primera.
4. Lista de cuenta `stripe_webhooks` (tipo IP): `apply.sh` la crea y la sincroniza con
   <https://stripe.com/files/ips/ips_webhooks.json>. Las reglas que la usan fallan si no
   existe. Vuelve a ejecutar `apply.sh --apply` (o solo esa parte) cuando Stripe
   anuncie cambios de IPs.
5. Token de API con los permisos que indica la cabecera de `apply.sh`.

## Cómo aplicarlo

```bash
cd infra/cloudflare
./apply.sh --plan pro --out /tmp/cf-final      # ensayo: valida y muestra qué se enviaría
CF_API_TOKEN=... CF_ZONE_ID=... CF_ACCOUNT_ID=... ./apply.sh --plan pro --apply
```

- `PUT` sobre el *entrypoint* de cada fase **sustituye** sus reglas: el script guarda
  antes la configuración actual en `./cloudflare-backup-<fecha>/`.
- Recomendado: la primera semana pon el OWASP en `"action": "log"` (en
  `managed-rules.json`) y revisa **Security → Events** antes de bloquear.
- También puedes crearlas a mano en el dashboard: **Security → WAF** (Custom rules,
  Rate limiting rules, Managed rules), **Caching → Cache Rules**, **SSL/TLS** y
  **Security → Bots**; las expresiones de los JSON se pegan tal cual en el
  *Expression editor*.

### Origen nginx

1. Copia `nginx/cloudflare-ips.conf` a `/etc/nginx/snippets/` e inclúyelo en el
   contexto `http` (o genéralo con `nginx/update-cloudflare-ips.sh` y prográmalo
   semanalmente).
2. Instala la CA de Authenticated Origin Pulls en
   `/etc/nginx/certs/cloudflare-origin-pull-ca.pem`:
   - **Zona** (sencillo): descarga la CA de Cloudflare desde su documentación de
     *Authenticated Origin Pulls* y comprueba su caducidad
     (`openssl x509 -enddate -noout -in ...`). Ese certificado es común a todos los
     clientes de Cloudflare: prueba que la conexión viene de Cloudflare, no de tu zona.
   - **Por hostname** (recomendado): genera tu propio certificado de cliente, súbelo
     a Cloudflare (SSL/TLS → Origin Server → Authenticated Origin Pulls) y pon aquí
     la CA que lo firmó.
3. Activa primero `tls_client_auth` en Cloudflare (lo hace `apply.sh`) y **después**
   `include .../authenticated-origin-pulls.conf;` en nginx. En orden inverso el sitio
   deja de responder.
4. Usa `nginx/origin-server.example.conf` como base del `server` público.
5. La app con `TRUST_PROXY=nginx`: nginx resuelve la IP real con el módulo realip
   (solo confía en `CF-Connecting-IP` si la conexión viene de Cloudflare) y la envía
   en `X-Real-IP`, **sobrescribiendo** `X-Real-IP` y `X-Forwarded-For` del cliente.
   `TRUST_PROXY=cloudflare` (la app lee `CF-Connecting-IP` directamente) solo es
   seguro si Cloudflare conecta **directamente** con la app sin nginx en medio y el
   cortafuegos del host solo admite los rangos de Cloudflare; si no, cualquiera que
   llegue al origen podría falsear su IP con esa cabecera.

Prueba funcional hecha en este entorno con nginx 1.24 (copias con rutas temporales y
puerto 18443, certificados autofirmados, una CA de prueba en lugar de la de
Cloudflare y `127.0.0.2` añadida a los rangos "de Cloudflare" solo en la copia; la
app sustituida por un servidor Python que devuelve las cabeceras recibidas):

| Caso | Resultado |
| --- | --- |
| Conexión que no viene de un rango de Cloudflare | cerrada sin respuesta (`return 444`) |
| Desde "Cloudflare" con `CF-Connecting-IP: 203.0.113.7` y `X-Forwarded-For`/`X-Real-IP` falseados | la app recibe `X-Real-IP: 203.0.113.7` y `X-Forwarded-For: 203.0.113.7` |
| Sin certificado de cliente (AOP) | 400 |
| `/api/metrics`, `/api/cron/jobs` | 404 |
| `/api/metricsfoo` | pasa (sin falsos positivos del patrón) |
| Host desconocido | handshake TLS rechazado |

(Las líneas `listen [::]:443` se quitaron solo en la copia de prueba porque el
sandbox no tiene IPv6.)

## HSTS

La app ya envía `Strict-Transport-Security: max-age=63072000; includeSubDomains`
(`next.config.ts`). El ajuste `security_header` de Cloudflare usa el mismo valor para
que no haya contradicciones. No actives `preload` hasta estar seguro de que **todos**
los subdominios sirven HTTPS: salir de la lista de precarga tarda meses.

## Verificación

```bash
SITE=https://reposteria.example.com
curl -sI $SITE/ | grep -i -E 'cf-cache-status|strict-transport'
curl -sI $SITE/admin/login | grep -i cf-cache-status          # BYPASS o DYNAMIC, nunca HIT
curl -sI $SITE/api/health | grep -i cf-cache-status           # BYPASS o DYNAMIC
curl -s -o /dev/null -w "%{http_code}\n" $SITE/.env            # 403
curl -s -o /dev/null -w "%{http_code}\n" $SITE/api/metrics     # 403
curl -s -o /dev/null -w "%{http_code}\n" -X PUT $SITE/          # 403
curl -s --tls-max 1.1 -o /dev/null -w "%{http_code}\n" $SITE/  # debe fallar (TLS < 1.2)
curl -sk -o /dev/null -w "%{http_code}\n" https://IP_DEL_ORIGEN/  # debe fallar (AOP / 444 / cortafuegos)
```

Envía un evento de prueba desde Stripe (Developers → Webhooks → *Send test event*)
y comprueba en **Security → Events** que no hay bloqueos sobre `/api/stripe/webhook`.

## Relación con el resto

- Prometheus y los planificadores de cron llaman a la app por la red interna, nunca a
  través de Cloudflare (la regla `rp_internal_routes` cierra esas rutas en el borde).
  Si usas un servicio de cron externo, sustituye esa regla por una que permita solo
  su IP o llama a `/api/cron*` por un hostname no proxied con IP restringida.
- Las alertas de 429/bloqueos de la app están en `infra/monitoring/alerts.yml`; los
  eventos del WAF de Cloudflare se consultan en Security → Events o con Logpush.
