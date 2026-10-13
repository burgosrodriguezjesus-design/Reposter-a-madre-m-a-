# Atención de los derechos de los interesados (arts. 12 a 22 RGPD)

> Revisado contra el código el 2026-10-13: `src/app/(site)/privacidad/derechos/**`, `src/app/admin/(panel)/privacidad/**`, `src/app/api/admin/privacidad/[id]/route.ts`, `src/lib/privacy.ts`, `src/lib/rbac.ts`.

## 1. Canales de entrada

| Canal | Tratamiento |
| --- | --- |
| Formulario `/privacidad/derechos` | Flujo automático con verificación por email (apartado 2) |
| Email a «[COMPLETAR: email de privacidad]» | Manual. **No** hay opción en el panel para dar de alta una solicitud a mano: anotarla en el registro manual (apartado 6) o pedir al interesado que use el formulario |
| Presencial o por correo postal | Manual: «[COMPLETAR]» |

El canal no puede condicionar el derecho: hay que atender también las solicitudes que no lleguen por el formulario.

## 2. Flujo del formulario

1. **Solicitud** (`requestRights`):
   - Campos: tipo (ACCESS, PORTABILITY, RECTIFICATION, ERASURE, OBJECTION, RESTRICTION), email y detalles (≤ 2.000 caracteres). Campo trampa `website` contra bots.
   - Límite de 5 solicitudes por hora por huella de IP.
   - Se crea `DataRequest` en estado `UNVERIFIED` con `dueAt = ahora + 30 días`. El email y los detalles se guardan cifrados.
   - La respuesta es la misma tanto si el email existe en la BD como si no.
2. **Verificación de identidad**:
   - Se envía al email un enlace con un token aleatorio de 32 bytes. Solo se guarda su SHA-256 y caduca a los 7 días.
   - La página `/privacidad/derechos/verificar` exige pulsar «Sí, confirmo» (los antivirus de correo que abren enlaces no confirman solos).
   - Al confirmar: estado `VERIFIED`, `verifiedAt`, auditoría `privacy.request_verified` y alerta `privacy.request` al responsable.
   - Las solicitudes no verificadas se borran a los 7 días.
3. **Gestión** en `/admin/privacidad`:
   - Permiso `privacy.manage`, que en `rbac.ts` **solo tiene OWNER**. MANAGER y STAFF no pueden ver ni resolver solicitudes.
   - Lista de solicitudes verificadas ordenada por `dueAt`, con la marca «Fuera de plazo».
   - Acciones:

     | Acción | Efecto | Auditoría |
     | --- | --- | --- |
     | «Descargar sus datos (JSON)» | `GET /api/admin/privacidad/[id]` | `privacy.export`, severidad warning |
     | «Marcar como atendida» | Pide una resolución de ≥ 5 caracteres | `privacy.request_complete` |
     | «Rechazar (motivar)» | Pide una resolución de ≥ 5 caracteres | `privacy.request_reject` |
     | «Ejecutar supresión» | Solo en solicitudes de tipo ERASURE; ejecuta `eraseSubjectData` | `privacy.erasure`, severidad warning |

**Alcance de la verificación**: acredita el control del email. Los datos se buscan **solo** por el índice ciego de ese email.

- Si el interesado usó otros emails, o solo se le conoce por el teléfono, hay que pedirle esos datos y tramitarlo a mano.
- No se debe pedir el DNI salvo duda razonable (art. 12.6).

## 3. Plazos

| Regla legal (art. 12.3) | Código | Nota |
| --- | --- | --- |
| 1 mes desde la recepción | `dueAt` = alta + 30 días | Contar desde la recepción es lo prudente; 30 días puede ser 1 día menos que un mes natural |
| Prórroga de 2 meses más por complejidad o volumen, informando en el primer mes con los motivos | **No implementada**: no hay estado ni campo de prórroga | Anotar la prórroga en la resolución y en el registro manual, y enviar la plantilla P5 |
| Responder aunque no se actúe, con los motivos y la posibilidad de reclamar a la AEPD (art. 12.4) | «Rechazar (motivar)» | Usar la plantilla P6 |

## 4. Derecho por derecho

| Derecho | Cómo se atiende | Limitaciones del código |
| --- | --- | --- |
| **Acceso** (art. 15) | Descargar el JSON y enviarlo junto con la información del art. 15.1 (plantilla P2): finalidades, categorías, destinatarios, plazos, derechos, origen y si hay decisiones automatizadas | El JSON excluye las fotos de referencia (solo se quita la URL) y las opiniones. Si se piden, enviar las fotos aparte |
| **Rectificación** (art. 16) | Corregir el dato | **No hay pantalla** para editar nombre, email, teléfono o dirección de pedidos, presupuestos o fichas. Hacerlo solo con el cliente Prisma de la app (`src/lib/db.ts`), **nunca con SQL directo**: se guardaría en claro y se romperían los índices ciegos |
| **Supresión** (art. 17) | «Ejecutar supresión» → `eraseSubjectData` (detalle abajo) | Los pedidos en curso no se tocan: cancelarlos antes o explicar el motivo. Opiniones, copias en el buzón, WhatsApp y Stripe, y copias de seguridad (≤ 35 días) quedan fuera |
| **Oposición** (art. 21) | Marketing: desactivar el consentimiento (enlace `/baja` del email o a mano) y aplicarlo en la herramienta externa si existe. Interés legítimo (ficha de cliente, seguridad): ponderar y responder | Sin automatización: se cierra con «Marcar como atendida» |
| **Limitación** (art. 18) | Conservar los datos sin tratarlos mientras se resuelve | **No implementada**: no existe una marca de «tratamiento limitado» en el modelo. Medida manual: anotar en `adminNotes` del pedido y no usar los datos «[COMPLETAR: procedimiento]» |
| **Portabilidad** (art. 20) | El mismo JSON (estructurado, de uso común, lectura mecánica) | Abarca los datos facilitados por el interesado con base en contrato o consentimiento |
| **No ser objeto de decisiones automatizadas** (art. 22) | La app no toma decisiones con efectos jurídicos o similares basadas solo en tratamiento automatizado. Lo automático es: cálculo de precios y franjas, sellos de fidelización por importe gastado, marca «verificada» de opiniones y límites o bloqueos de peticiones por seguridad | «[CONFIRMAR por el responsable]». Si alguna vez se añade un rechazo automático de pedidos o una valoración de fraude, revisar este punto |
| **Retirar el consentimiento** (art. 7.3) | `/baja?t=…` (marketing, recordatorios y carritos); desmarcar «recordarme el carrito» (`DELETE /api/cart/remember`); «Configurar cookies» | Al darse de baja se pone `marketingConsentAt = null` y no queda registro de la fecha de la retirada |

### Qué hace `eraseSubjectData(emailHash)`

| Elemento | Acción |
| --- | --- |
| Pedidos en curso (PENDING_PAYMENT, PENDING, ACCEPTED, IN_PREPARATION, READY) | No se tocan; se informa del número (`activeOrders`) |
| Resto de pedidos | `anonymizeOrder`: se conservan importes, fechas y productos; se vacían también código postal, ciudad, motivo de rechazo, `customSpec` (texto de la tarta) y notas del historial (ver conservación) |
| Presupuestos sin pedido | Se borran |
| Presupuestos vinculados a un pedido | Se anonimizan nombre, email, teléfono, notas, foto y `spec` (texto de la tarta) |
| Tarjetas regalo | Como comprador: nombre, email y mensaje anonimizados. Como destinatario: nombre, email y mensaje a null |
| Carritos guardados | Se borran |
| Ficha de cliente | Se borra, y en cascada sus recordatorios |
| Fotos de referencia | Se encola su borrado en la misma transacción (cola con reintentos y alerta si falla) |
| `DataRequest` | Se conserva 3 años como prueba de la atención |
| Opiniones, `AuditLog` | No se tocan |

> `/admin/clientes` → borrar ejecuta esta misma supresión. Para una solicitud de derechos usa `/admin/privacidad`, así queda registrada en `DataRequest`.

## 5. Formato de la exportación (JSON)

Archivo `datos-personales-<id>.json`, generado por `exportSubjectData` con `Cache-Control: private, no-store`:

```json
{
  "generatedAt": "2026-10-13T10:00:00.000Z",
  "description": "Datos personales que conservamos asociados a este email (art. 15 y 20 RGPD).",
  "customer": { "id": "…", "email": "…", "name": "…", "phone": "…", "marketingConsent": true, "marketingConsentAt": "…", "loyaltyStamps": 0, "ordersCount": 0, "totalSpentCents": 0, "createdAt": "…", "updatedAt": "…", "reminders": [ { "label": "…", "month": 5, "day": 12, "consentAt": "…", "active": true } ] },
  "orders": [ { "number": "…", "status": "…", "customerName": "…", "address": "…", "totalCents": 0, "items": [ { "name": "…", "quantity": 1, "dedication": "…", "customSpec": {} } ], "history": [ { "status": "…", "note": "…", "createdAt": "…" } ] } ],
  "quotes": [ { "number": "…", "spec": {}, "customerName": "…" } ],
  "giftCards": [ { "initialCents": 0, "balanceCents": 0, "purchaserName": "…", "recipientName": "…", "message": "…" } ],
  "savedCarts": [ { "createdAt": "…", "consentAt": "…", "cart": "<JSON del carrito como texto>" } ],
  "privacyRequests": [ { "type": "ACCESS", "status": "VERIFIED", "createdAt": "…", "resolvedAt": null } ]
}
```

El ejemplo está abreviado. Campos que se excluyen siempre: los que terminan en `Hash` o `Token`, `accessToken`, `stripe*`, `idempotency*`, `requestHash`, `checkoutUrl`, `adminNotes`, `referencePhotoUrl`, `unsubscribeToken` y el `code` de las tarjetas regalo.

El JSON se descarga en el equipo del OWNER: enviarlo por un canal seguro al email verificado y borrar la copia local después.

## 6. Registro de solicitudes

- **En la app**: modelo `DataRequest`, con tipo, estado, email cifrado, detalles cifrados, `createdAt`, `verifiedAt`, `dueAt`, `resolvedAt` y `resolution`.
  - El panel muestra las pendientes y las 30 últimas cerradas.
  - Se conservan 3 años.
  - Auditoría: `privacy.request_verified`, `privacy.export`, `privacy.erasure`, `privacy.request_complete`, `privacy.request_reject` y `privacy.customer_erased`.
- **Registro manual complementario** «[COMPLETAR: ubicación]». Es necesario para:
  - solicitudes recibidas por otros canales;
  - prórrogas;
  - una lista de supresiones ejecutadas guardada fuera de la BD, para volver a aplicarlas si se restaura una copia (ver conservación).

| Fecha recepción | Canal | Tipo | Id `DataRequest` (si existe) | Identidad verificada (cómo) | Vencimiento / prórroga | Fecha respuesta | Resultado | Responsable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

- `resolution` es texto libre **sin cifrar**: escribir solo la acción («Copia enviada el 12/10»), sin datos personales.

## 7. Plantillas de respuesta

**P1. Petición de información adicional** (cuando no se puede localizar a la persona)
> Hemos recibido tu solicitud de «[derecho]». No encontramos datos asociados a «[email]». Si hiciste pedidos con otro email o teléfono, indícanoslo respondiendo a este mensaje desde esa dirección. El plazo de respuesta empieza a contar cuando recibamos esa información.

**P2. Acceso / portabilidad**
> Adjuntamos una copia de los datos personales que conservamos asociados a tu email, en formato JSON.
> - **Finalidades**: gestión de pedidos, presupuestos y tarjetas regalo; programa de fidelización; comunicaciones solo si diste tu consentimiento.
> - **Destinatarios**: proveedores de alojamiento, base de datos, correo y pagos (Stripe), que actúan con contrato de encargo «[COMPLETAR: lista resumida]».
> - **Plazos**: pedidos, 6 años y luego se anonimizan; fotos, 90 días tras la fecha del pedido (150 días desde la solicitud en los presupuestos); presupuestos no aceptados, 12 meses; carritos, 30 días.
> - **Origen**: tú mismo.
> - **Decisiones automatizadas**: no tomamos decisiones automatizadas con efectos jurídicos sobre ti.
>
> Puedes ejercer el resto de derechos y reclamar ante la AEPD (www.aepd.es).

**P3. Rectificación**
> Hemos corregido «[dato]» en «[pedidos/ficha]». Si has compartido ese dato por otros medios (WhatsApp, email), ya se ha actualizado también allí.

**P4. Supresión**
> Hemos suprimido tus datos personales. Tu ficha de cliente, los carritos guardados, los presupuestos no aceptados y las fotos de referencia se han borrado. Los pedidos ya entregados se han anonimizado: conservamos solo los importes, fechas y productos que exige la normativa contable y fiscal (Código de Comercio, art. 30; Ley General Tributaria), sin tu nombre ni tus datos de contacto. «[Si aplica: Tienes «N» pedidos en curso que no podemos suprimir hasta que se completen o se cancelen.]» Las copias de seguridad cifradas se renuevan en un máximo de 35 días.

**P5. Prórroga**
> Por «[motivo: complejidad / número de solicitudes]», necesitamos ampliar el plazo de respuesta hasta el «[fecha]» (art. 12.3 RGPD). Te responderemos antes de esa fecha.

**P6. Denegación motivada**
> No podemos atender tu solicitud de «[derecho]» porque «[motivo concreto y base legal, p. ej. art. 17.3.b: obligación legal de conservación]». Puedes presentar una reclamación ante la Agencia Española de Protección de Datos (www.aepd.es) o acudir a los tribunales.

**P7. Oposición o baja de comunicaciones**
> Hemos dado de baja tu email de nuestras comunicaciones comerciales y recordatorios. No volverás a recibirlos.
