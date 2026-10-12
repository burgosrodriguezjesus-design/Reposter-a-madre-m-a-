/**
 * Genera secretos nuevos para un entorno: `npm run keys:generate`
 * Cópialos a tu gestor de secretos (Vercel → Environment Variables, Doppler, 1Password...).
 * Cada entorno (desarrollo, staging, producción) debe tener claves DISTINTAS.
 * No los guardes en el repositorio ni los compartas por email o chat.
 */
import { randomBytes } from "node:crypto";

const kid = `k${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`;
const b64 = (n: number) => randomBytes(n).toString("base64");

console.log(`# Generado el ${new Date().toISOString()}. Guarda esto en tu gestor de secretos, no en git.
AUTH_SECRET=${randomBytes(48).toString("base64url")}
DATA_ENCRYPTION_KEYS=${kid}:${b64(32)}
DATA_ENCRYPTION_ACTIVE_KEY=${kid}
DATA_HASH_KEY=${b64(32)}
CRON_SECRET=${randomBytes(32).toString("base64url")}
METRICS_TOKEN=${randomBytes(32).toString("base64url")}

# Para rotar la clave de cifrado: AÑADE la nueva a DATA_ENCRYPTION_KEYS (k_antigua:...,${kid}:...),
# cambia DATA_ENCRYPTION_ACTIVE_KEY, despliega, ejecuta \`npm run db:encrypt\` y después retira la antigua.`);
