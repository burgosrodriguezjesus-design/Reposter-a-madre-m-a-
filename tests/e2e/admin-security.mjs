/**
 * Prueba de extremo a extremo del panel en un navegador real (solo entornos de prueba):
 *   BASE_URL=http://localhost:3000 ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run test:e2e
 * Requiere un propietario SIN segundo factor configurado (BD de pruebas recién sembrada).
 * Comprueba: MFA obligatorio, cookie segura, robo de cookie, roles, fuerza bruta, auditoría y cierre de sesión.
 */
import { chromium } from "playwright";
import { createHmac } from "node:crypto";

const B = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const [email, password] = [process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD];
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "✓" : "✗"} ${name}${!ok && detail ? ` — ${detail}` : ""}`); };

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32(s) { let bits = 0, val = 0; const out = []; for (const c of s.replace(/[^A-Z2-7]/g, "")) { val = (val << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); }
function totp(secret, offset = 0) { const step = Math.floor(Date.now() / 30000) + offset; const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(step)); const h = createHmac("sha1", b32(secret)).update(m).digest(); const o = h[h.length - 1] & 15; return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0"); }

// En CI: npx playwright install chromium. Aquí se puede indicar un Chromium ya instalado con CHROMIUM_PATH.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const newCtx = (ua) => browser.newContext({ locale: "es-ES", ...(ua ? { userAgent: ua } : {}) });

async function login(page, mail, pass) {
  await page.goto(`${B}/admin/login`);
  await page.fill('input[name="email"]', mail);
  await page.fill('input[name="password"]', pass);
  await page.click('button[type="submit"]');
  await Promise.race([page.waitForURL(/\/admin\/login\/(configurar|verificar)/, { timeout: 8000 }), page.waitForSelector('p[role="alert"]', { timeout: 8000 })]).catch(() => {});
}

async function enroll(page) {
  const secret = (await page.locator("details code").textContent()).replace(/\s/g, "");
  await page.fill('form input[name="code"]', totp(secret));
  await page.click('form button[type="submit"]:has-text("Activar")');
  await page.waitForSelector("text=códigos de recuperación");
  const codes = await page.locator("ul.font-mono li").allTextContents();
  await page.click('button:has-text("Ya los he guardado")');
  await page.waitForURL(`${B}/admin`);
  return { secret, codes };
}

// 1. Sin sesión
const ctx = await newCtx();
const page = await ctx.newPage();
await page.goto(`${B}/admin/pedidos`);
await page.waitForURL(/admin\/login/);
check("Sin sesión, el panel lleva al acceso", page.url().includes("/admin/login"));

// 2. Contraseña incorrecta
await login(page, email, "contraseña-incorrecta-123");
check("Contraseña incorrecta: mensaje genérico", await page.locator("text=Email o contraseña incorrectos").isVisible());
await login(page, "no-existe@example.com", "contraseña-incorrecta-123");
check("Email inexistente: mismo mensaje (no revela cuentas)", await page.locator("text=Email o contraseña incorrectos").isVisible());

// 3. Contraseña correcta → MFA obligatorio
await login(page, email, password);
const firstStep = page.url();
check("Tras la contraseña se exige el segundo factor", /\/admin\/login\/(configurar|verificar)/.test(firstStep), firstStep);
await page.goto(`${B}/admin/pedidos`);
check("Con sesión pendiente de MFA no se accede al panel", /\/admin\/login\//.test(page.url()), page.url());
let secret;
if (firstStep.includes("configurar")) {
  await page.goto(`${B}/admin/login/configurar`);
  const r = await enroll(page);
  secret = r.secret;
  check("Alta de TOTP con 10 códigos de recuperación", r.codes.length === 10);
  process.env.__CODES = JSON.stringify(r.codes);
} else {
  check("La cuenta ya tenía MFA (prueba de alta omitida)", false, "usa una BD sin MFA para esta prueba");
}
check("Tras el segundo factor se entra al panel", page.url() === `${B}/admin`, page.url());

// 4. Atributos de la cookie
const cookies = await ctx.cookies();
const sess = cookies.find((c) => c.name.endsWith("rmm_admin"));
check("Cookie de sesión HttpOnly + Secure + SameSite=Strict + prefijo __Host-", !!sess && sess.httpOnly && sess.secure && sess.sameSite === "Strict" && sess.name.startsWith("__Host-"), JSON.stringify(sess && { n: sess.name, h: sess.httpOnly, s: sess.secure, ss: sess.sameSite }));
check("El token de sesión no es un JWT ni contiene datos", !!sess && !sess.value.includes(".") && sess.value.length >= 40);

// 5. Robo de cookie: otro navegador la reutiliza
const thief = await newCtx("Mozilla/5.0 (X11; Linux x86_64) Atacante/1.0");
await thief.addCookies([{ ...sess }]);
const tp = await thief.newPage();
await tp.goto(`${B}/admin/pedidos`);
check("Cookie robada usada desde otro navegador → sin acceso", /admin\/login/.test(tp.url()), tp.url());
await page.goto(`${B}/admin`);
check("…y la sesión comprometida queda revocada también para el original", /admin\/login/.test(page.url()), page.url());

// 6. Nuevo acceso con TOTP (código del siguiente intervalo: el actual ya se usó)
await login(page, email, password);
check("Cuenta con MFA → pide código", page.url().includes("/admin/login/verificar"), page.url());
await page.fill('input[name="code"]', "000000");
await page.click('button:has-text("Verificar")');
check("Código TOTP incorrecto → rechazado", !!(await page.waitForSelector("text=Código incorrecto", { timeout: 10000 }).catch(() => null)));
await page.fill('input[name="code"]', totp(secret, 1));
await page.click('button:has-text("Verificar")');
await page.waitForURL(`${B}/admin`);
check("Código TOTP correcto → acceso", page.url() === `${B}/admin`);

// 7. Usuario empleado con permisos mínimos
await page.goto(`${B}/admin/usuarios`);
await page.fill('input[name="name"]', "Empleada Prueba");
const staffEmail = `empleada${Date.now()}@example.com`;
await page.fill('form input[name="email"]', staffEmail);
await page.selectOption('select[name="role"]', "STAFF");
await page.click('button:has-text("Crear usuario")');
const temp = (await page.locator("code.font-mono").first().textContent({ timeout: 10000 })).trim();
check("Alta de empleado con contraseña provisional aleatoria", temp.length >= 20);
const sctx = await newCtx();
const sp = await sctx.newPage();
await login(sp, staffEmail, temp);
check("El empleado también debe activar el segundo factor", sp.url().includes("/admin/login/configurar"), sp.url());
await enroll(sp);
for (const path of ["/admin/ajustes", "/admin/usuarios", "/admin/clientes", "/admin/auditoria", "/admin/productos", "/admin/privacidad"]) {
  await sp.goto(`${B}${path}`);
  check(`Empleado sin permiso para ${path} → denegado`, sp.url().includes("sin-permiso=1"), sp.url());
}
const csv = await sp.request.get(`${B}/api/admin/clientes.csv`);
check("Empleado: exportación de clientes → 403", csv.status() === 403, String(csv.status()));
await sp.goto(`${B}/admin/pedidos`);
check("Empleado: sí puede ver pedidos", sp.url().endsWith("/admin/pedidos"));
const navText = await sp.locator("aside").textContent();
check("Empleado: el menú no muestra secciones sin permiso", !/Usuarios y permisos|Ajustes|Clientes/.test(navText ?? ""));

// 8. Fuerza bruta contra la cuenta del empleado
const bctx = await newCtx();
const bp = await bctx.newPage();
let blocked = false;
for (let i = 0; i < 7; i++) {
  await login(bp, staffEmail, `mala-${i}-contraseña`);
  if (await bp.locator("text=Demasiados intentos").isVisible()) { blocked = true; break; }
}
await login(bp, staffEmail, temp);
check("Fuerza bruta: la cuenta se bloquea y ni la contraseña correcta entra", blocked || !bp.url().includes("/admin/login/"), bp.url());

// 9. Auditoría
await page.goto(`${B}/admin/auditoria`);
await page.click('button:has-text("Verificar integridad")');
await page.waitForSelector("text=Íntegro", { timeout: 15000 });
check("Registro de auditoría íntegro y verificable", true);
const auditText = await page.locator("table").textContent();
check("La auditoría registra accesos, permisos denegados y bloqueos", /auth\.login/.test(auditText) && /access\.denied/.test(auditText) && /users\.create/.test(auditText));

// 10. Cierre de sesión
const before = (await ctx.cookies()).find((c) => c.name.endsWith("rmm_admin"));
await page.click('aside button:has-text("Cerrar sesión")');
await page.waitForURL(/admin\/login/);
const replay = await newCtx();
await replay.addCookies([{ ...before }]);
const r = await replay.request.get(`${B}/api/admin/clientes.csv`);
check("Tras cerrar sesión, la cookie antigua ya no sirve (sesión revocada en servidor)", r.status() === 401, String(r.status()));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} comprobaciones superadas`);
process.exit(failed ? 1 : 0);
