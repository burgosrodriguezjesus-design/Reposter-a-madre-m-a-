import "server-only";
import type { GiftCard, Order, OrderItem, OrderStatus, QuoteRequest } from "@prisma/client";
import { formatLocalDate, formatPrice } from "@/lib/format";
import { ORDER_STATUS, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/order-status";
import type { AllSettings } from "@/lib/settings-types";
import { siteUrl } from "@/lib/site-url";
import type { EmailMessage } from "@/lib/email";

type OrderWithItems = Order & { items: OrderItem[] };

export function escapeHtml(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const C = { cream: "#FBF7F2", cocoa: "#3B2A22", muted: "#7A6458", rose: "#A84D60", gold: "#C29A4A", line: "#EADFD2" };

function layout(settings: AllSettings, opts: { preheader: string; title: string; body: string; footerNote?: string }) {
  const b = settings.business;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(opts.title)}</title></head>
<body style="margin:0;background:${C.cream};font-family:Helvetica,Arial,sans-serif;color:${C.cocoa}">
<span style="display:none;max-height:0;overflow:hidden">${escapeHtml(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream};padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${C.line}">
<tr><td style="padding:28px 32px 8px;text-align:center;border-bottom:3px solid ${C.gold}">
<div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-style:italic;color:${C.cocoa}">${escapeHtml(b.name)}</div>
<div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${C.muted};margin:6px 0 16px">${escapeHtml(b.tagline)}</div>
</td></tr>
<tr><td style="padding:28px 32px">
<h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:24px;margin:0 0 16px;color:${C.cocoa}">${escapeHtml(opts.title)}</h1>
${opts.body}
</td></tr>
<tr><td style="padding:20px 32px;background:${C.cream};font-size:12px;line-height:18px;color:${C.muted};text-align:center">
${escapeHtml(b.name)} · ${escapeHtml(b.street)}, ${escapeHtml(b.postalCode)} ${escapeHtml(b.city)} · ${escapeHtml(b.phone)}<br>
${opts.footerNote ?? ""}
</td></tr></table></td></tr></table></body></html>`;
}

function button(href: string, label: string) {
  return `<p style="margin:24px 0;text-align:center"><a href="${href}" style="display:inline-block;background:${C.rose};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:bold">${escapeHtml(label)}</a></p>`;
}

function p(text: string) {
  return `<p style="font-size:15px;line-height:23px;margin:0 0 14px">${text}</p>`;
}

function itemsTable(order: OrderWithItems) {
  const rows = order.items
    .map((item) => {
      const options = Array.isArray(item.options)
        ? (item.options as { group: string; choice: string }[]).map((o) => `${escapeHtml(o.group)}: ${escapeHtml(o.choice)}`)
        : [];
      const extra = [
        item.variantName ? escapeHtml(item.variantName) : "",
        ...options,
        item.dedication ? `Dedicatoria: «${escapeHtml(item.dedication)}»` : "",
        item.referencePhotoUrl ? "Con foto de referencia" : "",
      ].filter(Boolean);
      return `<tr><td style="padding:10px 0;border-bottom:1px solid ${C.line};font-size:14px;line-height:20px">
<strong>${item.quantity} × ${escapeHtml(item.name)}</strong>${extra.length ? `<br><span style="color:${C.muted};font-size:13px">${extra.join("<br>")}</span>` : ""}</td>
<td style="padding:10px 0;border-bottom:1px solid ${C.line};text-align:right;font-size:14px;white-space:nowrap;vertical-align:top">${formatPrice(item.lineTotalCents)}</td></tr>`;
    })
    .join("");
  const line = (label: string, value: string, bold = false) =>
    `<tr><td style="padding:6px 0;font-size:14px;${bold ? "font-weight:bold" : `color:${C.muted}`}">${label}</td><td style="padding:6px 0;text-align:right;font-size:14px;${bold ? "font-weight:bold" : ""}">${value}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0">${rows}
${line("Subtotal", formatPrice(order.subtotalCents))}
${order.discountCents ? line(`Descuento${order.couponCode ? ` (${escapeHtml(order.couponCode)})` : ""}`, `−${formatPrice(order.discountCents)}`) : ""}
${order.fulfillment === "DELIVERY" ? line("Envío", order.deliveryFeeCents ? formatPrice(order.deliveryFeeCents) : "Gratis") : ""}
${order.giftCardCents ? line("Tarjeta regalo", `−${formatPrice(order.giftCardCents)}`) : ""}
${line("Total", formatPrice(order.totalCents), true)}</table>`;
}

function orderDetails(order: OrderWithItems, settings: AllSettings) {
  const b = settings.business;
  const when = `${formatLocalDate(order.scheduledDate)} a las ${order.scheduledTime}`;
  const where =
    order.fulfillment === "PICKUP"
      ? `Recogida en tienda: ${escapeHtml(b.street)}, ${escapeHtml(b.city)}`
      : `Entrega a domicilio: ${escapeHtml(order.address)} (${escapeHtml(order.postalCode)})`;
  return `<div style="background:${C.cream};border-radius:12px;padding:16px 18px;font-size:14px;line-height:22px;margin:16px 0">
<strong>Pedido ${escapeHtml(order.number)}</strong><br>
📅 ${escapeHtml(when)}<br>📍 ${where}<br>
💳 ${PAYMENT_METHOD_LABEL[order.paymentMethod]} · ${PAYMENT_STATUS_LABEL[order.paymentStatus]}</div>`;
}

export function orderUrl(order: Pick<Order, "number" | "accessToken">) {
  return siteUrl(`/pedido/${order.number}?t=${order.accessToken}`);
}

export function orderReceivedEmail(order: OrderWithItems, settings: AllSettings): EmailMessage {
  const title = order.requiresReview || order.status === "PENDING" ? "¡Hemos recibido tu pedido!" : "¡Pedido confirmado!";
  const intro =
    order.status === "ACCEPTED"
      ? "Tu pedido está confirmado y ya lo tenemos en nuestra agenda."
      : "Lo revisamos enseguida y te escribiremos en cuanto esté confirmado. Hasta entonces no tienes que hacer nada más.";
  const payNote =
    order.paymentMethod === "IN_STORE" && order.totalCents > 0
      ? p(`Pagarás <strong>${formatPrice(order.totalCents)}</strong> en la tienda al recoger tu pedido.`)
      : "";
  const body = [
    p(`Hola ${escapeHtml(order.customerName)},`),
    p(`Gracias por confiar en ${escapeHtml(settings.business.name)}. ${intro}`),
    orderDetails(order, settings),
    itemsTable(order),
    payNote,
    button(orderUrl(order), "Ver el estado de mi pedido"),
    p(`<span style="font-size:13px;color:${C.muted}"><strong>Cancelaciones:</strong> ${escapeHtml(settings.ordering.cancellationSummary)}</span>`),
    p(`<span style="font-size:13px;color:${C.muted}"><strong>Alérgenos:</strong> ${escapeHtml(settings.ordering.allergenNotice)}</span>`),
  ].join("");
  return {
    to: order.customerEmail,
    subject: `${title} · Pedido ${order.number}`,
    html: layout(settings, { preheader: `Pedido ${order.number} para el ${formatLocalDate(order.scheduledDate)}`, title, body }),
    text: `${title}\nPedido ${order.number}\n${formatLocalDate(order.scheduledDate)} a las ${order.scheduledTime}\nTotal: ${formatPrice(order.totalCents)}\nConsulta el estado: ${orderUrl(order)}`,
    replyTo: settings.business.email || undefined,
  };
}

export function newOrderAdminEmail(order: OrderWithItems, settings: AllSettings, to: string): EmailMessage {
  const title = `Nuevo pedido ${order.number}${order.requiresReview ? " (revisar personalización)" : ""}`;
  const body = [
    p(`<strong>${escapeHtml(order.customerName)}</strong> · ${escapeHtml(order.customerPhone)} · ${escapeHtml(order.customerEmail)}`),
    orderDetails(order, settings),
    itemsTable(order),
    order.notes ? p(`<strong>Notas del cliente:</strong> ${escapeHtml(order.notes)}`) : "",
    button(siteUrl(`/admin/pedidos/${order.id}`), "Abrir en el panel"),
  ].join("");
  return {
    to,
    subject: `🧁 ${title} · ${formatLocalDate(order.scheduledDate, "short")} ${order.scheduledTime}`,
    html: layout(settings, { preheader: `${order.customerName} · ${formatPrice(order.totalCents)}`, title, body }),
    text: `${title}\n${order.customerName} (${order.customerPhone})\n${formatLocalDate(order.scheduledDate)} ${order.scheduledTime}\nTotal ${formatPrice(order.totalCents)}\n${siteUrl(`/admin/pedidos/${order.id}`)}`,
    replyTo: order.customerEmail,
  };
}

export function orderStatusEmail(order: OrderWithItems, settings: AllSettings, status: OrderStatus, note?: string | null): EmailMessage {
  const info = ORDER_STATUS[status];
  const readyText =
    status === "READY"
      ? order.fulfillment === "PICKUP"
        ? `Puedes pasar a recogerlo por ${escapeHtml(settings.business.street)} a partir de las ${order.scheduledTime}.`
        : "Sale en breve hacia tu domicilio."
      : "";
  const body = [
    p(`Hola ${escapeHtml(order.customerName)},`),
    p(`${escapeHtml(info.customerText)} ${readyText}`),
    note ? p(`<em>${escapeHtml(note)}</em>`) : "",
    orderDetails(order, settings),
    button(orderUrl(order), "Ver mi pedido"),
  ].join("");
  return {
    to: order.customerEmail,
    subject: `Pedido ${order.number}: ${info.label.toLowerCase()}`,
    html: layout(settings, { preheader: info.customerText, title: `Tu pedido está: ${info.label.toLowerCase()}`, body }),
    text: `Pedido ${order.number}: ${info.label}\n${info.customerText}\n${note ?? ""}\n${orderUrl(order)}`,
    replyTo: settings.business.email || undefined,
  };
}

function quoteSpecHtml(quote: QuoteRequest) {
  const spec = (quote.spec as { summary?: { label: string; value: string }[] }).summary ?? [];
  return `<div style="background:${C.cream};border-radius:12px;padding:16px 18px;font-size:14px;line-height:22px;margin:16px 0">
<strong>Solicitud ${escapeHtml(quote.number)}</strong> · ${escapeHtml(formatLocalDate(quote.desiredDate))}<br>
${spec.map((s) => `${escapeHtml(s.label)}: ${escapeHtml(s.value)}`).join("<br>")}</div>`;
}

export function quoteUrl(quote: Pick<QuoteRequest, "id" | "accessToken">) {
  return siteUrl(`/presupuesto/${quote.id}?t=${quote.accessToken}`);
}

export function quoteReceivedEmail(quote: QuoteRequest, settings: AllSettings): EmailMessage {
  const body = [
    p(`Hola ${escapeHtml(quote.customerName)},`),
    p("Hemos recibido tu solicitud de presupuesto. Revisamos cada diseño a mano y te responderemos con el precio final en menos de 24 horas laborables."),
    quoteSpecHtml(quote),
    button(quoteUrl(quote), "Ver mi solicitud"),
  ].join("");
  return {
    to: quote.customerEmail,
    subject: `Solicitud de presupuesto ${quote.number} recibida`,
    html: layout(settings, { preheader: "Te respondemos en menos de 24 h laborables", title: "Hemos recibido tu idea", body }),
    text: `Solicitud ${quote.number} recibida. Te responderemos pronto. ${quoteUrl(quote)}`,
    replyTo: settings.business.email || undefined,
  };
}

export function newQuoteAdminEmail(quote: QuoteRequest, settings: AllSettings, to: string): EmailMessage {
  const body = [
    p(`<strong>${escapeHtml(quote.customerName)}</strong> · ${escapeHtml(quote.customerPhone)} · ${escapeHtml(quote.customerEmail)}`),
    quoteSpecHtml(quote),
    quote.notes ? p(`<strong>Notas:</strong> ${escapeHtml(quote.notes)}`) : "",
    quote.estimatedCents ? p(`Precio orientativo calculado: ${formatPrice(quote.estimatedCents)}`) : "",
    button(siteUrl(`/admin/presupuestos/${quote.id}`), "Responder en el panel"),
  ].join("");
  return {
    to,
    subject: `🎂 Nueva solicitud de presupuesto ${quote.number}`,
    html: layout(settings, { preheader: quote.customerName, title: "Nueva solicitud de tarta personalizada", body }),
    text: `Nueva solicitud ${quote.number} de ${quote.customerName}. ${siteUrl(`/admin/presupuestos/${quote.id}`)}`,
    replyTo: quote.customerEmail,
  };
}

export function quoteAnsweredEmail(quote: QuoteRequest, settings: AllSettings): EmailMessage {
  const accepted = quote.status === "QUOTED";
  const body = accepted
    ? [
        p(`Hola ${escapeHtml(quote.customerName)},`),
        p(`Ya tenemos el presupuesto de tu tarta: <strong style="font-size:18px">${formatPrice(quote.quotedCents ?? 0)}</strong>`),
        quote.adminMessage ? p(`<em>${escapeHtml(quote.adminMessage)}</em>`) : "",
        quoteSpecHtml(quote),
        button(quoteUrl(quote), "Ver y confirmar mi tarta"),
      ].join("")
    : [
        p(`Hola ${escapeHtml(quote.customerName)},`),
        p("Lo sentimos mucho, pero no podemos realizar este encargo."),
        quote.adminMessage ? p(`<em>${escapeHtml(quote.adminMessage)}</em>`) : "",
        p("Si quieres, escríbenos y buscamos juntos una alternativa."),
      ].join("");
  return {
    to: quote.customerEmail,
    subject: accepted ? `Tu presupuesto ${quote.number} está listo` : `Sobre tu solicitud ${quote.number}`,
    html: layout(settings, { preheader: "Respuesta a tu solicitud de tarta", title: accepted ? "Tu presupuesto está listo" : "Respuesta a tu solicitud", body }),
    text: accepted
      ? `Presupuesto ${quote.number}: ${formatPrice(quote.quotedCents ?? 0)}. ${quote.adminMessage ?? ""} ${quoteUrl(quote)}`
      : `No podemos realizar el encargo ${quote.number}. ${quote.adminMessage ?? ""}`,
    replyTo: settings.business.email || undefined,
  };
}

export function giftCardEmails(card: GiftCard, settings: AllSettings): EmailMessage[] {
  const validity = card.expiresAt ? `Válida hasta el ${card.expiresAt.toLocaleDateString("es-ES")}.` : "";
  const cardHtml = `<div style="margin:18px 0;padding:24px;border-radius:16px;background:linear-gradient(135deg,#F6D9DE,#FBF7F2);border:1px solid ${C.gold};text-align:center">
<div style="font-family:Georgia,serif;font-size:14px;letter-spacing:2px;text-transform:uppercase;color:${C.muted}">Tarjeta regalo</div>
<div style="font-family:Georgia,serif;font-size:36px;margin:8px 0;color:${C.cocoa}">${formatPrice(card.initialCents)}</div>
<div style="font-family:monospace;font-size:20px;letter-spacing:3px;background:#fff;display:inline-block;padding:8px 16px;border-radius:8px">${escapeHtml(card.code)}</div>
</div>`;
  const how = p(`Úsala al hacer un pedido en ${escapeHtml(siteUrl())} introduciendo el código, o enséñala en la tienda. ${validity}`);
  const messages: EmailMessage[] = [
    {
      to: card.purchaserEmail,
      subject: `Tu tarjeta regalo de ${formatPrice(card.initialCents)}`,
      html: layout(settings, {
        preheader: "Gracias por regalar dulzura",
        title: "¡Gracias por tu regalo!",
        body: [
          p(`Hola ${escapeHtml(card.purchaserName)},`),
          p(card.recipientEmail ? `Hemos enviado la tarjeta a ${escapeHtml(card.recipientName || card.recipientEmail)}. Aquí tienes una copia:` : "Aquí tienes tu tarjeta regalo:"),
          cardHtml,
          how,
        ].join(""),
      }),
      text: `Tarjeta regalo ${card.code} por ${formatPrice(card.initialCents)}. ${validity}`,
    },
  ];
  if (card.recipientEmail) {
    messages.push({
      to: card.recipientEmail,
      subject: `${card.purchaserName} te ha regalado algo dulce 🎁`,
      html: layout(settings, {
        preheader: "Tienes una tarjeta regalo",
        title: `¡${escapeHtml(card.recipientName || "Hola")}, tienes un regalo!`,
        body: [
          p(`${escapeHtml(card.purchaserName)} te regala una tarjeta de ${escapeHtml(settings.business.name)}.`),
          card.message ? p(`<em>«${escapeHtml(card.message)}»</em>`) : "",
          cardHtml,
          how,
        ].join(""),
      }),
      text: `${card.purchaserName} te regala una tarjeta de ${formatPrice(card.initialCents)}. Código: ${card.code}. ${validity}`,
    });
  }
  return messages;
}

function unsubscribeFooter(token: string) {
  const url = siteUrl(`/baja?t=${token}`);
  return { note: `¿No quieres recibir más avisos? <a href="${url}" style="color:${C.muted}">Darte de baja</a>`, url };
}

export function abandonedCartEmail(
  data: { name: string | null; email: string; token: string; unsubscribeToken: string },
  settings: AllSettings,
): EmailMessage {
  const url = siteUrl(`/carrito?recuperar=${data.token}`);
  const unsub = unsubscribeFooter(data.unsubscribeToken);
  return {
    to: data.email,
    subject: "Te guardamos tu carrito 🧁",
    html: layout(settings, {
      preheader: "Tu pedido te está esperando",
      title: "¿Terminamos tu pedido?",
      body: [
        p(`Hola${data.name ? ` ${escapeHtml(data.name)}` : ""},`),
        p("Nos pediste que te recordáramos tu carrito. Lo hemos guardado tal y como lo dejaste."),
        button(url, "Recuperar mi carrito"),
        p(`<span style="font-size:13px;color:${C.muted}">Recuerda que las fechas se llenan rápido, sobre todo los fines de semana.</span>`),
      ].join(""),
      footerNote: unsub.note,
    }),
    text: `Tu carrito te espera: ${url}\nDarte de baja: ${unsub.url}`,
    headers: { "List-Unsubscribe": `<${unsub.url}>` },
  };
}

export function reminderEmail(
  data: { name: string; email: string; label: string; date: string; unsubscribeToken: string },
  settings: AllSettings,
): EmailMessage {
  const unsub = unsubscribeFooter(data.unsubscribeToken);
  return {
    to: data.email,
    subject: `Se acerca: ${data.label} 🎉`,
    html: layout(settings, {
      preheader: "Te avisamos con tiempo para encargar la tarta",
      title: `Se acerca ${escapeHtml(data.label)}`,
      body: [
        p(`Hola ${escapeHtml(data.name)},`),
        p(`Nos pediste que te avisáramos: <strong>${escapeHtml(data.label)}</strong> es el ${escapeHtml(data.date)}. ¿Preparamos algo especial?`),
        button(siteUrl("/personalizar-tarta"), "Diseñar la tarta"),
      ].join(""),
      footerNote: unsub.note,
    }),
    text: `${data.label} es el ${data.date}. Diseña tu tarta: ${siteUrl("/personalizar-tarta")}\nBaja: ${unsub.url}`,
    headers: { "List-Unsubscribe": `<${unsub.url}>` },
  };
}

export function loyaltyRewardEmail(data: { name: string; email: string; code: string; amountCents: number }, settings: AllSettings): EmailMessage {
  return {
    to: data.email,
    subject: `¡Has completado tu tarjeta de sellos! 🎁`,
    html: layout(settings, {
      preheader: `Tienes ${formatPrice(data.amountCents)} de regalo`,
      title: "Gracias por ser de la casa",
      body: [
        p(`Hola ${escapeHtml(data.name)},`),
        p(`Has completado tu tarjeta de sellos. Te regalamos <strong>${formatPrice(data.amountCents)}</strong> para tu próximo pedido con el código:`),
        `<p style="text-align:center;font-family:monospace;font-size:22px;letter-spacing:3px">${escapeHtml(data.code)}</p>`,
        button(siteUrl("/productos"), "Hacer un pedido"),
      ].join(""),
    }),
    text: `Has completado tu tarjeta de sellos. Código: ${data.code} (${formatPrice(data.amountCents)})`,
  };
}
