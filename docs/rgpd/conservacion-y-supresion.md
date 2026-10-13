# Conservación y supresión de datos

> Fuente: `src/lib/privacy.ts` (`RETENTION`, `applyRetention`, `anonymizeOrder`, `eraseSubjectData`). Revisado el 2026-10-13.
> En el código, «meses» = 31 días y «años» = 366 días.

## 1. Plazos implementados

| Dato | Constante | Criterio exacto en el código | Acción |
| --- | --- | --- | --- |
| Pedidos | `ordersYears: 6` | `anonymizedAt = null` y `createdAt` > 2.196 días; hasta 500 por ejecución | Anonimizar (`anonymizeOrder`) |
| Fotos de referencia de pedidos | `referencePhotosDays: 90` | `OrderItem.referencePhotoUrl` con `order.scheduledDate` > 90 días; hasta 1.000 por ejecución | Borrar el archivo y vaciar el campo |
| Fotos de referencia de presupuestos | `referencePhotosDays + 60` | `QuoteRequest.createdAt` > 150 días | Borrar el archivo y vaciar el campo |
| Presupuestos no aceptados | `quotesNotAcceptedMonths: 12` | Estado NEW, QUOTED, REJECTED o EXPIRED, sin pedido, `createdAt` > 372 días | Borrar |
| Carritos guardados | `abandonedCartsDays: 30` | `updatedAt` > 30 días | Borrar |
| Intentos de acceso | `loginAttemptsDays: 90` | `createdAt` > 90 días | Borrar |
| Sesiones del panel | `expiredSessionsDays: 30` | `expiresAt` o `revokedAt` > 30 días | Borrar |
| Fichas de cliente | `inactiveCustomersMonths: 24` | Sin consentimiento comercial, sin pedidos, sin recordatorios activos y `updatedAt` > 744 días | Borrar (en cascada sus recordatorios) |
| Solicitudes de derechos | `dataRequestsYears: 3` | `createdAt` > 1.098 días | Borrar |
| Solicitudes no verificadas | (literal 7) | `UNVERIFIED` y `createdAt` > 7 días | Borrar |
| Trabajos de la cola | `jobsDoneDays: 30` | `DONE` y `updatedAt` > 30 días | Borrar |
| Trabajos fallidos | `jobsFailedDays: 90` | `FAILED` y `updatedAt` > 90 días | Borrar |
| Tarjetas regalo | `ordersYears: 6` | `createdAt` > 2.196 días y aún no anonimizadas | Anonimizar comprador, destinatario y mensaje (se conservan importe y estado) |
| Opiniones no publicadas | `unpublishedReviewsMonths: 12` | Estado distinto de `APPROVED`, no demo, `createdAt` > 372 días | Borrar |
| Eventos de Stripe | `stripeEventsDays: 90` | `processedAt` > 90 días | Borrar |
| Auditoría | `auditYears: 2` | `createdAt` > 732 días (el trigger de la BD impide borrar antes de 2 años) | Borrar |
| Copias de seguridad | `BACKUP_RETENTION_DAYS` (35 por defecto) | `find -mtime +35 -delete` (lógicas y base); WAL: +36 días | Borrar archivos |
| Marketing y recordatorios | — | Hasta la baja (`/baja`) | Desactivar el consentimiento y los recordatorios, y borrar los carritos |

### Sin plazo automático (pendiente de decidir)

| Dato | Situación actual |
| --- | --- |
| `Review` **publicada** | Mientras siga publicada; no se puede vincular a un email (sin exportación ni supresión automáticas: retirarla a petición) |
| `AdminUser` desactivado | Se conserva indefinidamente (sus acciones están en la auditoría) |
| `Customer` con consentimiento comercial | Hasta la baja; no hay caducidad del consentimiento por inactividad |
| `CelebrationReminder` inactivo | Hasta que se borre la ficha del cliente |
| `Coupon` de fidelización | La descripción incluye el id del cliente; sin plazo |
| Logs del alojamiento y del SMTP | Según el proveedor «[COMPLETAR]» |

## 2. Proceso automático

- `GET /api/cron` con `Authorization: Bearer CRON_SECRET` llama a `applyRetention()`, que es idempotente y devuelve el recuento en la respuesta JSON (`retention`).
- Programación:
  - Vercel: diaria a las 07:00 UTC (`vercel.json`).
  - Autoalojado: 03:17 UTC (`infra/scheduler/crontab`).
  - Kubernetes: 04:17 UTC (`infra/k8s/cronjobs.yaml`).
- El panel `/admin/privacidad` muestra los plazos principales leyendo `RETENTION`.
- Comprobación recomendada: revisar cada mes que el cron responde `ok` (en autoalojado salta la alerta `ReposteriaCronJobNotSucceeding`).

## 3. Anonimización frente a borrado

`anonymizeOrder` (plazo de 6 años y supresión a petición):

| Se borra o sustituye | Se conserva |
| --- | --- |
| `customerName` → «Datos eliminados»; `customerEmail`, `customerPhone` → vacío; `customerEmailHash` → `erased:<id>`; `customerPhoneHash`, `address`, `postalCode`, `city`, `notes`, `adminNotes`, `rejectionReason` → null; `customerId` → null; `marketingConsent` → false; `OrderItem.dedication`, `referencePhotoUrl` y `customSpec` (texto de la tarta) → null; notas de `OrderStatusEvent` → null; el presupuesto que originó el pedido se anonimiza igual (`spec` incluido); borrado de las fotos a través de la cola | Número, fechas, productos, opciones e importes, cupón, tarjeta regalo, ids de Stripe, zona de reparto |

Lo que se conserva (fecha, productos, importes, zona) difícilmente identifica a una persona, pero en poblaciones muy pequeñas no es imposible: trátalo como dato seudonimizado de acceso restringido.

## 4. Obligación fiscal y mercantil

- **Código de Comercio, art. 30**: libros, correspondencia, documentación y justificantes durante **6 años** a partir del último asiento realizado en los libros.
- **Ley General Tributaria**: el derecho de la Administración a liquidar prescribe a los **4 años** (art. 66), contados desde el fin del plazo de declaración (art. 67). Los justificantes deben conservarse mientras no haya prescrito (art. 70) y el plazo puede interrumpirse.
- **LOPDGDD, art. 32 (bloqueo)**: al suprimir, los datos que deban conservarse quedan bloqueados, a disposición solo de jueces, Ministerio Fiscal y Administraciones Públicas competentes durante el plazo de prescripción.

Situación del código y riesgos:
1. El plazo de 6 años cuenta desde `createdAt` del pedido, no desde el cierre del ejercicio ni desde el último asiento. Consultar con la asesoría si conviene sumar un margen (p. ej. 6 años + fin de ejercicio).
2. La supresión a petición **anonimiza en el acto** los pedidos cerrados, en lugar de bloquearlos. Así se cumple la supresión, pero se pierde la identidad del cliente que podría pedir una inspección o un juzgado. Decidir con la asesoría «[COMPLETAR: criterio]».
3. La aplicación **no emite facturas**. Las facturas completas (con NIF del cliente) se emiten fuera, en «[COMPLETAR: programa de facturación]», y su conservación se rige por ese sistema.

## 5. Copias de seguridad

- Copias lógicas (`scripts/backup.sh`), base y WAL (`infra/postgres/backup`): cifradas con age y borradas a los 35 días (WAL a los 36). En un proveedor gestionado se suma su PITR «[COMPLETAR: días]».
- **Datos suprimidos**: siguen en las copias hasta que la última copia anterior a la supresión caduca (≤ 35 días, más lo que conserve el destino externo). Ninguna copia se usa salvo para restaurar.
- **Copia externa** (`BACKUP_OFFSITE_CMD`): el script no borra en el destino. Hay que configurar allí una retención equivalente (regla de ciclo de vida o `rclone delete --min-age 35d`) «[COMPLETAR]».
- **Tras una restauración**: las supresiones y anonimizaciones posteriores a la fecha de la copia reaparecen. Además, las `DataRequest` de ese periodo también se pierden, porque están en la misma BD.
  - Procedimiento manual: mantener **fuera de la BD** una lista de las supresiones ejecutadas (fecha + id de solicitud + índice ciego del email). Después de restaurar, volver a ejecutar `eraseSubjectData` para cada una y `applyRetention` de inmediato.
  - Estado: **no implementado**.
- Las **fotos** no están en las copias de la BD. El volumen `reposteria_uploads` (autoalojado) no lo copia ningún script: una foto borrada no reaparece, pero tampoco hay copia de las fotos vigentes. En Supabase Storage depende del proveedor «[VERIFICAR]».

## 6. Borrado seguro y «crypto-shredding»

- Los campos de `ENCRYPTED_FIELDS` se guardan cifrados con un anillo de claves **común a todos los registros**. No hay una clave por persona, así que no se puede destruir a una sola persona borrando una clave: la supresión individual se hace sobrescribiendo o borrando filas.
- Retirar una clave sí sirve para borrar de forma criptográfica todo lo cifrado con ella:
  1. Rotar (`npm run keys:rotate`).
  2. Esperar a que caduquen todas las copias anteriores a la rotación (35 días más el destino externo). Hasta entonces, guardar el kid antiguo en una bóveda fuera de línea, porque sin él esas copias se restaurarían con los campos personales ilegibles.
  3. Destruir el kid antiguo.
- PostgreSQL no sobrescribe en el acto las filas borradas (MVCC). `VACUUM` reutiliza el espacio. Los campos cifrados reducen ese riesgo; los que van en claro (lista en [encargados-y-transferencias.md](encargados-y-transferencias.md)) no.

## 7. Fotos privadas

- Se guardan como `private:references/AAAA-MM/<token>.webp`, en el bucket privado de Supabase o en `UPLOAD_DIR/private/`. La ruta `/uploads/...` nunca las sirve.
- Se guardan **cifradas con AES-256-GCM** (clave activa de `DATA_ENCRYPTION_KEYS`, AAD = ruta del archivo). `npm run db:encrypt` cifra las locales anteriores a esta medida y las re-cifra al rotar la clave; las antiguas de Supabase siguen sin cifrar hasta que caducan (90–150 días).
- `applyRetention`, `anonymizeOrder` y `eraseSubjectData` quitan la referencia y, **en la misma transacción**, encolan un trabajo `storage.delete-private`. El trabajo llama a `deletePrivate()`, que comprueba la respuesta de Supabase (404 = ya borrada) y lanza si falla: la cola reintenta y, si se agotan los intentos, alerta `jobs.failed` (reintento manual en Registro de actividad → «Trabajos fallidos»). Así no queda ninguna foto huérfana en silencio.
- Pendiente: un barrido periódico que compare el bucket con las referencias de la BD (para restos anteriores a esta versión).

## 8. Copias fuera de la automatización (procedimiento manual)

| Lugar | Qué contiene | Acción al suprimir / plazo |
| --- | --- | --- |
| Buzón del negocio | Avisos de pedido y presupuesto con nombre, teléfono, email y notas; respuestas a clientes | «[COMPLETAR: borrar a los X meses y al atender una supresión]» |
| WhatsApp del negocio | Conversaciones y avisos de pedido | «[COMPLETAR]» |
| Dashboard de Stripe | Email e importes de los pagos | Stripe conserva según sus propias obligaciones; se informa en la respuesta |
| CSV de clientes y JSON de exportación descargados por el OWNER | Datos de contacto | Borrar tras usarlos; no guardar en carpetas compartidas |
| Herramienta externa de email marketing (si se usa) | Lista de contactos con consentimiento | Aplicar las bajas también allí |

## 9. Borrado manual desde el panel

- `/admin/clientes` → borrar (permiso `customers.delete`, solo OWNER) ejecuta la **misma supresión completa** que `/admin/privacidad` (`eraseSubjectData`): ficha, recordatorios, carritos, presupuestos sin pedido y fotos borrados; pedidos cerrados, presupuestos con pedido y tarjetas regalo anonimizados; pedidos en curso intactos. Queda auditado (`privacy.customer_erased`).
- Si la petición llegó como solicitud de derechos, usa `/admin/privacidad` para que quede registrada en `DataRequest`.
