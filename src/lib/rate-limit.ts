import "server-only";
import { headers } from "next/headers";
import { ipBucket, ipFromHeaders } from "@/lib/client-ip";
import { keyedHash } from "@/lib/crypto";
import { penalize, rateLimit } from "@/lib/limiter";

export { penalize, penaltyOf, rateLimit } from "@/lib/limiter";

/** IP del cliente según el proxy de confianza (TRUST_PROXY). */
export async function clientIp(): Promise<string> {
  return ipFromHeaders(await headers());
}

/** Huella HMAC de la IP (agrupando IPv6 por /64). */
export async function clientIpHash(): Promise<string> {
  return keyedHash("ip", ipBucket(await clientIp()));
}

export async function limitByIp(scope: string, limit: number, windowMs: number): Promise<boolean> {
  return (await rateLimit(scope, await clientIpHash(), limit, windowMs)).ok;
}

export async function penalizeClient(points = 1) {
  await penalize(await clientIpHash(), points);
}
