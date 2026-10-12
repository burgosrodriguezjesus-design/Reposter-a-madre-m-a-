/**
 * Carga inicial de datos: `npm run db:seed`
 *  - Crea el usuario administrador (ADMIN_EMAIL / ADMIN_PASSWORD) si no existe.
 *  - Guarda los ajustes por defecto (sin sobrescribir los que ya hayas cambiado).
 *  - Crea el horario de apertura si está vacío.
 *  - Crea el catálogo de DEMOSTRACIÓN (desactívalo con SEED_DEMO=false).
 * Se puede ejecutar varias veces sin duplicar datos.
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { hashPassword, passwordProblem } from "../src/lib/password";
import {
  DEFAULT_BUILDER,
  DEFAULT_BUSINESS,
  DEFAULT_MARKETING,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_ORDERING,
  DEFAULT_SEO,
} from "../src/config/defaults";
import { DEFAULT_OPENING_HOURS, DEMO_CATEGORIES, DEMO_PRODUCTS, DEMO_PROMOTIONS, DEMO_REVIEWS, DEMO_ZONES } from "./demo-data";

const db = new PrismaClient();

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn("⚠️  ADMIN_EMAIL / ADMIN_PASSWORD no definidos: no se crea el usuario administrador.");
    return;
  }
  const problem = passwordProblem(password, { email });
  if (problem) throw new Error(`ADMIN_PASSWORD no es válida: ${problem}`);
  const exists = await db.adminUser.findUnique({ where: { email } });
  if (exists) {
    console.log(`✔ Administrador ${email} ya existe (no se cambia su contraseña)`);
    return;
  }
  await db.adminUser.create({
    data: { email, name: "Administración", role: "OWNER", passwordHash: await hashPassword(password) },
  });
  console.log(`✔ Propietario creado: ${email} (en el primer acceso deberá activar la verificación en dos pasos)`);
}

async function seedSettings() {
  const defaults: Record<string, unknown> = {
    business: DEFAULT_BUSINESS,
    ordering: DEFAULT_ORDERING,
    marketing: DEFAULT_MARKETING,
    seo: DEFAULT_SEO,
    notifications: { ...DEFAULT_NOTIFICATIONS, adminEmail: process.env.ADMIN_EMAIL ?? "" },
    builder: DEFAULT_BUILDER,
  };
  for (const [key, value] of Object.entries(defaults)) {
    await db.setting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue },
      update: {},
    });
  }
  if ((await db.openingHour.count()) === 0) {
    await db.openingHour.createMany({ data: DEFAULT_OPENING_HOURS });
  }
  console.log("✔ Ajustes y horario");
}

async function seedDemo() {
  const categoryIds = new Map<string, string>();
  for (const [i, c] of DEMO_CATEGORIES.entries()) {
    const category = await db.category.upsert({
      where: { slug: c.slug },
      create: {
        slug: c.slug,
        name: c.name,
        description: c.description,
        content: c.content,
        imageUrl: c.image,
        sortOrder: i,
        isDemo: true,
      },
      update: {},
    });
    categoryIds.set(c.slug, category.id);
  }

  for (const [i, p] of DEMO_PRODUCTS.entries()) {
    const exists = await db.product.findUnique({ where: { slug: p.slug } });
    if (exists) continue;
    await db.product.create({
      data: {
        slug: p.slug,
        name: p.name,
        categoryId: categoryIds.get(p.category)!,
        shortDescription: p.short,
        description: p.description,
        priceCents: p.price,
        ingredients: p.ingredients,
        allergens: p.allergens,
        mayContain: p.mayContain ?? [],
        occasions: p.occasions,
        optionGroups: (p.options ?? []).map((g) => ({
          id: g.id,
          name: g.name,
          required: !!g.required,
          multiple: !!g.multiple,
          choices: g.choices.map((c) => ({ id: c.id, label: c.label, priceDeltaCents: c.delta ?? 0 })),
        })),
        allowDedication: !!p.dedication,
        allowReferencePhoto: !!p.referencePhoto,
        availability: p.availability ?? "AVAILABLE",
        leadTimeHours: p.leadTimeHours ?? 24,
        maxPerOrder: p.maxPerOrder ?? 10,
        featured: !!p.featured,
        isNew: !!p.isNew,
        popularityBoost: p.boost ?? 0,
        sortOrder: i,
        isDemo: true,
        images: { create: [{ url: p.image, alt: p.imageAlt, width: 800, height: 800 }] },
        variants: {
          create: (p.variants ?? []).map((v, idx) => ({
            name: v.name,
            servings: v.servings ?? null,
            priceCents: v.price,
            sortOrder: idx,
          })),
        },
      },
    });
  }

  for (const [i, z] of DEMO_ZONES.entries()) {
    await db.deliveryZone.upsert({
      where: { slug: z.slug },
      create: {
        slug: z.slug,
        name: z.name,
        postalCodes: z.postalCodes,
        feeCents: z.fee,
        minOrderCents: z.minOrder,
        freeFromCents: z.freeFrom,
        description: z.description,
        sortOrder: i,
        isDemo: true,
      },
      update: {},
    });
  }

  await db.coupon.upsert({
    where: { code: "BIENVENIDA10" },
    create: {
      code: "BIENVENIDA10",
      description: "10 % de descuento en el primer pedido online (demo)",
      type: "PERCENT",
      value: 10,
      minOrderCents: 2500,
      isDemo: true,
    },
    update: {},
  });

  if ((await db.promotion.count({ where: { isDemo: true } })) === 0) {
    await db.promotion.createMany({
      data: DEMO_PROMOTIONS.map((p, i) => ({ ...p, sortOrder: i, isDemo: true })),
    });
  }

  if ((await db.review.count({ where: { isDemo: true } })) === 0) {
    await db.review.createMany({
      data: DEMO_REVIEWS.map((r) => ({ ...r, status: "APPROVED" as const, isDemo: true })),
    });
  }

  console.log(`✔ Catálogo de demostración: ${DEMO_CATEGORIES.length} categorías, ${DEMO_PRODUCTS.length} productos`);
}

async function main() {
  await seedAdmin();
  await seedSettings();
  if (process.env.SEED_DEMO !== "false") await seedDemo();
  else console.log("· SEED_DEMO=false: no se crea el catálogo de demostración");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
