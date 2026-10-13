/**
 * Cifra los datos personales existentes, rota claves y recalcula índices ciegos.
 *
 *   npm run db:encrypt          → cifra lo que esté en claro y re-cifra con la clave activa
 *   npm run db:encrypt -- --check  → solo comprueba; sale con código 1 si queda algo pendiente
 *
 * Es idempotente y se puede interrumpir y relanzar. Úsalo:
 *  - justo después de aplicar la migración `seguridad` (datos anteriores en claro),
 *  - al rotar DATA_ENCRYPTION_ACTIVE_KEY (añade la clave nueva, actívala, ejecuta esto y después
 *    retira la antigua de DATA_ENCRYPTION_KEYS),
 *  - al rotar DATA_HASH_KEY (recalcula todos los índices ciegos).
 */
import { PrismaClient } from "@prisma/client";
import { readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { activeKeyId, blindIndex, decrypt, decryptBuffer, encrypt, encryptBuffer, isEncrypted, isEncryptedBuffer, needsReencryption } from "../src/lib/crypto";
import { BLIND_INDEXES, ENCRYPTED_FIELDS } from "../src/lib/db";

type Row = Record<string, unknown> & { id: string };
type Delegate = {
  findMany(args: object): Promise<Row[]>;
  update(args: object): Promise<unknown>;
};

const prisma = new PrismaClient();
const checkOnly = process.argv.includes("--check");
const BATCH = 200;

const TARGETS: Record<string, readonly string[]> = { ...ENCRYPTED_FIELDS, AdminUser: ["totpSecret"] };

async function processModel(model: string, fields: readonly string[]) {
  const delegate = (prisma as unknown as Record<string, Delegate>)[model[0].toLowerCase() + model.slice(1)];
  const blind = BLIND_INDEXES[model] ?? {};
  const select: Record<string, true> = { id: true };
  for (const f of fields) select[f] = true;
  for (const spec of Object.values(blind)) select[spec.hash] = true;

  let cursor: string | undefined;
  let scanned = 0;
  let pending = 0;
  let unreadable = 0;
  for (;;) {
    const rows = await delegate.findMany({ select, take: BATCH, orderBy: { id: "asc" }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    if (rows.length === 0) break;
    for (const row of rows) {
      scanned++;
      const data: Record<string, unknown> = {};
      for (const field of fields) {
        const value = row[field];
        const spec = blind[field];
        if (typeof value !== "string" || value === "") {
          if (spec && row[spec.hash] !== null && value == null) data[spec.hash] = null;
          continue;
        }
        let plain: string;
        try {
          plain = decrypt(value, `${model}.${field}`);
        } catch {
          unreadable++;
          console.error(`  ✗ ${model} ${row.id}: ${field} no se puede descifrar (¿falta una clave antigua?)`);
          continue;
        }
        if (!isEncrypted(value) || needsReencryption(value)) data[field] = encrypt(plain, `${model}.${field}`);
        if (spec) {
          const hash = blindIndex(spec.kind, plain);
          if (row[spec.hash] !== hash) data[spec.hash] = hash;
        }
      }
      if (Object.keys(data).length > 0) {
        pending++;
        if (!checkOnly) await delegate.update({ where: { id: row.id }, data });
      }
    }
    cursor = rows.at(-1)!.id;
  }
  const verb = checkOnly ? "pendientes" : "actualizados";
  console.log(`${model.padEnd(20)} ${String(scanned).padStart(6)} registros · ${pending} ${verb}${unreadable ? ` · ${unreadable} ilegibles` : ""}`);
  return { pending, unreadable };
}

/** Fotos privadas en disco (STORAGE_DRIVER=local): cifra las antiguas y re-cifra al rotar la clave. */
async function processPrivateFiles(): Promise<{ pending: number; unreadable: number }> {
  if (process.env.STORAGE_DRIVER === "supabase") {
    console.log("Fotos privadas         en Supabase Storage: las nuevas se suben cifradas; las anteriores a esta versión siguen en claro hasta que caduquen (90-150 días) o se vuelvan a subir.");
    return { pending: 0, unreadable: 0 };
  }
  if (process.env.STORAGE_DRIVER === "database") return processPrivateRows();
  const root = path.resolve(process.env.UPLOAD_DIR || "./uploads", "private");
  const files: string[] = [];
  const walk = async (dir: string) => {
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.name.endsWith(".webp")) files.push(full);
    }
  };
  await walk(path.join(root, "references"));
  let pending = 0;
  let unreadable = 0;
  const active = activeKeyId();
  for (const file of files) {
    const key = path.relative(root, file).split(path.sep).join("/");
    const data = await readFile(file);
    const kid = isEncryptedBuffer(data) ? data.subarray(9, 9 + data[8]).toString("utf8") : null;
    if (kid === active) continue;
    pending++;
    if (checkOnly) continue;
    try {
      const sealed = encryptBuffer(decryptBuffer(data, `media:${key}`), `media:${key}`);
      await writeFile(`${file}.tmp`, sealed, { mode: 0o600 });
      await rename(`${file}.tmp`, file);
    } catch {
      unreadable++;
    }
  }
  console.log(`${"Fotos privadas".padEnd(20)} ${String(files.length).padStart(6)} archivos · ${pending} ${checkOnly ? "pendientes" : "cifrados"}${unreadable ? ` · ${unreadable} ilegibles` : ""}`);
  return { pending: checkOnly ? pending : 0, unreadable };
}

/** Fotos privadas en la base de datos (STORAGE_DRIVER=database): re-cifra al rotar la clave. */
async function processPrivateRows(): Promise<{ pending: number; unreadable: number }> {
  const active = activeKeyId();
  let scanned = 0;
  let pending = 0;
  let unreadable = 0;
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.storedFile.findMany({
      where: { key: { startsWith: "private/references/" } },
      take: 20,
      orderBy: { key: "asc" },
      ...(cursor ? { cursor: { key: cursor }, skip: 1 } : {}),
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      scanned++;
      const data = Buffer.from(row.data);
      const kid = isEncryptedBuffer(data) ? data.subarray(9, 9 + data[8]).toString("utf8") : null;
      if (kid === active) continue;
      pending++;
      if (checkOnly) continue;
      const key = row.key.slice("private/".length);
      try {
        const sealed = encryptBuffer(decryptBuffer(data, `media:${key}`), `media:${key}`);
        await prisma.storedFile.update({ where: { key: row.key }, data: { data: new Uint8Array(sealed), size: sealed.length } });
      } catch {
        unreadable++;
      }
    }
    cursor = rows.at(-1)!.key;
  }
  console.log(`${"Fotos privadas".padEnd(20)} ${String(scanned).padStart(6)} archivos · ${pending} ${checkOnly ? "pendientes" : "cifrados"}${unreadable ? ` · ${unreadable} ilegibles` : ""}`);
  return { pending: checkOnly ? pending : 0, unreadable };
}

async function main() {
  console.log(checkOnly ? "Comprobando cifrado de datos personales…" : "Cifrando datos personales…");
  let pending = 0;
  let unreadable = 0;
  for (const [model, fields] of Object.entries(TARGETS)) {
    const r = await processModel(model, fields);
    pending += r.pending;
    unreadable += r.unreadable;
  }
  const f = await processPrivateFiles();
  pending += f.pending;
  unreadable += f.unreadable;
  if (checkOnly && pending > 0) {
    console.error(`\n✗ Hay ${pending} registros sin cifrar con la clave activa o con índices desactualizados. Ejecuta npm run db:encrypt`);
    process.exitCode = 1;
  } else if (unreadable > 0) {
    console.error(`\n✗ ${unreadable} valores no se pudieron descifrar.`);
    process.exitCode = 1;
  } else {
    console.log("\n✓ Todos los datos personales están cifrados con la clave activa.");
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
