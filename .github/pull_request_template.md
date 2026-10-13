## Qué cambia y por qué

<!-- Resumen breve. Enlaza la incidencia si existe. -->

## Cómo se ha probado

- [ ] `npm run lint && npm run typecheck && npm test`
- [ ] `npm run test:integration` (BD de pruebas) si toca BD, pedidos, pagos, cola o auditoría
- [ ] Probado a mano en local o en staging (describe el caso)

## Lista de seguridad (OWASP ASVS 4.0.3)

Marca lo que aplique; tacha (~~así~~) o indica «N/A» lo que no. Ante la duda, pide revisión de seguridad.

**Control de acceso (V4)**
- [ ] Cada Server Action / ruta de API del panel llama a `requirePermission(...)` o `requireAdmin()` **dentro** de la función (V4.1.1, V4.2.1).
- [ ] Los identificadores que llegan del cliente se comprueban contra el usuario/rol (sin IDOR) (V4.2.1).
- [ ] Los permisos nuevos se añaden a `src/lib/rbac.ts` con el rol mínimo necesario (V4.1.3).

**Validación y codificación (V5)**
- [ ] Toda entrada se valida en el servidor con zod (tipos, longitudes, rangos, listas cerradas) (V5.1.3).
- [ ] Sin SQL dinámico: `$queryRaw` con plantilla etiquetada; nunca `$queryRawUnsafe` con datos (V5.3.4).
- [ ] Sin `dangerouslySetInnerHTML` (salvo `JsonLd.tsx`) ni HTML construido con datos del usuario (V5.3.3).
- [ ] Sin `fetch` a URLs construidas con datos del usuario; si es imprescindible, lista blanca de hosts (V12.6.1).
- [ ] Subidas de archivos: tipo real comprobado, tamaño máximo, reprocesado con sharp, nunca ejecutables (V12.1, V12.2).

**Autenticación y sesiones (V2, V3)**
- [ ] No se debilita MFA, la caducidad por inactividad/máxima ni la revocación de sesiones (V3.3).
- [ ] Cookies nuevas: `HttpOnly`, `Secure`, `SameSite`, prefijo `__Host-` si son de sesión (V3.4).
- [ ] Las operaciones sensibles piden reautenticación o MFA reciente cuando corresponde (V2.2, V4.3).

**Criptografía y datos personales (V6, V8)**
- [ ] Datos personales nuevos se cifran con `src/lib/crypto.ts` (AES-256-GCM) y se buscan por índice ciego (V6.2, V8.3).
- [ ] Aleatoriedad con `node:crypto` (nunca `Math.random()` para tokens o códigos) (V6.3.1).
- [ ] Ningún secreto en el código, en `NEXT_PUBLIC_*`, en la imagen ni en los registros (V6.4, V14.3).
- [ ] Se respeta la política de conservación (RGPD) y, si hay datos nuevos, se añaden a exportación/supresión (V8.3.2).

**Errores y registros (V7)**
- [ ] Los registros no contienen emails, teléfonos, direcciones, tokens ni contraseñas (V7.1.1, V7.1.2).
- [ ] Las acciones administrativas relevantes quedan en la auditoría encadenada (`auditAdmin`) (V7.2).
- [ ] Los errores al cliente son genéricos; el detalle solo en el servidor (V7.4.1).

**Lógica de negocio, pagos y abuso (V11, V13)**
- [ ] Operaciones repetibles (pedidos, pagos, webhooks) siguen siendo idempotentes (V11.1.4).
- [ ] Límites de peticiones en endpoints nuevos expuestos (`src/lib/rate-limit.ts`) (V11.1.4, V13.1).
- [ ] Webhooks: firma verificada sobre el cuerpo sin modificar (V13.1.5).
- [ ] Importes y stock se calculan en el servidor, nunca se fían del cliente (V11.1.2).

**Configuración, dependencias y despliegue (V14)**
- [ ] Dependencias nuevas justificadas, mantenidas y sin vulnerabilidades HIGH/CRITICAL (V14.2.1).
- [ ] Cabeceras de seguridad y CSP no se relajan (o se explica el motivo) (V14.4).
- [ ] Migraciones compatibles hacia atrás (expand/contract): el rollback de la app debe seguir funcionando.
- [ ] Variables de entorno nuevas documentadas en `.env.example` y validadas en `src/lib/env.ts`.
- [ ] Si cambia el esquema: `prisma/sql/least-privilege.sql` y `npm run db:check-security` siguen correctos.

## Riesgos y plan de vuelta atrás

<!-- ¿Qué puede fallar en producción? ¿Cómo se revierte (vercel rollback, migración inversa...)? -->
