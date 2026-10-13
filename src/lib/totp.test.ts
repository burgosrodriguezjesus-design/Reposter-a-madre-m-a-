import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateRecoveryCodes, totpAt, verifyTotp } from "@/lib/totp";

// Vector de prueba del RFC 6238 (SHA-1, secreto "12345678901234567890")
const SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP (RFC 6238)", () => {
  it("coincide con los vectores oficiales", () => {
    expect(totpAt(SECRET, Math.floor(59 / 30))).toBe("287082");
    expect(totpAt(SECRET, Math.floor(1111111109 / 30))).toBe("081804");
    expect(totpAt(SECRET, Math.floor(2000000000 / 30))).toBe("279037");
  });
  it("acepta ±1 intervalo y rechaza reutilizar el mismo código", () => {
    const now = 1111111109_000;
    const step = verifyTotp(SECRET, "081804", null, now);
    expect(step).toBe(Math.floor(1111111109 / 30));
    expect(verifyTotp(SECRET, "081804", step, now)).toBeNull();
    expect(verifyTotp(SECRET, "000000", null, now)).toBeNull();
    expect(verifyTotp(SECRET, "abc", null, now)).toBeNull();
  });
  it("base32 ida y vuelta y códigos de recuperación únicos", () => {
    expect(base32Decode(SECRET).toString()).toBe("12345678901234567890");
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
  });
});
