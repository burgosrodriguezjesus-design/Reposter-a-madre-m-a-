# Monitores externos de disponibilidad (UptimeRobot / Better Stack)

> **Plantilla no probada en este entorno**: no se ha creado ningún monitor real. Los
> ejemplos de API reflejan la documentación pública de cada servicio en el momento de
> escribirlos; comprueba nombres de campos, intervalos mínimos y regiones del plan
> que contrates.

Los monitores externos son la **fuente de verdad del SLO del 99,95 %** visto por el
cliente: detectan caídas totales (DNS, TLS, CDN/WAF, proveedor) que Prometheus, al
vivir en la misma infraestructura, no puede ver. Complementan a `slo.yml`, que mide
la proporción de peticiones sin 5xx desde el lado servidor.

## Monitores

Sustituye `https://reposteria.example.com` por `NEXT_PUBLIC_SITE_URL`.

| # | Nombre | URL | Comprobación | Intervalo | Regiones | Alerta |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Portada | `/` | HTTP 200 **y** la palabra clave del título de la tienda en el HTML (detecta páginas de error con 200) | 60 s | ≥ 3 (Europa, Norteamérica, Asia/Oceanía) | Tras 2 fallos seguidos confirmados desde ≥ 2 regiones |
| 2 | Vida | `/api/health` | HTTP 200 y cuerpo con `"status":"ok"` | 60 s | ≥ 3 | Igual |
| 3 | Readiness | `/api/health/ready` | HTTP 200 (503 = BD o Redis inaccesibles) | 60 s | ≥ 3 | Igual; severidad alta: sin BD no se toman pedidos |
| 4 | Certificado TLS | dominio principal | Caducidad < 14 días | diario | — | Email |
| 5 | Heartbeat del Watchdog | (URL de heartbeat del servicio) | Alertmanager envía la alerta `Watchdog` cada minuto | espera 1 min, gracia 5 min | — | Si deja de llegar, la pila de alertas está caída |
| 6 | Heartbeat de copias (opcional) | (URL de heartbeat) | `backup-with-metrics.sh` / Job de backup hace `curl` al terminar bien | espera 1 h, gracia 1 h | — | Copia > 2 h |

Ajustes comunes:

- **Timeout**: 10 s (la portada SSR debería responder en < 1 s; 10 s evita falsos
  positivos por la red del monitor).
- **Método**: `GET` (algunos servicios usan `HEAD` por defecto: la app lo admite, pero
  `GET` comprueba también el cuerpo).
- **Seguir redirecciones**: sí en la portada (www → raíz), no en `/api/health*`.
- **User-Agent** propio (p. ej. `reposteria-uptime/1.0`) y una cabecera secreta
  opcional para identificarlos en logs.
- **Ventanas de mantenimiento** programadas en el monitor durante despliegues con
  migraciones, para que no consuman presupuesto de forma artificial (y anótalas).
- **Página de estado** pública (opcional) con los monitores 1 y 3.

### Por qué tres monitores

- `/` detecta fallos de renderizado, CDN, DNS y certificado.
- `/api/health` dice si el proceso vive **sin** depender de la BD.
- `/api/health/ready` dice si se pueden tomar pedidos (BD + Redis).

Combinación típica: `/api/health` OK y `/ready` KO → problema de BD/Redis;
ambos KO → app/proxy/DNS; `/` KO y health OK → error de renderizado o del catálogo.

### Firewall y bots

- **Vercel**: la regla de *challenge* por picos y el Bot Protection pueden desafiar a
  los monitores en la portada. Si ocurre, añade una regla de *bypass* (antes de las
  demás) por `user_agent` + cabecera secreta del monitor, o por las IPs publicadas
  por el servicio. Con **Attack Challenge Mode** activo los monitores no navegador
  fallarán: pausa los monitores o márcalo como mantenimiento.
- **Cloudflare**: `rp_health_skip_bots` (en `infra/cloudflare/rulesets/custom-rules.json`)
  ya exime `/api/health*` de Super Bot Fight Mode y Browser Integrity Check. Para la
  portada, añade una excepción similar por User-Agent + cabecera secreta.
- `/api/health*` nunca devuelve datos sensibles, así que no requiere autenticación.

## UptimeRobot

- Tipo **Keyword** para la portada y `/api/health` (alerta si la palabra **no**
  existe), tipo **HTTP(s)** para `/api/health/ready`.
- Intervalo de 60 s: requiere plan de pago (el gratuito es de 5 min). UptimeRobot
  confirma la caída desde otras ubicaciones antes de avisar.
- Alertas: contactos de email y *webhook* hacia el mismo canal que `ALERT_WEBHOOK_URL`
  (UptimeRobot permite definir el cuerpo JSON, p. ej.
  `{"text": "*monitorFriendlyName* *alertTypeFriendlyName*: *alertDetails*"}`).

Ejemplo con la API v2 (plantilla; la v3 usa otro formato):

```bash
curl -fsS -X POST https://api.uptimerobot.com/v2/newMonitor \
  -d "api_key=$UPTIMEROBOT_API_KEY" \
  -d "friendly_name=Repostería - readiness" \
  -d "url=https://reposteria.example.com/api/health/ready" \
  -d "type=1" \
  -d "interval=60" \
  -d "timeout=10"

curl -fsS -X POST https://api.uptimerobot.com/v2/newMonitor \
  -d "api_key=$UPTIMEROBOT_API_KEY" \
  -d "friendly_name=Repostería - vida" \
  -d "url=https://reposteria.example.com/api/health" \
  -d "type=2" -d "keyword_type=2" -d 'keyword_value="status":"ok"' \
  -d "interval=60"
```

(`type=2` = palabra clave; `keyword_type=2` = alertar si **no** existe.)

## Better Stack (Uptime)

- Monitor **Keyword** para portada y `/api/health`, **Status** (2xx) para `/ready`.
- *Check frequency* 60 s (o 30 s en planes de pago), regiones `eu`, `us`, `as`, `au`,
  *confirmation period* 60–120 s, *recovery period* 3 min, verificación SSL activada y
  aviso de caducidad a 14 días.
- *Heartbeats* para el Watchdog de Alertmanager (receptor `heartbeat` de
  `alertmanager.yml`, URL en `secrets/heartbeat_url`) y, opcionalmente, para las copias.
- Integraciones: email + Slack/Discord/Teams (o webhook) y política de escalado
  (llamada/SMS a la persona de guardia para los monitores 1 y 3).

Ejemplo con la API (plantilla):

```bash
curl -fsS -X POST https://uptime.betterstack.com/api/v2/monitors \
  -H "Authorization: Bearer $BETTERSTACK_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "monitor_type": "keyword",
    "url": "https://reposteria.example.com/api/health",
    "pronounceable_name": "Reposteria vida",
    "required_keyword": "\"status\":\"ok\"",
    "check_frequency": 60,
    "request_timeout": 10,
    "regions": ["eu", "us", "as", "au"],
    "confirmation_period": 60,
    "recovery_period": 180,
    "verify_ssl": true,
    "ssl_expiration": 14,
    "email": true
  }'

curl -fsS -X POST https://uptime.betterstack.com/api/v2/monitors \
  -H "Authorization: Bearer $BETTERSTACK_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "monitor_type": "status",
    "url": "https://reposteria.example.com/api/health/ready",
    "pronounceable_name": "Reposteria readiness",
    "check_frequency": 60,
    "request_timeout": 10,
    "regions": ["eu", "us", "as", "au"],
    "confirmation_period": 60,
    "recovery_period": 180,
    "email": true
  }'
```

## Relación con el SLO del 99,95 %

| Periodo | Indisponibilidad permitida |
| --- | --- |
| 30 días | ≈ 21,6 min |
| 90 días | ≈ 64,8 min |
| 1 año | ≈ 4 h 23 min |

- Con comprobaciones cada 60 s y confirmación de 2 fallos, una caída se detecta en
  ~2 min y la resolución del dato es de 1 min: **una sola caída de 22 min agota el
  presupuesto del mes**.
- Informe mensual: disponibilidad del monitor de readiness (el que representa "se
  pueden hacer pedidos"), descontando solo las ventanas de mantenimiento anunciadas.
- Alertas de *burn rate* (Prometheus, `slo.yml`), sobre la proporción de errores 5xx:

  ```promql
  # Quema rápida (critical): 2 % del presupuesto en 1 h o 5 % en 6 h
  (
    reposteria:slo_error_ratio:rate1h > 14.4 * 0.0005 and reposteria:slo_error_ratio:rate5m > 14.4 * 0.0005
  ) or (
    reposteria:slo_error_ratio:rate6h > 6 * 0.0005 and reposteria:slo_error_ratio:rate30m > 6 * 0.0005
  )

  # Quema lenta (warning): 10 % del presupuesto en 1 día o en 3 días
  (
    reposteria:slo_error_ratio:rate1d > 3 * 0.0005 and reposteria:slo_error_ratio:rate2h > 3 * 0.0005
  ) or (
    reposteria:slo_error_ratio:rate3d > 1 * 0.0005 and reposteria:slo_error_ratio:rate6h > 1 * 0.0005
  )

  # Disponibilidad según las sondas HTTPS (blackbox) en 30 días
  avg by (instance) (avg_over_time(probe_success{job="blackbox-public"}[30d]))
  ```

- Si usas Better Stack, su SLA/estado por monitor da la misma cifra desde fuera;
  si difiere mucho de `reposteria:slo_availability:ratio30d`, hay caídas que el lado
  servidor no ve (DNS, CDN, certificado) o errores que los monitores no ejercitan.
