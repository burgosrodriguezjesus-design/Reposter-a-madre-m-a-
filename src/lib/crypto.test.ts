import { describe, expect, it } from "vitest";
import { blindIndex, decrypt, decryptBuffer, encrypt, encryptBuffer, isEncrypted, isEncryptedBuffer, needsReencryption, normalizePhone, safeEqual } from "@/lib/crypto";

describe("cifrado AES-256-GCM", () => {
  it("cifra y descifra; cada cifrado es distinto (IV aleatorio)", () => {
    const a = encrypt("ana@example.com", "Order.customerEmail");
    const b = encrypt("ana@example.com", "Order.customerEmail");
    expect(a).not.toBe(b);
    expect(a.startsWith("enc:v1:kt2:")).toBe(true);
    expect(a).not.toContain("ana");
    expect(decrypt(a, "Order.customerEmail")).toBe("ana@example.com");
  });
  it("falla si se copia el cifrado a otra columna (AAD)", () => {
    const a = encrypt("Ana", "Order.customerName");
    expect(() => decrypt(a, "Order.customerEmail")).toThrow();
  });
  it("detecta manipulación del cifrado", () => {
    const a = encrypt("Ana López", "Customer.name");
    const parts = a.split(":");
    const body = Buffer.from(parts[4], "base64url");
    body[0] ^= 1;
    parts[4] = body.toString("base64url");
    expect(() => decrypt(parts.join(":"), "Customer.name")).toThrow();
  });
  it("lee datos antiguos en claro y marca los que necesitan re-cifrado", () => {
    expect(decrypt("texto antiguo", "Customer.name")).toBe("texto antiguo");
    expect(isEncrypted("texto")).toBe(false);
    expect(needsReencryption(encrypt("x", "c"))).toBe(false);
  });
  it("descifra con una clave antigua del anillo (rotación)", async () => {
    process.env.DATA_ENCRYPTION_ACTIVE_KEY = "kt1";
    const { resetKeyringForTests, encrypt: enc } = await import("@/lib/crypto");
    resetKeyringForTests();
    const old = enc("dato", "X.y");
    process.env.DATA_ENCRYPTION_ACTIVE_KEY = "kt2";
    resetKeyringForTests();
    expect(old.startsWith("enc:v1:kt1:")).toBe(true);
    expect(needsReencryption(old)).toBe(true);
    expect(decrypt(old, "X.y")).toBe("dato");
  });
});

describe("índices ciegos", () => {
  it("son deterministas y normalizan", () => {
    expect(blindIndex("email", " Ana@Example.COM ")).toBe(blindIndex("email", "ana@example.com"));
    expect(blindIndex("phone", "+34 600 11 22 33")).toBe(blindIndex("phone", "600112233"));
    expect(blindIndex("email", "ana@example.com")).not.toBe(blindIndex("email", "ana2@example.com"));
    expect(blindIndex("email", "a@b.es")).not.toContain("@");
  });
  it("normaliza teléfonos españoles", () => {
    expect(normalizePhone("0034 600-112-233")).toBe("600112233");
  });
  it("comparación en tiempo constante", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("cifrado de archivos (fotos privadas)", () => {
  const photo = Buffer.from("RIFF....WEBPVP8 datos de imagen de prueba con GPS 40.4,-3.7");
  it("cifra con AES-256-GCM y descifra con el mismo contexto", () => {
    const sealed = encryptBuffer(photo, "media:references/2026-10/a.webp");
    expect(isEncryptedBuffer(sealed)).toBe(true);
    expect(sealed.includes(Buffer.from("WEBP"))).toBe(false);
    expect(decryptBuffer(sealed, "media:references/2026-10/a.webp").equals(photo)).toBe(true);
  });
  it("rechaza un archivo manipulado o movido a otra ruta", () => {
    const sealed = encryptBuffer(photo, "media:references/2026-10/a.webp");
    expect(() => decryptBuffer(sealed, "media:references/2026-10/b.webp")).toThrow();
    const tampered = Buffer.from(sealed);
    tampered[tampered.length - 1] ^= 1;
    expect(() => decryptBuffer(tampered, "media:references/2026-10/a.webp")).toThrow();
  });
  it("los archivos antiguos sin cifrar se devuelven tal cual", () => {
    expect(decryptBuffer(photo, "media:x").equals(photo)).toBe(true);
  });
  it("blindIndex de tokens no normaliza y no revela el token", () => {
    expect(blindIndex("token", "AbC")).not.toBe(blindIndex("token", "abc"));
    expect(blindIndex("token", "secreto-largo")).not.toContain("secreto");
  });
});
