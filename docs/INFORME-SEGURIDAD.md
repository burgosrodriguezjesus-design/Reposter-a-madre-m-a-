# Informe de seguridad, protección de datos y alta disponibilidad

Repostería Madre Mía · rama `claude/seguridad-alta-disponibilidad` · verificación del 12–13 de octubre de 2026

Este informe separa tres cosas: lo **implementado** (está en el código), lo **probado de verdad**
(se ejecutó y se cuentan los resultados reales) y lo que **falta o depende de terceros**. No
incluye ninguna cifra que no se haya medido. Donde algo no se ha podido probar en este entorno,
se dice.

---

## 1. Resumen

- Los datos personales (nombre, email, teléfono, dirección, notas, dedicatorias, fotos de
  referencia y los enlaces de acceso a pedidos) se guardan **cifrados con AES-256-GCM**; las
  búsquedas usan índices ciegos HMAC. Un volcado de la base de datos sin las claves no permite
  leerlos ni abrir pedidos ajenos.
- El panel exige **contraseña Argon2id + segundo factor obligatorio** (TOTP o llave de acceso),
  con roles, sesiones revocables ligadas al dispositivo, bloqueo por fuerza bruta, alertas y un
  registro de auditoría encadenado que no se puede modificar.
- Los pedidos se crean en **transacciones con bloqueos e idempotencia**: en las pruebas de
  concurrencia nunca se vendió más stock del disponible y, en todas las pruebas de carga,
  **ningún pedido confirmado se perdió ni se duplicó**.
- **Capacidad medida:** en una única máquina de 4 CPU (con el generador de carga dentro) el
  sistema atiende **1.000 usuarios concurrentes con un 0,01 % de errores**, pero **no** 5.000 ni
  10.000 (53 % y 64 % de errores). Para esos niveles hace falta escalar horizontalmente y una CDN;
  **no se ha demostrado** que la infraestructura de producción los soporte.
- Los despliegues solo pasan por GitHub Actions cuando CI y el análisis de seguridad están en
  verde (vulnerabilidades HIGH/CRITICAL, secretos o hallazgos SAST graves los bloquean).
  **Requiere configurar GitHub y Vercel** (sección 6); hasta entonces, nada se despliega solo.

---

## 2. Qué se ha implementado

Detalle y archivos en `docs/seguridad/arquitectura-y-amenazas.md` (modelo de amenazas, OWASP Top 10
y ASVS), `docs/operaciones/*` y `docs/rgpd/*`.

| Área | Implementado | Dónde |
|---|---|---|
| Cifrado en tránsito | HTTPS con HSTS; nginx solo TLS 1.2/1.3; SMTP con STARTTLS y TLS ≥ 1.2 obligatorio (la app no arranca en producción con SMTP en claro); TLS + SCRAM hacia PostgreSQL y PgBouncer | `next.config.ts`, `infra/nginx`, `src/lib/email.ts`, `infra/postgres` |
| Cifrado en reposo | AES-256-GCM por campo con AAD, anillo de claves con rotación (`keys:generate`, `db:encrypt`), claves por variable o archivo (`*_FILE`); fotos privadas cifradas; copias cifradas con age | `src/lib/crypto.ts`, `src/lib/db.ts`, `src/lib/storage.ts`, `scripts/backup.sh` |
| Mínimo privilegio | Rol de la app sin DDL, RLS en todas las tablas, auditoría sin UPDATE/TRUNCATE, timeouts por rol; los pods no reciben la conexión de migraciones | `prisma/sql/least-privilege.sql`, `infra/k8s/externalsecret.yaml` |
| Panel | Argon2id, comprobación de contraseñas filtradas, MFA obligatorio (TOTP + passkeys + códigos de recuperación), RBAC (propietario/encargado/empleado) comprobado en servidor en cada página, acción y API, cookie `__Host-` HttpOnly/Secure/SameSite=Strict, caducidad por inactividad (60 min) y máxima (12 h), revocación, cambio obligatorio de contraseña provisional | `src/lib/{password,mfa,session,auth,rbac}.ts` |
| Auditoría y alertas | Registro encadenado por hash con verificación y ancla diaria; alertas deduplicadas sin datos personales, enviadas en el momento y, si la BD cae, directamente al webhook | `src/lib/audit.ts`, `src/lib/alerts.ts` |
| Ataques web | Consultas parametrizadas; CSP con nonce en rutas dinámicas; comprobación de origen (CSRF); limitador adaptativo por IP con penalizaciones y descarte de carga; WAF (ModSecurity + OWASP CRS, Cloudflare o Vercel Firewall); subidas validadas por bytes mágicos y re-codificadas; acceso a pedidos solo con token secreto (nunca por número) | `src/proxy.ts`, `src/lib/limiter.ts`, `infra/nginx`, `infra/cloudflare`, `infra/vercel` |
| Stripe | Sin datos de tarjeta; firma del webhook; eventos deduplicados; importe y moneda comprobados antes de marcar pagado; claves de idempotencia; reembolsos que devuelven stock, cupones y saldo una sola vez; conciliación periódica | `src/lib/checkout.ts`, `src/lib/order-events.ts`, `src/app/api/stripe/webhook` |
| Pedidos | Transacción ACID, bloqueo asesor por franja, `FOR UPDATE` del stock, restricciones CHECK, `Idempotency-Key`, cola transaccional (outbox) con reintentos y alerta si falla | `src/lib/checkout.ts`, `src/lib/jobs.ts` |
| Escalabilidad | Caché por instancia solo de datos públicos (nunca privados: `private, no-store`), PgBouncer, Redis compartido opcional, índices, emails asíncronos, plantillas de balanceo y autoescalado (k8s HPA 3–20, nginx least_conn) | `src/lib/micro-cache.ts`, `infra/*` |
| Observabilidad | `/api/health`, `/api/health/ready`, `/api/metrics` (con token; métricas HTTP de baja cardinalidad, cola, alertas), reglas de Prometheus/Alertmanager con SLO 99,95 % | `src/lib/metrics.ts`, `src/lib/http-metrics.ts`, `infra/monitoring` |
| RGPD | Política y cookies alineadas con el código; analítica solo con consentimiento y retirada inmediata; formulario de derechos con verificación por email; exportación y supresión (anonimiza lo que hay que conservar por ley); plazos de conservación automáticos; registro de actividades, encargados, procedimiento de brechas | `src/lib/privacy.ts`, `docs/rgpd/*` |
| CI/CD | Lint, tipos, unitarias, integración con PostgreSQL real, DAST propio, E2E con navegador, CodeQL, Semgrep, npm audit, OSV-Scanner, Gitleaks, Trivy (repositorio, IaC e imagen), ZAP baseline; despliegue staging → aprobación → producción con prueba de humo y rollback; cola cada 5 min para Vercel Hobby | `.github/workflows/*` |
| Divulgación | `SECURITY.md` y `/.well-known/security.txt` (RFC 9116, se publica al definir `SECURITY_CONTACT`) | `src/app/.well-known` |

---

## 3. Qué se ha probado de verdad

Entorno: contenedor Linux de 4 CPU, PostgreSQL 16 y Redis 7 locales, Node 22, la app compilada en
modo producción. Todas las pruebas usan datos ficticios y se ejecutaron solo contra este entorno
propio.

### 3.1 Pruebas automáticas (estado final, commit `e587850`)

| Prueba | Resultado | Qué comprueba (resumen) |
|---|---|---|
| Unitarias (`npm test`) | **41/41** | cifrado de campos y archivos (manipulación y cambio de contexto rechazados), índices ciegos, TOTP, enmascarado de logs, IP de confianza, métricas HTTP con un servidor real |
| Integración con PostgreSQL real (`npm run test:integration`) | **18/18** | 20 compradores simultáneos de la última unidad → 1 venta; stock 5 y 30 compradores de 2 → 4 vendidas; capacidad por franja; idempotencia; precio solo en servidor; cifrado en reposo de datos y tokens; pago con importe distinto rechazado; notificaciones de pago simultáneas confirman una vez; cancelación simultánea devuelve el stock una vez; 4 procesadores ejecutan cada trabajo una sola vez; manipulación de la auditoría detectada; exportación y supresión RGPD completas; firma y duplicados del webhook |
| DAST propio (`npm run test:security`) | **51/51** (estable en 7 ejecuciones) | cabeceras y CSP, CSRF, inyección SQL/XSS, IDOR de pedidos, manipulación de precios, subidas maliciosas, cuerpos enormes, fuerza bruta → 429, panel sin sesión, métricas sin token |
| E2E con Chromium (`npm run test:e2e`) | **33/33** | MFA obligatorio, cookie segura, robo de cookie desde otro navegador → sesión revocada, permisos por rol, contraseña provisional obligatoria de cambiar, fuerza bruta, auditoría íntegra, cierre de sesión revocado en servidor |
| `npm run db:check-security` | **14/14** | RLS, privilegios, triggers de auditoría, datos cifrados |
| `infra/postgres/test/validate-data-stack.sh` | **45/45** | TLS + SCRAM obligatorios, PgBouncer, ACL de Redis, copias cifradas, archivo WAL y **recuperación a un punto en el tiempo completa** |
| Simulacro de copia y restauración | correcto | copia cifrada sin texto en claro, huella SHA-256, mismas filas tras restaurar, clave incorrecta y archivo manipulado rechazados (conjunto de datos pequeño: el tiempo medido no es un RTO real) |
| TLS de nginx | correcto | TLS 1.1 rechazado; 1.2 y 1.3 aceptados |
| Prueba manual del recorrido real | correcto | pedido por la API → enlace con token canjeado por cookie HttpOnly y retirado de la URL → página con datos descifrados y `private, no-store`; token falso → 404; foto subida cifrada en disco y servida por URL firmada; firma manipulada → 403 |

### 3.2 Análisis de seguridad ejecutados en local

| Herramienta | Resultado |
|---|---|
| `npm audit --omit=dev` | **0 vulnerabilidades** (se actualizó `@simplewebauthn/server` y se forzó `deepmerge-ts` 8). Queda `braces` (solo desarrollo, sin versión corregida): excepción con caducidad en `osv-scanner.toml` |
| Gitleaks 8.30.1 (historial + árbol) | **0 secretos**; las reglas propias detectan claves de prueba plantadas (control positivo) |
| Trivy 0.70.0 (dependencias, secretos, IaC) | **0 HIGH/CRITICAL** tras pasar el planificador y las copias a usuarios sin root |
| Semgrep (reglas propias) | 0 hallazgos ERROR; reglas verificadas con casos de prueba. Los conjuntos del registro de Semgrep no se pudieron descargar aquí (red restringida): se ejecutan en CI |
| promtool / amtool | 52 alertas + 29 reglas SLO válidas; configuración de Prometheus y Alertmanager válida |
| CodeQL, ZAP, Trivy de imagen, OSV-Scanner | **no ejecutados en local** (requieren GitHub Actions o Docker); están en `security.yml` |

### 3.3 Pruebas de carga

Arnés propio `loadtest/harness.mjs` (usuarios virtuales con pausas de 1–3 s: 70 % navega, 25 %
prepara la compra, 5 % pide). **Una sola máquina de 4 CPU** con 3 instancias de la app, nginx,
PgBouncer, PostgreSQL, Redis **y el generador de carga** compitiendo por la misma CPU. Resultados
completos en `loadtest/results/`. Se ejecutaron con el commit `e66247c` (antes de cifrar los
tokens; ese cambio añade un cifrado AES por pedido, de coste despreciable frente al resto).

| VU | Duración | Peticiones | Pet./s | Errores | Páginas p50 / p95 / p99 | Pedidos confirmados | En la BD | Perdidos | Duplicados |
|---|---|---|---|---|---|---|---|---|---|
| 100 | 60 s | 2.355 | 33 | 0 % | 9 / 49 / 107 ms | 39 | 39 | 0 | 0 |
| 500 | 60 s | 10.095 | 139 | 0 % | 113 / 820 / 1.189 ms | 159 | 159 | 0 | 0 |
| 1.000 | 60 s | 14.457 | 198 | 0,01 % | 538 / 2.397 / 5.082 ms | 223 | 223 | 0 | 0 |
| 5.000 | 90 s | 48.835 | 367 | **53 %** | 510 / 16.886 / 19.268 ms | 274 | 275 | 0 | 0 |
| 10.000 | 90 s | 67.585 | 528 | **64 %** | — (saturado) | 240 | 240 | 0 | 0 |

- A 5.000 y 10.000 VU los errores son 502 de nginx y tiempos de espera: la máquina está saturada
  (app ≈ 215–225 % de CPU de 400 %, generador 56–66 %). El pedido «de más» a 5.000 VU se guardó
  pero su respuesta no llegó al cliente; un reintento con la misma `Idempotency-Key` lo recupera.
- El descarte de carga (503 rápido) casi no actuó antes de la saturación (5 respuestas 503 frente
  a ~40.000 502): con más carga que capacidad, hay que añadir capacidad.
- **Conclusión honesta:** demostrado hasta ~1.000 usuarios concurrentes en esta máquina; 5.000 y
  10.000 **no** demostrados. Escenarios k6 para repetirlo en staging en `loadtest/k6` (solo se
  ejecutó el perfil de humo de 5 VU: 0 % errores y el pedido confirmado verificado en la BD).

---

## 4. Riesgos pendientes (por prioridad)

| # | Riesgo | Impacto | Mitigación actual | Recomendación |
|---|---|---|---|---|
| 1 | Capacidad de 5.000–10.000 usuarios **no demostrada** | caída en un pico de tráfico | escalado horizontal y CDN preparados en `infra/` | prueba k6 en staging con la infraestructura real antes de una campaña |
| 2 | Configuración externa sin hacer (sección 6) | sin ella no hay WAF, copias externas ni despliegues | la app no arranca en producción con configuración insegura | completar la lista de la sección 6 |
| 3 | Una sola región (`cdg1`) y BD sin alta disponibilidad configurada | el 99,95 % depende del proveedor | copias cifradas + PITR | BD gestionada con réplica y PITR; documentado en `docs/operaciones/alta-disponibilidad.md` |
| 4 | Sin reautenticación reciente para exportar, suprimir o gestionar usuarios | una sesión robada abierta podría hacerlo | MFA, sesión ligada al dispositivo, 60 min de inactividad, alertas y auditoría de esas acciones | pedir un código TOTP en esas acciones |
| 5 | Supresiones que «reaparecen» al restaurar una copia anterior | incumplimiento RGPD tras un desastre | procedimiento en `docs/rgpd/conservacion-y-supresion.md` | reaplicar las supresiones registradas tras cada restauración |
| 6 | Páginas públicas estáticas con CSP `'unsafe-inline'` en scripts | XSS con menos defensa en profundidad en esas páginas | no muestran contenido de usuarios; React escapa | nonces también en esas páginas si se renderizan dinámicamente |
| 7 | Derechos sin pantalla propia: rectificación, limitación, prórroga, solicitudes por email | gestión manual | exportación y supresión completas | ampliar `/admin/privacidad` |
| 8 | Rotar `DATA_HASH_KEY` requiere ventana de mantenimiento | duplicados si hay escrituras durante la rotación | `db:encrypt` recalcula índices | rotar con la tienda en pausa |
| 9 | `BACKUP_OFFSITE_CMD` no purga copias externas; el volumen de subidas no se copia | conservación más larga de lo declarado; pérdida de fotos | fotos cifradas; retención local 35 días | regla de ciclo de vida en el bucket externo; copiar el volumen |
| 10 | Políticas RLS `USING (true)` | la RLS no separa clientes entre sí | el límite real es el rol de la app y la autorización en código | aceptable para este diseño (sin cuentas de cliente) |
| 11 | Sin SBOM/firma de imágenes ni SRI para Google Tag Manager | cadena de suministro | acciones fijadas por SHA, Dependabot, Trivy | `cosign`/SBOM en CI si se usa Docker/k8s |
| 12 | Dobles confirmaciones de recordatorios (double opt-in) y fecha de baja | prueba de consentimiento más débil | consentimiento explícito con fecha | añadir confirmación por email |

---

## 5. Lo que este informe NO afirma

- Que el sitio soporte 5.000 o 10.000 usuarios concurrentes.
- Que se hayan ejecutado CodeQL, ZAP, OSV-Scanner o el análisis de la imagen Docker (están
  configurados en CI pero no se han ejecutado aquí).
- Que el workflow de despliegue funcione contra Vercel: es una plantilla validada (sintaxis,
  versiones y SHA de las acciones comprobados) pero sin cuenta de Vercel ni GitHub Actions en
  este entorno no se ha ejecutado. Valida el primer despliegue y un rollback en staging.
- Cumplimiento legal: la documentación RGPD tiene campos «[COMPLETAR]» y conviene revisarla con
  un asesor (plazos fiscales, bloqueo de datos del art. 32 LOPDGDD).

---

## 6. Configuración externa necesaria (antes de producción)

1. **Secretos por entorno** (`npm run keys:generate`, distintos en staging y producción) en el
   gestor de secretos / Vercel: `DATA_ENCRYPTION_KEYS`, `DATA_ENCRYPTION_ACTIVE_KEY`, `DATA_HASH_KEY`,
   `CRON_SECRET`, `METRICS_TOKEN`, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, Stripe, SMTP, etc. Guarda una
   copia de las claves de cifrado fuera de la plataforma: **sin ellas los datos son irrecuperables**.
2. **GitHub:** protección de `main` con los checks obligatorios de CI y Security; entornos
   `staging`, `production` (con revisores obligatorios) y `cron` con sus secretos
   (`docs/operaciones/despliegue-seguro.md`). Activa el informe privado de vulnerabilidades.
3. **Vercel:** `vercel.json` desactiva los despliegues automáticos de Git: **todo despliegue pasa
   ahora por `deploy.yml`** (o un `vercel deploy` manual). Si usas el plan Pro, cambia el cron de
   `/api/cron/jobs` a cada minuto y desactiva `cron-jobs.yml` (`CRON_VIA_GITHUB=false`).
4. **Base de datos gestionada** (región UE) con PITR y, para el 99,95 %, alta disponibilidad;
   aplica `prisma/sql/least-privilege.sql` y comprueba con `npm run db:check-security`.
5. **Redis gestionado** (Upstash u otro) para límites compartidos entre instancias.
6. **WAF/CDN:** Vercel Firewall o Cloudflare con las reglas de `infra/`.
7. **Copias externas:** destino fuera del proveedor principal (`BACKUP_OFFSITE_CMD`) con regla de
   ciclo de vida, y la clave privada de age guardada offline.
8. **Alertas:** `ALERT_EMAIL` y/o `ALERT_WEBHOOK_URL`; monitor externo de `/api/health/ready`.
9. **Contacto de seguridad:** `SECURITY_CONTACT` (publica `/.well-known/security.txt`).
10. **RGPD:** completar los «[COMPLETAR]» de `docs/rgpd/*` y firmar los contratos de encargado.
11. Tras desplegar esta versión: `npm run db:encrypt` (cifra los tokens y fotos existentes).

---

## 7. Plan de despliegue y mantenimiento

**Primer despliegue:** configurar lo anterior → push a `main` → CI + Security en verde → staging
automático con prueba de humo → aprobación manual → producción sin dominio → prueba de humo →
promoción → prueba de humo con rollback automático si falla → `npm run db:encrypt` → prueba de
carga k6 en staging (perfiles 100 → 1.000 y, si se espera, 5.000).

| Frecuencia | Tarea |
|---|---|
| Continua | Dependabot y `security.yml` (también semanal sin cambios de código); atender alertas |
| Diaria (automática) | retención RGPD, verificación y ancla de la auditoría, conciliación de pagos |
| Semanal | revisar «Trabajos fallidos» y avisos del registro de actividad |
| Mensual | revisar usuarios del panel y sus roles; revisar excepciones de `osv-scanner.toml` y `.trivyignore` (caducan) |
| Trimestral | **simulacro de restauración** (registro en `docs/operaciones/recuperacion-desastres.md`); prueba k6 en staging |
| Anual | rotación de claves de cifrado (`keys:rotate`); revisión del registro de actividades y del procedimiento de brechas |

## 8. Cómo repetir las verificaciones

```bash
npm test                                   # unitarias
DATABASE_URL=<bd *_test> DIRECT_URL=<dueño> npm run test:integration
npm run build && npm start                 # en otra terminal:
BASE_URL=http://localhost:3000 npm run test:security
BASE_URL=http://localhost:3000 ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run test:e2e
npm run db:check-security
sudo infra/postgres/test/validate-data-stack.sh
node loadtest/k6/export-catalog.mjs > loadtest/k6/catalog.json
k6 run -e BASE_URL=<staging> -e PERFIL=500 -e AUTORIZADO=si loadtest/k6/tienda.js
```

Solo contra entornos propios y autorizados.
