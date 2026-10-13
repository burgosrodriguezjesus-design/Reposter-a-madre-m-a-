/* eslint-disable -- casos de prueba de Semgrep: código vulnerable a propósito, no se ejecuta */
// Casos de prueba de .semgrep/rules.yml: `semgrep --test .semgrep/`
// Nota: la regla admin-server-action-without-authz solo se aplica a src/app/admin/**; para
// probarla, copia este archivo bajo esa ruta (semgrep --test respeta "paths").
// (este archivo no se compila: tsconfig solo incluye src/ y el CI lo excluye del escaneo)
"use server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";

declare const db: any, tx: any, requirePermission: any, requireAdmin: any, req: any, el: any, formData: FormData;

async function sqlCases(id: string) {
  // ruleid: reposteria.prisma-raw-unsafe
  await db.$queryRawUnsafe(`SELECT * FROM "Order" WHERE id = '${id}'`);
  // ruleid: reposteria.prisma-raw-unsafe
  await tx.$executeRawUnsafe("DELETE FROM x WHERE id = " + id);
  // ok: reposteria.prisma-raw-unsafe
  await tx.$executeRawUnsafe(`ALTER TABLE "AuditLog" ENABLE TRIGGER "AuditLog_no_update_delete"`);
  // ok: reposteria.prisma-raw-unsafe
  await db.$queryRaw`SELECT * FROM "Order" WHERE id = ${id}`;
}

// ruleid: reposteria.admin-server-action-without-authz
export async function deleteEverything(formData: FormData) {
  await db.product.deleteMany({ where: { id: String(formData.get("id")) } });
}

// ok: reposteria.admin-server-action-without-authz
export async function deleteProduct(formData: FormData) {
  const admin = await requirePermission("catalog.write");
  await db.product.delete({ where: { id: String(formData.get("id")) }, admin });
}

// ok: reposteria.admin-server-action-without-authz
export async function revokeSessions() {
  await requireAdmin();
  await db.session.deleteMany({});
}

async function logging(customer: { email: string; phone: string }, email: string) {
  // ruleid: reposteria.console-log-personal-data
  console.log("pedido creado", customer.email);
  // ruleid: reposteria.console-log-personal-data
  console.error(`fallo al enviar a ${email}`);
  // ruleid: reposteria.console-log-personal-data
  console.info({ email, total: 3 });
  // ok: reposteria.console-log-personal-data
  console.log("Email enviado");
  // ok: reposteria.console-log-personal-data
  console.log("pedido", 42);
}

async function randomness() {
  // ruleid: reposteria.math-random-for-secrets
  const resetToken = Math.random().toString(36).slice(2);
  // ok: reposteria.math-random-for-secrets
  const jitterMs = Math.random() * 100;
  // ok: reposteria.math-random-for-secrets
  const sessionToken = randomBytes(32).toString("base64url");
  return { resetToken, jitterMs, sessionToken };
}

// ruleid: reposteria.math-random-for-secrets
function makeGiftCardCode() { return String(Math.floor(Math.random() * 1e8)); }

async function cookieCases(res: any) {
  const jar = await cookies();
  // ruleid: reposteria.cookie-without-httponly
  jar.set("sid", "abc", { secure: true, sameSite: "strict" });
  // ruleid: reposteria.cookie-without-httponly
  res.cookies.set("acc", "x", { httpOnly: false, secure: true });
  // ok: reposteria.cookie-without-httponly
  jar.set("sid", "abc", { httpOnly: true, secure: true, sameSite: "strict" });
  // ok: reposteria.cookie-without-httponly
  jar.set("sid", "", { maxAge: 0 });
  // ruleid: reposteria.cookie-without-httponly
  document.cookie = "a=b";
  return makeGiftCardCode();
}

async function routeHandler(request: any) {
  const target = request.nextUrl.searchParams.get("url");
  // ruleid: reposteria.fetch-url-from-user-input
  await fetch(target);
  const slug = request.nextUrl.searchParams.get("slug");
  // ok: reposteria.fetch-url-from-user-input
  await fetch(`https://api.example.com/items/${encodeURIComponent(slug)}`);
  // ok: reposteria.fetch-url-from-user-input
  await fetch("https://api.pwnedpasswords.com/range/ABCDE");
}

function dom(html: string) {
  // ruleid: reposteria.dangerously-set-inner-html
  el.innerHTML = html;
}

void [sqlCases, logging, randomness, cookieCases, dom, routeHandler];

function cartLine(line: object) {
  // ok: reposteria.math-random-for-secrets
  return { ...line, key: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}` };
}
void cartLine;
