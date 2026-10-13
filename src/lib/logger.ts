/**
 * Registro estructurado (JSON por línea) con enmascarado de datos personales y secretos.
 * Nunca registres objetos completos de pedidos o clientes: pasa identificadores.
 */
type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const PHONE = /(?<![\w-])(\+?\d[\d\s-]{6,}\d)(?![\w-])/g;
const SECRETS = [
  /\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{8,}/g, // Stripe
  /\bwhsec_[A-Za-z0-9]{8,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*/gi,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, // JWT
  /\benc:v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+/g,
  /\b(postgres(?:ql)?|redis|rediss):\/\/[^\s"']+/gi,
];
const SENSITIVE_KEYS = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|totp|recovery|card|cvv|iban|email|phone|address|name/i;

export function maskString(value: string): string {
  let out = value;
  for (const re of SECRETS) out = out.replace(re, "[secreto]");
  out = out.replace(EMAIL, (_m, first: string, domain: string) => `${first}***@${domain}`);
  out = out.replace(PHONE, (m) => `***${m.replace(/\D/g, "").slice(-2)}`);
  return out;
}

const SECRET_KEYS = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|totp|recovery|cvv/i;

/**
 * Enmascara datos personales y secretos dentro de un valor.
 * `strict` (registros técnicos) oculta también campos como name/email/address;
 * `secrets` (auditoría) solo oculta secretos y enmascara emails y teléfonos en los textos.
 */
export function redact(value: unknown, depth = 0, mode: "strict" | "secrets" = "strict"): unknown {
  if (depth > 5) return "[…]";
  if (typeof value === "string") return maskString(value.length > 2000 ? `${value.slice(0, 2000)}…` : value);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return { name: value.name, message: maskString(value.message), code: (value as { code?: string }).code };
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1, mode));
  if (value && typeof value === "object") {
    const out: Fields = {};
    for (const [k, v] of Object.entries(value)) {
      const hide = (mode === "strict" ? SENSITIVE_KEYS : SECRET_KEYS).test(k) && !/id$|Id$|count|Count|hash|Hash/.test(k);
      out[k] = hide ? "[oculto]" : redact(v, depth + 1, mode);
    }
    return out;
  }
  return value;
}

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel = LEVELS[(process.env.LOG_LEVEL as Level) ?? "info"] ?? 20;

function write(level: Level, event: string, fields?: Fields) {
  if (LEVELS[level] < minLevel) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...(fields ? (redact(fields) as Fields) : {}) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, fields?: Fields) => write("debug", event, fields),
  info: (event: string, fields?: Fields) => write("info", event, fields),
  warn: (event: string, fields?: Fields) => write("warn", event, fields),
  error: (event: string, fields?: Fields) => write("error", event, fields),
};
