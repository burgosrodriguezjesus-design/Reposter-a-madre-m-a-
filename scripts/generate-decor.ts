/**
 * Genera la decoración y la ilustración de portada del diseño «elegante» (crema, negro y oro):
 *   public/decor/ramas-esquina.svg   ramas secas de paniculata (esquina superior izquierda)
 *   public/decor/ramas-lateral.svg   ramillete pequeño para el lateral derecho
 *   public/demo/hero-tarta-zanahoria.svg  tarta de zanahoria vista desde arriba con una porción
 * Son ilustraciones propias y ligeras hasta que subas tus fotos reales (mejor cenitales, sobre
 * fondo claro). Uso: npx tsx scripts/generate-decor.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const f = (n: number) => Math.round(n * 10) / 10;
const rad = (deg: number) => (deg * Math.PI) / 180;
const pt = (cx: number, cy: number, r: number, deg: number) => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))] as const;

// ───────────── Ramas secas de paniculata ─────────────
type Branch = { x: number; y: number; angle: number; length: number; bend: number; twigs: number };

function branches(seed: number, w: number, h: number, list: Branch[]): string {
  const r = rng(seed);
  const stems: string[] = [];
  const buds: string[] = [];
  const bud = (x: number, y: number, scale: number) => {
    const n = 3 + Math.floor(r() * 5);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * 6 * scale;
      const br = (1.4 + r() * 1.6) * scale;
      const bx = x + Math.cos(a) * d;
      const by = y + Math.sin(a) * d;
      buds.push(`<circle cx="${f(bx)}" cy="${f(by)}" r="${f(br)}" fill="#fbfaf7" stroke="#d9cdb8" stroke-width=".6"/>`);
      if (r() < 0.45) buds.push(`<circle cx="${f(bx)}" cy="${f(by)}" r="${f(br * 0.35)}" fill="#c9b48f"/>`);
    }
  };
  const grow = (x: number, y: number, angle: number, length: number, bend: number, width: number, depth: number, twigs: number) => {
    const [ex, ey] = [x + Math.cos(rad(angle)) * length, y + Math.sin(rad(angle)) * length];
    const mid = angle + bend;
    const [cx, cy] = [x + Math.cos(rad(mid)) * length * 0.55, y + Math.sin(rad(mid)) * length * 0.55];
    stems.push(`<path d="M${f(x)} ${f(y)}Q${f(cx)} ${f(cy)} ${f(ex)} ${f(ey)}" stroke="#a98a5e" stroke-width="${f(width)}" fill="none" stroke-linecap="round"/>`);
    if (depth >= 3 || length < 14) {
      bud(ex, ey, Math.max(0.7, 1.1 - depth * 0.1));
      return;
    }
    for (let i = 0; i < twigs; i++) {
      const t = 0.35 + r() * 0.6;
      // Punto sobre la curva cuadrática
      const px = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * cx + t * t * ex;
      const py = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * cy + t * t * ey;
      const side = r() < 0.5 ? -1 : 1;
      grow(px, py, angle + side * (18 + r() * 38), length * (0.32 + r() * 0.3), side * (6 + r() * 14), width * 0.7, depth + 1, Math.max(1, twigs - 1));
    }
    bud(ex, ey, 1);
  };
  for (const b of list) grow(b.x, b.y, b.angle, b.length, b.bend, 1.5, 0, b.twigs);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" fill="none">\n<g opacity=".92">${stems.join("")}</g>\n<g>${buds.join("")}</g>\n</svg>\n`;
}

// ───────────── Tarta de zanahoria vista desde arriba ─────────────
function heroCake(): string {
  const r = rng(20261013);
  const W = 1000;
  const H = 1000;
  // Plato grande
  const P1 = { x: 430, y: 410, r: 330 };
  const C = { x: 430, y: 410, r: 232 };
  const CUT = [38, 78]; // porción que falta (grados)
  // Plato pequeño con la porción
  const P2 = { x: 770, y: 800, r: 180 };

  const sector = (cx: number, cy: number, rr: number, a1: number, a2: number) => {
    // Círculo completo menos el sector [a1, a2]
    const [x1, y1] = pt(cx, cy, rr, a1);
    const [x2, y2] = pt(cx, cy, rr, a2);
    return `M${f(cx)} ${f(cy)}L${f(x2)} ${f(y2)}A${rr} ${rr} 0 1 1 ${f(x1)} ${f(y1)}Z`;
  };
  const wedge = (cx: number, cy: number, rr: number, a1: number, a2: number) => {
    const [x1, y1] = pt(cx, cy, rr, a1);
    const [x2, y2] = pt(cx, cy, rr, a2);
    return `M${f(cx)} ${f(cy)}L${f(x1)} ${f(y1)}A${rr} ${rr} 0 0 1 ${f(x2)} ${f(y2)}Z`;
  };

  // Textura de la cobertura: remolinos muy suaves
  const swirls: string[] = [];
  for (let i = 0; i < 30; i++) {
    let a = r() * 360;
    while (a > CUT[0] - 6 && a < CUT[1] + 6) a = r() * 360;
    const d = r() * (C.r - 30);
    const [x, y] = pt(C.x, C.y, d, a);
    const len = 30 + r() * 46;
    const rot = r() * 180;
    swirls.push(
      `<path d="M${f(x - len / 2)} ${f(y)}q${f(len / 2)} ${f(-8 - r() * 10)} ${f(len)} 0" stroke="#e3dfd7" stroke-width="${f(2.2 + r() * 2)}" stroke-linecap="round" fill="none" transform="rotate(${f(rot)} ${f(x)} ${f(y)})" opacity="${f(0.5 + r() * 0.4)}"/>`,
    );
  }
  // Migas en el borde (bizcocho asomando)
  const crumbs = (cx: number, cy: number, rr: number, from: number, to: number, n: number) => {
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const a = from + r() * (to - from);
      const [x, y] = pt(cx, cy, rr + (r() - 0.3) * 7, a);
      out.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(1 + r() * 2.4)}" fill="${r() < 0.5 ? "#b88a5a" : "#9b6f45"}" opacity="${f(0.55 + r() * 0.4)}"/>`);
    }
    return out.join("");
  };

  // Caras del corte: tiras de bizcocho a lo largo de los dos radios
  const [ax, ay] = pt(C.x, C.y, C.r, CUT[0]);
  const [bx, by] = pt(C.x, C.y, C.r, CUT[1]);
  const flecks = (x1: number, y1: number, x2: number, y2: number) =>
    Array.from({ length: 14 }, () => {
      const t = 0.12 + r() * 0.85;
      return `<circle cx="${f(x1 + (x2 - x1) * t + (r() - 0.5) * 6)}" cy="${f(y1 + (y2 - y1) * t + (r() - 0.5) * 6)}" r="${f(0.9 + r() * 1.3)}" fill="#e2702a" opacity=".8"/>`;
    }).join("");
  const cutFaces = `<path d="M${C.x} ${C.y}L${f(ax)} ${f(ay)}" stroke="#c49a69" stroke-width="13" stroke-linecap="round"/><path d="M${C.x} ${C.y}L${f(bx)} ${f(by)}" stroke="#a47a4c" stroke-width="9" stroke-linecap="round" opacity=".95"/>${flecks(C.x, C.y, ax, ay)}`;

  // Porción en el plato pequeño (sector girado)
  const S = { r: 215, a1: -114, a2: -70 };
  const slicePath = wedge(0, 0, S.r, S.a1, S.a2);
  const sliceFrost = wedge(0, -10, S.r - 16, S.a1 + 3, S.a2 - 3);
  const sliceSwirls: string[] = [];
  for (let i = 0; i < 9; i++) {
    const a = S.a1 + 6 + r() * (S.a2 - S.a1 - 12);
    const [x, y] = pt(0, 0, 50 + r() * 130, a);
    sliceSwirls.push(`<path d="M${f(x - 10)} ${f(y)}q10 -6 20 0" stroke="#d9d5cc" stroke-width="1.4" stroke-linecap="round" fill="none" opacity=".7"/>`);
  }

  const carrot = (x: number, y: number, len: number, rot: number, k = 1.7) =>
    `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${k})" filter="url(#sombraSuave)">
      <path d="M0 -15C${f(len * 0.3)} -17 ${f(len * 0.78)} -9 ${len} -1.5c3 1 3 3 0 4C${f(len * 0.78)} 10 ${f(len * 0.3)} 16 0 15c-6 0-9-6-9-15s3-15 9-15z" fill="url(#zanahoria)"/>
      ${Array.from({ length: 6 }, (_, i) => `<path d="M${f(14 + i * len * 0.13)} ${f(-11 + i * 1.4)}q4 ${f(4 + r() * 3)} 1 ${f(9 + r() * 4)}" stroke="#c4561f" stroke-width="1.2" fill="none" opacity=".55" stroke-linecap="round"/>`).join("")}
      <ellipse cx="-8.5" cy="0" rx="3.2" ry="10" fill="#d9c08a" opacity=".85"/>
    </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>
  <filter id="sombra" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="16" dy="22" stdDeviation="20" flood-color="#2b2a28" flood-opacity=".22"/></filter>
  <filter id="sombraSuave" x="-30%" y="-60%" width="160%" height="220%"><feDropShadow dx="8" dy="12" stdDeviation="8" flood-color="#2b2a28" flood-opacity=".22"/></filter>
  <radialGradient id="plato" cx="45%" cy="40%" r="65%"><stop offset="0" stop-color="#d4d3d0"/><stop offset=".72" stop-color="#bfbebb"/><stop offset="1" stop-color="#a9a8a5"/></radialGradient>
  <radialGradient id="platoFondo" cx="45%" cy="40%" r="60%"><stop offset="0" stop-color="#c2c1be"/><stop offset="1" stop-color="#b0afac"/></radialGradient>
  <radialGradient id="cobertura" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fdfcf9"/><stop offset=".8" stop-color="#f3f0ea"/><stop offset="1" stop-color="#e6e1d8"/></radialGradient>
  <linearGradient id="zanahoria" x1="0" y1="-15" x2="0" y2="15" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#f39a5b"/><stop offset=".5" stop-color="#e9772f"/><stop offset="1" stop-color="#c85a1c"/></linearGradient>
</defs>
<!-- Plato grande -->
<g filter="url(#sombra)">
  <circle cx="${P1.x}" cy="${P1.y}" r="${P1.r}" fill="url(#plato)"/>
  <circle cx="${P1.x}" cy="${P1.y}" r="${P1.r - 58}" fill="url(#platoFondo)"/>
  <circle cx="${P1.x}" cy="${P1.y}" r="${P1.r - 58}" fill="none" stroke="#9f9e9b" stroke-width="2" opacity=".5"/>
</g>
<!-- Tarta con una porción menos -->
<g filter="url(#sombra)">
  <path d="${sector(C.x, C.y, C.r + 6, CUT[0], CUT[1])}" fill="#b98d5f"/>
  <path d="${sector(C.x, C.y, C.r - 4, CUT[0] + 1, CUT[1] - 1)}" fill="url(#cobertura)"/>
</g>
${crumbs(C.x, C.y, C.r + 2, CUT[1] + 2, 360 + CUT[0] - 2, 170)}
${cutFaces}
<g>${swirls.join("")}</g>
<!-- Plato pequeño con la porción -->
<g filter="url(#sombra)">
  <circle cx="${P2.x}" cy="${P2.y}" r="${P2.r}" fill="url(#plato)"/>
  <circle cx="${P2.x}" cy="${P2.y}" r="${P2.r - 36}" fill="url(#platoFondo)"/>
</g>
<g transform="translate(${P2.x + 20} ${P2.y + 105}) rotate(24)">
  <g filter="url(#sombraSuave)">
    <path d="${slicePath}" fill="#a87b4f"/>
    <path d="${sliceFrost}" fill="url(#cobertura)"/>
  </g>
  ${crumbs(0, 0, S.r - 2, S.a1, S.a2, 26)}
  ${sliceSwirls.join("")}
</g>
<!-- Zanahorias -->
${carrot(118, 812, 150, -38)}
${carrot(196, 862, 140, -30)}
</svg>
`;
}

const decor = path.resolve("public/decor");
mkdirSync(decor, { recursive: true });
writeFileSync(
  path.join(decor, "ramas-esquina.svg"),
  branches(7, 520, 520, [
    { x: -10, y: 120, angle: -8, length: 330, bend: 10, twigs: 4 },
    { x: 20, y: -10, angle: 58, length: 300, bend: -8, twigs: 4 },
    { x: -20, y: 40, angle: 22, length: 380, bend: 6, twigs: 5 },
    { x: 60, y: -20, angle: 80, length: 220, bend: 12, twigs: 3 },
  ]),
);
writeFileSync(
  path.join(decor, "ramas-lateral.svg"),
  branches(11, 260, 300, [
    { x: 270, y: 170, angle: 200, length: 170, bend: -10, twigs: 3 },
    { x: 270, y: 140, angle: 222, length: 130, bend: 8, twigs: 3 },
  ]),
);
writeFileSync(path.resolve("public/demo/hero-tarta-zanahoria.svg"), heroCake());
console.log("✓ Decoración y portada generadas en public/decor y public/demo");
