import "server-only";
import type { DeliveryZone } from "@prisma/client";
import type { FaqKey } from "@/content/landings";
import type { AllSettings } from "@/lib/settings-types";
import type { OpeningSchedule } from "@/lib/schedule";
import type { ProductCardData } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { fullAddress } from "@/lib/structured-data";

/** Preguntas frecuentes generadas con los datos reales del negocio (se actualizan solas). */
export function buildFaqs(
  keys: FaqKey[],
  ctx: { settings: AllSettings; zones: DeliveryZone[]; schedule: OpeningSchedule; products: ProductCardData[]; payments: { card: boolean; inStore: boolean } },
): { q: string; a: string }[] {
  const { settings, zones, schedule, products, payments } = ctx;
  const b = settings.business;
  const o = settings.ordering;
  const openDays = schedule.filter((d) => d.intervals.length);
  const scheduleText = openDays
    .map((d) => `${d.name.toLowerCase()} de ${d.intervals.map((i) => `${i.opensAt} a ${i.closesAt}`).join(" y de ")}`)
    .join("; ");

  const prices = products.map((p) => p.fromPriceCents).filter((n) => n > 0);
  const answers: Record<FaqKey, { q: string; a: string } | null> = {
    leadTime: {
      q: "¿Con cuánta antelación tengo que hacer el pedido?",
      a: `La mayoría de nuestros productos se pueden encargar con ${o.minLeadHours} horas de antelación. Las tartas personalizadas necesitan al menos ${Math.round(settings.builder.leadTimeHours / 24)} días y las tartas de boda, unas tres semanas. Al hacer el pedido online, el calendario solo te muestra los días y horas que realmente tenemos disponibles.`,
    },
    delivery:
      o.deliveryEnabled && zones.length
        ? {
            q: `¿Hacéis entregas a domicilio en ${b.city}?`,
            a: `Sí, repartimos en ${zones.map((z) => z.name).join(", ")}. El envío cuesta desde ${formatPrice(Math.min(...zones.map((z) => z.feeCents)))}${
              zones.some((z) => z.freeFromCents != null)
                ? ` y es gratis a partir de ${formatPrice(Math.min(...zones.filter((z) => z.freeFromCents != null).map((z) => z.freeFromCents!)))}`
                : ""
            }. Al finalizar el pedido introduce tu código postal y te diremos si llegamos a tu zona.`,
          }
        : {
            q: `¿Hacéis entregas a domicilio en ${b.city}?`,
            a: `No, solo trabajamos con recogida en ${fullAddress(b)}, el día y a la hora que elijas al hacer el pedido.`,
          },
    pickup: {
      q: "¿Dónde y cuándo se recoge el pedido?",
      a: `En ${fullAddress(b)}, a la hora que elijas al hacer el pedido. Nuestro horario es: ${scheduleText || "consulta el horario en la web"}.`,
    },
    allergens: {
      q: "¿Indicáis los alérgenos? ¿Tenéis opciones para alérgicos?",
      a: `Sí, en cada producto detallamos los ingredientes y los 14 alérgenos de declaración obligatoria. ${o.allergenNotice} Si tienes una alergia, indícalo en las notas del pedido y te asesoramos.`,
    },
    custom: settings.builder.enabled
      ? {
          q: "¿Puedo pedir una tarta con un diseño concreto?",
          a: "Sí. En el personalizador eliges tamaño, bizcocho, relleno, cobertura, colores, decoración y texto, y ves un precio orientativo al momento. Para diseños complejos (figuras modeladas, temáticas) puedes subir una foto de inspiración y pedirnos presupuesto sin compromiso.",
        }
      : null,
    payment: {
      q: "¿Cómo se paga el pedido?",
      a: [
        payments.card ? "Puedes pagar online con tarjeta, Apple Pay o Google Pay a través de Stripe, una pasarela de pago segura (nosotros no vemos ni guardamos los datos de tu tarjeta)." : "",
        payments.inStore ? "Si recoges en tienda, también puedes reservar y pagar al recoger, en efectivo o con tarjeta." : "",
        "También aceptamos nuestras tarjetas regalo.",
      ]
        .filter(Boolean)
        .join(" "),
    },
    price: prices.length
      ? {
          q: "¿Cuánto cuesta una tarta?",
          a: `Nuestros precios van desde ${formatPrice(Math.min(...prices))} hasta ${formatPrice(Math.max(...prices))} según el producto y el tamaño. En cada ficha verás el precio de cada tamaño y el número aproximado de raciones, y las opciones extra muestran su coste antes de añadirlas.`,
        }
      : null,
    cancel: { q: "¿Puedo cancelar o cambiar mi pedido?", a: o.cancellationSummary },
  };
  return keys.map((k) => answers[k]).filter((x): x is { q: string; a: string } => !!x);
}
