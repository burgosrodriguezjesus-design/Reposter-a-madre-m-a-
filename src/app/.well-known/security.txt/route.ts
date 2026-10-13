import { siteUrl } from "@/lib/site-url";

/**
 * security.txt (RFC 9116): cómo informar de vulnerabilidades (ver SECURITY.md).
 * Solo se publica si SECURITY_CONTACT está definido (mailto:... o https://...); así nunca se
 * anuncia un contacto de ejemplo. SECURITY_POLICY_URL y SECURITY_ENCRYPTION_URL son opcionales.
 */
export const dynamic = "force-dynamic";

const VALID = /^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/;

export function GET() {
  const contacts = (process.env.SECURITY_CONTACT ?? "").split(",").map((c) => c.trim()).filter((c) => VALID.test(c));
  if (contacts.length === 0) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const optional = (name: string, field: string) => {
    const v = process.env[name]?.trim();
    return v && /^https:\/\/\S+$/.test(v) ? [`${field}: ${v}`] : [];
  };
  // Caduca a los 180 días de servirse: si el sitio deja de mantenerse, el archivo pierde validez
  const expires = new Date(Date.now() + 180 * 86400_000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const body = [
    ...contacts.map((c) => `Contact: ${c}`),
    `Expires: ${expires}`,
    ...optional("SECURITY_ENCRYPTION_URL", "Encryption"),
    ...optional("SECURITY_POLICY_URL", "Policy"),
    "Preferred-Languages: es, en",
    `Canonical: ${siteUrl("/.well-known/security.txt")}`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
