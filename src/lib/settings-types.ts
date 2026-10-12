export type Photo = { url: string; alt: string };

export type BusinessSettings = {
  name: string;
  tagline: string;
  description: string;
  legalName: string;
  taxId: string;
  registryInfo: string;
  sanitaryRegistry: string;
  street: string;
  postalCode: string;
  city: string;
  province: string;
  neighborhood: string;
  latitude: number | null;
  longitude: number | null;
  phone: string;
  whatsapp: string;
  email: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  /** Enlace a tu Perfil de Empresa de Google (Google Maps) */
  googleBusinessUrl: string;
  /** Enlace directo para dejar reseña en Google */
  googleReviewUrl: string;
  howToGetThere: string;
  heroImageUrl: string;
  heroImageAlt: string;
  storePhotos: Photo[];
  foundedYear: number | null;
  priceRange: string;
  timezone: string;
};

export type OrderingSettings = {
  onlineOrdersEnabled: boolean;
  closedMessage: string;
  minLeadHours: number;
  maxAdvanceDays: number;
  slotMinutes: number;
  maxOrdersPerSlot: number;
  maxOrdersPerDay: number;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  deliveryInfo: string;
  payInStoreEnabled: boolean;
  cardPaymentEnabled: boolean;
  autoAcceptStandardOrders: boolean;
  cancellationSummary: string;
  allergenNotice: string;
};

export type MarketingSettings = {
  announcement: string;
  showDemoBanner: boolean;
  loyaltyEnabled: boolean;
  loyaltyStampEveryCents: number;
  loyaltyStampsForReward: number;
  loyaltyRewardCents: number;
  giftCardsEnabled: boolean;
  giftCardAmounts: number[];
  giftCardValidityMonths: number;
  abandonedCartEnabled: boolean;
  abandonedCartDelayHours: number;
  remindersEnabled: boolean;
  reminderDaysBefore: number;
};

export type SeoSettings = {
  homeTitle: string;
  homeDescription: string;
  gaMeasurementId: string;
  googleSiteVerification: string;
};

export type NotificationSettings = {
  adminEmail: string;
  adminWhatsapp: string;
  whatsappNotifyAdmin: boolean;
};

export type BuilderOption = {
  id: string;
  label: string;
  priceDeltaCents: number;
  requiresQuote?: boolean;
  hex?: string;
};

export type BuilderSize = { id: string; label: string; servings: string; priceCents: number };

export type BuilderSettings = {
  enabled: boolean;
  intro: string;
  leadTimeHours: number;
  celebrations: string[];
  sizes: BuilderSize[];
  sponges: BuilderOption[];
  fillings: BuilderOption[];
  coverings: BuilderOption[];
  colors: BuilderOption[];
  maxColors: number;
  decorations: BuilderOption[];
  textPriceCents: number;
  textMaxLength: number;
  photoReferenceEnabled: boolean;
};

export type AllSettings = {
  business: BusinessSettings;
  ordering: OrderingSettings;
  marketing: MarketingSettings;
  seo: SeoSettings;
  notifications: NotificationSettings;
  builder: BuilderSettings;
};

export type SettingsKey = keyof AllSettings;
