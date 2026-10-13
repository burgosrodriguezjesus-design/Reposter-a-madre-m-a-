# Encargados del tratamiento y transferencias internacionales

> Revisado contra el código el 2026-10-13. Columna «Datos que recibe» = lo que el código envía o almacena realmente en el proveedor.
> Antes de usar cada proveedor en producción: firmar o aceptar su DPA (art. 28.3), elegir región UE y comprobar el mecanismo de transferencia **en la fecha de la firma**.
> Certificación DPF: consultar https://www.dataprivacyframework.gov/list. Este documento no da por hecha ninguna certificación.

## Resumen

| Proveedor | Papel | Activo si… | Región recomendada / configurada |
| --- | --- | --- | --- |
| Vercel Inc. | Encargado (alojamiento, funciones, CDN, cron, logs, firewall) | Despliegue en Vercel | Funciones en `cdg1` (París), según `vercel.json`. La red perimetral es global. |
| Supabase / Neon / servidor propio | Encargado (PostgreSQL, almacenamiento de fotos, copias del proveedor) | `DATABASE_URL`, `STORAGE_DRIVER=supabase` | README: «Europe West (Paris)» o Frankfurt. «[COMPLETAR: proveedor y región elegidos]» |
| Upstash u otro Redis gestionado | Encargado (contadores del limitador) | `REDIS_URL` | «[COMPLETAR: región UE]» |
| Cloudflare | Encargado (proxy inverso, WAF) | `TRUST_PROXY=cloudflare` | Red global |
| Proveedor SMTP | Encargado (correo transaccional) | `SMTP_HOST` | «[COMPLETAR: proveedor y región]» |
| Stripe | Pasarela de pago. Encargado para unos fines y responsable independiente para otros (fraude, obligaciones regulatorias) | `STRIPE_SECRET_KEY` | La política de privacidad cita Stripe Payments Europe Ltd. (Irlanda) |
| Meta (WhatsApp Business Cloud API) | Encargado | `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` | «[COMPLETAR]» |
| Google Ireland Ltd. (GA4) | Encargado | `seo.gaMeasurementId` y consentimiento | — |
| Google (Maps embebido) | Tercero independiente | El usuario pulsa «Ver mapa interactivo» | — |
| GitHub (Microsoft) | Repositorio y CI. No es encargado mientras no reciba datos reales | Siempre | — |
| Destino de copias externas | Encargado (almacenamiento de copias cifradas) | `BACKUP_OFFSITE_CMD` | «[COMPLETAR]» |
| Webhook de alertas | Receptor de alertas sin datos personales | `ALERT_WEBHOOK_URL` | «[COMPLETAR: Slack/Telegram/…]» |
| Have I Been Pwned (pwnedpasswords) | No es encargado: solo recibe los 5 primeros caracteres hex del SHA-1 de la contraseña | `PASSWORD_BREACH_CHECK=true` | — |
| Proveedor del servidor (autoalojado) | Encargado | `docker-compose.prod.yml` / `infra/k8s` | «[COMPLETAR]» |

## Detalle por proveedor

### Vercel
- **Datos que recibe**: todo el tráfico HTTP en tránsito (formularios con nombre, email, teléfono, dirección, fotos), direcciones IP, variables de entorno, **incluidas las claves de cifrado** (`DATA_ENCRYPTION_KEYS`, `DATA_HASH_KEY`), y logs de ejecución. Los logs de la app pasan por `src/lib/logger.ts`, que enmascara nombre, email, teléfono, dirección y secretos.
- **Nota**: `src/lib/whatsapp.ts` usa `console.error` con el cuerpo de la respuesta de Meta, sin pasar por el enmascarado.
- **Transferencia**: Vercel Inc. (EE. UU.). Mecanismo: DPF o CCT del DPA «[VERIFICAR]».
- **DPA**: «[COMPLETAR: enlace al DPA de Vercel y fecha de aceptación]».

### Base de datos y almacenamiento (Supabase / Neon / propio)
- **Datos que recibe**: la base de datos completa. Los campos de `ENCRYPTED_FIELDS` (datos de contacto, notas, dedicatorias y tokens de acceso a pedidos y enlaces) llegan cifrados con AES-256-GCM y las claves **no** están en el proveedor de BD. Llegan **en claro** (se vacían al anonimizar el pedido, salvo los del personal):
  - `AdminUser.email` y `name`; `AuditLog.actorEmail`; `OrderStatusEvent.actorEmail` y `note`.
  - `Order.postalCode`, `city`, `adminNotes` y `rejectionReason`.
  - `OrderItem.customSpec` y `QuoteRequest.spec` (incluyen el texto de la tarta).
  - `Review.authorName` y `text`; `DataRequest.resolution`; contadores de `Customer`.
- **Fotos de referencia** (Supabase Storage, bucket privado `SUPABASE_PRIVATE_BUCKET`): se guardan **cifradas con AES-256-GCM** por la app (el proveedor no tiene la clave). Se accede con `SUPABASE_SERVICE_ROLE_KEY`, que salta RLS. Las subidas antes de esta medida siguen sin cifrar hasta que caducan (90–150 días).
- **Copias del proveedor** (PITR o diarias): «[COMPLETAR: plan y días de retención]».
- **Transferencia**: Supabase Inc. / Neon (EE. UU.) con región UE. Mecanismo: «[VERIFICAR: DPF o CCT]». Posible acceso de soporte desde fuera del EEE: revisar la lista de subencargados.
- **DPA**: «[COMPLETAR]».

### Redis (Upstash u otro)
- **Datos que recibe** (`src/lib/limiter.ts`, `src/lib/rate-limit.ts`, `src/proxy.ts`, `src/app/admin/login/actions.ts`):
  - Claves `rl:<ámbito>:<huella>:<ventana>` y `rl:pen:<huella>` con contadores enteros.
  - La huella es HMAC-SHA256 truncado (32 caracteres) de la IP, o del email de login.
  - En el cambio de contraseña y en WebAuthn la huella es el id interno del usuario o de la sesión.
  - Caducidad: 2 × ventana; penalizaciones, 1 h. No hay IP ni email en claro, ni caché de datos privados.
- **Transferencia**: «[VERIFICAR según proveedor]». Riesgo bajo: datos seudonimizados con clave que el proveedor no tiene.
- **DPA**: «[COMPLETAR]».

### Cloudflare (opcional)
- **Datos que recibe**: termina TLS, así que ve todo el tráfico descifrado (formularios, fotos, cookies) y las IP. Caché solo de estáticos y páginas públicas (`infra/cloudflare/rulesets/cache-rules.json`).
- **Transferencia**: Cloudflare Inc. (EE. UU.). «[VERIFICAR: DPF/CCT]». **DPA**: «[COMPLETAR]».

### Proveedor SMTP
- **Datos que recibe** (contenido de `src/lib/emails.ts` y de las acciones):
  - Al cliente: email, nombre, detalle del pedido o presupuesto y enlaces con token de acceso (`?t=`).
  - Tarjetas regalo: emails de comprador y destinatario, y el mensaje.
  - Recordatorios de carrito y de celebraciones; códigos de fidelización.
  - Verificación de solicitudes de derechos.
  - Al buzón del negocio: nombre, teléfono, email y notas del cliente (avisos de pedido y presupuesto), y reservas de tarjeta regalo con nombre y email.
  - Avisos de nuevo dispositivo al personal; alertas sin datos personales.
- **Transferencia**: «[COMPLETAR: proveedor; VERIFICAR mecanismo]». **DPA**: «[COMPLETAR]».

### Stripe
- **Lo que envía el código** (`src/lib/checkout.ts`, `src/app/api/giftcards/route.ts`):
  - `customer_email` (cliente, o comprador de la tarjeta regalo).
  - `client_reference_id` y `metadata` (id y número de pedido, id de la tarjeta regalo).
  - Nombre de la línea `Pedido <número> · <negocio>`; descripción `<cantidad>× <producto>` (máx. 450 caracteres); importe.
  - `success_url`, que incluye el número de pedido **y el token de acceso** (`?t=`).
- **No** se envían nombre, teléfono ni dirección. Los datos de tarjeta los introduce el cliente directamente en Stripe.
- **Lo que guarda la app**: ids de sesión y PaymentIntent en `Order`/`GiftCard`, y `StripeEvent` (id, tipo, resultado) durante 90 días.
- **Transferencia**: Stripe trata datos también en EE. UU. «[VERIFICAR: DPF/CCT en el DPA de Stripe]». **DPA**: «[COMPLETAR]».

### Meta – WhatsApp Business Cloud API (opcional)
- **Datos que recibe** (`job-handlers.ts` → `whatsapp.new-order`): una plantilla para el número del **negocio** (`notifications.adminWhatsapp`) con `<número de pedido> · <nombre del cliente> · <fecha> <hora> · <importe>`.
- El botón `wa.me` de la web no envía nada desde la app: el cliente inicia la conversación en WhatsApp.
- **Transferencia**: «[VERIFICAR: DPF/CCT]». **DPA**: condiciones de WhatsApp Business «[COMPLETAR]».

### Google
- **GA4**: solo si está configurado y el usuario acepta (ver cookies en el registro). Contrato de tratamiento de datos de Google Analytics «[COMPLETAR: aceptado sí/no]».
- **Maps**: iframe solo tras pulsar el botón; Google actúa como tercero independiente.

### GitHub (CI)
- `ci.yml` usa PostgreSQL efímero con datos demo (`prisma/seed.ts`) y datos ficticios de pruebas. `.env` y `/uploads/` están en `.gitignore`, y Gitleaks y Trivy buscan secretos.
- Condición: **nunca** usar volcados de producción en CI ni en issues o PR. Si ocurriera, GitHub pasaría a ser encargado y habría que evaluar una brecha.

### Copias externas (`BACKUP_OFFSITE_CMD`, p. ej. rclone)
- **Datos que recibe**: volcados cifrados con age. Sin la clave privada no son legibles.
- `scripts/backup.sh` usa `copy` y **no borra** en el destino: hay que configurar allí la retención (ver conservación).

## Checklist por encargado

Rellenar una fila por proveedor activo.

| Proveedor | DPA firmado (fecha/enlace) | Región UE elegida | Mecanismo de transferencia comprobado | Lista de subencargados revisada | Aviso de brechas sin dilación en el DPA | Devolución o borrado al terminar | Responsable de la revisión |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Vercel | «[COMPLETAR]» | cdg1 (funciones) | ☐ | ☐ | ☐ | ☐ | «[COMPLETAR]» |
| BD / Storage | «[COMPLETAR]» | ☐ | ☐ | ☐ | ☐ | ☐ | |
| Redis | «[COMPLETAR]» | ☐ | ☐ | ☐ | ☐ | ☐ | |
| SMTP | «[COMPLETAR]» | ☐ | ☐ | ☐ | ☐ | ☐ | |
| Stripe | «[COMPLETAR]» | n/a | ☐ | ☐ | ☐ | ☐ | |
| Meta (si se usa) | «[COMPLETAR]» | ☐ | ☐ | ☐ | ☐ | ☐ | |
| Cloudflare (si se usa) | «[COMPLETAR]» | n/a | ☐ | ☐ | ☐ | ☐ | |
| Google GA4 (si se usa) | «[COMPLETAR]» | n/a | ☐ | ☐ | ☐ | ☐ | |
| Copias externas | «[COMPLETAR]» | ☐ | ☐ | ☐ | ☐ | ☐ | |

## Recomendaciones
1. Elegir región UE en BD, Storage, Redis y SMTP, y mantener las funciones de Vercel en `cdg1`.
2. Si un proveedor estadounidense no figura en la lista DPF, usar las CCT (Decisión 2021/914) de su DPA y documentar una evaluación de impacto de la transferencia.
3. Separar los custodios: claves de cifrado en el gestor de secretos del alojamiento y BD en otro proveedor. Nunca guardar las claves en el proveedor de BD.
4. Quitar el token de acceso de `success_url` de Stripe, o asumir y documentar que Stripe lo recibe.
5. Actualizar la política de privacidad con la lista real de categorías de encargados (falta Redis, Cloudflare si se usa, y el destino de las copias).
