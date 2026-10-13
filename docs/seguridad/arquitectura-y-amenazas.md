# Arquitectura de seguridad y modelo de amenazas

Documento de referencia para quien mantenga, audite o despliegue la web de Repostería Madre Mía
(Next.js 16, App Router). Cada control indica el archivo donde está implementado. Lo que no está
implementado aparece como **Pendiente**; no se describen controles que no existan en el código.

Documentos relacionados: [Gestión de secretos](../operaciones/gestion-de-secretos.md) ·
[Despliegue seguro](../operaciones/despliegue-seguro.md) · [Política de divulgación](../../SECURITY.md).

---

## 1. Componentes

| Componente | Tecnología | Archivos principales | Notas |
| --- | --- | --- | --- |
| Navegador del cliente | HTML/React, sin cuentas de cliente | `src/app/(site)/` | El cliente solo envía ids, cantidades y sus datos de contacto. |
| Navegador del personal | Panel `/admin` | `src/app/admin/` | Contraseña + MFA obligatorio, RBAC. |
| Borde / WAF | Vercel Firewall, Cloudflare o nginx + ModSecurity (OWASP CRS) | `infra/vercel/firewall.json`, `infra/cloudflare/`, `infra/nginx/` | Una de las tres según la plataforma. |
| Proxy de la app | `src/proxy.ts` (runtime Node) | `src/proxy.ts`, `src/lib/limiter.ts`, `src/lib/load.ts` | Descarte de carga, límite global por IP, anti-CSRF, CSP con nonce, barrera del panel. |
| Aplicación | Next.js (páginas, Server Actions, rutas `/api/*`) | `src/app/`, `src/lib/` | `output: "standalone"` (`next.config.ts`). |
| Base de datos | PostgreSQL 16 vía Prisma 6 | `prisma/schema.prisma`, `prisma/migrations/`, `prisma/sql/least-privilege.sql` | Cifrado de campos en la app (`src/lib/db.ts`). En autoalojado, a través de PgBouncer (`infra/pgbouncer/`). |
| Redis (opcional) | ioredis | `src/lib/redis.ts`, `infra/redis/` | Contadores de límites compartidos. Sin Redis, límites en memoria por instancia. |
| Cola de trabajos | Tabla `Job` (outbox) | `src/lib/jobs.ts`, `src/lib/job-handlers.ts` | Emails, WhatsApp y alertas con reintentos. |
| Pagos | Stripe Checkout alojado + webhook | `src/lib/checkout.ts`, `src/lib/stripe.ts`, `src/lib/order-events.ts`, `src/app/api/stripe/webhook/route.ts` | La app nunca ve datos de tarjeta. |
| Correo | SMTP (nodemailer) | `src/lib/email.ts`, `src/lib/emails.ts` | STARTTLS obligatorio y TLS ≥ 1.2 salvo `SMTP_ALLOW_PLAINTEXT=true`. |
| WhatsApp (opcional) | Cloud API de Meta | `src/lib/whatsapp.ts` | Plantillas al número del negocio. |
| Almacenamiento de imágenes | Disco local o Supabase Storage | `src/lib/storage.ts`, `src/app/api/uploads/route.ts`, `src/app/api/media/route.ts` | Bucket público (catálogo) y privado (fotos de clientes). |
| Tareas programadas | Vercel Cron / CronJobs k8s / `infra/scheduler` | `vercel.json`, `infra/k8s/cronjobs.yaml`, `src/app/api/cron/` | Autenticadas con `CRON_SECRET`. |
| Copias de seguridad | `pg_dump` + `age` | `scripts/backup.sh`, `scripts/restore.sh`, `infra/postgres/backup/` | Cifradas con clave pública; la privada fuera del servidor. |
| Monitorización | Prometheus, Alertmanager, blackbox | `infra/monitoring/`, `src/app/api/metrics/route.ts` | `/api/metrics` exige `METRICS_TOKEN`. |
| CI/CD | GitHub Actions | `.github/workflows/{ci,security,deploy}.yml` | Ver [Despliegue seguro](../operaciones/despliegue-seguro.md). |

## 2. Diagrama y fronteras de confianza

```
                    ┌─────────────────────── Internet (no confiable) ───────────────────────┐
  Cliente / Personal│  Navegador ──HTTPS(HSTS)──┐                 Stripe ──webhook firmado──┐ │
                    └───────────────────────────┼───────────────────────────────────────────┼─┘
  FC-1 ═════════════════════════════════════════╪═══════════════════════════════════════════╪══
                                                ▼                                           ▼
                                    WAF / CDN (Vercel Firewall | Cloudflare | nginx+CRS)
  FC-2 ════════════════════════════════════════ │ (IP real solo vía TRUST_PROXY) ═══════════════
                                                ▼
                       src/proxy.ts → páginas, Server Actions, /api/*  (Next.js, Node)
                         │            │              │                 │
  FC-3 ══════════════════╪════════════╪══════════════╪═════════════════╪══════════════════════
                         ▼            ▼              ▼                 ▼
                  PostgreSQL     Redis (opc.)   Storage (público /   Salida: Stripe API, SMTP,
                  (TLS, rol      (ACL)          privado)             WhatsApp, HIBP (k-anon.)
                   reposteria_app, RLS)
  FC-4 ═══ Secretos: gestor del proveedor (Vercel / GitHub Environments / Docker / ExternalSecret)
  FC-5 ═══ Cadena de suministro: npm, imágenes base, acciones de GitHub, CI/CD
```

| Frontera | Qué separa | Control principal |
| --- | --- | --- |
| FC-1 | Internet ↔ borde | TLS 1.2/1.3 (`infra/nginx/snippets/tls.conf`), HSTS de 2 años con subdominios; `preload` solo con `HSTS_PRELOAD=true` (`next.config.ts`), WAF (`infra/`). |
| FC-2 | Borde ↔ aplicación | Solo se confía en la cabecera de IP del proxy declarado en `TRUST_PROXY` (`src/lib/client-ip.ts`); el resto de cabeceras del cliente se trata como no confiable. |
| FC-3 | Aplicación ↔ datos y terceros | Rol de BD sin DDL + RLS (`prisma/sql/least-privilege.sql`), cifrado de campos (`src/lib/db.ts`), firma de webhooks, TLS saliente (`src/lib/email.ts`). |
| FC-4 | Secretos ↔ código / navegador | Secretos solo en el gestor del entorno; `experimental.taint` (`next.config.ts`, `src/lib/taint.ts`); solo `NEXT_PUBLIC_SITE_URL` es pública. |
| FC-5 | Código de terceros ↔ build | `npm ci` con lockfile, acciones fijadas por SHA, Dependabot con *cooldown* (`.github/dependabot.yml`), análisis en `security.yml`. |

## 3. Flujos de datos

### 3.1 Pedido y pago con Stripe
1. El navegador envía a `POST /api/orders` (`src/app/api/orders/route.ts`) ids de producto, cantidades,
   opciones, franja y datos de contacto, con cabecera `Idempotency-Key` opcional (16–64 caracteres).
2. `src/proxy.ts` aplica límite global (60 escrituras/min por IP) y comprueba `Origin`; la ruta aplica
   su propio límite (8 pedidos / 10 min por IP), validación zod (`src/lib/validation.ts`) y tamaño
   máximo del cuerpo (100 KB, `readJson`).
3. `createOrder` (`src/lib/checkout.ts`) recalcula precios, descuentos, envío y total en el servidor
   (`priceCart`), bloquea la franja (`pg_advisory_xact_lock`) y el stock (`SELECT … FOR UPDATE`) y crea
   el pedido con los datos personales cifrados. Misma clave de idempotencia con cuerpo distinto → **422**.
4. Con pago online se crea una sesión de Stripe Checkout con importe del servidor y clave de
   idempotencia `checkout-session-<orderId>`. El navegador va a `checkout.stripe.com` (permitido en
   `form-action` de la CSP).
5. Stripe llama a `POST /api/stripe/webhook`: firma verificada con `constructEvent` y tolerancia de
   300 s, se ignoran eventos de modo distinto (test/live), deduplicación por `StripeEvent.id`.
   `markOrderPaid` (`src/lib/order-events.ts`) compara `amount_total` y moneda (EUR) con el pedido; si no
   coinciden no se marca pagado y se emite la alerta `payment.amount_mismatch`.
6. El pedido solo pasa a pagado por el webhook o la verificación del servidor, nunca por la URL de
   retorno. Reembolsos: `charge.refunded` → `markOrderRefunded`; reembolso iniciado desde el panel con
   clave `refund-<orderId>`.
7. El acceso del cliente al pedido es por token aleatorio (`?t=`), que `src/proxy.ts` canjea por una
   cookie HttpOnly limitada a `/pedido/<número>` y elimina de la URL (`Referrer-Policy: no-referrer`).

### 3.2 Correo, WhatsApp y alertas
- Los envíos se encolan en la tabla `Job` dentro de la misma transacción del pedido (outbox,
  `src/lib/jobs.ts`); procesadores con `FOR UPDATE SKIP LOCKED`, reintentos y estado `FAILED` con alerta.
- Se procesan en `/api/cron/jobs` y, de forma oportunista, con `kickJobs()` tras pedidos, webhooks y
  algunas acciones (`src/lib/job-handlers.ts`); `securityAlert` también lanza la cola en el momento
  (`after()`) y, si la BD no está disponible, envía la alerta directamente a `ALERT_WEBHOOK_URL`.
  En Vercel Hobby (cron diario en `vercel.json`) los reintentos los lanza cada 5 minutos
  `.github/workflows/cron-jobs.yml`; con Vercel Pro, cron cada minuto.
- SMTP: `requireTLS` (puerto ≠ 465), `minVersion: "TLSv1.2"`, `rejectUnauthorized: true` (`src/lib/email.ts`).
  El proveedor SMTP recibe nombre, email y contenido del pedido del cliente (encargado de tratamiento).
- Alertas (`src/lib/alerts.ts`): tipo, mensaje genérico e identificadores internos; agrupadas por
  ventana de 10 min; destino `ALERT_EMAIL` y/o `ALERT_WEBHOOK_URL`.

### 3.3 Subidas y almacenamiento
- `POST /api/uploads` (fotos de referencia de clientes): límite 12 subidas / 10 min por IP, ≤ 10 MB,
  `multipart/form-data` obligatorio, tipo declarado en lista blanca, bytes mágicos (JPEG, PNG, WebP,
  HEIC/AVIF), `sharp` con `limitInputPixels` y una sola página, re-codificación a WebP (sin EXIF/GPS)
  (`src/lib/storage.ts`).
- Las fotos de clientes se guardan con referencia opaca `private:references/…` en el bucket privado
  (o `UPLOAD_DIR/private`) y solo se sirven por `/api/media` con firma HMAC y caducidad (≤ 24 h).
- Con `STORAGE_DRIVER=supabase` la app usa `SUPABASE_SERVICE_ROLE_KEY` (solo servidor).

### 3.4 Panel de administración
Login (`src/app/admin/login/actions.ts`) → sesión pendiente de MFA (10 min) → TOTP, passkey o código
de recuperación (`src/lib/mfa.ts`) → sesión nueva (`src/lib/session.ts`) → cada página, Server Action y
ruta `/api/admin/*` comprueba permiso en servidor (`src/lib/auth.ts`, `src/lib/rbac.ts`).

### 3.5 Derechos RGPD y conservación
Formulario público `/privacidad/derechos` con verificación por enlace firmado (hash SHA-256 del token
en `DataRequest.verifyTokenHash`); el OWNER exporta (JSON) o suprime desde `/admin/privacidad`
(`src/lib/privacy.ts`: `exportSubjectData`, `eraseSubjectData`). `applyRetention` se ejecuta en
`/api/cron` con los plazos de `RETENTION` (pedidos 6 años y luego anonimizados, fotos de referencia
90 días, intentos de login 90 días, sesiones caducadas 30 días, clientes inactivos 24 meses,
carritos 30 días, auditoría 2 años, etc.).

## 4. Clasificación de datos

| Clase | Datos | Protección en reposo | Archivo |
| --- | --- | --- | --- |
| **Personal cifrado** (AES-256-GCM, AAD `Modelo.campo`) | `Order`: customerName, customerEmail, customerPhone, address, notes, accessToken · `OrderItem`: dedication · `QuoteRequest`: customerName, customerEmail, customerPhone, notes, accessToken · `Customer`: email, name, phone, unsubscribeToken · `CelebrationReminder`: label · `AbandonedCart`: email, name, cart, token · `GiftCard`: purchaserName, purchaserEmail, recipientName, recipientEmail, message · `DataRequest`: email, details | Cifrado transparente en la extensión de Prisma; formato `enc:v1:<kid>:<iv>:<ct>` | `src/lib/db.ts` (`ENCRYPTED_FIELDS`), `src/lib/crypto.ts` |
| **Secreto de autenticación cifrado** | `AdminUser.totpSecret`, `AdminSession.challenge` (secreto TOTP en alta) | AES-256-GCM (contextos `AdminUser.totpSecret`, `AdminSession.challenge`) | `src/lib/mfa.ts` |
| **Índices ciegos** (HMAC-SHA256 con `DATA_HASH_KEY`) | `Order.customerEmailHash/customerPhoneHash`, `QuoteRequest.customerEmailHash`, `Customer.emailHash/unsubscribeTokenHash`, `AbandonedCart.emailHash/tokenHash`, `GiftCard.purchaserEmailHash/recipientEmailHash`, `DataRequest.emailHash` | No reversibles sin la clave; solo igualdad | `src/lib/db.ts` (`BLIND_INDEXES`) |
| **Huellas con clave** | IP (`ipHash`) y user-agent (`deviceHash`) de sesiones, intentos de login y auditoría; email de login (`LoginAttempt.emailHash`) | `keyedHash` (HMAC con `DATA_HASH_KEY`, truncado) | `src/lib/crypto.ts`, `src/lib/session.ts` |
| **Credenciales** | Contraseñas del personal; códigos de recuperación; id de sesión | Argon2id (m=19456 KiB, t=2, p=1); SHA-256; SHA-256 del token de cookie | `src/lib/password.ts`, `src/lib/totp.ts`, `src/lib/session.ts` |
| **Personal NO cifrado en la app** | `AdminUser.email` y `name` (personal interno); `Review.authorName` y `text` (publicados); `Order.postalCode/city`, `OrderItem.customSpec` y `QuoteRequest.spec` (se anonimizan con el pedido) | Solo controles de la BD (rol de la app, RLS, cifrado del proveedor si existe) | `prisma/schema.prisma`, `src/lib/storage.ts` |
| **Fotos de referencia** | Archivos en bucket/directorio privado | AES-256-GCM por archivo (AAD = ruta), servidas solo con URL firmada que caduca | `src/lib/storage.ts`, `src/lib/crypto.ts` (`encryptBuffer`) |
| **Pago** | Ninguna tarjeta; solo ids de sesión/PaymentIntent de Stripe, importes | — | `src/lib/checkout.ts` |
| **Público** | Catálogo, precios, ajustes públicos, ocupación agregada | Microcaché solo para estos datos (`src/lib/micro-cache.ts`) | — |

Observación: quien obtenga una copia de la BD **sin** las claves no puede leer los campos cifrados,
ni los tokens de acceso (también cifrados), así que tampoco puede abrir pedidos ni presupuestos a
través de la web. Las fotos subidas antes de esta versión en Supabase siguen sin cifrar hasta que
caduquen (90–150 días); las locales las cifra `npm run db:encrypt`.

## 5. Modelo de amenazas STRIDE

S = suplantación, T = manipulación, R = repudio, I = divulgación, D = denegación de servicio,
E = elevación de privilegios. Riesgo residual: B (bajo), M (medio), A (alto).

### 5.1 Sitio público y API de pedidos

| | Amenaza | Mitigación implementada | Residual |
| --- | --- | --- | --- |
| S | Suplantar IP para saltarse límites (`X-Forwarded-For` falsa) | IP solo de la cabecera del proxy de confianza (`src/lib/client-ip.ts`, `TRUST_PROXY`) | B |
| T | Manipular precio, descuento o total | Cálculo solo en servidor (`priceCart`, `src/lib/checkout.ts`); el campo `totalCents` del cliente se ignora | B |
| T | Pedido duplicado o sobreventa por concurrencia | Bloqueo asesor por franja, `FOR UPDATE`, `CHECK` en BD (migración `20261012180000_seguridad`), idempotencia | B |
| R | Cliente niega haber hecho el pedido | `OrderStatusEvent`, aceptación de condiciones, consentimiento con fecha | M (sin firma del cliente) |
| I | Ver pedidos ajenos (IDOR) | Token aleatorio por pedido/presupuesto, comparación en tiempo constante, cookie con `Path` limitado; `/seguimiento` exige número + email y tiene límite | B |
| I | XSS reflejado/almacenado | Escapado de React, CSP con nonce y `strict-dynamic` en rutas sensibles (`STRICT` en `src/proxy.ts`), único `dangerouslySetInnerHTML` en `src/components/site/JsonLd.tsx` con `<` escapado; regla Semgrep `reposteria.dangerously-set-inner-html` (ERROR) | M: páginas estáticas/ISR usan `script-src 'unsafe-inline'` (sin nonce) |
| D | Inundación de peticiones | Límites globales y por ruta, penalizaciones, descarte de carga con 503 (`src/lib/limiter.ts`, `src/lib/load.ts`), WAF | M (ver §7, DDoS) |
| E | Acceso a rutas internas | Sin rutas de administración fuera de `/admin` y `/api/admin`; `/api/cron` y `/api/metrics` con secreto | B |

### 5.2 Panel de administración

| | Amenaza | Mitigación implementada | Residual |
| --- | --- | --- | --- |
| S | Robo/adivinación de contraseña | Argon2id, ≥ 12 caracteres, lista de contraseñas comunes, HIBP por k-anonimato (`src/lib/password.ts`), MFA obligatorio, límites por IP (10/15 min) y por cuenta (6/15 min), bloqueo progresivo desde 5 fallos (15 min, duplicándose, máx. 24 h), mensaje genérico y hash ficticio para no revelar cuentas | B |
| S | Phishing de TOTP | Passkeys WebAuthn disponibles (`@simplewebauthn/server`, `src/lib/mfa.ts`); TOTP sigue siendo phishable | M |
| S | Robo de cookie de sesión | `__Host-`, HttpOnly, Secure, SameSite=Strict; sesión ligada a hash de user-agent (cambio → revocación y alerta); token rotado tras MFA; caducidad 60 min inactividad / 12 h (`src/lib/session.ts`) | M (un atacante que copie también el user-agent exacto no se detecta) |
| T | CSRF en Server Actions | Comprobación de `Origin`/`Sec-Fetch-Site` en `src/proxy.ts`, SameSite=Strict | B |
| R | Personal niega una acción | `AuditLog` encadenado por hash, triggers que impiden UPDATE/TRUNCATE y DELETE < 2 años, verificación y ancla diaria en `/api/cron` (`src/lib/audit.ts`) | B |
| I | Exportaciones masivas | Permiso `customers.export` solo OWNER, auditoría y alerta `admin.export` (`src/app/api/admin/clientes.csv/route.ts`), protección contra inyección de fórmulas CSV | B |
| E | Empleado accede a funciones de propietario | RBAC en servidor por página/acción/API (`requirePermission`, `apiRequirePermission`); regla Semgrep `reposteria.admin-server-action-without-authz` (ERROR); nadie modifica su propio rol y siempre queda un OWNER activo (`src/app/admin/(panel)/usuarios/actions.ts`) | B |
| E | Uso de sesión abierta para acciones críticas | **Pendiente:** no hay reautenticación ni MFA reciente para exportar, suprimir datos o gestionar usuarios | M |

### 5.3 Webhook de Stripe y pagos

| | Amenaza | Mitigación implementada | Residual |
| --- | --- | --- | --- |
| S | Webhook falso que marca pedidos pagados | Firma `constructEvent` con `STRIPE_WEBHOOK_SECRET`, tolerancia 300 s, alerta `webhook.invalid_signature` | B |
| T | Pago de importe inferior | `markOrderPaid` compara `amount_total` y moneda; si no coincide, no se confirma y alerta crítica | B |
| R/T | Reenvío o duplicado de eventos | Tabla `StripeEvent`, operaciones idempotentes | B |
| I | Claves de Stripe expuestas | Solo servidor, `taint` (`src/lib/taint.ts`), comprobación test/live por entorno (`src/lib/env.ts`) | B |
| D | Saturación del webhook | Ruta crítica excluida del descarte de carga; Stripe reintenta ante 500 | B |

### 5.4 Subidas y almacenamiento

| | Amenaza | Mitigación implementada | Residual |
| --- | --- | --- | --- |
| T | Archivo malicioso (polyglot, SVG con script, HTML) | Bytes mágicos + re-codificación con `sharp`; SVG y HTML no admitidos | B |
| D | Bomba de descompresión/imagen gigante | `limitInputPixels: 50_000_000`, 10 MB, una sola página | B |
| I | Acceso a fotos de clientes | Bucket privado, URL firmada con caducidad; recorrido de rutas impedido (`readLocal`) | B |
| I | Fuga de la clave de servicio de Supabase | Solo servidor; tiene acceso total al proyecto Supabase | M |

### 5.5 Base de datos, Redis y copias

| | Amenaza | Mitigación implementada | Residual |
| --- | --- | --- | --- |
| T/E | Inyección SQL | Prisma parametrizado; `$queryRaw`/`$executeRaw` solo como plantillas etiquetadas; regla `reposteria.prisma-raw-unsafe` (ERROR) | B |
| E | App comprometida cambia esquema o borra auditoría | Rol `reposteria_app` sin DDL ni TRUNCATE, sin UPDATE en `AuditLog`, `statement_timeout` 15 s; `npm run db:check-security` (14 comprobaciones) | B: los pods de k8s ya no reciben `DIRECT_URL`; en Vercel no la definas en el entorno de la app (ver gestión de secretos) |
| I | Copia de la BD robada | Campos personales, tokens de acceso y fotos cifrados; copias cifradas con `age` | B (sin las claves `DATA_*`) |
| I | Acceso a la API pública de Supabase | RLS activado en todas las tablas y revocación a `anon`/`authenticated` (`prisma/sql/least-privilege.sql`) | B. Nota: las políticas de RLS son `USING (true)` para la app: no aíslan filas entre clientes |
| D | Caída de Redis | Límites en memoria por instancia; `/api/health/ready` solo exige BD | B |

### 5.6 CI/CD y cadena de suministro

| | Amenaza | Mitigación implementada | Residual |
| --- | --- | --- | --- |
| T | Dependencia comprometida | `npm ci`, `npm audit` (HIGH+), OSV-Scanner, Trivy, Dependabot con *cooldown* | M |
| T | Acción de GitHub manipulada | Acciones fijadas por SHA | B |
| E | PR que despliega o lee secretos de producción | `deploy.yml` por `workflow_run` (usa la definición de la rama por defecto), entornos con revisores | B si se configuran los ajustes de [Despliegue seguro](../operaciones/despliegue-seguro.md) |
| T | Código no verificado en producción por la integración Git de Vercel | `vercel.json` con `"git": {"deploymentEnabled": false}`: solo despliega `deploy.yml` tras CI y Security en verde | B |
| I | Secretos en el repositorio | Gitleaks sobre todo el historial, Trivy `secret`, `.gitignore` con `.env` | B |

## 6. Riesgos residuales principales

| Id | Riesgo | Acción propuesta |
| --- | --- | --- |
| R-1 | Un miembro del proyecto de Vercel puede desplegar a mano (`vercel deploy`) sin pasar por CI | Limitar los miembros del proyecto y los tokens; ver [Despliegue seguro §4](../operaciones/despliegue-seguro.md#4-ajustes-obligatorios-en-vercel). |
| R-2 | Sin reautenticación para acciones críticas del panel | Pedir MFA reciente (p. ej. < 5 min) para exportar, suprimir y gestionar usuarios. |
| R-3 | Fotos antiguas en Supabase sin cifrar (anteriores al cifrado de archivos) | Caducan por retención en 90–150 días; o volver a subirlas. |
| R-4 | `script-src 'unsafe-inline'` en páginas estáticas/ISR | Mantener esas páginas sin datos personales ni formularios con credenciales (ya es así: rutas en `STRICT`). |
| R-5 | Rotación de `DATA_HASH_KEY` sin periodo de doble clave | Ver [Gestión de secretos §4.2](../operaciones/gestion-de-secretos.md#42-data_hash_key). |
| R-6 | El planificador de GitHub Actions puede retrasar unos minutos la cola en Vercel Hobby | Vercel Pro con cron cada minuto, o planificador externo. |
| R-7 | TLS hacia la BD solo se avisa (no se exige) en `checkEnvironment` | Usar siempre `sslmode=require` o `verify-full` con proveedores gestionados. |

## 7. Ataques solicitados: control y prueba

Pruebas existentes: unitarias (`src/lib/*.test.ts`, `npm test`), integración contra PostgreSQL real
(`tests/integration/*.test.ts`, `npm run test:integration`), DAST propio (`scripts/security-tests.ts`,
`npm run test:security`), E2E del panel con Playwright (`tests/e2e/admin-security.mjs`,
`npm run test:e2e`) y, en CI, ZAP baseline pasivo (`.zap/rules.tsv`). Resultados registrados en la
última ejecución local: unitarias 41/41, integración 18/18, DAST 51/51 (estable en 7 ejecuciones),
E2E 33/33.

| Ataque | Control | Cómo se ha probado |
| --- | --- | --- |
| Inyección SQL | Prisma parametrizado; raw SQL solo con plantillas etiquetadas; Semgrep `reposteria.prisma-raw-unsafe` | DAST: cargas `' OR '1'='1`, `1; DROP TABLE "Order";--` en `/productos?q=`, `?categoria=`, `/api/availability?lead=`, `/producto/…`, `/zonas/…`, `/seguimiento?error=` (sin 500); inyección en cupón e id de producto en `/api/checkout/preview` (< 500); JSON con tipos manipulados (`{ "$gt": "" }`) → 400/429. |
| XSS | Escapado de React, CSP con nonce + `strict-dynamic` en rutas sensibles, `default-src 'none'` en `/api/*` | DAST: `<script>…`, `"><img onerror>` en los mismos parámetros sin eco sin escapar; CSP del checkout con nonce, sin `'unsafe-inline'` en `script-src`, nonce presente en los `<script>` y distinto en cada petición; CSP con `frame-ancestors 'none'`, `object-src 'none'`, `base-uri`. ZAP baseline (regla 10038 FAIL). |
| CSRF | `Origin`/`Sec-Fetch-Site` en `src/proxy.ts` (excepto webhook, cron, métricas y health), SameSite=Strict | DAST: `POST /api/orders` y Server Action `POST /admin/login` con `Origin: https://atacante.example` → 403. |
| Fuerza bruta | Límites por IP y por cuenta, bloqueo progresivo, límite de 5 fallos de MFA, alertas | E2E: hasta 7 contraseñas erróneas contra una cuenta de empleado → mensaje "Demasiados intentos" o la contraseña correcta deja de entrar; TOTP incorrecto rechazado. DAST: ráfaga de 25 `POST /api/orders` → al menos un 429. Unitarias: política de contraseñas y Argon2id. |
| Robo de sesión | Cookie `__Host-` HttpOnly/Secure/Strict, ligada al user-agent, rotación tras MFA, revocación en servidor | E2E: atributos de la cookie; token no JWT y ≥ 40 caracteres; cookie usada desde otro user-agent → sin acceso y la sesión original queda revocada; tras cerrar sesión la cookie antigua da 401. DAST: cookie inventada → 401. |
| Manipulación de precios | Precios y totales solo en servidor; importe de Stripe comparado con el pedido | Integración: "los importes se calculan en el servidor…" y "un importe distinto al calculado no confirma el pedido". DAST: pedido con `totalCents: 1` se crea con el precio real. Unitarias: `src/lib/pricing.test.ts` (opciones inventadas, cantidades excesivas). |
| Subidas maliciosas | Bytes mágicos, `sharp`, límites, almacenamiento privado firmado | DAST: texto PHP como `foto.jpg`, SVG con script y HTML → 400; foto privada sin firma o con firma inventada → 403; rutas `/uploads/private/…`, `/uploads/../.env` no expuestas. |
| Abuso de API | Límites globales y por ruta, penalizaciones, tamaño máximo de cuerpo, idempotencia | DAST: cuerpo de 5.000 elementos → 4xx sin 500; ráfaga → 429; doble envío simultáneo con la misma `Idempotency-Key` → mismo pedido; misma clave con otro cuerpo → 422. Integración: 10 reintentos simultáneos → un pedido. |
| Dependencias vulnerables | `npm audit --omit=dev --audit-level=high`, OSV-Scanner, Trivy fs/imagen, Dependabot | Jobs de `.github/workflows/security.yml` (bloqueantes). No hay prueba local registrada en este documento. |
| DDoS | WAF/CDN (`infra/`), límites adaptativos, descarte de carga 503, HPA 3–20 réplicas (`infra/k8s/hpa.yaml`) | Solo la parte de aplicación: DAST de ráfaga (429). Pruebas de carga (`loadtest/`) en una única máquina de 4 CPU: 0 % errores hasta 500 VU, 0,01 % a 1.000 VU, 53 % a 5.000 y 64 % a 10.000 VU, sin pedidos perdidos ni duplicados. **No se ha probado** la protección volumétrica del WAF/CDN ni capacidad de 5.000+ usuarios en producción. |
| Escalada de privilegios | RBAC en servidor, OWNER único gestor de usuarios, no autodegradación, último OWNER protegido | E2E: empleado redirigido con `sin-permiso=1` en `/admin/ajustes`, `/usuarios`, `/clientes`, `/auditoria`, `/productos`, `/privacidad`; exportación CSV → 403; menú sin secciones prohibidas. Unitarias: matriz de permisos STAFF/MANAGER/OWNER. DAST: APIs de admin sin sesión → 401. |
| IDOR (complementaria) | Tokens por pedido | DAST: pedido sin token → 404, token incorrecto → 404, cookie de un pedido no abre otro, la página no contiene el token ni `enc:v1:`/hashes internos. |

## 8. OWASP Top 10 (2021)

| Categoría | Controles | Evidencia |
| --- | --- | --- |
| A01 Control de acceso roto | RBAC en servidor, tokens por pedido, barrera de cookie en `src/proxy.ts`, CORS no habilitado | `src/lib/rbac.ts`, `src/lib/auth.ts`, `src/lib/access-token.ts`; E2E y DAST §7 |
| A02 Fallos criptográficos | AES-256-GCM con AAD y anillo de claves, HMAC para índices, Argon2id, HSTS, TLS 1.2+ | `src/lib/crypto.ts`, `src/lib/password.ts`, `next.config.ts`, `infra/nginx/snippets/tls.conf`; `src/lib/crypto.test.ts` |
| A03 Inyección | Prisma, zod, escapado React, CSP, CSV sin fórmulas | `src/lib/validation.ts`, `.semgrep/rules.yml`; DAST §7 |
| A04 Diseño inseguro | Cálculo de importes en servidor, idempotencia, outbox, modelo de amenazas (este documento) | `src/lib/checkout.ts`, `src/lib/jobs.ts`; integración |
| A05 Configuración insegura | `checkEnvironment` falla al arrancar en producción, cabeceras de seguridad, `poweredByHeader: false`, Trivy IaC | `src/lib/env.ts`, `src/instrumentation-node.ts`, `next.config.ts`; ZAP baseline |
| A06 Componentes vulnerables | npm audit, OSV, Trivy, Dependabot | `.github/workflows/security.yml`, `.github/dependabot.yml` |
| A07 Fallos de identificación y autenticación | MFA obligatorio, bloqueo, sesiones en servidor, HIBP | `src/lib/mfa.ts`, `src/lib/session.ts`, `src/app/admin/login/actions.ts`; E2E |
| A08 Fallos de integridad de software y datos | Firma de webhooks, acciones por SHA, lockfile, auditoría encadenada | `src/app/api/stripe/webhook/route.ts`, `src/lib/audit.ts`. **Pendiente:** firma/SBOM de imágenes de contenedor y SRI de scripts de terceros |
| A09 Fallos de registro y monitorización | Logs enmascarados, auditoría, alertas, métricas Prometheus | `src/lib/logger.ts`, `src/lib/alerts.ts`, `infra/monitoring/` |
| A10 SSRF | Sin `fetch` a URLs del usuario (destinos fijos: Stripe, Supabase, Meta, HIBP); regla `reposteria.fetch-url-from-user-input` (WARNING) | `src/lib/storage.ts`, `src/lib/whatsapp.ts`, `src/lib/password.ts` |

## 9. OWASP ASVS 4.0.3 (capítulos principales)

| Capítulo | Estado | Evidencia / carencias |
| --- | --- | --- |
| V2 Autenticación | Cumple | Argon2id, ≥ 12 caracteres, HIBP, MFA obligatorio (TOTP con protección de reutilización, passkeys, 10 códigos de recuperación), bloqueo, mensajes genéricos, cambio obligatorio de la contraseña provisional (`mustChangePassword`). Clientes sin cuentas (acceso por token). |
| V3 Sesiones | Cumple | Token de 256 bits, SHA-256 en BD, `__Host-`, caducidad por inactividad y absoluta, revocación individual/global, rotación tras MFA (`src/lib/session.ts`). |
| V4 Control de acceso | Parcial | RBAC en servidor y regla Semgrep. **Pendiente:** reautenticación para operaciones sensibles (V4.3 / V2.2 de la plantilla de PR). |
| V5 Validación y codificación | Cumple | zod en servidor, Prisma, escapado React, CSV seguro. |
| V6 Criptografía | Parcial | Algoritmos y gestión de claves con versión (`kid`). Carencias: rotación de `DATA_HASH_KEY` sin doble clave; `*_FILE` solo para las 3 claves de datos (todas marcadas con *taint*, también las leídas de archivo). |
| V7 Errores y registros | Parcial | Registros enmascarados (`src/lib/logger.ts`, prueba unitaria), auditoría encadenada, errores genéricos. Carencias: retención y centralización de logs dependen del proveedor (no configuradas en el repositorio); retraso de unos minutos de la cola en Vercel Hobby (R-6). |
| V8 Protección de datos | Cumple | Cifrado de campos, tokens y fotos; `Cache-Control: private, no-store` en páginas privadas; conservación y derechos RGPD. Observación R-3. |
| V9 Comunicaciones | Parcial | HSTS, TLS 1.2/1.3 en nginx, SMTP con TLS ≥ 1.2 (la app no arranca en producción con `SMTP_ALLOW_PLAINTEXT=true`). Carencias: TLS hacia la BD solo se avisa (no se exige) en `checkEnvironment`; el fragmento de `infra/postgres/gen-secrets.sh` usa `sslmode=prefer` hacia PgBouncer en red interna. |
| V10 Código malicioso | Parcial | Lockfile, Gitleaks, análisis de dependencias, acciones por SHA. **Pendiente:** firma de imágenes/SBOM; SRI para Google Tag Manager (`src/components/site/CookieConsent.tsx`). |
| V12 Archivos y recursos | Cumple | §3.3; sin rutas de archivo controladas por el usuario. |
| V13 API y servicios web | Cumple | Anti-CSRF por `Origin`, tipos de contenido comprobados, límites de tamaño y frecuencia, firma de webhook, `default-src 'none'` en `/api/*`. |
| V14 Configuración | Parcial | Fail-closed en producción, cabeceras, imagen no root, CI de seguridad. Carencias: R-1 (despliegue manual con `vercel deploy`), `SECURITY.md` con contacto y huella PGP de ejemplo (`/.well-known/security.txt` está implementado en `src/app/.well-known/security.txt/route.ts`, pero responde 404 hasta definir `SECURITY_CONTACT`). |
