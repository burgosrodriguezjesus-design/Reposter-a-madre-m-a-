# Procedimiento ante brechas de datos personales (arts. 33 y 34 RGPD)

> Brecha = destrucción, pérdida, alteración, comunicación o acceso no autorizados a datos personales, sea accidental o ilícita.
> Plazo: notificar a la AEPD **en 72 h desde que se tiene constancia**, salvo que sea improbable que suponga un riesgo. **Todas** las brechas se registran, se notifiquen o no (art. 33.5).

## Roles y contactos

| Rol | Persona | Contacto |
| --- | --- | --- |
| Responsable de la gestión de la brecha (decide notificar) | «[COMPLETAR: titular / OWNER]» | «[COMPLETAR]» |
| Técnico de guardia | «[COMPLETAR]» | «[COMPLETAR]» |
| DPD o asesor externo | «[COMPLETAR]» | «[COMPLETAR]» |
| Soporte de proveedores | Vercel, BD, Stripe, SMTP… | «[COMPLETAR: enlaces de soporte y seguridad]» |

## 1. Fuentes de detección

| Fuente | Qué avisa | Dónde |
| --- | --- | --- |
| Alertas de la app (`securityAlert`) | `admin.bruteforce`, `admin.login_locked`, `admin.mfa_failures`, `admin.recovery_code_used`, `admin.session_hijack_suspected`, `admin.new_device`, `admin.permission_denied`, `admin.user_changed`, `admin.export`, `payment.amount_mismatch`, `webhook.invalid_signature`, `upload.rejected`, `traffic.anomaly`, `db.error`, `audit.chain_broken`… | Email `ALERT_EMAIL` y/o `ALERT_WEBHOOK_URL`, agrupadas cada 10 min (`src/lib/alerts.ts`) |
| Cadena de auditoría | `verifyAuditChain` diario en `/api/cron`: alerta crítica `audit.chain_broken`, o huella diaria `audit.anchor` que se guarda fuera del sistema | `/admin/auditoria` (verificación manual, solo OWNER) |
| Email de nuevo dispositivo | El empleado recibe un aviso al iniciar sesión desde un dispositivo nuevo | Buzón del empleado |
| Monitorización (autoalojado) | `ReposteriaSecurityAlert`, `ReposteriaAdminLoginFailures`, `ReposteriaWebhookErrors`, `ReposteriaRateLimitSpike`, `PostgresDown`… | `infra/monitoring/alerts.yml` |
| WAF | Bloqueos y picos | Vercel Firewall, Cloudflare o ModSecurity |
| CI de seguridad | Secretos en el repositorio y vulnerabilidades | Gitleaks, Trivy, CodeQL, Semgrep (`.github/workflows/security.yml`) |
| Proveedores | Avisos de incidentes de los encargados (obligatorio por DPA) | Email del titular de la cuenta |
| Personas | Clientes, empleados o terceros que informan | «[COMPLETAR: buzón de seguridad]», `SECURITY.md` |

## 2. Fases

| Fase | Plazo orientativo | Acciones |
| --- | --- | --- |
| 1. Registro inicial | Inmediato | Abrir una entrada en el registro de brechas. Anotar **T0 = momento en que se tiene constancia razonable**: de ahí corren las 72 h. |
| 2. Contención | Primeras horas | Aplicar el playbook. Conservar evidencias: no borrar logs, exportar `/admin/auditoria` y guardar la última huella `audit.anchor`. |
| 3. Evaluación | < 24 h | Qué datos, cuántas personas, si estaban cifrados y si la clave está comprometida, consecuencias posibles. Usar la tabla de gravedad y la herramienta «Asesora Brecha» de la AEPD. |
| 4. Notificación a la AEPD | ≤ 72 h desde T0 | Sede electrónica: https://sedeagpd.gob.es (formulario de notificación de brechas de datos personales). Si falta información, notificar en fases (art. 33.4) y justificar cualquier retraso. |
| 5. Comunicación a interesados | Sin dilación indebida | Si hay **alto riesgo** (art. 34). Excepciones del art. 34.3: datos ininteligibles por cifrado con clave no comprometida; medidas posteriores que eliminan el alto riesgo; esfuerzo desproporcionado (en ese caso, comunicación pública). |
| 6. Remediación y cierre | Días o semanas | Corregir la causa, revisar medidas y actualizar este procedimiento y el registro. |

### Gravedad

| Nivel | Criterios orientativos | Acción |
| --- | --- | --- |
| Sin riesgo probable | Datos cifrados (AES-256-GCM o copia age) con clave no comprometida; datos ya públicos; incidente contenido sin acceso efectivo | Solo registro interno, con la justificación |
| Riesgo | Acceso a datos de contacto en claro (nombre, email, teléfono, dirección) de pocos clientes; pérdida temporal de disponibilidad con restauración | Notificar a la AEPD en 72 h |
| Alto riesgo | Datos de muchos clientes en claro; fotos de referencia (pueden mostrar menores u otras personas); combinación de dirección y fecha de entrega; credenciales; riesgo de suplantación o fraude | AEPD + comunicación a los interesados |

Datos que **no** llevan cifrado de aplicación y agravan la valoración: fotos de referencia subidas a Supabase antes del cifrado de archivos (hasta que caducan), emails y nombres del personal, `AuditLog.actorEmail`, código postal y ciudad de los pedidos, texto de la tarta (`customSpec`/`spec`), opiniones, `adminNotes`, `rejectionReason` y notas del historial de estados.

### Contenido mínimo de la notificación (art. 33.3)
1. Naturaleza de la brecha, categorías y número aproximado de interesados y de registros.
2. Contacto del DPD u otro punto de contacto.
3. Consecuencias probables.
4. Medidas adoptadas o propuestas, incluidas las de mitigación.

## 3. Playbooks

### A. Copia de la base de datos filtrada
1. Identificar el archivo y su `.sha256`. Determinar si es un `*.dump.age` (cifrado) o un volcado sin cifrar (p. ej. descargado del panel del proveedor).
2. **Copia `.age`**: comprobar que la clave privada age (`BACKUP_AGE_IDENTITY`) sigue bajo custodia y no ha salido. Si es así, el contenido es ininteligible. Registrar, pero normalmente no hace falta comunicar (art. 34.3.a). Aun así: generar un par age nuevo, cambiar `BACKUP_AGE_RECIPIENT` y revocar el acceso al almacenamiento donde estaba.
3. **Volcado sin cifrar**: los campos de `ENCRYPTED_FIELDS` siguen cifrados si las claves `DATA_*` no se han filtrado. Quedan expuestos los datos en claro listados arriba, los hashes Argon2id del personal y los índices ciegos (HMAC). Los tokens de acceso a pedidos y enlaces también van cifrados: el volcado solo no permite abrir pedidos en la web.
   - Forzar el cambio de contraseña de todo el personal y cerrar todas las sesiones (playbook C).
   - Evaluar si las claves `DATA_*` pudieron filtrarse a la vez (mismo origen o acceso al alojamiento). Si es así, aplicar el playbook B y tratar la brecha como alto riesgo.
4. Si la filtración vino del proveedor de BD: abrir incidencia, pedir su informe (obligación del DPA) y rotar `DATABASE_URL`/`DIRECT_URL` y `SUPABASE_SERVICE_ROLE_KEY`.

### B. Clave de cifrado filtrada (`DATA_ENCRYPTION_KEYS` / `DATA_HASH_KEY`)
1. Generar material nuevo: `npm run keys:generate`.
2. **Clave de cifrado**:
   1. Añadir la clave nueva a `DATA_ENCRYPTION_KEYS` sin quitar la antigua.
   2. Poner `DATA_ENCRYPTION_ACTIVE_KEY=<kid nuevo>` y desplegar.
   3. Ejecutar `npm run keys:rotate` contra producción. Re-cifra todos los campos y `AdminUser.totpSecret`.
   4. Comprobar con `npm run db:encrypt -- --check`: debe salir con código 0 y sin registros «ilegibles».
   5. Retirar el kid antiguo de `DATA_ENCRYPTION_KEYS` y volver a desplegar.
3. **Clave de índices** (`DATA_HASH_KEY`): sustituirla y ejecutar `npm run keys:rotate`, que recalcula los índices ciegos. Efectos:
   - Las huellas de IP antiguas (`LoginAttempt`, `AuditLog`, `AdminSession`) dejan de poder correlacionarse.
   - Las URL firmadas de fotos caducan.
   - Los contadores del limitador se reinician.
   - Con la clave filtrada, las huellas de IPv4 se pueden revertir por fuerza bruta: inclúyelo en la evaluación.
4. Las **copias anteriores a la rotación** siguen cifradas con la clave antigua. Si la clave y alguna copia (o la BD) pudieron caer juntas, la brecha es efectiva. Valorar destruir esas copias en cuanto exista una copia nueva verificada.
5. Revisar quién tuvo acceso a la variable: equipo de Vercel, logs de despliegue o `*_FILE` montados.

### C. Cuenta de administrador comprometida
1. Desde otra cuenta OWNER, en `/admin/usuarios`:
   - «Desactivar» (revoca todas sus sesiones).
   - O, si se va a mantener la cuenta: «cerrar sesiones», «restablecer segundo factor» y desbloquear después del cambio de contraseña.
2. El usuario legítimo, en `/admin/seguridad`: cambiar la contraseña, generar códigos de recuperación nuevos, quitar passkeys desconocidas y «cerrar las demás sesiones».
3. Si la cuenta comprometida es el **único OWNER**: «[COMPLETAR: procedimiento de acceso de emergencia (p. ej. desactivar el usuario por SQL con el rol de migraciones y crear otro OWNER con el seed)]».
4. Alcance: en `/admin/auditoria`, filtrar por el actor desde el primer acceso sospechoso.
   - Buscar `order.view`, `quote.view`, `customers.export`, `privacy.export`, `privacy.erasure`, `admin.user_changed` y cambios de ajustes.
   - Verificar la cadena y compararla con la última huella `audit.anchor`.
   - Las vistas de listado (p. ej. la lista de pedidos) **no** se auditan: suponer que todo lo visible en los listados para ese rol pudo verse.
5. Según el rol: STAFF ve pedidos y calendario; MANAGER además clientes, presupuestos y tarjetas regalo; OWNER todo, incluidas las exportaciones.

### D. Fuga de claves de Stripe
1. En el Dashboard de Stripe, «roll» de la clave secreta (y del secreto de firma del webhook si se expuso `STRIPE_WEBHOOK_SECRET`). Actualizar `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` en el alojamiento y desplegar.
2. Revisar los logs de la API de Stripe: llamadas no reconocidas, reembolsos, listados de Checkout Sessions (contienen email del cliente e importes) y cambios de cuenta bancaria.
3. La app no considera pagado un pedido sin un webhook firmado y con importe y moneda correctos (`markOrderPaid`). Revisar alertas `payment.amount_mismatch` y `webhook.invalid_signature`.
4. Si hubo lectura de sesiones de pago, hay brecha de emails de clientes: evaluar con la tabla.
5. Recomendación: usar una clave restringida con solo los permisos necesarios.

### E. Otros secretos

| Secreto | Impacto | Acción |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Acceso total a BD y Storage saltando RLS (las fotos van cifradas con la clave de la app; las antiguas, en claro hasta que caducan) | Rotar las claves del proyecto en Supabase y desplegar; revisar los logs de Storage |
| Credenciales SMTP | Envío de correos suplantando al negocio; posible lectura de lo enviado según el proveedor | Rotar; revisar el historial de envíos del proveedor |
| `CRON_SECRET`, `METRICS_TOKEN` | Ejecución de tareas o lectura de métricas (sin datos personales) | Rotar |
| `WHATSAPP_TOKEN` | Envío de mensajes como el negocio | Revocar en Meta |
| Clave privada age | Todas las copias pasan a ser legibles | Nuevo par; volver a cifrar o destruir las copias existentes; tratar las copias accesibles como volcado sin cifrar (A.3) |
| Cuenta de Vercel / GitHub | Acceso a variables de entorno (claves) y al despliegue | Rotar todos los secretos (B, D y esta tabla), revisar despliegues y activar MFA |

## 4. Plantilla de comunicación a interesados (art. 34)

> Asunto: Información importante sobre la seguridad de tus datos en «[COMPLETAR: nombre comercial]»
>
> El «[fecha]» detectamos «[descripción clara y breve]». Los datos afectados son «[categorías]». Las consecuencias posibles son «[p. ej. correos de phishing que suplanten a la tienda]».
> Hemos «[medidas: rotación de claves, cierre del acceso, aviso a la AEPD]». Te recomendamos «[p. ej. desconfiar de mensajes que pidan pagos o datos]».
> Para cualquier duda: «[contacto]». Puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).

## 5. Registro de brechas (art. 33.5)

Conservar fuera de la aplicación (p. ej. hoja protegida del responsable) «[COMPLETAR: ubicación]».

| Campo | Ejemplo / instrucción |
| --- | --- |
| Id | BR-AAAA-NN |
| Fecha y hora de detección (T0) | |
| Fecha y hora de inicio estimada | |
| Fuente de detección | Alerta `audit.chain_broken`, aviso de proveedor… |
| Descripción | |
| Tipo | Confidencialidad / integridad / disponibilidad |
| Categorías de datos e interesados | |
| Nº aproximado de interesados y de registros | |
| ¿Datos cifrados? ¿Clave comprometida? | |
| Consecuencias probables | |
| Nivel de riesgo y justificación | |
| Medidas de contención y corrección | |
| Notificada a la AEPD (fecha, nº de registro) o motivo para no notificar | |
| Comunicada a interesados (fecha, medio) o excepción del art. 34.3 aplicada | |
| Encargados implicados y su informe | |
| Lecciones aprendidas y cambios | |
| Cerrada por / fecha | |

## 6. Mantenimiento
- Simulacro anual de este procedimiento. Fecha del último: «[COMPLETAR]».
- Comprobar que `ALERT_EMAIL`/`ALERT_WEBHOOK_URL` llegan a alguien que los lee, y que la huella diaria `audit.anchor` se guarda fuera del sistema.
