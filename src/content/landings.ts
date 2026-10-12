/**
 * Páginas de aterrizaje para búsquedas locales ("tartas personalizadas en [ciudad]"...).
 * Cada una tiene un enfoque y un texto propios y se completa con datos reales del negocio
 * (productos, precios, plazos, zonas de reparto y horario), para evitar contenido duplicado.
 * Edita los textos libremente: son el principal factor de calidad para Google.
 */
import { slugify } from "@/lib/format";
import type { BusinessSettings } from "@/lib/settings-types";

export type Landing = {
  key: string;
  slug: string;
  label: string;
  h1: string;
  metaTitle: string;
  metaDescription: string;
  intro: string[];
  /** Categoría cuyos productos se muestran */
  categorySlug?: string;
  /** Ordenación de productos: populares de todo el catálogo */
  showBestsellers?: boolean;
  highlights: { title: string; text: string }[];
  ctaLabel: string;
  ctaHref: string;
  faqKeys: FaqKey[];
};

export type FaqKey = "leadTime" | "delivery" | "pickup" | "allergens" | "custom" | "payment" | "price" | "cancel";

export function getLandings(b: BusinessSettings): Landing[] {
  const city = b.city;
  const citySlug = slugify(city);
  const list: Landing[] = [
    {
      key: "reposteria",
      slug: `reposteria-artesanal-${citySlug}`,
      label: `Repostería artesanal en ${city}`,
      h1: `Repostería artesanal en ${city}`,
      metaTitle: `Repostería artesanal en ${city} | Tartas y dulces por encargo`,
      metaDescription: `Obrador de repostería artesanal en ${city}: tartas, cupcakes, galletas y postres elaborados a diario con mantequilla e ingredientes de calidad. Encarga online.`,
      intro: [
        `En ${b.name} horneamos cada día en nuestro obrador de ${b.neighborhood ? `${b.neighborhood}, en ` : ""}${city}. Sin bizcochos industriales ni premezclas: mantequilla de verdad, huevos camperos, fruta de temporada y chocolate de calidad.`,
        "Puedes elegir entre nuestras recetas de siempre o encargarnos algo hecho a tu medida. Todo se reserva online en unos minutos, eligiendo el día y la hora de recogida o entrega.",
      ],
      showBestsellers: true,
      highlights: [
        { title: "Elaboración diaria", text: "Horneamos por encargo para que todo llegue recién hecho a tu mesa." },
        { title: "Ingredientes reales", text: "Mantequilla, nata fresca, chocolate de cobertura y fruta de temporada." },
        { title: "Pedido online", text: "Reserva día y hora, paga online o al recoger y recibe la confirmación por email." },
      ],
      ctaLabel: "Ver todos los productos",
      ctaHref: "/productos",
      faqKeys: ["leadTime", "pickup", "delivery", "allergens", "payment"],
    },
    {
      key: "personalizadas",
      slug: `tartas-personalizadas-${citySlug}`,
      label: `Tartas personalizadas en ${city}`,
      h1: `Tartas personalizadas en ${city}`,
      metaTitle: `Tartas personalizadas en ${city} | Diseña la tuya online`,
      metaDescription: `Tartas personalizadas en ${city} con el nombre, los colores y los sabores que elijas. Configúrala online, mira el precio al momento y recógela o recíbela en casa.`,
      intro: [
        `Una tarta personalizada es el centro de la celebración, así que la diseñamos contigo. En nuestro personalizador eliges tamaño, bizcocho, relleno, cobertura, colores y decoración y ves un precio orientativo al instante, calculado con nuestras tarifas reales.`,
        "Si tienes una idea especial (una temática, figuras modeladas o una réplica de una foto), envíanos tu inspiración y te preparamos un presupuesto sin compromiso antes de confirmar nada.",
      ],
      categorySlug: "tartas-personalizadas",
      highlights: [
        { title: "Precio al momento", text: "Sabes lo que cuesta antes de pedir: sin sorpresas." },
        { title: "Foto de inspiración", text: "Sube una imagen de referencia y la adaptamos a tu tarta." },
        { title: "Revisión a mano", text: "Cada tarta personalizada la revisamos y confirmamos personalmente." },
      ],
      ctaLabel: "Diseñar mi tarta",
      ctaHref: "/personalizar-tarta",
      faqKeys: ["custom", "leadTime", "price", "cancel", "delivery"],
    },
    {
      key: "cumpleanos",
      slug: `tartas-de-cumpleanos-${citySlug}`,
      label: `Tartas de cumpleaños en ${city}`,
      h1: `Tartas de cumpleaños en ${city}`,
      metaTitle: `Tartas de cumpleaños en ${city} | Encarga con dedicatoria`,
      metaDescription: `Tartas de cumpleaños artesanales en ${city}: chocolate, queso, red velvet o personalizadas con nombre. Elige tamaño por número de invitados y encarga online.`,
      intro: [
        "Elegir la tarta de cumpleaños debería ser la parte fácil de organizar la fiesta. Por eso te indicamos en cada tarta cuántas raciones da cada tamaño y te dejamos añadir la dedicatoria y las velas en el mismo pedido.",
        `Las recogidas son en nuestro obrador de ${city} y, si lo prefieres, te la llevamos a casa dentro de nuestras zonas de reparto.`,
      ],
      categorySlug: "tartas-de-cumpleanos",
      highlights: [
        { title: "Tamaño según invitados", text: "Raciones orientativas en cada tamaño para no quedarte corto." },
        { title: "Dedicatoria incluida", text: "Escribimos el mensaje que quieras con chocolate." },
        { title: "Packs de cumpleaños", text: "Tarta, cupcakes y velas en un solo pedido." },
      ],
      ctaLabel: "Ver tartas de cumpleaños",
      ctaHref: "/categoria/tartas-de-cumpleanos",
      faqKeys: ["leadTime", "price", "delivery", "allergens", "pickup"],
    },
    {
      key: "encargar",
      slug: `encargar-tartas-${citySlug}`,
      label: `Encargar tartas en ${city}`,
      h1: `Encargar tartas en ${city}, paso a paso`,
      metaTitle: `Encargar tartas en ${city} | Pedido online en 3 minutos`,
      metaDescription: `Cómo encargar una tarta en ${city}: elige producto, día y hora, paga online o en tienda y sigue tu pedido. Plazos, zonas de entrega y horario de recogida.`,
      intro: [
        `Encargar una tarta en ${b.name} se hace en tres pasos: eliges el producto (o lo diseñas), seleccionas el día y la hora de recogida o entrega y confirmas tus datos. El calendario solo te muestra los huecos que de verdad tenemos libres.`,
        "Recibirás un email con el número de pedido y un enlace para consultar su estado en cualquier momento: pendiente, aceptado, en preparación, listo y entregado.",
      ],
      showBestsellers: true,
      highlights: [
        { title: "1. Elige", text: "Del catálogo o desde el personalizador de tartas." },
        { title: "2. Reserva", text: "Día y hora según la disponibilidad real del obrador." },
        { title: "3. Disfruta", text: "Recoge en tienda o recíbelo en casa." },
      ],
      ctaLabel: "Empezar mi pedido",
      ctaHref: "/productos",
      faqKeys: ["leadTime", "payment", "cancel", "pickup", "delivery"],
    },
    {
      key: "cupcakes",
      slug: `cupcakes-artesanales-${citySlug}`,
      label: `Cupcakes artesanales en ${city}`,
      h1: `Cupcakes artesanales en ${city}`,
      metaTitle: `Cupcakes artesanales en ${city} | Cajas y personalizados`,
      metaDescription: `Cupcakes artesanales en ${city} con buttercream de merengue suizo: cajas variadas para regalar y cupcakes personalizados para cumpleaños, bautizos y empresas.`,
      intro: [
        "Nuestros cupcakes se hornean por la mañana y se decoran con buttercream de merengue suizo, más ligera y menos dulce que la crema de mantequilla clásica.",
        "Tenemos cajas variadas listas para regalar y cupcakes personalizados con toppers para fiestas, eventos de empresa o mesas dulces.",
      ],
      categorySlug: "cupcakes",
      highlights: [
        { title: "Recién horneados", text: "Se preparan para el día de tu recogida." },
        { title: "Personalizables", text: "Colores, toppers y temática a juego con tu fiesta." },
        { title: "Para regalar", text: "Cajas con ventana y lazo, listas para entregar." },
      ],
      ctaLabel: "Ver cupcakes",
      ctaHref: "/categoria/cupcakes",
      faqKeys: ["leadTime", "custom", "allergens", "delivery"],
    },
  ];

  if (b.neighborhood) {
    list.push({
      key: "barrio",
      slug: `pasteleria-cerca-de-${slugify(b.neighborhood)}`,
      label: `Pastelería en ${b.neighborhood}`,
      h1: `Pastelería artesanal en ${b.neighborhood}`,
      metaTitle: `Pastelería cerca de ${b.neighborhood} (${city}) | ${b.name}`,
      metaDescription: `Pastelería artesanal en ${b.neighborhood}, ${city}: tartas, cupcakes y dulces por encargo. Dirección, horario, cómo llegar y recogida en tienda.`,
      intro: [
        `Estamos en ${b.street}, en pleno ${b.neighborhood}. Si vives o trabajas cerca, puedes encargar online y pasar a recoger tu pedido a la hora que elijas, sin esperas.`,
        b.howToGetThere,
      ],
      showBestsellers: true,
      highlights: [
        { title: "Recogida sin colas", text: "Tu pedido te espera listo a la hora reservada." },
        { title: "Encargos de última hora", text: "Algunos productos se pueden pedir con solo 24 h de antelación." },
        { title: "Trato cercano", text: "Somos un obrador de barrio: pregúntanos lo que necesites." },
      ],
      ctaLabel: "Cómo llegar",
      ctaHref: "/donde-estamos",
      faqKeys: ["pickup", "leadTime", "payment", "allergens"],
    });
  }
  return list;
}
