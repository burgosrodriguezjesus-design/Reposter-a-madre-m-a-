import "server-only";
import QRCode from "qrcode";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { decrypt, encrypt, sha256 } from "@/lib/crypto";
import { generateRecoveryCodes, generateTotpSecret, normalizeRecoveryCode, otpauthUri, verifyTotp } from "@/lib/totp";
import { createSession, isKnownDevice, requestFingerprint, revokeSession, type SessionWithUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { securityAlert } from "@/lib/alerts";
import { enqueue } from "@/lib/jobs";
import { siteUrl } from "@/lib/site-url";
import { inc } from "@/lib/metrics";

/**
 * Segundo factor obligatorio del panel: app de autenticación (TOTP), passkeys / llaves de
 * seguridad (WebAuthn, resistentes a phishing) y códigos de recuperación de un solo uso.
 */
export const MAX_MFA_ATTEMPTS = 5;
const TOTP_CTX = "AdminUser.totpSecret";
const CHALLENGE_CTX = "AdminSession.challenge";

function rp() {
  const url = new URL(siteUrl());
  return { rpID: process.env.WEBAUTHN_RP_ID || url.hostname, origin: url.origin, rpName: "Panel de la repostería" };
}

export async function hasSecondFactor(userId: string, totpEnabledAt: Date | null): Promise<boolean> {
  if (totpEnabledAt) return true;
  return (await db.adminPasskey.count({ where: { userId } })) > 0;
}

// ───────────── TOTP ─────────────

/** Genera (o reutiliza) un secreto pendiente de confirmar, guardado cifrado en la sesión. */
export async function pendingTotpSecret(session: SessionWithUser) {
  let secret: string;
  if (session.challenge?.startsWith("totp:")) {
    secret = decrypt(session.challenge.slice(5), CHALLENGE_CTX);
  } else {
    secret = generateTotpSecret();
    await db.adminSession.update({ where: { id: session.id }, data: { challenge: `totp:${encrypt(secret, CHALLENGE_CTX)}` } });
  }
  const uri = otpauthUri(secret, session.user.email, "Repostería · Panel");
  const svg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return { secret, qrDataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` };
}

export async function confirmTotp(session: SessionWithUser, code: string): Promise<string[] | null> {
  if (!session.challenge?.startsWith("totp:")) return null;
  const secret = decrypt(session.challenge.slice(5), CHALLENGE_CTX);
  const step = verifyTotp(secret, code, null);
  if (step === null) return null;
  const codes = generateRecoveryCodes();
  await db.$transaction([
    db.adminUser.update({
      where: { id: session.userId },
      data: {
        totpSecret: encrypt(secret, TOTP_CTX),
        totpEnabledAt: new Date(),
        totpLastStep: step,
        recoveryCodes: codes.map((c) => sha256(normalizeRecoveryCode(c))),
      },
    }),
    db.adminSession.update({ where: { id: session.id }, data: { challenge: null } }),
  ]);
  return codes;
}

export async function regenerateRecoveryCodes(userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await db.adminUser.update({ where: { id: userId }, data: { recoveryCodes: codes.map((c) => sha256(normalizeRecoveryCode(c))) } });
  return codes;
}

/** Verifica un código TOTP o de recuperación. Impide reutilizar códigos (también en carreras). */
export async function verifyCode(session: SessionWithUser, raw: string): Promise<"totp" | "recovery" | null> {
  const user = session.user;
  const code = raw.trim();
  if (/^\d{3}\s?\d{3}$/.test(code) && user.totpSecret) {
    const step = verifyTotp(decrypt(user.totpSecret, TOTP_CTX), code, user.totpLastStep);
    if (step === null) return null;
    // Actualización condicional: si otra petición usó ya este intervalo, falla.
    const { count } = await db.adminUser.updateMany({
      where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
      data: { totpLastStep: step },
    });
    return count === 1 ? "totp" : null;
  }
  const hashed = sha256(normalizeRecoveryCode(code));
  if (normalizeRecoveryCode(code).length !== 10 || !user.recoveryCodes.includes(hashed)) return null;
  const { count } = await db.adminUser.updateMany({
    where: { id: user.id, recoveryCodes: { has: hashed } },
    data: { recoveryCodes: user.recoveryCodes.filter((c) => c !== hashed) },
  });
  if (count !== 1) return null;
  await securityAlert("admin.recovery_code_used", "Se ha usado un código de recuperación para entrar al panel.", { userId: user.id });
  return "recovery";
}

/** Cuenta un intento fallido de segundo factor; al superar el máximo, revoca la sesión. */
export async function registerMfaFailure(session: SessionWithUser): Promise<boolean> {
  const updated = await db.adminSession.update({ where: { id: session.id }, data: { mfaAttempts: { increment: 1 } } });
  inc("admin_login_failures_total", { stage: "mfa" });
  if (updated.mfaAttempts >= MAX_MFA_ATTEMPTS) {
    await revokeSession(session.id, "demasiados intentos de segundo factor");
    await audit({ action: "auth.mfa_locked", entity: "AdminUser", entityId: session.userId, severity: "alert", ipHash: session.ipHash });
    await securityAlert("admin.mfa_failures", "Varios códigos de verificación incorrectos: sesión bloqueada (la contraseña era correcta).", {
      userId: session.userId,
    });
    return true;
  }
  return false;
}

/** Segundo factor correcto: emite una sesión nueva completa y revoca la pendiente. */
export async function completeLogin(session: SessionWithUser, method: "totp" | "recovery" | "passkey" | "enrollment") {
  await revokeSession(session.id, "sustituida tras verificar el segundo factor");
  const newId = await createSession(session.userId, true);
  const fp = await requestFingerprint();
  await db.adminUser.update({ where: { id: session.userId }, data: { lastLoginAt: new Date(), failedLogins: 0, lockedUntil: null } });
  inc("admin_login_success_total");
  await audit({
    action: "auth.login",
    actor: { id: session.user.id, email: session.user.email, role: session.user.role },
    entity: "AdminUser",
    entityId: session.userId,
    ipHash: fp.ipHash,
    details: { method, device: fp.deviceLabel },
  });
  if (!(await isKnownDevice(session.userId, fp.deviceHash, newId))) {
    await enqueue("email.admin-new-device", { userId: session.userId, device: fp.deviceLabel, at: new Date().toISOString() });
    await securityAlert("admin.new_device", "Acceso al panel desde un navegador o dispositivo nuevo.", { userId: session.userId, device: fp.deviceLabel });
  }
}

// ───────────── Passkeys / llaves de seguridad (WebAuthn) ─────────────

export async function passkeyRegistrationOptions(session: SessionWithUser) {
  const { rpID, rpName } = rp();
  const existing = await db.adminPasskey.findMany({ where: { userId: session.userId }, select: { id: true, transports: true } });
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: session.user.email,
    userDisplayName: session.user.name,
    userID: new TextEncoder().encode(session.userId),
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports as AuthenticatorTransportFuture[] })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
  await db.adminSession.update({ where: { id: session.id }, data: { challenge: `webauthn:${options.challenge}` } });
  return options;
}

export async function verifyPasskeyRegistration(session: SessionWithUser, response: RegistrationResponseJSON, name: string) {
  if (!session.challenge?.startsWith("webauthn:")) return false;
  const { rpID, origin } = rp();
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge: session.challenge.slice(9),
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
  });
  await db.adminSession.update({ where: { id: session.id }, data: { challenge: null } });
  if (!result.verified) return false;
  const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;
  await db.adminPasskey.create({
    data: {
      id: credential.id,
      userId: session.userId,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      name: name.slice(0, 60) || "Llave de seguridad",
    },
  });
  return true;
}

export async function passkeyAuthOptions(session: SessionWithUser) {
  const { rpID } = rp();
  const keys = await db.adminPasskey.findMany({ where: { userId: session.userId }, select: { id: true, transports: true } });
  if (keys.length === 0) return null;
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: keys.map((k) => ({ id: k.id, transports: k.transports as AuthenticatorTransportFuture[] })),
    userVerification: "preferred",
  });
  await db.adminSession.update({ where: { id: session.id }, data: { challenge: `webauthn:${options.challenge}` } });
  return options;
}

export async function verifyPasskeyAuth(session: SessionWithUser, response: AuthenticationResponseJSON): Promise<boolean> {
  if (!session.challenge?.startsWith("webauthn:")) return false;
  const key = await db.adminPasskey.findFirst({ where: { id: response.id, userId: session.userId } });
  await db.adminSession.update({ where: { id: session.id }, data: { challenge: null } });
  if (!key) return false;
  const { rpID, origin } = rp();
  try {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: session.challenge.slice(9),
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: { id: key.id, publicKey: new Uint8Array(key.publicKey), counter: key.counter, transports: key.transports as AuthenticatorTransportFuture[] },
      requireUserVerification: false,
    });
    if (!result.verified) return false;
    // Un contador que no avanza puede indicar una llave clonada
    if (key.counter > 0 && result.authenticationInfo.newCounter <= key.counter) {
      await securityAlert("admin.session_hijack_suspected", "Contador de llave de seguridad no válido (posible clonación).", { userId: session.userId });
      return false;
    }
    await db.adminPasskey.update({ where: { id: key.id }, data: { counter: result.authenticationInfo.newCounter, lastUsedAt: new Date() } });
    return true;
  } catch {
    return false;
  }
}
