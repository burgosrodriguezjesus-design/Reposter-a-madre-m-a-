import { randomBytes, randomInt } from "node:crypto";

// Sin caracteres ambiguos (0/O, 1/I/L) para dictarlos por teléfono sin errores.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function randomCode(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** Número de pedido legible: MM-7K3P9Q */
export function orderNumber(): string {
  return `MM-${randomCode(6)}`;
}

export function quoteNumber(): string {
  return `P-${randomCode(6)}`;
}

/** Código de tarjeta regalo: XXXX-XXXX-XXXX */
export function giftCardCode(): string {
  return `${randomCode(4)}-${randomCode(4)}-${randomCode(4)}`;
}

export function secureToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}
