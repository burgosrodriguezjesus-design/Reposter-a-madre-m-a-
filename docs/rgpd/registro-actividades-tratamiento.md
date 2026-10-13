# Registro de actividades de tratamiento (art. 30 RGPD)

> Documento interno. Revisado contra el código el 2026-10-13 (`prisma/schema.prisma`, `src/lib/db.ts`, `src/lib/privacy.ts` y rutas citadas).
> Los textos entre «[COMPLETAR: …]» los rellena el responsable. Revisar cada vez que cambie el código de datos personales o un proveedor.

## Responsable

| Campo | Valor |
| --- | --- |
| Razón social | «[COMPLETAR: razón social]» |
| NIF | «[COMPLETAR: NIF]» |
| Domicilio | «[COMPLETAR: dirección postal]» |
| Contacto privacidad | «[COMPLETAR: email de privacidad]» |
| Delegado de Protección de Datos | «[COMPLETAR: nombre y contacto del DPD, o «No designado» tras valorar arts. 37 RGPD y 34 LOPDGDD]» |
| Responsable interno de la plataforma | «[COMPLETAR: persona con rol OWNER]» |

## Medidas de seguridad comunes (referenciadas como MS-n)

| Id | Medida | Dónde |
| --- | --- | --- |
| MS-1 | HTTPS con HSTS preload; nginx solo TLS 1.2/1.3; SMTP con STARTTLS obligatorio y TLS ≥ 1.2 | `next.config.ts`, `infra/nginx`, `src/lib/email.ts` |
| MS-2 | Cifrado de campos AES-256-GCM (`enc:v1:<kid>:…`, AAD `Modelo.campo`) e índices ciegos HMAC-SHA256 para email/teléfono. Campos cifrados: `Order` customerName, customerEmail, customerPhone, address, notes · `OrderItem` dedication · `QuoteRequest` customerName, customerEmail, customerPhone, notes · `Customer` email, name, phone · `CelebrationReminder` label · `AbandonedCart` email, name, cart · `GiftCard` purchaserName, purchaserEmail, recipientName, recipientEmail, message · `DataRequest` email, details · `AdminUser` totpSecret | `src/lib/db.ts` (`ENCRYPTED_FIELDS`), `src/lib/crypto.ts` |
| MS-3 | BD con mínimo privilegio: rol `reposteria_app` sin DDL, RLS en todas las tablas, `AuditLog` sin UPDATE/TRUNCATE para la app, trigger que impide borrar auditoría de menos de 2 años | `prisma/sql/least-privilege.sql`, `npm run db:check-security` |
| MS-4 | Panel: Argon2id, MFA obligatorio (TOTP/passkeys), sesiones en BD revocables (inactividad 60 min, máx. 12 h), RBAC en servidor (OWNER/MANAGER/STAFF) | `src/lib/auth.ts`, `src/lib/session.ts`, `src/lib/rbac.ts` |
| MS-5 | Registro de auditoría encadenado por hash, verificación diaria y huella enviada fuera del sistema | `src/lib/audit.ts`, `/api/cron` |
| MS-6 | Logs técnicos enmascarados (nombre, email, teléfono, dirección, secretos) | `src/lib/logger.ts` |
| MS-7 | Copias cifradas con age (clave privada fuera del servidor), SHA-256, retención 35 días por defecto | `scripts/backup.sh`, `infra/postgres/backup` |
| MS-8 | Fotos de clientes: re-codificadas a WebP sin EXIF/GPS, almacenamiento privado, solo con URL firmada de 10 min (`/api/media`). Cifradas con AES-256-GCM por la aplicación (AAD = ruta); las subidas a Supabase antes de esta medida, sin cifrar hasta que caducan | `src/lib/storage.ts`, `src/lib/crypto.ts` |
| MS-9 | Limitación de peticiones con claves HMAC de IP; WAF (Vercel Firewall / Cloudflare / ModSecurity) | `src/lib/limiter.ts`, `src/proxy.ts`, `infra/` |
| MS-10 | Conservación automática diaria (`applyRetention`) | `src/lib/privacy.ts`, `/api/cron` |
| MS-11 | Acceso a pedidos/presupuestos solo con token secreto canjeado por cookie HttpOnly limitada a esa ruta | `src/proxy.ts`, `src/lib/access-token.ts` |
| MS-12 | Alertas de seguridad sin datos personales (tipo, contadores, ids internos) | `src/lib/alerts.ts` |

Encargados y transferencias: ver [encargados-y-transferencias.md](encargados-y-transferencias.md). Plazos detallados: [conservacion-y-supresion.md](conservacion-y-supresion.md).

---

## T1. Gestión de pedidos y pagos

| Campo | Contenido |
| --- | --- |
| Finalidad | Tramitar pedidos (recogida o reparto), cobrar (Stripe Checkout o pago en tienda), avisar del estado, permitir el seguimiento sin cuenta (`/seguimiento`, `/pedido/[n]`), gestionar reembolsos y cancelaciones, contabilidad. |
| Base jurídica | Ejecución del contrato (art. 6.1.b). Conservación de los datos de la venta: obligación legal (art. 6.1.c; Código de Comercio art. 30, LGT). |
| Interesados | Clientes compradores. |
| Datos | Nombre, email, teléfono, dirección, código postal y ciudad (solo reparto), notas, dedicatoria, productos y opciones, texto de la tarta personalizada (`customSpec.spec.text`, ≤ 120 caracteres, **no cifrado**), fecha y hora, importes, cupón, tarjeta regalo usada, método y estado de pago, ids de Stripe (sesión, PaymentIntent), historial de estados con notas, aceptación de condiciones (fecha), casilla de comunicaciones comerciales. **No** se tratan datos de tarjeta. Al confirmar el pedido se crea o actualiza una ficha `Customer` (ver T4). |
| Origen | El propio interesado (formulario de compra). |
| Destinatarios / encargados | Alojamiento (Vercel o servidor propio), base de datos (Supabase/Neon/propia), proveedor SMTP, Stripe, Meta (WhatsApp Cloud API, si está configurada: nombre del cliente, número de pedido, fecha/hora e importe, enviado al número del negocio). Administración tributaria cuando lo exija la ley. |
| Transferencias internacionales | Según proveedor (ver documento de encargados). |
| Conservación | Pedidos: anonimización automática a los 6 años desde `createdAt` (`RETENTION.ordersYears = 6`, calculado como 6 × 366 días). Dedicatoria y foto de referencia se borran al anonimizar. Pedidos en curso nunca se tocan. |
| Medidas | MS-1 a MS-7, MS-10, MS-11. Precios calculados solo en servidor; idempotencia; el pedido solo se marca pagado por webhook verificado. |

## T2. Presupuestos y tartas personalizadas (con fotos de referencia)

| Campo | Contenido |
| --- | --- |
| Finalidad | Estudiar y presupuestar tartas personalizadas, responder al cliente y, si acepta, convertir el presupuesto en pedido. |
| Base jurídica | Aplicación de medidas precontractuales a petición del interesado (art. 6.1.b). |
| Interesados | Solicitantes. Posibles terceros que aparezcan en las fotos de referencia. |
| Datos | `QuoteRequest`: nombre, email, teléfono, fecha deseada, modalidad, notas, especificación del personalizador (`spec`, incluye celebración y texto de la tarta, **no cifrado**), foto de referencia (`private:references/…`), importes estimado y presupuestado, mensaje de la repostería. En pedidos: `OrderItem.referencePhotoUrl` y `customSpec`. |
| Destinatarios / encargados | Alojamiento, BD, almacenamiento de fotos (Supabase Storage bucket privado o disco local), SMTP. |
| Conservación | No aceptados (estado NEW, QUOTED, REJECTED o EXPIRED sin pedido): borrado a los 12 meses (12 × 31 días desde `createdAt`). Foto de pedido: 90 días tras `scheduledDate`. Foto de presupuesto: 150 días (90 + 60) desde `createdAt`. Presupuestos aceptados y vinculados a un pedido: se anonimizan junto con su pedido (6 años o supresión). |
| Medidas | MS-1 a MS-8, MS-10, MS-11. Fotos: comprobación de bytes mágicos, límite de 10 MB, eliminación de metadatos. |

## T3. Atención al cliente (email, WhatsApp, teléfono) y opiniones

| Campo | Contenido |
| --- | --- |
| Finalidad | Responder consultas e incidencias; publicar opiniones moderadas. |
| Base jurídica | Consultas sobre pedidos: art. 6.1.b. Consultas generales: interés legítimo en atender a quien escribe (art. 6.1.f). Opiniones: consentimiento (art. 6.1.a), según la política de privacidad. |
| Interesados | Clientes y potenciales clientes. |
| Datos | Lo que el interesado envíe. WhatsApp: el botón de la web es un enlace `wa.me` iniciado por el cliente; la conversación ocurre en la cuenta de WhatsApp del negocio, fuera de la aplicación. Las notificaciones de pedido al personal llevan `replyTo` con el email del cliente. Opiniones (`Review`): nombre del autor, puntuación, texto, número de pedido opcional; el email solo se usa para marcarla como verificada y **no se guarda**. |
| Destinatarios / encargados | Meta (WhatsApp), proveedor del buzón del negocio «[COMPLETAR: proveedor del buzón]», SMTP. |
| Conservación | Conversaciones de WhatsApp y del buzón: «[COMPLETAR: plazo y procedimiento manual]» (la aplicación no las gestiona). Opiniones no publicadas: borrado a los 12 meses. Publicadas: mientras sigan publicadas (no se vinculan a un email: retirarlas a petición). |
| Medidas | MS-1, MS-4, MS-6. Moderación previa: las opiniones solo se publican tras aprobarlas. |

## T4. Fichas de cliente, fidelización, tarjetas regalo y cupones

| Campo | Contenido |
| --- | --- |
| Finalidad | Historial de compras del cliente, sellos de fidelización y vales de premio, venta y canje de tarjetas regalo. |
| Base jurídica | Tarjetas regalo: contrato con el comprador (6.1.b); datos del destinatario: «[COMPLETAR: 6.1.b a favor de tercero o 6.1.f, valorar]». Ficha de cliente y fidelización: «[COMPLETAR: 6.1.b si las condiciones del programa forman parte del contrato; si no, 6.1.f con prueba de ponderación]». La ficha se crea con **cada** pedido confirmado (`handleOrderConfirmed`), esté o no activo el programa de fidelización. |
| Interesados | Clientes; compradores y destinatarios de tarjetas regalo. |
| Datos | `Customer`: email, nombre, teléfono, nº de pedidos, gasto total, sellos, consentimiento comercial y fecha, token de baja. `GiftCard`: nombre y email de comprador y destinatario, mensaje, código, saldo, caducidad, id de sesión de Stripe. Cupones de premio (`Coupon`): código y descripción con el id del cliente. |
| Destinatarios / encargados | Alojamiento, BD, SMTP, Stripe (email del comprador de la tarjeta). |
| Conservación | Ficha sin pedidos, sin consentimiento comercial y sin recordatorios activos: borrado tras 24 meses sin cambios (24 × 31 días desde `updatedAt`). Mientras tenga pedidos no anonimizados no se borra. Tarjetas regalo: anonimización automática a los 6 años desde la compra (o antes, si se ejerce la supresión). |
| Medidas | MS-1 a MS-7, MS-10. |

## T5. Comunicaciones comerciales y recordatorios (solo con consentimiento)

| Campo | Contenido |
| --- | --- |
| Finalidad | (a) Novedades y ofertas a quien marcó la casilla en la compra; (b) un único recordatorio de carrito abandonado; (c) recordatorio anual de celebraciones. |
| Base jurídica | Consentimiento (art. 6.1.a RGPD; art. 21 LSSI-CE). |
| Qué hace el código | (a) Se guarda `marketingConsent` y `marketingConsentAt` (casilla en la compra). La aplicación **no envía boletines**: solo permite al OWNER exportar un CSV de clientes con consentimiento (`/api/admin/clientes.csv`, auditado y con alerta). El envío se haría con una herramienta externa «[COMPLETAR: herramienta, si se usa]». (b) `POST /api/cart/remember` con casilla sin marcar por defecto; el cron envía un solo email si está activado `abandonedCartEnabled`. (c) `/recordatorios` con casilla obligatoria; el cron envía el email anual. Baja: `/baja?t=…` desactiva el consentimiento, los recordatorios y borra los carritos. Ninguno de los tres flujos verifica el email antes de guardar el consentimiento (sin doble opt-in). |
| Interesados | Clientes que consienten. |
| Datos | Nombre, email, teléfono (ficha), contenido del carrito (cifrado), etiqueta y fecha de la celebración (etiqueta cifrada). |
| Destinatarios / encargados | SMTP; herramienta externa de envío, si se usa. |
| Conservación | Hasta la retirada del consentimiento. Carritos: 30 días desde `updatedAt`. Al darse de baja `marketingConsentAt` se pone a `null` (no queda fecha de la retirada). |
| Medidas | MS-1 a MS-6. |

## T6. Administración y seguridad de la plataforma

| Campo | Contenido |
| --- | --- |
| Finalidad | Control de acceso al panel, prevención de abusos y fraude, auditoría de acciones, alertas e integridad del sistema. |
| Base jurídica | Interés legítimo en la seguridad de la red y la información (art. 6.1.f; considerando 49) y obligación de seguridad (art. 32). Personal: relación laboral o mercantil (6.1.b). |
| Interesados | Personal con acceso al panel; visitantes de la web (solo huella de IP). |
| Datos | `AdminUser`: email y nombre (**en claro**), hash Argon2id, secreto TOTP (cifrado), códigos de recuperación (hash), passkeys (clave pública), fallos de acceso, bloqueo, último acceso. `AdminSession`: huella de IP, huella del dispositivo, etiqueta del dispositivo, fechas. `LoginAttempt`: HMAC de IP y de email, éxito. `AuditLog`: id, email (**en claro**) y rol del actor, acción, entidad, HMAC de IP, detalles enmascarados. Limitador: contadores en Redis o memoria con claves HMAC (IP agrupada /64 en IPv6, email de login), id de usuario o id de sesión; caducan en ≤ 2 × ventana (penalizaciones: 1 h). |
| Destinatarios / encargados | Alojamiento, BD, Redis gestionado, WAF (Vercel/Cloudflare), SMTP y webhook de alertas. Comprobación de contraseñas filtradas en Have I Been Pwned: solo se envían los 5 primeros caracteres hex del SHA-1. |
| Conservación | Intentos de acceso: 90 días. Sesiones: 30 días tras caducar o revocarse. Auditoría: 2 años (2 × 366 días; la BD impide borrar antes). Trabajos completados: 30 días; fallidos: 90 días. Eventos de Stripe: 90 días. Usuarios desactivados: **sin plazo automático**. Logs del proveedor: «[COMPLETAR: plazo de logs en Vercel/servidor]». |
| Medidas | MS-1 a MS-7, MS-9, MS-12. |

## T7. Ejercicio de derechos de los interesados

| Campo | Contenido |
| --- | --- |
| Finalidad | Recibir, verificar, atender y acreditar las solicitudes de los arts. 15 a 22. |
| Base jurídica | Obligación legal (art. 6.1.c; arts. 12 a 22 RGPD). |
| Interesados | Solicitantes. |
| Datos | `DataRequest`: tipo, email (cifrado) y su índice ciego, detalles (cifrados), hash del token de verificación, fechas, resolución (texto libre **no cifrado**). |
| Destinatarios / encargados | Alojamiento, BD, SMTP. |
| Conservación | No verificadas: 7 días. Resto: 3 años desde `createdAt` (3 × 366 días). |
| Medidas | MS-1 a MS-5. Solo el rol OWNER (`privacy.manage`). Procedimiento: [derechos-interesados.md](derechos-interesados.md). |

## T8. Analítica web (solo si se configura y se acepta)

| Campo | Contenido |
| --- | --- |
| Finalidad | Estadísticas de uso de la web. |
| Base jurídica | Consentimiento (art. 6.1.a; art. 22.2 LSSI-CE). |
| Estado | Solo existe si el OWNER introduce un ID de medición GA4 en Ajustes (`seo.gaMeasurementId`). «[COMPLETAR: activado sí/no]». |
| Destinatarios | Google Ireland Ltd. |
| Conservación | «[COMPLETAR: retención configurada en GA4]». |

---

## Cookies y consentimiento: lo que hace el código

| Elemento | Tipo | Comportamiento real |
| --- | --- | --- |
| `rmm-cart-v1` (localStorage) | Técnico | Contenido del carrito. |
| `rmm-consent-v1` (localStorage) | Técnico | `{ analytics, date }`. Es la única constancia del consentimiento (no se registra en servidor). |
| `__Host-rmm_admin` (en desarrollo sin HTTPS: `rmm_admin`) | Técnico | Sesión del panel: HttpOnly, Secure, SameSite=Strict, Path=/. |
| `acc_o_<número>` / `acc_q_<id>` | Técnico | Token de acceso al pedido o presupuesto: HttpOnly, SameSite=Lax, limitada a la ruta de esa página, 90 días. |
| Google Analytics 4 (`gtag.js`, cookies `_ga*`) | Analítica | `CookieConsent` solo inserta los scripts si hay `gaMeasurementId` **y** `consent.analytics === true`. Antes de aceptar no se hace ninguna petición a Google. Modo de consentimiento con `ad_storage`, `ad_user_data` y `ad_personalization` en `denied`. |
| Google Maps (iframe) | Terceros | Solo se carga al pulsar «Ver mapa interactivo», con aviso previo. |
| Fuentes | — | `next/font/google` se descarga al compilar y se sirve desde el propio dominio: no hay petición a Google al navegar. |
| WhatsApp | — | Enlace simple, sin scripts de terceros. |
| Stripe | Terceros | Solo en la página de pago alojada por Stripe. |

Banner: botones «Aceptar todas», «Rechazar» y «Configurar», con el mismo nivel. Se vuelve a abrir con el enlace «Configurar cookies».

Corregido en esta versión (antes eran huecos):
- Retirar el consentimiento tiene efecto inmediato: se envía `gtag('consent','update',{analytics_storage:'denied'})`, se borran las cookies `_ga*` y se recarga la página sin el script.
- La política de cookies usa el nombre real `__Host-rmm_admin` e incluye las cookies `acc_o_*` / `acc_q_*`.
- El banner describe GA4 como estadísticas con identificadores seudónimos (no «anónimas») y avisa de posibles transferencias fuera de la UE.