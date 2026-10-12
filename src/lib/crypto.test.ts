import { describe, expect, it } from "vitest";
import { blindIndex, decrypt, encrypt, isEncrypted, needsReencryption, normalizePhone, safeEqual } from "@/lib/crypto";

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
