/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  VALORES INICIALES DEL NEGOCIO                                     ║
 * ║  Se cargan en la base de datos con `npm run db:seed` y después se  ║
 * ║  editan cómodamente desde el panel: /admin/ajustes                 ║
 * ║  El email y la razón social son de EJEMPLO: sustitúyelos.          ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
import type {
  BuilderSettings,
  BusinessSettings,
  MarketingSettings,
  NotificationSettings,
  OrderingSettings,
  SeoSettings,
} from "@/lib/settings-types";

export const DEFAULT_BUSINESS: BusinessSettings = {
  name: "Repostería Madre Mía",
  tagline: "Tartas y dulces artesanales hechos con cariño",
  description:
    "Repostería artesanal en el Mercado de Bailén (Málaga): tartas personalizadas, tartas de cumpleaños y de boda, cupcakes, galletas y postres hechos a mano con ingredientes de calidad.",
  legalName: "[Razón social o nombre del titular]",
  taxId: "",
  registryInfo: "",
  sanitaryRegistry: "",
  venue: "Mercado de Bailén, puestos 70-71",
  street: "Plaza de Bailén, 8",
  postalCode: "29009",
  city: "Málaga",
  province: "Málaga",
  neighborhood: "Bailén-Miraflores",
  // Coordenadas del Mercado de Bailén (comprobadas en una sola fuente: verifícalas en Google Maps)
  latitude: 36.7245674,
  longitude: -4.4322519,
  phone: "+34 631 364 968",
  whatsapp: "+34 631 364 968",
  email: "hola@tudominio.es",
  instagram: "",
  facebook: "",
  tiktok: "",
  googleBusinessUrl: "",
  googleReviewUrl: "",
  howToGetThere:
    "Estamos dentro del Mercado de Bailén, en los puestos 70-71. La entrada principal da a la Plaza de Bailén. Recoge tu pedido en el puesto a la hora que hayas elegido, dentro del horario del mercado.",
  heroImageUrl: "",
  heroImageAlt: "",
  storePhotos: [],
  foundedYear: null,
  priceRange: "€€",
  timezone: "Europe/Madrid",
};

export const DEFAULT_ORDERING: OrderingSettings = {
  onlineOrdersEnabled: true,
  closedMessage: "Ahora mismo no aceptamos pedidos online. Escríbenos por WhatsApp y te atendemos encantados.",
  minLeadHours: 24,
  maxAdvanceDays: 90,
  slotMinutes: 30,
  maxOrdersPerSlot: 4,
  maxOrdersPerDay: 25,
  pickupEnabled: true,
  // Solo recogida en el puesto del mercado (sin envío a domicilio)
  deliveryEnabled: false,
  deliveryInfo: "",
  payInStoreEnabled: true,
  cardPaymentEnabled: false,
  autoAcceptStandardOrders: false,
  cancellationSummary:
    "Pedidos estándar: cancelación gratuita hasta 48 h antes. Tartas personalizadas: cancelación gratuita hasta 72 h antes; después no es posible porque ya hemos comprado ingredientes y preparado la decoración.",
  allergenNotice:
    "Elaboramos en un obrador donde se manipulan gluten, huevo, lácteos, frutos de cáscara, soja y sésamo. Aunque extremamos las precauciones, no podemos garantizar la ausencia total de trazas.",
};

export const DEFAULT_MARKETING: MarketingSettings = {
  announcement: "Encarga online y elige día y hora · Recogida en el Mercado de Bailén, puestos 70-71",
  showDemoBanner: true,
  loyaltyEnabled: true,
  loyaltyStampEveryCents: 1000,
  loyaltyStampsForReward: 10,
  loyaltyRewardCents: 500,
  giftCardsEnabled: true,
  giftCardAmounts: [2000, 3000, 5000, 7500, 10000],
  giftCardValidityMonths: 12,
  abandonedCartEnabled: true,
  abandonedCartDelayHours: 3,
  remindersEnabled: true,
  reminderDaysBefore: 10,
};

export const DEFAULT_SEO: SeoSettings = {
  homeTitle: "",
  homeDescription: "",
  gaMeasurementId: "",
  googleSiteVerification: "",
};

export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  adminEmail: "",
  adminWhatsapp: "",
  whatsappNotifyAdmin: false,
};

export const DEFAULT_BUILDER: BuilderSettings = {
  enabled: true,
  intro:
    "Elige tamaño, sabores, colores y decoración. Verás un precio orientativo al momento. Para diseños muy elaborados, pide presupuesto y te respondemos en menos de 24 h laborables.",
  leadTimeHours: 72,
  celebrations: ["Cumpleaños", "Boda", "Aniversario", "Bautizo", "Comunión", "Baby shower", "Graduación", "Empresa", "Otra"],
  sizes: [
    { id: "s15", label: "Ø 15 cm", servings: "6-8 personas", priceCents: 3200 },
    { id: "s18", label: "Ø 18 cm", servings: "10-12 personas", priceCents: 4200 },
    { id: "s22", label: "Ø 22 cm", servings: "15-18 personas", priceCents: 5600 },
    { id: "s26", label: "Ø 26 cm", servings: "22-25 personas", priceCents: 7200 },
    { id: "t2", label: "Dos pisos", servings: "30-35 personas", priceCents: 11500 },
  ],
  sponges: [
    { id: "vainilla", label: "Vainilla", priceDeltaCents: 0 },
    { id: "chocolate", label: "Chocolate", priceDeltaCents: 0 },
    { id: "red-velvet", label: "Red velvet", priceDeltaCents: 300 },
    { id: "zanahoria", label: "Zanahoria y nuez", priceDeltaCents: 300 },
    { id: "limon", label: "Limón", priceDeltaCents: 0 },
  ],
  fillings: [
    { id: "nata-fresa", label: "Nata y fresa natural", priceDeltaCents: 0 },
    { id: "trufa", label: "Trufa de chocolate", priceDeltaCents: 0 },
    { id: "queso", label: "Crema de queso", priceDeltaCents: 200 },
    { id: "dulce-leche", label: "Dulce de leche", priceDeltaCents: 200 },
    { id: "pistacho", label: "Crema de pistacho", priceDeltaCents: 500 },
    { id: "frutos-rojos", label: "Mermelada casera de frutos rojos", priceDeltaCents: 200 },
  ],
  coverings: [
    { id: "buttercream", label: "Buttercream suave", priceDeltaCents: 0 },
    { id: "ganache", label: "Ganache de chocolate", priceDeltaCents: 300 },
    { id: "fondant", label: "Fondant", priceDeltaCents: 800 },
    { id: "naked", label: "Semidesnuda (naked)", priceDeltaCents: 0 },
  ],
  colors: [
    { id: "blanco", label: "Blanco roto", priceDeltaCents: 0, hex: "#FBF7F0" },
    { id: "rosa", label: "Rosa empolvado", priceDeltaCents: 0, hex: "#EDBCC5" },
    { id: "melocoton", label: "Melocotón", priceDeltaCents: 0, hex: "#F6C7A6" },
    { id: "lavanda", label: "Lavanda", priceDeltaCents: 0, hex: "#CDBFE3" },
    { id: "menta", label: "Verde menta", priceDeltaCents: 0, hex: "#BFE3D0" },
    { id: "celeste", label: "Azul cielo", priceDeltaCents: 0, hex: "#BCD8EE" },
    { id: "amarillo", label: "Amarillo vainilla", priceDeltaCents: 0, hex: "#F7E3A1" },
    { id: "chocolate", label: "Chocolate", priceDeltaCents: 0, hex: "#6B4A3A" },
    { id: "dorado", label: "Detalles dorados", priceDeltaCents: 300, hex: "#C9A45C" },
  ],
  maxColors: 3,
  decorations: [
    { id: "flores-naturales", label: "Flores naturales comestibles", priceDeltaCents: 900 },
    { id: "frutas", label: "Fruta fresca de temporada", priceDeltaCents: 500 },
    { id: "drip", label: "Goteo (drip) de chocolate", priceDeltaCents: 400 },
    { id: "macarons", label: "Macarons y merengues", priceDeltaCents: 700 },
    { id: "topper", label: "Topper personalizado", priceDeltaCents: 600 },
    { id: "foto", label: "Foto impresa en papel de azúcar", priceDeltaCents: 800 },
    { id: "figuras", label: "Figuras modeladas a mano", priceDeltaCents: 0, requiresQuote: true },
    { id: "tematica", label: "Diseño temático complejo", priceDeltaCents: 0, requiresQuote: true },
  ],
  textPriceCents: 0,
  textMaxLength: 40,
  photoReferenceEnabled: true,
};
