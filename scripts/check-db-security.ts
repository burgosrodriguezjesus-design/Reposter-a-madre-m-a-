/**
 * Comprueba la configuración de seguridad de la base de datos con la conexión de la APP
 * (DATABASE_URL): `npm run db:check-security`. Sale con código 1 si algo crítico falla.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
type Check = { name: string; ok: boolean; critical: boolean; detail?: string };
const checks: Check[] = [];
const add = (name: string, ok: boolean, critical = true, detail?: string) => checks.push({ name, ok, critical, detail });

async function denied(sql: string, setup?: string): Promise<boolean> {
  try {
    await db.$transaction(async (tx) => {
      if (setup) await tx.$executeRawUnsafe(setup);
      await tx.$executeRawUnsafe(sql);
      throw new Error("__rollback__");
    });
    return false;
  } catch (e) {
    return !(e instanceof Error && e.message === "__rollback__");
  }
}

async function main() {
  const [me] = await db.$queryRaw<{ user: string; superuser: boolean; bypass: boolean }[]>`
    SELECT current_user AS "user", rolsuper AS superuser, rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user`;
  add(`La app no se conecta como superusuario (${me.user})`, !me.superuser);
  add("El rol de la app no salta RLS", !me.bypass, false);

  const owned = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user`;
  add("La app no es dueña de las tablas (no puede cambiar el esquema)", Number(owned[0].n) === 0, false, `${owned[0].n} tablas propias`);

  const noRls = await db.$queryRaw<{ relname: string }[]>`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`;
  add("RLS activado en todas las tablas", noRls.length === 0, false, noRls.map((r) => r.relname).join(", "));

  const triggers = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_trigger WHERE tgname IN ('AuditLog_no_update_delete', 'AuditLog_no_truncate')`;
  add("Auditoría protegida por triggers (solo inserción)", Number(triggers[0].n) === 2);

  const checksDb = await db.$queryRaw<{ conname: string }[]>`SELECT conname FROM pg_constraint WHERE contype = 'c' AND conname IN ('Product_stock_nonnegative','GiftCard_balance_valid','Coupon_redemptions_valid','Order_amounts_valid','OrderItem_values_valid')`;
  add("Restricciones de integridad (stock, saldos, importes)", checksDb.length === 5, true, `${checksDb.length}/5`);

  // Se inserta una entrada de prueba dentro de la transacción (se deshace siempre) y se intenta alterarla
  const probe = `INSERT INTO "AuditLog" (id, action, "prevHash", hash) VALUES ('__probe__', 'probe', 'x', 'x')`;
  add("No se puede modificar la auditoría", await denied(`UPDATE "AuditLog" SET action = 'x' WHERE id = '__probe__'`, probe));
  add("No se pueden borrar entradas recientes de auditoría", await denied(`DELETE FROM "AuditLog" WHERE id = '__probe__'`, probe));
  add("No se puede vaciar la auditoría", await denied(`TRUNCATE "AuditLog"`));
  add("No se puede crear tablas (sin DDL)", await denied(`CREATE TABLE public.__probe (id int)`), false);
  add("No se puede dejar stock negativo", await denied(`UPDATE "Product" SET stock = -1 WHERE id = (SELECT id FROM "Product" LIMIT 1)`));

  const anon = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM information_schema.role_table_grants WHERE table_schema = 'public' AND grantee IN ('anon','authenticated','PUBLIC')`;
  add("Sin privilegios para roles públicos (anon/authenticated/PUBLIC)", Number(anon[0].n) === 0, true, `${anon[0].n} permisos`);

  const [ssl] = await db.$queryRaw<{ ssl: boolean | null }[]>`SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()`;
  add("Conexión cifrada con la base de datos (TLS)", !!ssl?.ssl, false);

  const plain = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "Order" WHERE "customerEmail" <> '' AND "customerEmail" NOT LIKE 'enc:v1:%'`;
  add("Datos personales de pedidos cifrados", Number(plain[0].n) === 0, true, `${plain[0].n} sin cifrar`);

  let failed = false;
  for (const c of checks) {
    const mark = c.ok ? "✓" : c.critical ? "✗" : "!";
    if (!c.ok && c.critical) failed = true;
    console.log(`${mark} ${c.name}${c.detail && !c.ok ? ` (${c.detail})` : ""}`);
  }
  console.log(failed ? "\nHay fallos críticos." : "\nSin fallos críticos (los avisos «!» dependen del entorno).");
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
