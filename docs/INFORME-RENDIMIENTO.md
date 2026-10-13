# Informe de rendimiento y carga (octubre 2026)

Revisión completa de rendimiento, concurrencia, fiabilidad y SEO/UX de la web, con mediciones reales.
Todas las cifras son de pruebas ejecutadas de verdad en el entorno descrito; **no son una garantía de
lo que soportará producción**, que corre en otra infraestructura (Vercel + Supabase).

**Entorno de las pruebas:** contenedor Linux de 4 CPU y 16 GB, Node 22, PostgreSQL 16 y Redis 7
locales, la app compilada en modo producción (`next build && next start`, **un solo proceso**).
El generador de carga (k6) corría **en la misma máquina**, de modo que compite por la CPU con el
servidor: los límites medidos son los de «servidor + generador» juntos, es decir, un límite inferior.

## 1. Problemas encontrados

| Problema | Impacto | Estado |
|---|---|---|
| `/carrito` era estática y la CSP estricta con *nonce* bloqueaba sus scripts | El carrito no funcionaba con la política de seguridad | Corregido (`connection()`) + comprobación automática en el *build* (`scripts/check-csp-routes.mjs`) |
| Las precargas de enlaces (`<Link>`) pasaban por el limitador por IP | ~25 peticiones por página → 429 a visitantes reales; multiplica invocaciones en Vercel | Corregido: el *proxy* ignora las precargas y el pie de página no precarga |
| `/productos` se generaba en cada visita | Página más costosa: p95 648 ms con 300 usuarios (resto ~150 ms); saturaba el servidor a partir de ~500 | Corregido: sin filtros se sirve estática (ISR 5 min, CDN); con filtros sigue dinámica |
| LCP móvil 3,3–3,7 s; TBT 770 ms en inicio | Fuera del objetivo de 2,5 s | Mejorado: prioridad de la imagen principal, logotipo al tamaño real, fuente variable, animación de entrada que no oculta el contenido |
| Aviso de cookies visible sin analítica configurada | Elemento intrusivo e innecesario (LSSI art. 22.2) | Solo aparece si hay analítica |
| Desbordamiento horizontal de 10 px en la ficha de producto (móvil) | Desplazamiento lateral | Corregido |
| Jerarquía de encabezados incorrecta (h3 sin h2) en catálogo y ubicación | Accesibilidad y SEO | Corregido |
| Meta descripciones de más de 160 caracteres | Cortadas en Google | `metaDescription()` las recorta en una palabra completa |
| Sin página de error global ni del panel; 404 genérica | Mala experiencia ante fallos | Añadidas 404 con marca, `global-error` y error del panel |
| Doble envío posible en reseñas, tarjetas regalo y tarta personalizada | Peticiones duplicadas | Bloqueo de envío en curso |

## 2. Pruebas de carga (k6, subida gradual)

Recorrido realista (`loadtest/k6/tienda.js`): 70 % navega, 25 % prepara la compra (resumen +
disponibilidad), 5 % hace un pedido (pago en tienda), con pausas de 1–4 s entre pasos.
Los datos por tramos de 30 s están en `loadtest/results/local-4cpu-*-tramos.tsv`.

### Antes de la optimización del catálogo

| Usuarios simultáneos | Peticiones/s | p95 | Errores |
|---|---|---|---|
| 100 | 40 | 66 ms | 0 % |
| 300 | 118 | 280–430 ms | 0 % (409 = sin hueco, regla de negocio) |
| 600 | 160 | 3,2 s | 0 % |
| 1.000 | 160 | 6,6–7,8 s | hasta 2,6 % (tiempos agotados) |

El servidor se saturaba en ~160 peticiones/s: a partir de ~500 usuarios todo se encolaba.

### Después

| Usuarios simultáneos | Peticiones/s | p50 | p95 | Errores |
|---|---|---|---|---|
| 100 | 40 | 8 ms | 17–20 ms | 0 % |
| 300 | 121 | 9 ms | 24 ms | 0 % |
| 600 | 240 | 14 ms | 55 ms | 0 % |
| 1.000 | 376–388 | 92–135 ms | 232–600 ms | 0 % |
| 1.500 | 400 | 0,9–1,1 s | 1,4–1,8 s | 0 % |
| 2.000 | 380–410 | 1,6–1,9 s | 2,5–2,6 s | 0–2,7 % |
| 3.000 | 415–430 | 1,5–1,7 s | 2,2–2,5 s | 7–10 % (conexiones rechazadas por cola llena) |

- **Límite cómodo medido: 1.000 usuarios simultáneos** con 0 errores y p95 entre 232 ms (subida
  gradual) y 600 ms (subida rápida de 0 a 1.000 en un minuto).
- **Saturación: ~400 peticiones/s** (a partir de ~1.300 usuarios la latencia pasa de 1 s; desde
  ~2.000 empiezan los errores). En ese punto la CPU de la máquina estaba al 100 % (servidor + k6).
- **Integridad de pedidos:** 1.236 pedidos confirmados (prueba de humo + dos escaleras hasta 1.000), 1.236 en la base de
  datos, 0 claves de idempotencia repetidas, 0 pedidos fallidos (`loadtest/k6/verify-orders.mjs`).
  En la prueba de 1.000–3.000 usuarios no se hicieron pedidos porque las pruebas anteriores habían
  llenado todos los huecos de recogida (se cancelaron después en la BD local).

### Qué significa para producción (Vercel + Supabase)

No se ha podido cargar el entorno de Vercel desde aquí (y no debe hacerse sin avisar al proveedor).
Por arquitectura:
- Las páginas públicas estáticas (inicio, catálogo sin filtros, fichas, categorías, zonas, legales)
  las sirve la CDN de Vercel sin ejecutar código: su capacidad no depende de este servidor.
- Las rutas dinámicas (filtros del catálogo, carrito, pedido, API) se ejecutan en funciones que
  Vercel escala horizontalmente; el cuello de botella pasa a ser **Supabase** (plan gratuito:
  conexiones limitadas por el *pooler*). La disponibilidad y el catálogo se guardan en una
  micro-caché para reducir consultas.
- El limitador de peticiones usa Redis si existe `REDIS_URL`; en Vercel sin Redis funciona en
  memoria **por instancia**, así que no es un límite global.

## 3. Lighthouse (laboratorio)

Móvil con limitación real de red y CPU (*devtools throttling*), estado final:

| Página | LCP | CLS | TBT |
|---|---|---|---|
| Inicio | 2,1–2,3 s | 0 | 310 ms |
| Productos | 2,0 s | 0 | 280–380 ms |
| Producto | 2,1 s | 0 | 270 ms |
| Personalizar tarta | 1,9 s | 0 | 290 ms |
| Carrito | 1,7 s | 0 | 210 ms |
| Finalizar pedido | 1,8 s | 0 | 220 ms |

- Móvil simulado (método por defecto de Lighthouse): rendimiento 89–95, accesibilidad 97–100,
  buenas prácticas 100. El LCP simulado sale 2,7–3,6 s porque estima la carga de la fuente web
  con una red 4G lenta; con la limitación real queda por debajo de 2,5 s.
- Escritorio: 100 / 100 / 100, LCP 0,6–0,8 s.
- SEO 63–69 **solo** porque el entorno de pruebas lleva `noindex` a propósito; en producción
  desaparece.
- En una de varias ejecuciones del inicio salió CLS 0,172 (después, tres repeticiones con 0):
  posible reflujo al cambiar la fuente. Vigilar con datos de campo.
- INP no se mide en laboratorio; el TBT (que lo anticipa) está entre 210 y 380 ms en móvil
  limitado. Hay que confirmarlo con datos reales de usuarios.

## 4. Otras pruebas (estado final)

| Prueba | Resultado |
|---|---|
| Unitarias | 43/43 |
| Integración con PostgreSQL real | 26/26 |
| Seguridad (DAST propio) | 51/51 |
| Panel en navegador (MFA, sesiones, robo de cookie) | 33/33 en dos ejecuciones limpias (en la primera, con el servidor recién arrancado, un paso superó su tiempo de espera de 8 s) |
| Compra completa en navegador | correcta, sin errores de JavaScript |
| Rastreo de 59 páginas × 3 tamaños | sin errores, sin desbordamientos (solo la 404 esperada) |
| `npm audit` (producción) | 0 vulnerabilidades |

## 5. Pendiente

1. **Limitador global en Vercel:** Upstash Redis (plan gratuito, 500.000 comandos/mes) o reglas
   de Vercel Firewall. Sin coste mientras no se supere el plan gratuito.
2. **Datos de campo (Core Web Vitals reales):** Vercel Speed Insights (plan Hobby: incluido con
   límite) o Search Console cuando el dominio esté en producción.
3. **Supabase gratuito:** se pausa tras 7 días sin actividad y tiene conexiones limitadas. Para el
   lanzamiento, valorar el plan Pro (25 $/mes) si hay pedidos diarios.
4. **Reintentos de la cola en Vercel Hobby:** dependen de los avisos de cada petición y del cron
   diario; con Pro el cron puede ser cada minuto.
5. **Prueba de carga contra el entorno real** (con aviso previo al proveedor) antes de una campaña
   grande.

## 6. Cómo repetir

```bash
npm run build && RATE_LIMIT_MULTIPLIER=1000 npx next start -p 3000     # solo en local
k6 run -e AUTORIZADO=si -e BASE_URL=http://localhost:3000 -e PERFIL=escalera \
  -e CATALOGO=loadtest/k6/catalog.json loadtest/k6/tienda.js            # 100 → 1.000
k6 run ... -e PERFIL=limite ...                                          # 1.000 → 3.000
EMAIL=<emailPedidos> CONFIRMADOS=<pedidosConfirmados> npx tsx loadtest/k6/verify-orders.mjs
```
