# Vercel Firewall (WAF), Attack Challenge Mode, DDoS y Spend Management

> **Plantilla no probada en este entorno.** `firewall.json` se ha validado contra el
> esquema JSON del cuerpo de `PUT /v1/security/firewall/config` (tipos de condición,
> operadores, acciones, límites de longitud) y sus expresiones regulares compilan,
> pero **no se ha aplicado a ningún proyecto de Vercel**. Aplícalo primero en un
> proyecto de staging y en modo `log` (ver más abajo).

## Qué contiene `firewall.json`

Es el cuerpo completo que espera la API (sin comentarios, porque la API rechaza
campos desconocidos). Las reglas se evalúan **en orden**; las de *bypass* van
primero y las de *rate limit* solo actúan cuando se supera el umbral.

| # | Regla | Condición | Acción |
| --- | --- | --- | --- |
| 1 | Bypass webhook de Stripe | `POST /api/stripe/webhook` con cabecera `stripe-signature` | bypass (la firma se verifica en la app) |
| 2 | Bypass cron de Vercel | `GET /api/cron*`, UA `vercel-cron/`, con `Authorization` | bypass (la app exige `CRON_SECRET`) |
| 3 | Rutas sensibles y escaneos | `/.env`, `/.git`, `wp-*`, `xmlrpc.php`, `phpmyadmin`, extensiones `.php/.sql/.bak/.zip/...` | deny + bloqueo persistente 1 h |
| 4 | Métodos no usados | `TRACE`, `PUT`, `PATCH`, WebDAV... | deny |
| 5 | Métricas | `/api/metrics` desde una IP distinta a la del Prometheus | deny |
| 6 | Login del panel (corto) | `POST /admin/login` > 5/min por IP | 429 |
| 7 | Login del panel (largo) | `POST /admin/login` > 20/10 min por IP | deny 1 h |
| 8 | Pedidos y checkout | `POST /api/orders`, `POST /api/checkout*` > 10/min por IP | 429 |
| 9 | Subidas | `POST /api/uploads` > 10/min por IP | 429 |
| 10 | Formularios públicos | `POST/DELETE /api/(quotes\|reviews\|giftcards\|cart)` > 20/min por IP | 429 |
| 11 | API general | `/api/*` > 300/min por IP | 429 |
| 12 | Picos de navegación | páginas (no `/api`, no estáticos) > 300/min por IP | challenge |
| 13 | Panel fuera de España | `/admin*` con país ≠ ES | challenge (no bloqueo) |

Además:

- `managedRules`: **Bot Protection** en *challenge* y **AI Bots** en *deny*
  (evita el rastreo masivo por crawlers de IA; quítalo si quieres aparecer en sus
  respuestas). Comprueba los nombres exactos con un `GET` de la configuración activa.
- `crs`: categorías del **OWASP Core Ruleset** (SQLi, XSS, RCE, LFI/RFI, escáneres,
  PHP, Java en *deny*; multipart, genérico y session fixation en *log* para vigilar
  falsos positivos con subidas y formularios). Según el plan, este conjunto puede
  no estar disponible: si la API lo rechaza, elimina el bloque `crs`.
- `ips`: un ejemplo de bloqueo manual con una IP de documentación
  (`198.51.100.23`); sustitúyelo o deja la lista vacía.

Marcadores que hay que cambiar: `reposteria.example.com` (en `ips`) y
`203.0.113.10` (IP del Prometheus que scrapea `/api/metrics`; si no hay ninguno,
la regla 5 deja la ruta cerrada a todo el mundo, que es lo deseable).

### Límites y costes que debes revisar

- El número de reglas personalizadas y de reglas de *rate limit*, las ventanas
  permitidas y las claves (`ip`, `ja4`...) dependen del plan. En Hobby hay muy pocas
  reglas: prioriza 3 (rutas sensibles), 6 (login), 8 (pedidos) y 9 (subidas).
- Las reglas de *rate limit* se facturan por petición evaluada en algunos planes:
  las reglas 11 y 12 evalúan casi todo el tráfico. Revisa los precios vigentes y,
  si hace falta, deja solo las específicas (la app ya limita en Redis).
- Si en el futuro la app usa `PUT`/`PATCH` (p. ej. en `/api/admin/*`), ajusta la regla 4.
- Si el panel se usa desde fuera de España, desactiva la regla 13 (`"active": false`).

## Cómo aplicarlo

### Opción A: dashboard

Proyecto → **Firewall** → **Configure** → **New rule**. Reproduce cada regla de la
tabla (los campos del formulario son los mismos que en el JSON: *If* = condiciones,
*Then* = acción, *Rate limit* = ventana, límite y clave). Revisa con
**Review changes** y publica con **Publish**. Los conjuntos gestionados (Bot
Protection, AI Bots, OWASP) se activan en **Firewall → Configure → Managed
Rulesets**.

### Opción B: API (recomendado, reproducible)

`PUT` **sustituye la configuración entera**: guarda antes la activa.

```bash
export VERCEL_TOKEN=...        # token con acceso al equipo (no lo pegues en scripts versionados)
export PROJECT_ID=prj_...
export TEAM_ID=team_...

# 1) Copia de la configuración activa
curl -fsS -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v1/security/firewall/config/active?projectId=$PROJECT_ID&teamId=$TEAM_ID" \
  > firewall.backup.json

# 2) (Recomendado) primera semana en modo observación: deny/challenge/429 -> log
jq '(.rules[].action.mitigate | select(.action != "bypass")) |= (.action = "log" | del(.actionDuration))
    | (.rules[].action.mitigate.rateLimit | select(. != null)) |= (.action = "log")' \
  infra/vercel/firewall.json > /tmp/firewall.log-mode.json

# 3) Publicar
curl -fsS -X PUT -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" \
  "https://api.vercel.com/v1/security/firewall/config?projectId=$PROJECT_ID&teamId=$TEAM_ID" \
  --data @/tmp/firewall.log-mode.json      # o @infra/vercel/firewall.json para el modo definitivo
```

Con la CLI de Vercel: `vercel api /v1/security/firewall/config --method PUT --input infra/vercel/firewall.json`
(añade `projectId`/`teamId` como parámetros de consulta).

Para cambios puntuales sin reescribirlo todo existe `PATCH /v1/security/firewall/config`
(acciones `rules.insert`, `rules.update`, `rules.remove`...). Tras unos días en modo
`log`, revisa **Firewall → Traffic** (peticiones que habrían sido bloqueadas) y
publica `firewall.json` tal cual.

### Comprobación tras publicar

```bash
SITE=https://reposteria.example.com
curl -s -o /dev/null -w "%{http_code}\n" $SITE/.env                 # 403
curl -s -o /dev/null -w "%{http_code}\n" $SITE/api/metrics          # 403 (fuera de la IP permitida)
for i in $(seq 1 7); do curl -s -o /dev/null -w "%{http_code} " -X POST $SITE/admin/login; done; echo   # 429 a partir del 6º
```

Y envía un evento de prueba desde el dashboard de Stripe (Developers → Webhooks →
*Send test event*) para confirmar que el webhook sigue llegando.

## Attack Challenge Mode (ataque en curso)

Hace que **todos** los visitantes resuelvan un challenge antes de llegar a la app.
Los bots verificados (buscadores) siguen pasando; los clientes que no son
navegadores (apps, scripts) quedan bloqueados salvo que una regla de *bypass*
los deje pasar. Es gratuito en todos los planes y el tráfico que bloquea no se
factura según la documentación de Vercel (verifica las condiciones vigentes).

- **Dashboard**: Proyecto → **Firewall** → menú **⋯** / **Bot Management** →
  **Attack Challenge Mode** → elige duración → **Enable**.
- **API**:

  ```bash
  # Activar durante 2 horas
  UNTIL=$(( ($(date +%s) + 7200) * 1000 ))
  curl -fsS -X POST -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" \
    "https://api.vercel.com/v1/security/attack-mode?teamId=$TEAM_ID" \
    --data "{\"projectId\":\"$PROJECT_ID\",\"attackModeEnabled\":true,\"attackModeActiveUntil\":$UNTIL}"

  # Desactivar
  curl -fsS -X POST -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" \
    "https://api.vercel.com/v1/security/attack-mode?teamId=$TEAM_ID" \
    --data "{\"projectId\":\"$PROJECT_ID\",\"attackModeEnabled\":false}"
  ```

Cuándo activarlo: picos de 429/bloqueos (`ReposteriaRateLimitSpike`), latencia o
errores 5xx disparados sin causa interna, o aviso de ataque en Firewall → Overview.
Mientras esté activo, comprueba con un evento de prueba de Stripe que el webhook
pasa (regla 1) y que los monitores de disponibilidad no dan falsos positivos
(pausa los que no sean navegador o márcalo como mantenimiento). Desactívalo en
cuanto pase el ataque: añade fricción a todos los clientes.

### Cron cada minuto y el firewall

- `/api/cron/jobs` debe llamarse **cada minuto**. Vercel Cron solo admite esa
  frecuencia en planes de pago; el `vercel.json` actual del repositorio la programa a
  diario (válido en Hobby). En Pro cambia su `schedule` a `* * * * *`; en Hobby usa un
  planificador externo (p. ej. *schedules* de Upstash QStash, que reenvía la
  cabecera `Authorization: Bearer $CRON_SECRET` si se le pasa como
  `Upstash-Forward-Authorization`; compruébalo en su documentación).
- La regla 2 solo deja pasar a Vercel Cron (User-Agent `vercel-cron/`). Un
  planificador externo no la cumple: no le afectan las reglas de challenge (que
  excluyen `/api/*`), pero **sí el Attack Challenge Mode**. Si usas uno, añade una
  regla de *bypass* para `/api/cron` con su User-Agent/IP **y** la cabecera
  `authorization` (la app sigue exigiendo el secreto).

## Protección DDoS incluida

- Vercel aplica mitigación DDoS automática en capas 3, 4 y 7 en todos los planes,
  sin configuración. Las reglas de esta carpeta son complementarias (abuso de
  negocio: fuerza bruta, spam de pedidos y subidas).
- No crees reglas de *System Bypass* (`bypassSystem`) salvo indicación del soporte
  de Vercel: desactivan esa mitigación para el tráfico afectado.
- La app debe estar configurada con `TRUST_PROXY=vercel` para que la IP del
  cliente usada por el rate limit propio (Redis) sea la que Vercel verifica.
- Consulta el panel **Firewall → Overview/Traffic** y, para retención larga,
  envía los logs del firewall a un *Log Drain*.

## Spend Management (tope de gasto)

Un ataque o un bucle de peticiones puede disparar el consumo (invocaciones,
transferencia, optimización de imágenes, rate limiting). En Pro:

1. **Team Settings → Billing → Spend Management** → activa e indica un importe
   mensual máximo.
2. Activa las notificaciones (por ejemplo al 50 %, 75 % y 100 %) por email y por
   **webhook**. El cuerpo del webhook de Vercel no tiene el formato `{"text": ...}`:
   si quieres recibirlo en Slack/Discord/Teams, pásalo por un pequeño relé o usa la
   integración de Vercel con Slack.
3. **Pausar proyectos al alcanzar el tope**: deja la web **sin servicio** hasta que
   se reanude manualmente. Para una tienda online es preferible no activarlo en
   producción (o fijar un tope alto) y reaccionar a las notificaciones con el
   Attack Challenge Mode y las reglas de rate limit. Sí tiene sentido en proyectos
   de staging/preview.
4. Revisa también **Usage** semanalmente y fija `images.qualities`/`remotePatterns`
   (ya acotados en `next.config.ts`) para que nadie pueda generar variantes de
   imagen ilimitadas.

## Relación con el resto de defensas

| Capa | Dónde |
| --- | --- |
| DDoS L3/L4/L7 | Vercel (automático) |
| WAF, bots, rate limit en el borde | este `firewall.json` |
| Rate limit global por IP/usuario, bloqueo progresivo de login, MFA | la app (Redis + BD) |
| Firma de webhooks, Bearer de cron y métricas | la app |
| Alertas de 429, fallos de login y pagos | `infra/monitoring/alerts.yml` |
