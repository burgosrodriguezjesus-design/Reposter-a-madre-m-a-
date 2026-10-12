import { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { getAvailabilityCalendar } from "@/lib/schedule";
import type { CreateOrderInput } from "@/lib/validation";

if (!/_test\b|test/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Las pruebas de integración solo se ejecutan contra una base de datos cuyo nombre contenga «test»");
}

/** Conexión como dueño (para simular a un atacante con acceso directo a la BD). */
export const owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

export async function openSlot(leadHours = 24, skip = 0): Promise<{ date: string; time: string }> {
  const { days } = await getAvailabilityCalendar(leadHours, 30);
  const free = days.filter((d) => d.status === "open").flatMap((d) => d.slots.filter((s) => s.available).map((s) => ({ date: d.date, time: s.time })));
  if (!free[skip]) throw new Error("No hay huecos libres en el calendario de pruebas");
  return free[skip];
}

export async function makeProduct(stock: number | null, priceCents = 1500) {
  const category = await db.category.findFirstOrThrow();
  return db.product.create({
    data: {
      slug: `prueba-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: "Producto de prueba",
      categoryId: category.id,
      priceCents,
      stock,
      leadTimeHours: 0,
      maxPerOrder: 50,
      allergens: [],
      mayContain: [],
      occasions: [],
    },
  });
}

export function orderInput(productId: string, slot: { date: string; time: string }, i = 0, quantity = 1): CreateOrderInput {
  return {
    items: [{ kind: "product", productId, quantity, options: {} }],
    fulfillment: "PICKUP",
    date: slot.date,
    time: slot.time,
    customer: { name: `Cliente ${i}`, email: `cliente${i}@example.com`, phone: "600000000" },
    paymentMethod: "IN_STORE",
    acceptTerms: true,
    marketingConsent: false,
  } as CreateOrderInput;
}
