import { Prisma, PrismaClient } from "@prisma/client";
import { blindIndex, decrypt, encrypt } from "@/lib/crypto";

/**
 * Cliente de base de datos con cifrado transparente de datos personales.
 *
 * - Al escribir, las columnas de `ENCRYPTED_FIELDS` se cifran con AES-256-GCM y se calculan sus
 *   índices ciegos (`BLIND_INDEXES`), también en escrituras anidadas.
 * - Al leer, se descifran (también en relaciones incluidas).
 * - Los filtros de igualdad sobre email o teléfono se traducen a su índice ciego. Cualquier otro
 *   filtro u ordenación sobre una columna cifrada lanza un error (sería incorrecto en silencio).
 *
 * Las consultas SQL en bruto ($queryRaw) NO pasan por aquí: no deben leer columnas cifradas.
 */
export const ENCRYPTED_FIELDS: Record<string, readonly string[]> = {
  Order: ["customerName", "customerEmail", "customerPhone", "address", "notes"],
  OrderItem: ["dedication"],
  QuoteRequest: ["customerName", "customerEmail", "customerPhone", "notes"],
  Customer: ["email", "name", "phone"],
  CelebrationReminder: ["label"],
  AbandonedCart: ["email", "name", "cart"],
  GiftCard: ["purchaserName", "purchaserEmail", "recipientName", "recipientEmail", "message"],
  DataRequest: ["email", "details"],
};

type BlindSpec = { hash: string; kind: "email" | "phone" };
export const BLIND_INDEXES: Record<string, Record<string, BlindSpec>> = {
  Order: { customerEmail: { hash: "customerEmailHash", kind: "email" }, customerPhone: { hash: "customerPhoneHash", kind: "phone" } },
  QuoteRequest: { customerEmail: { hash: "customerEmailHash", kind: "email" } },
  Customer: { email: { hash: "emailHash", kind: "email" } },
  AbandonedCart: { email: { hash: "emailHash", kind: "email" } },
  GiftCard: { purchaserEmail: { hash: "purchaserEmailHash", kind: "email" }, recipientEmail: { hash: "recipientEmailHash", kind: "email" } },
  DataRequest: { email: { hash: "emailHash", kind: "email" } },
};

/** Relaciones de cada modelo: campo → modelo relacionado (del esquema de Prisma). */
const RELATIONS: Record<string, Record<string, string>> = Object.fromEntries(
  Prisma.dmmf.datamodel.models.map((m) => [m.name, Object.fromEntries(m.fields.filter((f) => f.kind === "object").map((f) => [f.name, f.type]))]),
);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date) && !Buffer.isBuffer(v);
const each = (v: unknown, fn: (o: Obj) => void) => (Array.isArray(v) ? v.forEach((x) => isObj(x) && fn(x)) : isObj(v) && fn(v));

export class EncryptedFieldQueryError extends Error {}

// ───────────── Escritura ─────────────

function encryptData(model: string, data: Obj) {
  const fields = ENCRYPTED_FIELDS[model] ?? [];
  const blind = BLIND_INDEXES[model] ?? {};
  for (const [key, raw] of Object.entries(data)) {
    if (fields.includes(key)) {
      const isSet = isObj(raw) && "set" in raw;
      const value = isSet ? (raw as Obj).set : raw;
      if (value === undefined) continue;
      const spec = blind[key];
      if (spec) data[spec.hash] = typeof value === "string" ? (value ? blindIndex(spec.kind, value) : "") : null;
      if (typeof value === "string" && value !== "") {
        const enc = encrypt(value, `${model}.${key}`);
        data[key] = isSet ? { set: enc } : enc;
      }
      continue;
    }
    const related = RELATIONS[model]?.[key];
    if (related && isObj(raw)) encryptNested(related, raw);
  }
}

function encryptNested(model: string, ops: Obj) {
  each(ops.create, (d) => encryptData(model, d));
  if (isObj(ops.createMany)) each(ops.createMany.data, (d) => encryptData(model, d));
  each(ops.connectOrCreate, (c) => isObj(c.create) && encryptData(model, c.create));
  each(ops.update, (u) => encryptData(model, isObj(u.data) ? u.data : u));
  each(ops.updateMany, (u) => isObj(u.data) && encryptData(model, u.data));
  each(ops.upsert, (u) => {
    if (isObj(u.create)) encryptData(model, u.create);
    if (isObj(u.update)) encryptData(model, u.update);
  });
}

// ───────────── Filtros ─────────────

function translateFilter(model: string, key: string, value: unknown): [string, unknown] {
  const spec = BLIND_INDEXES[model]?.[key];
  const h = (v: unknown) => {
    if (typeof v !== "string") throw new EncryptedFieldQueryError(`Filtro no válido sobre ${model}.${key}`);
    return blindIndex(spec!.kind, v);
  };
  if (spec) {
    if (typeof value === "string") return [spec.hash, h(value)];
    if (isObj(value)) {
      const keys = Object.keys(value);
      if (keys.length === 1 && keys[0] === "equals") return [spec.hash, { equals: h(value.equals) }];
      if (keys.length === 1 && keys[0] === "in" && Array.isArray(value.in)) return [spec.hash, { in: value.in.map(h) }];
      if (keys.length === 1 && keys[0] === "not" && typeof value.not === "string") return [spec.hash, { not: h(value.not) }];
    }
  }
  throw new EncryptedFieldQueryError(
    `${model}.${key} está cifrado: solo se puede buscar por igualdad${spec ? "" : " en campos con índice ciego"}.`,
  );
}

function translateWhere(model: string, where: unknown): unknown {
  if (Array.isArray(where)) return where.map((w) => translateWhere(model, w));
  if (!isObj(where)) return where;
  const out: Obj = {};
  for (const [key, value] of Object.entries(where)) {
    if (key === "AND" || key === "OR" || key === "NOT") {
      out[key] = translateWhere(model, value);
    } else if (ENCRYPTED_FIELDS[model]?.includes(key)) {
      if (value === undefined) continue;
      const [k, v] = translateFilter(model, key, value);
      out[k] = v;
    } else if (RELATIONS[model]?.[key] && isObj(value)) {
      const related = RELATIONS[model][key];
      const ops = ["is", "isNot", "some", "every", "none"];
      out[key] = Object.keys(value).some((k) => ops.includes(k))
        ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, ops.includes(k) ? translateWhere(related, v) : v]))
        : translateWhere(related, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function assertNoEncryptedOrder(model: string, orderBy: unknown) {
  each(orderBy, (o) => {
    for (const key of Object.keys(o)) {
      if (ENCRYPTED_FIELDS[model]?.includes(key)) throw new EncryptedFieldQueryError(`No se puede ordenar por ${model}.${key} (cifrado)`);
    }
  });
}

// ───────────── Lectura ─────────────

export function decryptResult(model: string, value: unknown): unknown {
  if (Array.isArray(value)) {
    for (const v of value) decryptResult(model, v);
    return value;
  }
  if (!isObj(value)) return value;
  const fields = ENCRYPTED_FIELDS[model];
  const relations = RELATIONS[model] ?? {};
  for (const [key, v] of Object.entries(value)) {
    if (fields?.includes(key) && typeof v === "string") {
      try {
        value[key] = decrypt(v, `${model}.${key}`);
      } catch {
        // Dato manipulado o clave retirada: nunca se muestra el cifrado ni se detiene la página entera.
        console.error(`[crypto] no se pudo descifrar ${model}.${key}`);
        value[key] = "[dato ilegible]";
      }
    } else if (relations[key] && v && typeof v === "object") {
      decryptResult(relations[key], v);
    }
  }
  return value;
}

const WRITE_OPS = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert"]);

function createClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  return base.$extends({
    name: "cifrado-datos-personales",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const a = (args ?? {}) as Obj;
          if (WRITE_OPS.has(operation)) {
            if (operation === "upsert") {
              if (isObj(a.create)) encryptData(model, a.create);
              if (isObj(a.update)) encryptData(model, a.update);
            } else {
              each(a.data, (d) => encryptData(model, d));
            }
          }
          if ("where" in a) a.where = translateWhere(model, a.where);
          if ("orderBy" in a) assertNoEncryptedOrder(model, a.orderBy);
          const result = await query(a as typeof args);
          return decryptResult(model, result) as typeof result;
        },
      },
    },
  });
}

export type Db = ReturnType<typeof createClient>;
/** Cliente dentro de `db.$transaction(async (tx) => ...)` */
export type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];

// Reutiliza una única instancia en desarrollo (hot reload) y en cada función serverless.
const globalForPrisma = globalThis as unknown as { prisma?: Db };

export const db: Db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
