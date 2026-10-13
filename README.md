# Repostería Madre Mía · Web con pedidos online, panel de gestión y SEO local

Web profesional para una repostería artesanal: catálogo, **pedidos online con pago**, **personalizador de tartas** con precio al momento,
presupuestos para diseños complejos, **panel de administración** pensado para el móvil y una base **SEO local** completa
(páginas por servicio y zona, datos estructurados, sitemap…).

> 🧁 **Viene con contenido de demostración** (productos, precios, zonas y opiniones de ejemplo) marcado con la etiqueta «Demo».
> Se elimina con un clic desde **Panel → Ajustes → Datos de demostración**. Al editar un producto de ejemplo pasa a ser tuyo.

---

## Índice

1. [Qué incluye](#qué-incluye)
2. [Tecnología](#tecnología)
3. [Probarla en tu ordenador](#probarla-en-tu-ordenador)
4. [Publicarla en Internet (paso a paso)](#publicarla-en-internet-paso-a-paso)
5. [Configurar pagos, correo, fotos y WhatsApp](#configurar-servicios)
6. [Google: Search Console, Perfil de Empresa y Analytics](#google)
7. [Primeros pasos con tus datos reales](#primeros-pasos-con-tus-datos-reales)
8. [Variables de entorno](#variables-de-entorno)
9. [Estructura del proyecto](#estructura-del-proyecto)
10. [Seguridad y RGPD](#seguridad-y-rgpd)
11. [Mantenimiento](#mantenimiento)

---

## Qué incluye

### Web pública
| Página | Para qué sirve |
|---|---|
| **Portada** | Foto principal, nombre y eslogan, botones *Hacer pedido / Personalizar tarta / Ver productos*, más vendidos, categorías, personalizador, promociones, novedades, elaboración artesanal, opiniones, ubicación y horario. |
| **Catálogo** `/productos` | Filtros por categoría, ocasión, precio y popularidad (ventas reales + ajuste manual). Funciona incluso sin JavaScript. |
| **Categorías** `/categoria/…` | Página propia con texto SEO editable para cada categoría. |
| **Ficha de producto** `/producto/…` | Fotos, descripción, precio por tamaño, raciones, ingredientes, 14 alérgenos, opciones con suplemento, dedicatoria, foto de referencia, disponibilidad y antelación. |
| **Personalizador** `/personalizar-tarta` | Celebración, tamaño, bizcocho, relleno, cobertura, colores, decoración, texto y foto de inspiración, con **vista previa ilustrada y precio estimado** según tus tarifas. Los diseños complejos se envían como **solicitud de presupuesto**. |
| **Carrito y pedido** | Cantidades, fecha y hora (solo huecos realmente libres), recogida o entrega a domicilio por código postal, datos, cupón, tarjeta regalo, pago con **Stripe** o **en tienda**, resumen y confirmación. |
| **Seguimiento** `/seguimiento` | Estado del pedido: pendiente → aceptado → en preparación → listo → entregado. |
| **Presupuestos** | El cliente recibe el precio por email y confirma/paga desde su enlace. |
| **Tarjetas regalo** | Compra online (se envían por email) o reserva para pagar en tienda. |
| **Opiniones** | Las escriben los clientes; se publican tras tu aprobación (nunca se pueden inventar desde el panel). Marca «pedido verificado». |
| **Dónde estamos** | Mapa (se carga al pulsar, sin cookies previas), botón «Cómo llegar», horario, teléfono, WhatsApp, zonas de reparto y fotos del local. |
| **Recordatorios** | El cliente se apunta para que le avises antes de un cumpleaños (con consentimiento expreso). |
| **Legales** | Aviso legal, privacidad, cookies, condiciones de compra, cancelaciones y tabla de alérgenos, rellenados con tus datos. |
| **Páginas locales SEO** | «Repostería artesanal en [ciudad]», «Tartas personalizadas en [ciudad]», «Tartas de cumpleaños en [ciudad]», «Encargar tartas en [ciudad]», «Cupcakes artesanales en [ciudad]», «Pastelería cerca de [barrio]» y una página por zona de reparto (solo si escribes texto propio para ella). |

Además: botón flotante de WhatsApp, banner de cookies con consentimiento real (Google Analytics solo se carga si se acepta),
diseño adaptado a móvil/tablet/ordenador, animaciones suaves que respetan «reducir movimiento».

### Panel de administración (`/admin`)
- **Inicio**: pedidos por aceptar, pedidos de hoy, ventas y ticket medio del mes, próximos 7 días y una lista de puesta en marcha.
- **Pedidos**: buscar, filtrar (por aceptar, hoy, próximos, listos, todos, por fecha), cambiar estado con aviso por email,
  rechazar/cancelar con **reembolso automático en Stripe**, marcar como pagado, notas internas, WhatsApp/llamada al cliente, imprimir.
- **Presupuestos**: ver diseño y foto, responder con precio y mensaje, rechazar.
- **Calendario y horario**: horario partido por día, vacaciones/días bloqueados, antelación, franjas y capacidad máxima por franja y día.
- **Productos y categorías**: crear, editar, borrar/archivar, fotos (se convierten a WebP), tamaños, opciones con precio,
  alérgenos, ocasiones, disponibilidad, destacados, novedades y SEO.
- **Personalizador**: opciones y precios del configurador de tartas.
- **Zonas de reparto**: códigos postales, coste, pedido mínimo, envío gratis desde…
- **Promociones y cupones** (porcentaje, importe fijo, envío gratis, fechas, usos máximos).
- **Tarjetas regalo**, **opiniones** (aprobar/ocultar/responder), **clientes** (exportación CSV solo de quienes consienten y borrado RGPD),
  **estadísticas** (ventas por día/semana/mes, productos más vendidos) y **ajustes** (negocio, fotos, pagos, marketing, SEO, avisos, usuarios).
- Se actualiza solo cada minuto para ver pedidos nuevos y tiene barra inferior de accesos rápidos en el móvil.

### Notificaciones
- **Email** al cliente (pedido recibido, cada cambio de estado, presupuesto, tarjeta regalo) y al obrador (nuevo pedido, presupuesto, opinión).
- **WhatsApp**: enlaces directos con el mensaje preparado en toda la web y el panel; y, si configuras la **API oficial de WhatsApp Business**,
  aviso automático al obrador de cada pedido nuevo.

### Marketing y fidelización
Productos recomendados, packs, promociones, cupones, tarjetas regalo, productos de temporada, novedades,
**tarjeta de sellos** (al completarla se envía un cupón), recordatorios de celebraciones y **un único** recordatorio de carrito
— estos dos últimos, solo con consentimiento expreso y con enlace de baja.

---

## Tecnología

- **Next.js 16** (App Router, React 19, TypeScript, renderizado en servidor e ISR → páginas indexables y rápidas)
- **Tailwind CSS 4**
- **PostgreSQL** con **Prisma** (compatible con Supabase, Neon, Railway o tu propio servidor)
- **Stripe Checkout** para pagos (tarjeta, Apple Pay, Google Pay). Nunca se almacenan datos de tarjetas.
- **Nodemailer (SMTP)** para correos: Resend, Brevo, Google Workspace, el correo de tu hosting…
- **Sharp** para optimizar fotos (WebP) y `next/image` para servirlas en AVIF/WebP del tamaño justo.
- Almacenamiento de fotos en **Supabase Storage** (recomendado en Vercel) o en disco (servidor propio).

---

## Probarla en tu ordenador

Necesitas **Node.js 20.9 o superior** y **Docker** (para la base de datos) o un PostgreSQL ya instalado.

```bash
# 1. Instalar dependencias
npm install

# 2. Crear el archivo de configuración y rellenarlo (mínimo: claves de `npm run keys:generate`, ADMIN_EMAIL, ADMIN_PASSWORD)
cp .env.example .env
#   Genera el secreto con:  openssl rand -base64 48

# 3. Arrancar PostgreSQL en local
docker compose up -d

# 4. Crear las tablas y cargar los datos iniciales + demostración
npx prisma migrate deploy
npm run db:seed

# 5. Arrancar la web
npm run dev
```

- Web: http://localhost:3000
- Panel: http://localhost:3000/admin (con el `ADMIN_EMAIL` y `ADMIN_PASSWORD` del `.env`)
- Sin SMTP configurado, los correos aparecen en la terminal. Sin Stripe, solo se ofrece «pagar en tienda».

Comprobaciones: `npm run typecheck`, `npm run lint`, `npm test` (precios y disponibilidad) y `npm run build`.

---

## Publicarla en Internet (paso a paso)

La opción recomendada es **Vercel + Supabase** (ambos tienen plan gratuito para empezar). Tiempo estimado: 30-45 minutos.

### 1. Base de datos y fotos en Supabase
1. Crea una cuenta en [supabase.com](https://supabase.com) → **New project** (región **Europe West (Paris)** o Frankfurt, por el RGPD y la velocidad).
2. **Project Settings → Database → Connection string**:
   - Copia la cadena **Transaction pooler** (puerto 6543) → será `DATABASE_URL` y añádele `?pgbouncer=true` al final.
   - Copia la cadena **Session/Direct** (puerto 5432) → será `DIRECT_URL`.
3. **Storage → New bucket** → nombre `uploads` → márcalo como **Public**.
4. **Project Settings → API**: copia la **URL** del proyecto (`SUPABASE_URL`) y la **service_role key** (`SUPABASE_SERVICE_ROLE_KEY`, ¡secreta!).

### 2. Código en GitHub
Sube este repositorio a tu cuenta de GitHub (si no lo está ya).

### 3. Despliegue en Vercel
1. En [vercel.com](https://vercel.com) → **Add New → Project** → importa el repositorio.
2. No hace falta tocar el comando de compilación: Vercel ejecuta automáticamente el script `vercel-build` de `package.json`,
   que aplica las migraciones de la base de datos antes de compilar.
3. En **Environment Variables** añade las de la [tabla](#variables-de-entorno), como mínimo:
   `NEXT_PUBLIC_SITE_URL`, `DATABASE_URL`, `DIRECT_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `STORAGE_DRIVER=supabase`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET=uploads`, `CRON_SECRET`.
4. **Deploy** (solo el primero). `vercel.json` desactiva los despliegues automáticos al hacer push: a partir de ahí se
   despliega con `.github/workflows/deploy.yml` (solo si CI y Security están en verde, con aprobación manual), o a mano con
   `vercel deploy --prod`. Configuración en [docs/operaciones/despliegue-seguro.md](docs/operaciones/despliegue-seguro.md).
5. Carga los datos iniciales **una vez** desde tu ordenador, apuntando a la base de datos de producción:
   ```bash
   DATABASE_URL="(cadena directa 5432)" DIRECT_URL="(cadena directa 5432)" ADMIN_EMAIL="tu@email.es" ADMIN_PASSWORD="una-contraseña-larga" npm run db:seed
   ```
   Si no quieres el catálogo de ejemplo, añade `SEED_DEMO=false`.
6. **Dominio propio**: Vercel → *Settings → Domains* → añade `www.tudominio.es` y sigue las instrucciones DNS.
   Después actualiza `NEXT_PUBLIC_SITE_URL=https://www.tudominio.es` y vuelve a desplegar. HTTPS se activa solo.
7. **Tareas programadas**: `vercel.json` ya programa `/api/cron` cada día a las 07:00 UTC (recordatorios de celebraciones,
   carritos y limpieza). La cola de emails y avisos (`/api/cron/jobs`) la llama cada 5 minutos
   `.github/workflows/cron-jobs.yml` (entorno `cron` de GitHub); en el plan Pro, ponla cada minuto en `vercel.json`.

### Alternativa: servidor propio (VPS)
```bash
npm ci && npx prisma migrate deploy && npm run db:seed && npm run build
npm start   # puerto 3000; ponlo detrás de Nginx/Caddy con HTTPS y un gestor como pm2 o systemd
```
Con `STORAGE_DRIVER=local` las fotos se guardan en `./uploads` (haz copia de seguridad de esa carpeta).
Programa la tarea diaria: `curl -H "Authorization: Bearer $CRON_SECRET" https://tudominio.es/api/cron`.

---

## Configurar servicios

### Pagos con Stripe
1. Crea la cuenta en [stripe.com](https://stripe.com) y completa los datos del negocio para poder cobrar.
2. **Desarrolladores → Claves de API** → copia la clave secreta (`sk_live_…`, o `sk_test_…` para pruebas) en `STRIPE_SECRET_KEY`.
3. **Desarrolladores → Webhooks → Añadir endpoint**:
   - URL: `https://tudominio.es/api/stripe/webhook`
   - Eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`
   - Copia el *Signing secret* (`whsec_…`) en `STRIPE_WEBHOOK_SECRET`.
4. En **Configuración → Métodos de pago** activa los que quieras (tarjeta, Apple Pay, Google Pay…).
5. Prueba con la tarjeta `4242 4242 4242 4242` usando claves de prueba.

Si el pedido se rechaza o cancela desde el panel, puedes **reembolsarlo automáticamente**.
En local puedes reenviar los webhooks con `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

### Correo electrónico (SMTP)
Cualquier proveedor SMTP sirve. Ejemplo con **Resend** (gratis hasta 3.000 correos/mes):
`SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_USER=resend`, `SMTP_PASSWORD=(tu API key)`,
`EMAIL_FROM="Repostería Madre Mía <pedidos@tudominio.es>"`. Verifica tu dominio en el proveedor (registros SPF/DKIM) para no caer en spam.
El email que recibe los avisos de pedidos se cambia en **Panel → Ajustes → Avisos**.

### Fotos
- **Vercel**: `STORAGE_DRIVER=supabase` (obligatorio: el disco de Vercel no es persistente).
- **Servidor propio**: `STORAGE_DRIVER=local` (opcional `UPLOAD_DIR=/ruta/persistente`).
Todas las fotos se recodifican a WebP, se redimensionan y se les quitan los metadatos (p. ej., ubicación GPS).

### WhatsApp
- Los **enlaces de WhatsApp** funcionan sin configurar nada: solo indica tu número en Ajustes.
- **Avisos automáticos** (opcional) con la API oficial *WhatsApp Business Cloud* de Meta:
  1. Crea una app en [developers.facebook.com](https://developers.facebook.com) con el producto WhatsApp y un número verificado.
  2. Crea y espera la aprobación de una plantilla de mensaje (categoría *Utility*) con **un parámetro** en el cuerpo, p. ej.:
     `Nuevo pedido: {{1}}`.
  3. Rellena `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_TEMPLATE_NEW_ORDER` (nombre de la plantilla).
  4. En **Ajustes → Avisos**, indica el WhatsApp del obrador y activa la casilla.

---

## Google

**Ninguna web puede garantizar el primer puesto en Google**, pero esta parte de una base técnica sólida. Para aprovecharla:

1. **Search Console** ([search.google.com/search-console](https://search.google.com/search-console)):
   añade la propiedad con *Prefijo de URL*, elige verificación por **etiqueta HTML** y pega el código en **Ajustes → SEO y Google**.
   Después envía el sitemap: `https://tudominio.es/sitemap.xml`.
2. **Perfil de Empresa de Google** ([business.google.com](https://business.google.com)): crea o reclama la ficha, categoría principal
   «Pastelería», usa **exactamente** el mismo nombre, dirección y teléfono que en la web (NAP), añade la web, el horario y fotos reales.
   Pega el enlace de la ficha y el de «pedir reseñas» en **Ajustes → Negocio**.
3. **Google Analytics 4**: crea una propiedad, copia el ID `G-XXXXXXX` en Ajustes. Solo se carga si el visitante acepta las cookies.
4. **Contenido**: escribe textos propios en cada categoría y en las zonas que atiendes, sube fotos reales con descripción
   y pide opiniones a tus clientes (en la web y en Google). Es lo que más influye en el posicionamiento local.

Lo que ya hace la web por ti: títulos y metadescripciones únicos, URLs cortas en español, jerarquía H1-H3, datos estructurados
(`Bakery`, `Product`, `BreadcrumbList`, `FAQPage`), canonical, `sitemap.xml` con imágenes, `robots.txt`, imágenes AVIF/WebP con texto
alternativo, páginas renderizadas en servidor y cacheadas (ISR), diseño mobile-first y buenas métricas Core Web Vitals
(Lighthouse en la versión demo: SEO 100, rendimiento ≈ 91-94 en móvil simulado).

---

## Primeros pasos con tus datos reales

1. **Ajustes → Negocio**: nombre, eslogan, dirección, ciudad, barrio, coordenadas, teléfono, WhatsApp, redes, datos legales (NIF, razón social, registro sanitario).
2. **Ajustes → Fotos**: foto de portada y fotos del local.
3. **Calendario y horario**: horario real, vacaciones, antelación y capacidad.
4. **Categorías y productos**: crea los tuyos (o edita los de ejemplo) con fotos reales y alérgenos.
5. **Personalizador** y **Zonas de reparto** con tus precios.
6. **Ajustes → Datos de demostración → Eliminar**.
7. Revisa los textos legales (`/aviso-legal`, `/privacidad`, `/cookies`, `/condiciones-de-compra`) con un profesional.
8. Haz un pedido de prueba completo antes de anunciar la web.

Los valores iniciales también están en `src/config/defaults.ts` y los textos de las páginas locales en `src/content/landings.ts`.

---

## Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | ✅ | URL pública sin barra final (`https://www.tudominio.es`). |
| `DATABASE_URL` / `DIRECT_URL` | ✅ | Conexiones a PostgreSQL (en Supabase: pooler y directa). |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | ✅ (seed) | Primer usuario del panel (contraseña de 10+ caracteres). |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Pagos online | Sin ellas solo hay pago en tienda. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | Correos | Sin ellas los correos se muestran en el registro del servidor. |
| `STORAGE_DRIVER` | ✅ | `supabase` (Vercel) o `local`. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | Si `supabase` | Bucket público para fotos. |
| `UPLOAD_DIR` | Opcional | Carpeta de fotos con `local` (por defecto `./uploads`). |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NEW_ORDER`, `WHATSAPP_TEMPLATE_LANG`, `WHATSAPP_API_VERSION` | Opcional | API oficial de WhatsApp Business. |
| `CRON_SECRET` | Recomendada | Protege `/api/cron` (Vercel lo envía automáticamente). |
| `SEED_DEMO` | Opcional | `false` para no crear el catálogo de ejemplo al hacer el seed. |

---

## Estructura del proyecto

```
prisma/
  schema.prisma        Modelo de datos (productos, pedidos, presupuestos, clientes, cupones…)
  migrations/          Migraciones SQL
  seed.ts, demo-data.ts  Carga inicial y catálogo de demostración
public/demo/           Ilustraciones de demostración (sustitúyelas por fotos reales desde el panel)
scripts/               Generador de las ilustraciones demo
src/
  app/(site)/          Web pública (portada, catálogo, producto, personalizador, carrito, pedido, legales, páginas SEO)
  app/admin/           Panel de administración
  app/api/             Pedidos, disponibilidad, subidas, presupuestos, opiniones, tarjetas regalo, Stripe, cron
  components/          Componentes de la web y del panel
  config/defaults.ts   Valores iniciales del negocio
  content/             Páginas locales SEO y preguntas frecuentes
  lib/                 Lógica: precios, disponibilidad, pedidos, emails, pagos, almacenamiento, SEO, seguridad
  proxy.ts             Protección del panel (sesión + anti-CSRF)
```

---

## Seguridad y RGPD

Resumen (detalle, pruebas reales y riesgos pendientes en **[docs/INFORME-SEGURIDAD.md](docs/INFORME-SEGURIDAD.md)**):

- Datos personales, fotos de clientes y enlaces de acceso a pedidos **cifrados con AES-256-GCM**; búsquedas por índices ciegos.
- Panel con **Argon2id + verificación en dos pasos obligatoria** (app TOTP o llave de acceso), roles, sesiones revocables ligadas al
  dispositivo, bloqueo por fuerza bruta, alertas y registro de actividad encadenado que no se puede modificar.
- CSP con nonce, protección CSRF, límites de peticiones adaptativos, WAF, validación en servidor; **los precios siempre se calculan en el servidor**.
- Pedidos sin pérdidas ni duplicados (transacciones, bloqueos, `Idempotency-Key`, cola con reintentos); pagos confirmados solo por el webhook firmado de Stripe.
- Copias cifradas, plazos de conservación automáticos, exportación y supresión de datos, analítica solo con consentimiento.
- CI con análisis de seguridad que **bloquea el despliegue** ante vulnerabilidades graves.

Documentación: [arquitectura y amenazas](docs/seguridad/arquitectura-y-amenazas.md) ·
[alta disponibilidad](docs/operaciones/alta-disponibilidad.md) · [recuperación ante desastres](docs/operaciones/recuperacion-desastres.md) ·
[monitorización](docs/operaciones/monitorizacion-y-alertas.md) · [secretos](docs/operaciones/gestion-de-secretos.md) ·
[despliegue seguro](docs/operaciones/despliegue-seguro.md) · RGPD: [registro de actividades](docs/rgpd/registro-actividades-tratamiento.md),
[encargados](docs/rgpd/encargados-y-transferencias.md), [brechas](docs/rgpd/procedimiento-brechas.md),
[conservación](docs/rgpd/conservacion-y-supresion.md), [derechos](docs/rgpd/derechos-interesados.md) · [SECURITY.md](SECURITY.md).

---

## Mantenimiento

- **Cambiar el modelo de datos**: edita `prisma/schema.prisma` → `npm run db:migrate` → sube los cambios (Vercel aplica la migración al desplegar).
- **Copias de seguridad**: además de las del proveedor, `scripts/backup.sh` (cifradas con age) y simulacro de restauración
  trimestral con `scripts/restore.sh` ([recuperación ante desastres](docs/operaciones/recuperacion-desastres.md)).
- **Tras desplegar una versión con cambios de cifrado**: `npm run db:encrypt`.
- **Actualizar dependencias**: `npm outdated` y `npm update`, comprobando después `npm run build`.
- **Regenerar ilustraciones demo**: `npx tsx scripts/generate-demo-images.ts`.
