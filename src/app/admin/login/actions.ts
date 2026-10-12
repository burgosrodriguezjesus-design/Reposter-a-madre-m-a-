"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { endSession, isLoginBlocked, recordLoginAttempt, startSession, verifyPassword } from "@/lib/auth";
import { clientIp } from "@/lib/rate-limit";

// Hash ficticio para que el tiempo de respuesta no revele si el email existe.
const DUMMY_HASH = "$2b$12$AF2HIcZq1kcXqOn1edqSee53o5yZvaWrJTuY1DHKhvtyFHzfVljIO";

export async function login(_prev: { error?: string } | null, formData: FormData): Promise<{ error?: string } | null> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 160);
  const password = String(formData.get("password") ?? "").slice(0, 200);
  const next = String(formData.get("next") ?? "/admin");
  const ip = await clientIp();

  if (await isLoginBlocked(ip, email)) {
    return { error: "Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo." };
  }
  const user = await db.adminUser.findUnique({ where: { email } });
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  await recordLoginAttempt(ip, email, !!user && valid);
  if (!user || !valid) return { error: "Email o contraseña incorrectos" };

  await db.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await startSession(user.id);
  redirect(next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin");
}

export async function logout() {
  await endSession();
  redirect("/admin/login");
}
