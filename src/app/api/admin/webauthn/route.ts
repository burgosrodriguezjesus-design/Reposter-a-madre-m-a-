import { NextResponse } from "next/server";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { forbiddenOrigin, PRIVATE_NO_STORE, readJson, sameOrigin } from "@/lib/http";
import { completeLogin, hasSecondFactor, passkeyAuthOptions, passkeyRegistrationOptions, registerMfaFailure, verifyPasskeyAuth, verifyPasskeyRegistration } from "@/lib/mfa";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Passkeys / llaves de seguridad (WebAuthn).
 *  - auth-*: segundo factor al iniciar sesión (sesión pendiente).
 *  - register-*: alta de una llave, en el primer acceso (sesión pendiente sin segundo factor)
 *    o desde "Seguridad" (sesión completa).
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbiddenOrigin();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sesión caducada. Vuelve a entrar." }, { status: 401, headers: PRIVATE_NO_STORE });
  if (!(await rateLimit("webauthn", session.id, 20, 10 * 60_000)).ok) {
    return NextResponse.json({ error: "Demasiados intentos" }, { status: 429, headers: PRIVATE_NO_STORE });
  }
  const body = (await readJson(request)) as { action?: string; response?: Record<string, unknown> } | null;
  const action = body?.action;
  const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: PRIVATE_NO_STORE });

  if (action === "auth-options" || action === "auth-verify") {
    if (session.mfaVerified) return json({ redirect: "/admin" });
    if (action === "auth-options") {
      const options = await passkeyAuthOptions(session);
      return options ? json({ options }) : json({ error: "No tienes llaves registradas" }, 400);
    }
    const ok = body?.response ? await verifyPasskeyAuth(session, body.response as unknown as AuthenticationResponseJSON) : false;
    if (!ok) {
      const locked = await registerMfaFailure(session);
      return json({ error: locked ? "Demasiados intentos. Vuelve a introducir la contraseña." : "No se pudo verificar la llave" }, locked ? 401 : 400);
    }
    await completeLogin(session, "passkey");
    return json({ ok: true, redirect: "/admin" });
  }

  if (action === "register-options" || action === "register-verify") {
    // Sin sesión completa solo se permite registrar la PRIMERA llave (alta obligatoria del MFA)
    const enrolling = !session.mfaVerified;
    if (enrolling && (await hasSecondFactor(session.userId, session.user.totpEnabledAt))) return json({ error: "Ya tienes un segundo factor" }, 403);
    if (action === "register-options") return json({ options: await passkeyRegistrationOptions(session) });
    const response = body?.response as (RegistrationResponseJSON & { name?: string }) | undefined;
    const ok = response ? await verifyPasskeyRegistration(session, response, String(response.name ?? "Passkey")) : false;
    if (!ok) return json({ error: "No se pudo registrar la llave" }, 400);
    await audit({
      action: "auth.passkey_added",
      actor: { id: session.user.id, email: session.user.email, role: session.user.role },
      entity: "AdminUser",
      entityId: session.userId,
      ipHash: session.ipHash,
    });
    if (enrolling) await completeLogin(session, "enrollment");
    return json({ ok: true, redirect: enrolling ? "/admin" : "/admin/seguridad" });
  }
  return json({ error: "Acción no válida" }, 400);
}
