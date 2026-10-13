import { describe, expect, it } from "vitest";
import { hashPassword, needsRehash, passwordProblem, verifyPassword } from "@/lib/password";
import { can, ROLE_PERMISSIONS } from "@/lib/rbac";
import { maskString, redact } from "@/lib/logger";
import { ipFromHeaders } from "@/lib/client-ip";
import bcrypt from "bcryptjs";

describe("contraseñas", () => {
  it("Argon2id: verifica, rechaza y no necesita rehash", async () => {
    const h = await hashPassword("una frase larga y segura");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword("una frase larga y segura", h)).toBe(true);
    expect(await verifyPassword("otra", h)).toBe(false);
    expect(needsRehash(h)).toBe(false);
  });
  it("acepta bcrypt antiguo y pide migrarlo", async () => {
    const old = await bcrypt.hash("contraseña antigua 1", 4);
    expect(await verifyPassword("contraseña antigua 1", old)).toBe(true);
    expect(needsRehash(old)).toBe(true);
  });
  it("política", () => {
    expect(passwordProblem("corta")).toMatch(/12/);
    expect(passwordProblem("aaaaaaaaaaaaaaa")).toMatch(/común/);
    expect(passwordProblem("maria.lopez-2026!", { email: "maria.lopez@x.es" })).toMatch(/email/);
    expect(passwordProblem("tres palabras al azar")).toBeNull();
  });
});

describe("roles (mínimo privilegio)", () => {
  it("el empleado no gestiona usuarios, ajustes, exportaciones ni reembolsos", () => {
    for (const p of ["users.manage", "settings.manage", "customers.export", "orders.refund", "audit.view", "catalog.manage", "customers.view"] as const) {
      expect(can("STAFF", p)).toBe(false);
    }
    expect(can("STAFF", "orders.update")).toBe(true);
  });
  it("el encargado no gestiona usuarios, privacidad ni exportaciones", () => {
    for (const p of ["users.manage", "privacy.manage", "customers.export", "orders.refund", "audit.view", "settings.manage"] as const) expect(can("MANAGER", p)).toBe(false);
  });
  it("cada rol incluye los permisos del anterior", () => {
    for (const p of ROLE_PERMISSIONS.STAFF) expect(can("MANAGER", p)).toBe(true);
    for (const p of ROLE_PERMISSIONS.MANAGER) expect(can("OWNER", p)).toBe(true);
  });
});

describe("registros sin datos personales ni secretos", () => {
  it("enmascara emails, teléfonos, claves y cadenas de conexión", () => {
    const out = maskString("ana.lopez@gmail.com 600112233 sk_live_abcdefghijk postgresql://u:p@h/db Bearer abcdefghijklmnop");
    expect(out).not.toMatch(/ana\.lopez|600112233|sk_live_abc|u:p@h|abcdefghijklmnop/);
  });
  it("oculta campos sensibles", () => {
    const r = redact({ customerEmail: "x@y.es", password: "secreto", orderId: "o1", nested: { phone: "600112233" } }) as Record<string, unknown>;
    expect(r.customerEmail).toBe("[oculto]");
    expect(r.password).toBe("[oculto]");
    expect(r.orderId).toBe("o1");
  });
});

describe("IP de confianza", () => {
  it("ignora X-Forwarded-For falsificadas si no hay proxy de confianza", () => {
    process.env.TRUST_PROXY = "none";
    expect(ipFromHeaders(new Headers({ "x-forwarded-for": "1.2.3.4" }))).toBe("local");
    process.env.TRUST_PROXY = "nginx";
    expect(ipFromHeaders(new Headers({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(ipFromHeaders(new Headers({ "x-real-ip": "<script>" }))).toBe("local");
    delete process.env.TRUST_PROXY;
  });
});
