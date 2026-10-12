/**
 * Genera las ilustraciones SVG de demostración en /public/demo.
 * Son marcadores elegantes y ligeros hasta que subas tus fotos reales desde el panel.
 * Uso: npx tsx scripts/generate-demo-images.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT = path.resolve("public/demo");
mkdirSync(OUT, { recursive: true });

// ───────────── utilidades ─────────────
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const f = (n: number) => Math.round(n * 10) / 10;

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + (amount > 0 ? (255 - v) * amount : v * amount))));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

let gid = 0;
const uid = (p: string) => `${p}${++gid}`;

function svg(w: number, h: number, body: string, title: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img"><title>${title}</title>${body}</svg>\n`;
}

function background(w: number, h: number, c1: string, c2: string, seed: number) {
  const id = uid("bg");
  const r = rng(seed);
  let dots = "";
  for (let i = 0; i < 26; i++) {
    const x = r() * w;
    const y = r() * h * 0.55;
    const s = 2 + r() * 4;
    const color = r() > 0.5 ? "#D4B26A" : "#EDBCC5";
    dots += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(s)}" fill="${color}" opacity="${f(0.25 + r() * 0.35)}"/>`;
  }
  return `<defs><radialGradient id="${id}" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs>
<rect width="${w}" height="${h}" fill="url(#${id})"/>
<circle cx="${w / 2}" cy="${h * 0.48}" r="${Math.min(w, h) * 0.36}" fill="#ffffff" opacity="0.45"/>${dots}`;
}

function plate(cx: number, cy: number, rx: number) {
  return `<ellipse cx="${cx}" cy="${cy + 14}" rx="${rx + 10}" ry="${rx * 0.16}" fill="#3B2A22" opacity="0.10"/>
<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${rx * 0.16}" fill="#ffffff"/>
<ellipse cx="${cx}" cy="${cy - 3}" rx="${rx * 0.86}" ry="${rx * 0.13}" fill="none" stroke="#D4B26A" stroke-width="2.5" opacity="0.8"/>`;
}

function cakeStand(cx: number, cy: number, rx: number) {
  return `<ellipse cx="${cx}" cy="${cy + 150}" rx="${rx * 0.55}" ry="${rx * 0.08}" fill="#3B2A22" opacity="0.10"/>
<path d="M${cx - rx * 0.32},${cy + 145} Q${cx},${cy + 120} ${cx + rx * 0.32},${cy + 145} Z" fill="#E9DCCB"/>
<rect x="${cx - 16}" y="${cy + 10}" width="32" height="125" rx="10" fill="#EFE4D6"/>
<ellipse cx="${cx}" cy="${cy + 6}" rx="${rx}" ry="${rx * 0.15}" fill="#E3D3BF"/>
<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${rx * 0.15}" fill="#ffffff"/>
<ellipse cx="${cx}" cy="${cy - 2}" rx="${rx * 0.9}" ry="${rx * 0.13}" fill="none" stroke="#C29A4A" stroke-width="3" opacity="0.7"/>`;
}

type Cyl = { cx: number; top: number; bottom: number; rx: number; ry: number };

function cylinderBody(c: Cyl, fill: string) {
  const id = uid("sh");
  return `<defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity="0.16"/><stop offset="0.35" stop-color="#fff" stop-opacity="0.10"/><stop offset="0.7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.2"/></linearGradient></defs>
<path d="M${c.cx - c.rx},${c.top} L${c.cx - c.rx},${c.bottom} A${c.rx},${c.ry} 0 0 0 ${c.cx + c.rx},${c.bottom} L${c.cx + c.rx},${c.top} Z" fill="${fill}"/>
<path d="M${c.cx - c.rx},${c.top} L${c.cx - c.rx},${c.bottom} A${c.rx},${c.ry} 0 0 0 ${c.cx + c.rx},${c.bottom} L${c.cx + c.rx},${c.top} Z" fill="url(#${id})"/>`;
}

function band(c: Cyl, y1: number, y2: number, fill: string) {
  return `<path d="M${c.cx - c.rx},${y1} A${c.rx},${c.ry} 0 0 0 ${c.cx + c.rx},${y1} L${c.cx + c.rx},${y2} A${c.rx},${c.ry} 0 0 1 ${c.cx - c.rx},${y2} Z" fill="${fill}"/>`;
}

function topEllipse(c: Cyl, fill: string) {
  return `<ellipse cx="${c.cx}" cy="${c.top}" rx="${c.rx}" ry="${c.ry}" fill="${fill}"/>`;
}

function frontY(c: Cyl, x: number, y: number) {
  const t = (x - c.cx) / c.rx;
  return y + c.ry * Math.sqrt(Math.max(0, 1 - t * t));
}

function drip(c: Cyl, color: string, seed: number, maxLen = 90) {
  const r = rng(seed);
  const steps = 13;
  let d = `M${c.cx - c.rx},${c.top}`;
  for (let i = 0; i <= steps; i++) {
    const x = c.cx - c.rx + (2 * c.rx * i) / steps;
    const y = frontY(c, x, c.top) + 10;
    const w = 9 + r() * 7;
    const len = 18 + r() * maxLen * (0.4 + 0.6 * Math.sin((Math.PI * i) / steps));
    if (i === 0 || i === steps) {
      d += ` L${f(x)},${f(y)}`;
      continue;
    }
    d += ` L${f(x - w)},${f(y)} L${f(x - w)},${f(y + len)} A${f(w)},${f(w)} 0 0 0 ${f(x + w)},${f(y + len)} L${f(x + w)},${f(y)}`;
  }
  d += ` L${c.cx + c.rx},${c.top} A${c.rx},${c.ry} 0 0 0 ${c.cx - c.rx},${c.top} Z`;
  return `<path d="${d}" fill="${color}"/><ellipse cx="${c.cx - c.rx * 0.3}" cy="${c.top - 4}" rx="${c.rx * 0.35}" ry="${c.ry * 0.25}" fill="#fff" opacity="0.18"/>`;
}

function dollops(c: Cyl, color: string, count = 12, size = 20) {
  let out = "";
  for (let i = 0; i < count; i++) {
    const a = Math.PI + (Math.PI * (i + 0.5)) / count;
    const x = c.cx + Math.cos(a) * c.rx * 0.86;
    const y = c.top + Math.sin(a) * c.ry * 0.7;
    out += swirl(x, y, size, color);
  }
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * (i + 0.5)) / count;
    const x = c.cx + Math.cos(a) * c.rx * 0.86;
    const y = c.top + Math.sin(a) * c.ry * 0.7;
    out += swirl(x, y, size, color);
  }
  return out;
}

function swirl(x: number, y: number, s: number, color: string) {
  return `<g><ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(s)}" ry="${f(s * 0.62)}" fill="${shade(color, -0.08)}"/>
<ellipse cx="${f(x)}" cy="${f(y - s * 0.38)}" rx="${f(s * 0.72)}" ry="${f(s * 0.48)}" fill="${color}"/>
<path d="M${f(x - s * 0.35)},${f(y - s * 0.6)} Q${f(x)},${f(y - s * 1.45)} ${f(x + s * 0.3)},${f(y - s * 0.62)} Z" fill="${shade(color, 0.12)}"/></g>`;
}

function berry(x: number, y: number, r = 15, color = "#C2324B") {
  return `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${color}"/><circle cx="${f(x - r * 0.35)}" cy="${f(y - r * 0.35)}" r="${f(r * 0.28)}" fill="#fff" opacity="0.5"/>`;
}

function blueberry(x: number, y: number, r = 11) {
  return `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="#3E4C8A"/><circle cx="${f(x)}" cy="${f(y - r * 0.5)}" r="${f(r * 0.25)}" fill="#22284D"/>`;
}

function strawberry(x: number, y: number, s = 26) {
  return `<g><path d="M${f(x)},${f(y + s)} C${f(x - s)},${f(y + s * 0.2)} ${f(x - s * 0.8)},${f(y - s * 0.7)} ${f(x)},${f(y - s * 0.5)} C${f(x + s * 0.8)},${f(y - s * 0.7)} ${f(x + s)},${f(y + s * 0.2)} ${f(x)},${f(y + s)} Z" fill="#D7374E"/>
<path d="M${f(x - s * 0.5)},${f(y - s * 0.5)} L${f(x)},${f(y - s * 0.3)} L${f(x + s * 0.5)},${f(y - s * 0.5)} L${f(x + s * 0.15)},${f(y - s * 0.75)} L${f(x)},${f(y - s * 0.55)} L${f(x - s * 0.15)},${f(y - s * 0.75)} Z" fill="#5E8C4A"/>
<circle cx="${f(x - s * 0.2)}" cy="${f(y)}" r="2" fill="#F8E39A"/><circle cx="${f(x + s * 0.25)}" cy="${f(y + s * 0.2)}" r="2" fill="#F8E39A"/><circle cx="${f(x)}" cy="${f(y + s * 0.5)}" r="2" fill="#F8E39A"/></g>`;
}

function flower(x: number, y: number, s: number, petal: string, center = "#E7C46B") {
  let petals = "";
  for (let i = 0; i < 5; i++) {
    const a = (i * 72 * Math.PI) / 180;
    petals += `<ellipse cx="${f(x + Math.cos(a) * s * 0.55)}" cy="${f(y + Math.sin(a) * s * 0.55)}" rx="${f(s * 0.55)}" ry="${f(s * 0.38)}" transform="rotate(${i * 72} ${f(x + Math.cos(a) * s * 0.55)} ${f(y + Math.sin(a) * s * 0.55)})" fill="${petal}"/>`;
  }
  return `<g>${petals}<circle cx="${f(x)}" cy="${f(y)}" r="${f(s * 0.3)}" fill="${center}"/></g>`;
}

function leaf(x: number, y: number, s: number, rot: number) {
  return `<path d="M${x},${y} q${s * 0.5},${-s * 0.5} ${s},0 q${-s * 0.5},${s * 0.5} ${-s},0 Z" fill="#8FAF7E" transform="rotate(${rot} ${x} ${y})"/>`;
}

function macaron(x: number, y: number, s: number, color: string, rot = 0) {
  return `<g transform="rotate(${rot} ${x} ${y})"><ellipse cx="${x}" cy="${f(y + s * 0.28)}" rx="${s}" ry="${f(s * 0.32)}" fill="${shade(color, -0.1)}"/>
<rect x="${f(x - s * 0.9)}" y="${f(y - s * 0.05)}" width="${f(s * 1.8)}" height="${f(s * 0.22)}" rx="${f(s * 0.1)}" fill="#FFF7EC"/>
<ellipse cx="${x}" cy="${f(y - s * 0.12)}" rx="${s}" ry="${f(s * 0.36)}" fill="${color}"/><ellipse cx="${f(x - s * 0.3)}" cy="${f(y - s * 0.24)}" rx="${f(s * 0.35)}" ry="${f(s * 0.1)}" fill="#fff" opacity="0.35"/></g>`;
}

function candle(x: number, y: number, color: string, h = 70) {
  return `<g><rect x="${x - 7}" y="${y - h}" width="14" height="${h}" rx="4" fill="${color}"/>
<path d="M${x - 7},${y - h + 14} l14,-8 M${x - 7},${y - h + 34} l14,-8 M${x - 7},${y - h + 54} l14,-8" stroke="#fff" stroke-width="4" opacity="0.7"/>
<line x1="${x}" y1="${y - h}" x2="${x}" y2="${y - h - 8}" stroke="#3B2A22" stroke-width="2"/>
<path d="M${x},${y - h - 38} C${x + 12},${y - h - 22} ${x + 9},${y - h - 8} ${x},${y - h - 7} C${x - 9},${y - h - 8} ${x - 12},${y - h - 22} ${x},${y - h - 38} Z" fill="#F6B73C"/>
<path d="M${x},${y - h - 26} C${x + 5},${y - h - 18} ${x + 4},${y - h - 11} ${x},${y - h - 10} C${x - 4},${y - h - 11} ${x - 5},${y - h - 18} ${x},${y - h - 26} Z" fill="#FFF1C4"/></g>`;
}

function sprinkles(cx: number, cy: number, rx: number, ry: number, seed: number, count = 40, colors = ["#F28BA8", "#7FC8E8", "#F7D774", "#9AD6A6", "#C9A2E8", "#ffffff"]) {
  const r = rng(seed);
  let out = "";
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r());
    const x = cx + Math.cos(a) * rx * d;
    const y = cy + Math.sin(a) * ry * d;
    out += `<rect x="${f(x)}" y="${f(y)}" width="12" height="4" rx="2" fill="${colors[i % colors.length]}" transform="rotate(${Math.round(r() * 180)} ${f(x)} ${f(y)})"/>`;
  }
  return out;
}

function shards(c: Cyl, seed: number) {
  const r = rng(seed);
  let out = "";
  for (let i = 0; i < 7; i++) {
    const x = c.cx - c.rx * 0.6 + r() * c.rx * 1.2;
    const y = c.top - 8 + r() * 10;
    const h = 40 + r() * 40;
    out += `<path d="M${f(x)},${f(y)} l${f(10 + r() * 8)},${f(-h)} l${f(14 + r() * 10)},${f(h * 0.7)} Z" fill="${r() > 0.5 ? "#4A2E22" : "#6B4A3A"}" stroke="#3B2A22" stroke-width="1"/>`;
  }
  return out;
}

function goldLeaf(x: number, y: number, s: number) {
  return `<path d="M${x},${y} l${s * 0.6},${-s * 0.3} l${s * 0.2},${s * 0.5} l${-s * 0.5},${s * 0.4} Z" fill="#D4B26A" opacity="0.95"/>`;
}

function topper(x: number, y: number, text: string) {
  return `<g><line x1="${x - 40}" y1="${y}" x2="${x - 40}" y2="${y - 90}" stroke="#C29A4A" stroke-width="4"/><line x1="${x + 40}" y1="${y}" x2="${x + 40}" y2="${y - 90}" stroke="#C29A4A" stroke-width="4"/>
<text x="${x}" y="${y - 92}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-size="54" fill="#C29A4A" stroke="#9C7A35" stroke-width="1">${text}</text></g>`;
}

// ───────────── composiciones ─────────────
type LayerCakeOpts = {
  frosting: string;
  sponge?: string;
  cream?: string;
  naked?: boolean;
  dripColor?: string;
  top?: (c: Cyl) => string;
  front?: (c: Cyl) => string;
  bg?: [string, string];
  seed?: number;
  stand?: boolean;
  height?: number;
};

function layerCake(o: LayerCakeOpts, title: string, w = 800, h = 800) {
  const seed = o.seed ?? 1;
  const ch = o.height ?? 220;
  const c: Cyl = { cx: w / 2, top: 390 - (ch - 220) / 2, bottom: 390 - (ch - 220) / 2 + ch, rx: 220, ry: 48 };
  let body = background(w, h, ...(o.bg ?? ["#FFF8F1", "#F6E7DC"]), seed);
  body += o.stand ? cakeStand(c.cx, c.bottom + 38, 300) : plate(c.cx, c.bottom + 30, 300);
  if (o.naked) {
    body += cylinderBody(c, o.cream ?? "#FFF7EC");
    const layers = 3;
    const gap = 14;
    const lh = (ch - gap * (layers - 1)) / layers;
    for (let i = 0; i < layers; i++) {
      const y1 = c.top + i * (lh + gap);
      body += band(c, y1, y1 + lh, o.sponge ?? "#E7B97A");
    }
    body += cylinderBody({ ...c }, "rgba(255,255,255,0.0)");
    body += `<path d="M${c.cx - c.rx},${c.top} L${c.cx - c.rx},${c.bottom} A${c.rx},${c.ry} 0 0 0 ${c.cx + c.rx},${c.bottom} L${c.cx + c.rx},${c.top} Z" fill="${o.cream ?? "#FFF7EC"}" opacity="0.35"/>`;
    body += topEllipse(c, o.cream ?? "#FFF7EC");
  } else {
    body += cylinderBody(c, o.frosting);
    body += topEllipse(c, shade(o.frosting, 0.15));
  }
  if (o.front) body += o.front(c);
  if (o.dripColor) body += drip(c, o.dripColor, seed + 7);
  if (o.top) body += o.top(c);
  return svg(w, h, body, title);
}

function tieredCake(o: { tiers: number; frosting: string; naked?: boolean; sponge?: string; bg?: [string, string]; seed?: number; flowers?: string[] }, title: string) {
  const w = 800;
  const h = 800;
  const seed = o.seed ?? 3;
  let body = background(w, h, ...(o.bg ?? ["#FFFBF6", "#F3E6DA"]), seed);
  const specs = o.tiers === 3 ? [{ rx: 210, h: 150 }, { rx: 155, h: 130 }, { rx: 105, h: 115 }] : [{ rx: 200, h: 170 }, { rx: 135, h: 150 }];
  let bottom = 640;
  body += cakeStand(400, bottom + 22, 280).replace(/cy="(\d+)"/, (m) => m);
  const cyls: Cyl[] = [];
  for (const s of specs) {
    const c: Cyl = { cx: 400, top: bottom - s.h, bottom, rx: s.rx, ry: s.rx * 0.2 };
    cyls.push(c);
    if (o.naked) {
      body += cylinderBody(c, "#FFF7EC");
      const lh = (s.h - 24) / 2;
      body += band(c, c.top + 4, c.top + 4 + lh, o.sponge ?? "#E7B97A");
      body += band(c, c.top + 16 + lh, c.top + 16 + 2 * lh, o.sponge ?? "#E7B97A");
      body += `<path d="M${c.cx - c.rx},${c.top} L${c.cx - c.rx},${c.bottom} A${c.rx},${c.ry} 0 0 0 ${c.cx + c.rx},${c.bottom} L${c.cx + c.rx},${c.top} Z" fill="#FFF7EC" opacity="0.4"/>`;
      body += topEllipse(c, "#FFF7EC");
    } else {
      body += cylinderBody(c, o.frosting);
      body += topEllipse(c, shade(o.frosting, 0.2));
      // perlas
      for (let i = 0; i <= 16; i++) {
        const x = c.cx - c.rx + (2 * c.rx * i) / 16;
        body += `<circle cx="${f(x)}" cy="${f(frontY(c, x, c.bottom) - 6)}" r="5" fill="#F3E9DA" stroke="#D4B26A" stroke-width="1"/>`;
      }
    }
    bottom = c.top + 6;
  }
  const r = rng(seed);
  const palette = o.flowers ?? ["#F2C5CF", "#ffffff", "#F6D9DE", "#E9B7C2"];
  // cascada de flores
  const path: [number, number][] = [
    [cyls[cyls.length - 1].cx + 30, cyls[cyls.length - 1].top - 10],
    [cyls[cyls.length - 1].cx + 90, cyls[cyls.length - 1].bottom - 30],
    [cyls[0].cx + 120, cyls[0].top + 10],
    [cyls[0].cx + 170, cyls[0].top + 70],
    [cyls[0].cx + 120, cyls[0].bottom - 20],
  ];
  for (const [x, y] of path) {
    for (let i = 0; i < 4; i++) {
      const dx = (r() - 0.5) * 60;
      const dy = (r() - 0.5) * 40;
      body += leaf(x + dx, y + dy, 26, Math.round(r() * 360));
    }
    for (let i = 0; i < 3; i++) body += flower(x + (r() - 0.5) * 50, y + (r() - 0.5) * 30, 18 + r() * 10, palette[Math.floor(r() * palette.length)]);
  }
  return svg(w, h, body, title);
}

function cupcake(cx: number, base: number, s: number, liner: string, frosting: string, topping: "cherry" | "sprinkles" | "topper" | "berry" | "crumbs", seed: number) {
  const w = 62 * s;
  const lh = 95 * s;
  let out = `<ellipse cx="${cx}" cy="${base + 6}" rx="${w * 0.95}" ry="${10 * s}" fill="#3B2A22" opacity="0.10"/>`;
  out += `<path d="M${f(cx - w)},${f(base - lh)} L${f(cx + w)},${f(base - lh)} L${f(cx + w * 0.75)},${base} L${f(cx - w * 0.75)},${base} Z" fill="${liner}"/>`;
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    out += `<line x1="${f(cx - w + 2 * w * t)}" y1="${f(base - lh)}" x2="${f(cx - w * 0.75 + 1.5 * w * t)}" y2="${base}" stroke="${shade(liner, -0.15)}" stroke-width="${f(3 * s)}"/>`;
  }
  out += `<ellipse cx="${cx}" cy="${f(base - lh)}" rx="${f(w * 1.08)}" ry="${f(16 * s)}" fill="${shade(frosting, -0.08)}"/>`;
  out += `<ellipse cx="${cx}" cy="${f(base - lh - 22 * s)}" rx="${f(w * 0.98)}" ry="${f(28 * s)}" fill="${frosting}"/>`;
  out += `<ellipse cx="${cx}" cy="${f(base - lh - 52 * s)}" rx="${f(w * 0.72)}" ry="${f(24 * s)}" fill="${shade(frosting, 0.06)}"/>`;
  out += `<ellipse cx="${cx}" cy="${f(base - lh - 78 * s)}" rx="${f(w * 0.45)}" ry="${f(18 * s)}" fill="${shade(frosting, 0.12)}"/>`;
  out += `<path d="M${f(cx - w * 0.25)},${f(base - lh - 88 * s)} Q${cx},${f(base - lh - 130 * s)} ${f(cx + w * 0.2)},${f(base - lh - 90 * s)} Z" fill="${shade(frosting, 0.18)}"/>`;
  out += `<ellipse cx="${f(cx - w * 0.4)}" cy="${f(base - lh - 30 * s)}" rx="${f(w * 0.3)}" ry="${f(6 * s)}" fill="#fff" opacity="0.3"/>`;
  const topY = base - lh - 112 * s;
  if (topping === "cherry") out += `<path d="M${cx},${f(topY)} q${f(10 * s)},${f(-30 * s)} ${f(26 * s)},${f(-38 * s)}" stroke="#5E8C4A" stroke-width="${f(3 * s)}" fill="none"/>` + berry(cx, topY + 6 * s, 16 * s, "#C2203B");
  if (topping === "berry") out += berry(cx - 10 * s, topY + 14 * s, 11 * s, "#C2324B") + blueberry(cx + 12 * s, topY + 16 * s, 10 * s);
  if (topping === "sprinkles") out += sprinkles(cx, base - lh - 45 * s, w * 0.8, 40 * s, seed, 22);
  if (topping === "crumbs") {
    const r = rng(seed);
    for (let i = 0; i < 14; i++) out += `<circle cx="${f(cx + (r() - 0.5) * w * 1.2)}" cy="${f(base - lh - 30 * s - r() * 60 * s)}" r="${f(4 * s)}" fill="#A8323F"/>`;
  }
  if (topping === "topper") out += `<circle cx="${cx}" cy="${f(topY - 4 * s)}" r="${f(26 * s)}" fill="#fff" stroke="#C29A4A" stroke-width="${f(3 * s)}"/><path d="M${f(cx - 10 * s)},${f(topY - 8 * s)} a${f(6 * s)},${f(6 * s)} 0 0 1 ${f(10 * s)},0 a${f(6 * s)},${f(6 * s)} 0 0 1 ${f(10 * s)},0 q0,${f(10 * s)} ${f(-10 * s)},${f(18 * s)} q${f(-10 * s)},${f(-8 * s)} ${f(-10 * s)},${f(-18 * s)} Z" fill="#E58FA3"/>`;
  return out;
}

function cupcakesScene(items: { liner: string; frosting: string; topping: "cherry" | "sprinkles" | "topper" | "berry" | "crumbs" }[], title: string, seed: number, bg: [string, string] = ["#FFF8F1", "#F8E3E6"]) {
  let body = background(800, 800, ...bg, seed);
  body += `<ellipse cx="400" cy="640" rx="330" ry="40" fill="#fff" opacity="0.8"/>`;
  const positions = items.length === 3 ? [[250, 600, 0.95], [550, 600, 0.95], [400, 650, 1.15]] : [[400, 640, 1.3]];
  items.forEach((it, i) => {
    const [x, y, s] = positions[i] ?? positions[0];
    body += cupcake(x, y, s, it.liner, it.frosting, it.topping, seed + i);
  });
  return svg(800, 800, body, title);
}

function cookie(cx: number, cy: number, r: number, base: string, icing: string | null, pattern: "heart" | "flower" | "star" | "dots" | "chips" | "plain", seed: number) {
  let out = `<circle cx="${cx}" cy="${cy + 6}" r="${r}" fill="#3B2A22" opacity="0.10"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="${shade(base, -0.12)}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.9}" fill="${base}"/>`;
  const rr = rng(seed);
  if (icing) out += `<circle cx="${cx}" cy="${cy}" r="${r * 0.78}" fill="${icing}"/>`;
  if (pattern === "heart") out += `<path d="M${cx},${f(cy + r * 0.45)} C${f(cx - r * 0.7)},${f(cy)} ${f(cx - r * 0.45)},${f(cy - r * 0.55)} ${cx},${f(cy - r * 0.2)} C${f(cx + r * 0.45)},${f(cy - r * 0.55)} ${f(cx + r * 0.7)},${cy} ${cx},${f(cy + r * 0.45)} Z" fill="#E58FA3"/>`;
  if (pattern === "flower") out += flower(cx, cy, r * 0.5, "#fff", "#E7C46B");
  if (pattern === "star") {
    let d = "";
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 ? r * 0.25 : r * 0.55;
      d += `${i ? "L" : "M"}${f(cx + Math.cos(a) * rad)},${f(cy + Math.sin(a) * rad)} `;
    }
    out += `<path d="${d}Z" fill="#E7C46B"/>`;
  }
  if (pattern === "dots" || icing) {
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      out += `<circle cx="${f(cx + Math.cos(a) * r * 0.7)}" cy="${f(cy + Math.sin(a) * r * 0.7)}" r="${f(r * 0.04)}" fill="#fff"/>`;
    }
  }
  if (pattern === "chips") for (let i = 0; i < 9; i++) out += `<ellipse cx="${f(cx + (rr() - 0.5) * r * 1.3)}" cy="${f(cy + (rr() - 0.5) * r * 1.3)}" rx="${f(r * 0.1)}" ry="${f(r * 0.08)}" fill="#4A2E22"/>`;
  if (pattern === "plain") for (let i = 0; i < 20; i++) out += `<circle cx="${f(cx + (rr() - 0.5) * r * 1.2)}" cy="${f(cy + (rr() - 0.5) * r * 1.2)}" r="2" fill="#fff" opacity="0.8"/>`;
  return out;
}

function cookiesScene(kind: "decorated" | "butter" | "chips", title: string, seed: number) {
  let body = background(800, 800, "#FFF9F3", "#F3E3D3", seed);
  body += `<ellipse cx="400" cy="430" rx="320" ry="300" fill="#fff" opacity="0.9"/><ellipse cx="400" cy="430" rx="290" ry="270" fill="none" stroke="#D4B26A" stroke-width="3" opacity="0.6"/>`;
  const spots: [number, number, number][] = [[300, 330, 95], [500, 320, 90], [270, 520, 88], [480, 525, 100], [395, 425, 80]];
  const patterns = ["heart", "flower", "star", "dots", "heart"] as const;
  const icings = ["#F6D9DE", "#CDBFE3", "#BFE3D0", "#BCD8EE", "#FBF7F0"];
  spots.forEach(([x, y, r], i) => {
    if (kind === "decorated") body += cookie(x, y, r, "#E2B47C", icings[i], patterns[i], seed + i);
    if (kind === "butter") body += cookie(x, y, r * 0.8, i % 2 ? "#EAC48F" : "#E5B877", null, "plain", seed + i);
    if (kind === "chips") body += cookie(x, y, r, "#C98F55", null, "chips", seed + i);
  });
  return svg(800, 800, body, title);
}

function brownieScene(dough: string, title: string, seed: number, extra: "nuts" | "raspberry") {
  let body = background(800, 800, "#FFF8F1", "#EFE2D4", seed);
  body += plate(400, 640, 300);
  const r = rng(seed);
  const blocks: [number, number][] = [[260, 600], [470, 600], [365, 470]];
  for (const [x, y] of blocks) {
    const w = 190;
    const h = 95;
    const d = 60;
    body += `<path d="M${x},${y} l${w},0 l0,${-h} l${-w},0 Z" fill="${dough}"/>`;
    body += `<path d="M${x},${y - h} l${d * 0.6},${-d * 0.5} l${w},0 l${-d * 0.6},${d * 0.5} Z" fill="${shade(dough, 0.18)}"/>`;
    body += `<path d="M${x + w},${y} l${d * 0.6},${-d * 0.5} l0,${-h} l${-d * 0.6},${d * 0.5} Z" fill="${shade(dough, -0.25)}"/>`;
    for (let i = 0; i < 5; i++) body += `<path d="M${f(x + 20 + r() * 150)},${f(y - h - 6 - r() * 20)} l${f(18 + r() * 20)},${f(-4 + r() * 8)}" stroke="${shade(dough, -0.3)}" stroke-width="3" stroke-linecap="round"/>`;
    for (let i = 0; i < 4; i++) {
      const px = x + 30 + r() * 140;
      const py = y - h - 10 - r() * 18;
      body += extra === "nuts" ? `<ellipse cx="${f(px)}" cy="${f(py)}" rx="14" ry="9" fill="#B07A4A" stroke="#8A5A33" stroke-width="2"/>` : berry(px, py, 10, "#D5455F");
    }
    for (let i = 0; i < 6; i++) body += `<circle cx="${f(x + 15 + r() * 160)}" cy="${f(y - 10 - r() * (h - 20))}" r="${f(3 + r() * 3)}" fill="${shade(dough, -0.35)}" opacity="0.6"/>`;
  }
  return svg(800, 800, body, title);
}

function dessertCups(kind: "tiramisu" | "lemon" | "macarons", title: string, seed: number) {
  let body = background(800, 800, "#FFFAF4", kind === "lemon" ? "#F7EBC8" : "#F3E2D6", seed);
  body += `<ellipse cx="400" cy="650" rx="330" ry="38" fill="#fff" opacity="0.85"/>`;
  if (kind === "tiramisu") {
    for (const [x, s] of [[255, 0.9], [545, 0.9], [400, 1.1]] as [number, number][]) {
      const w = 95 * s;
      const h = 220 * s;
      const base = x === 400 ? 660 : 620;
      body += `<rect x="${x - w}" y="${base - h}" width="${2 * w}" height="${h}" rx="${18 * s}" fill="#ffffff" opacity="0.55" stroke="#E3D3BF" stroke-width="3"/>`;
      const layers = ["#6B4A3A", "#FBF1E1", "#8A5E46", "#FBF1E1"];
      layers.forEach((col, i) => {
        body += `<rect x="${x - w + 8}" y="${f(base - 14 - (i + 1) * (h - 40) / 4)}" width="${2 * w - 16}" height="${f((h - 40) / 4)}" rx="6" fill="${col}"/>`;
      });
      body += `<ellipse cx="${x}" cy="${f(base - h + 24)}" rx="${w - 8}" ry="${12 * s}" fill="#7A4E36"/>`;
      body += `<rect x="${x - w}" y="${base - h}" width="${2 * w}" height="${h}" rx="${18 * s}" fill="none" stroke="#fff" stroke-width="5" opacity="0.6"/>`;
    }
  }
  if (kind === "lemon") {
    for (const [x, y, s] of [[260, 560, 0.9], [540, 560, 0.9], [400, 640, 1.1]] as [number, number, number][]) {
      const w = 120 * s;
      body += `<ellipse cx="${x}" cy="${y + 8}" rx="${w}" ry="${26 * s}" fill="#3B2A22" opacity="0.1"/>`;
      let crust = `M${x - w},${y - 40 * s}`;
      for (let i = 0; i <= 12; i++) crust += ` L${f(x - w + (2 * w * i) / 12)},${f(y - 40 * s - (i % 2 ? 8 * s : 0))}`;
      crust += ` L${f(x + w * 0.85)},${y} L${f(x - w * 0.85)},${y} Z`;
      body += `<path d="${crust}" fill="#D9A25E"/>`;
      body += `<ellipse cx="${x}" cy="${f(y - 42 * s)}" rx="${f(w * 0.95)}" ry="${f(24 * s)}" fill="#F4D35E"/>`;
      for (let i = 0; i < 5; i++) {
        const px = x - w * 0.6 + i * w * 0.3;
        body += `<path d="M${f(px - 22 * s)},${f(y - 40 * s)} Q${f(px)},${f(y - 120 * s)} ${f(px + 22 * s)},${f(y - 40 * s)} Z" fill="#FFF8EE"/><path d="M${f(px - 6 * s)},${f(y - 85 * s)} Q${f(px)},${f(y - 118 * s)} ${f(px + 6 * s)},${f(y - 85 * s)} Z" fill="#D9A25E"/>`;
      }
    }
  }
  if (kind === "macarons") {
    const colors = ["#F2B8C6", "#CDBFE3", "#BFE3D0", "#F7E3A1", "#F6C7A6", "#BCD8EE"];
    let i = 0;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4 - row; col++) {
        const x = 400 - (3 - row) * 62 + col * 124;
        const y = 600 - row * 78;
        body += macaron(x, y, 58, colors[i++ % colors.length]);
      }
    }
  }
  return svg(800, 800, body, title);
}

function giftScene(kind: "birthday" | "merienda" | "table", title: string, seed: number) {
  let body = background(800, 800, "#FFF8F2", "#F6DDE2", seed);
  body += `<ellipse cx="400" cy="660" rx="330" ry="36" fill="#fff" opacity="0.85"/>`;
  // caja
  const x = kind === "table" ? 140 : 210;
  const w = kind === "table" ? 230 : 300;
  const y = 650;
  const h = kind === "table" ? 170 : 230;
  body += `<rect x="${x}" y="${y - h}" width="${w}" height="${h}" rx="10" fill="#F6D9DE"/>`;
  body += `<rect x="${x - 12}" y="${y - h - 46}" width="${w + 24}" height="56" rx="10" fill="#EDBCC5"/>`;
  body += `<rect x="${x + w / 2 - 18}" y="${y - h - 46}" width="36" height="${h + 46}" fill="#C29A4A"/>`;
  body += `<path d="M${x + w / 2},${y - h - 46} C${x + w / 2 - 90},${y - h - 140} ${x + w / 2 - 120},${y - h - 30} ${x + w / 2},${y - h - 46} Z" fill="#D4B26A"/><path d="M${x + w / 2},${y - h - 46} C${x + w / 2 + 90},${y - h - 140} ${x + w / 2 + 120},${y - h - 30} ${x + w / 2},${y - h - 46} Z" fill="#D4B26A"/>`;
  body += `<circle cx="${x + w / 2}" cy="${y - h - 46}" r="16" fill="#C29A4A"/>`;
  if (kind === "birthday") {
    body += cupcake(610, 650, 0.85, "#BCD8EE", "#F6D9DE", "sprinkles", seed);
    body += candle(150, 655, "#7FC8E8", 90) + candle(185, 655, "#F28BA8", 70);
  }
  if (kind === "merienda") {
    body += cookie(600, 600, 70, "#C98F55", null, "chips", seed);
    body += cookie(660, 520, 50, "#E2B47C", "#F6D9DE", "heart", seed + 1);
  }
  if (kind === "table") {
    body += `<rect x="400" y="520" width="310" height="14" rx="6" fill="#E3D3BF"/><rect x="545" y="534" width="20" height="116" fill="#E3D3BF"/>`;
    body += cupcake(460, 520, 0.6, "#F6D9DE", "#FBF7F0", "cherry", seed) + cupcake(560, 520, 0.6, "#CDBFE3", "#F2B8C6", "sprinkles", seed + 1) + cupcake(655, 520, 0.6, "#BFE3D0", "#FBF7F0", "berry", seed + 2);
    body += macaron(470, 640, 34, "#F2B8C6") + macaron(560, 640, 34, "#CDBFE3") + macaron(650, 640, 34, "#F7E3A1");
  }
  return svg(800, 800, body, title);
}

function seasonalScene(kind: "huesos", title: string, seed: number) {
  let body = background(800, 800, "#FFF8F1", "#F1DFC8", seed);
  body += plate(400, 620, 300);
  if (kind === "huesos") {
    const rolls: [number, number, number][] = [[300, 520, -12], [470, 500, 8], [380, 590, -4]];
    for (const [x, y, rot] of rolls) {
      body += `<g transform="rotate(${rot} ${x} ${y})"><rect x="${x - 100}" y="${y - 32}" width="200" height="64" rx="32" fill="#FBF3E4" stroke="#EADBC4" stroke-width="3"/><ellipse cx="${x + 96}" cy="${y}" rx="14" ry="30" fill="#F2C14E"/><ellipse cx="${x - 96}" cy="${y}" rx="14" ry="30" fill="#F2C14E"/></g>`;
    }
    const r = rng(seed);
    for (let i = 0; i < 9; i++) {
      const x = 200 + r() * 400;
      const y = 400 + r() * 70;
      body += `<circle cx="${f(x)}" cy="${f(y)}" r="30" fill="#E2A75E"/><circle cx="${f(x - 8)}" cy="${f(y - 10)}" r="8" fill="#F6CF8F" opacity="0.8"/>`;
      for (let k = 0; k < 6; k++) body += `<circle cx="${f(x + (r() - 0.5) * 40)}" cy="${f(y + (r() - 0.5) * 40)}" r="2" fill="#fff"/>`;
    }
  }
  return svg(800, 800, body, title);
}

function storefront(title: string) {
  const w = 1200;
  const h = 800;
  let body = `<rect width="${w}" height="${h}" fill="#F8EFE6"/><rect y="640" width="${w}" height="160" fill="#E9DCCB"/>`;
  body += `<rect x="150" y="120" width="900" height="520" fill="#FFFAF4" stroke="#E3D3BF" stroke-width="4"/>`;
  body += `<rect x="150" y="120" width="900" height="90" fill="#3B2A22"/><text x="600" y="180" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="52" fill="#E6CF9B">Repostería artesanal</text>`;
  // toldo
  for (let i = 0; i < 12; i++) body += `<path d="M${150 + i * 75},210 l75,0 l0,60 a37.5,22 0 0 1 -75,0 Z" fill="${i % 2 ? "#FFFFFF" : "#EDBCC5"}"/>`;
  // escaparate
  body += `<rect x="200" y="320" width="520" height="300" rx="8" fill="#DCEAF0" stroke="#C29A4A" stroke-width="6"/>`;
  body += `<rect x="230" y="520" width="460" height="10" fill="#E3D3BF"/>`;
  body += cupcake(300, 520, 0.6, "#F6D9DE", "#FBF7F0", "cherry", 4) + cupcake(400, 520, 0.6, "#CDBFE3", "#F2B8C6", "sprinkles", 5);
  body += `<g transform="translate(470 360) scale(0.42)">${'<rect x="0" y="120" width="380" height="200" fill="#F2C5CF"/><ellipse cx="190" cy="120" rx="190" ry="40" fill="#F8DDE3"/><ellipse cx="190" cy="320" rx="190" ry="40" fill="#F2C5CF"/>'}</g>`;
  body += macaron(560, 590, 26, "#BFE3D0") + macaron(620, 590, 26, "#F7E3A1");
  // puerta
  body += `<rect x="780" y="320" width="200" height="320" rx="6" fill="#A84D60"/><rect x="805" y="345" width="150" height="150" rx="75" fill="#DCEAF0"/><circle cx="950" cy="500" r="8" fill="#E6CF9B"/>`;
  // plantas
  body += `<rect x="1040" y="560" width="70" height="80" rx="8" fill="#C29A4A"/>` + leaf(1060, 560, 60, -80) + leaf(1080, 555, 60, -110) + leaf(1070, 560, 55, -60);
  body += `<rect x="90" y="560" width="70" height="80" rx="8" fill="#C29A4A"/>` + leaf(110, 560, 60, -80) + leaf(130, 555, 60, -110) + leaf(120, 560, 55, -60);
  return svg(w, h, body, title);
}

function hero() {
  const w = 1000;
  const h = 1000;
  const c: Cyl = { cx: 500, top: 430, bottom: 690, rx: 280, ry: 60 };
  let body = background(w, h, "#FFF9F4", "#F7DFE3", 99);
  body += `<circle cx="500" cy="520" r="400" fill="#F6D9DE" opacity="0.5"/>`;
  body += cakeStand(500, c.bottom + 40, 380);
  body += cylinderBody(c, "#F4CBD3");
  // rosetas laterales
  for (let i = 0; i <= 14; i++) {
    const x = c.cx - c.rx + (2 * c.rx * i) / 14;
    body += `<circle cx="${f(x)}" cy="${f(frontY(c, x, c.bottom) - 10)}" r="13" fill="#FBEFF1"/>`;
  }
  body += topEllipse(c, "#F8DDE3");
  body += drip(c, "#D4B26A", 12, 110);
  body += dollops(c, "#FFF7F0", 10, 24);
  const r = rng(5);
  body += macaron(400, 395, 42, "#CDBFE3", -12) + macaron(470, 380, 40, "#F7E3A1", 6);
  body += flower(590, 380, 46, "#FFFFFF") + flower(640, 410, 34, "#F2B8C6") + leaf(620, 350, 50, -30) + leaf(660, 380, 44, 20);
  body += strawberry(520, 400, 30) + strawberry(555, 425, 24);
  for (let i = 0; i < 8; i++) body += goldLeaf(380 + r() * 260, 390 + r() * 40, 18);
  for (let i = 0; i < 6; i++) body += berry(360 + r() * 300, 420 + r() * 30, 10, "#3E4C8A");
  // destellos
  for (const [x, y, s] of [[180, 220, 18], [830, 260, 14], [860, 640, 12], [140, 600, 10]] as [number, number, number][]) {
    body += `<path d="M${x},${y - s} Q${x},${y} ${x + s},${y} Q${x},${y} ${x},${y + s} Q${x},${y} ${x - s},${y} Q${x},${y} ${x},${y - s} Z" fill="#D4B26A" opacity="0.8"/>`;
  }
  return svg(w, h, body, "Tarta artesanal rosa con goteo dorado, macarons, flores y fresas");
}

// ───────────── catálogo de ilustraciones ─────────────
const images: Record<string, string> = {
  "tarta-personalizada-nombre": layerCake(
    { frosting: "#F4CBD3", dripColor: "#D4B26A", seed: 11, top: (c) => dollops(c, "#FFF7F0", 9, 18) + topper(c.cx, c.top + 10, "Lucía") },
    "Tarta personalizada rosa con goteo dorado y topper con nombre",
  ),
  "tarta-foto-comestible": layerCake(
    {
      frosting: "#FBF7F0",
      seed: 12,
      bg: ["#FFF9F4", "#E7EEF6"],
      top: (c) =>
        `<ellipse cx="${c.cx}" cy="${c.top}" rx="${c.rx * 0.62}" ry="${c.ry * 0.62}" fill="#BCD8EE"/><ellipse cx="${c.cx}" cy="${c.top + 4}" rx="${c.rx * 0.4}" ry="${c.ry * 0.3}" fill="#9AD6A6"/><circle cx="${c.cx + 60}" cy="${c.top - 12}" r="10" fill="#F7D774"/>` +
        dollops(c, "#ffffff", 12, 14),
      front: (c) => {
        let out = "";
        for (let i = 0; i <= 18; i++) {
          const x = c.cx - c.rx + (2 * c.rx * i) / 18;
          out += `<circle cx="${f(x)}" cy="${f(frontY(c, x, c.bottom) - 8)}" r="9" fill="#BCD8EE"/>`;
        }
        return out;
      },
    },
    "Tarta blanca con fotografía comestible en la parte superior",
  ),
  "naked-cake-flores": layerCake(
    {
      frosting: "#FFF7EC",
      naked: true,
      sponge: "#EBC28A",
      seed: 13,
      bg: ["#FFFBF5", "#EEF2E6"],
      top: (c) => flower(c.cx - 70, c.top - 10, 34, "#F2B8C6") + flower(c.cx + 10, c.top - 18, 40, "#ffffff") + flower(c.cx + 85, c.top - 6, 30, "#CDBFE3") + leaf(c.cx - 130, c.top - 4, 46, -20) + leaf(c.cx + 120, c.top - 10, 46, 200) + leaf(c.cx + 40, c.top - 30, 40, -60),
    },
    "Naked cake de bizcocho con flores comestibles",
  ),
  "tarta-chocolate-triple": layerCake(
    { frosting: "#6B4A3A", dripColor: "#3E271D", seed: 14, bg: ["#FFF6EE", "#EAD8C8"], top: (c) => dollops(c, "#8A5E46", 10, 18) + shards(c, 4) },
    "Tarta de triple chocolate con goteo y virutas",
  ),
  "red-velvet": layerCake(
    { frosting: "#FFF7EC", naked: true, sponge: "#A8323F", cream: "#FFF4EA", seed: 15, top: (c) => dollops(c, "#FFF4EA", 10, 18) + berry(c.cx - 30, c.top - 14, 16) + berry(c.cx + 20, c.top - 8, 14) + leaf(c.cx + 50, c.top - 18, 30, -30) },
    "Tarta red velvet con crema de queso",
  ),
  "tarta-zanahoria": layerCake(
    {
      frosting: "#FFF7EC",
      naked: true,
      sponge: "#C98A4B",
      seed: 16,
      bg: ["#FFF9F1", "#F6E2C9"],
      top: (c) => {
        let out = dollops(c, "#FFF4EA", 10, 16);
        const r = rng(8);
        for (let i = 0; i < 8; i++) out += `<ellipse cx="${f(c.cx - 120 + r() * 240)}" cy="${f(c.top - 10 + r() * 20)}" rx="14" ry="9" fill="#B07A4A" stroke="#8A5A33" stroke-width="2"/>`;
        return out + `<path d="M${c.cx - 10},${c.top - 30} l40,-10 l-30,30 Z" fill="#F08A2E"/>`;
      },
    },
    "Tarta de zanahoria con frosting y nueces",
  ),
  "tarta-queso": layerCake(
    {
      frosting: "#F6E3B4",
      seed: 17,
      height: 150,
      bg: ["#FFFAF2", "#F4E6CC"],
      top: (c) => `<ellipse cx="${c.cx}" cy="${c.top}" rx="${c.rx}" ry="${c.ry}" fill="#B9773A"/><ellipse cx="${c.cx - 40}" cy="${c.top - 6}" rx="${c.rx * 0.6}" ry="${c.ry * 0.5}" fill="#8A4F22" opacity="0.65"/><ellipse cx="${c.cx + 60}" cy="${c.top + 6}" rx="${c.rx * 0.3}" ry="${c.ry * 0.3}" fill="#5E3416" opacity="0.5"/>`,
      front: (c) => `<path d="M${c.cx - c.rx},${c.top} L${c.cx - c.rx},${c.top + 26} A${c.rx},${c.ry} 0 0 0 ${c.cx + c.rx},${c.top + 26} L${c.cx + c.rx},${c.top} Z" fill="#C88A4E" opacity="0.6"/>`,
    },
    "Tarta de queso al horno con superficie tostada",
  ),
  "tarta-cumpleanos-velas": layerCake(
    {
      frosting: "#BCD8EE",
      dripColor: "#F2B8C6",
      seed: 18,
      bg: ["#FFF9F4", "#E6F0F8"],
      top: (c) => sprinkles(c.cx, c.top, c.rx * 0.8, c.ry * 0.6, 3, 50) + candle(c.cx - 70, c.top + 5, "#F28BA8") + candle(c.cx, c.top - 8, "#F7D774", 85) + candle(c.cx + 70, c.top + 5, "#9AD6A6"),
      front: (c) => sprinkles(c.cx, c.top + 140, c.rx * 0.9, 50, 9, 40),
    },
    "Tarta de cumpleaños azul con fideos de colores y velas",
  ),
  "tarta-calabaza": layerCake(
    {
      frosting: "#E59A4E",
      seed: 19,
      height: 140,
      bg: ["#FFF7EE", "#F3DCC2"],
      top: (c) => {
        let out = `<ellipse cx="${c.cx}" cy="${c.top}" rx="${c.rx}" ry="${c.ry}" fill="#D9822F"/>`;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          out += swirl(c.cx + Math.cos(a) * c.rx * 0.7, c.top + Math.sin(a) * c.ry * 0.6, 16, "#FFF4E6");
        }
        return out + leaf(c.cx - 20, c.top - 10, 40, -30) + leaf(c.cx + 10, c.top - 6, 36, 200);
      },
      front: (c) => `<path d="M${c.cx - c.rx},${c.top + 90} L${c.cx - c.rx},${c.bottom} A${c.rx},${c.ry} 0 0 0 ${c.cx + c.rx},${c.bottom} L${c.cx + c.rx},${c.top + 90} A${c.rx},${c.ry} 0 0 1 ${c.cx - c.rx},${c.top + 90} Z" fill="#B97A3E"/>`,
    },
    "Tarta de calabaza y especias con crema",
  ),
  "tarta-boda-tres-pisos": tieredCake({ tiers: 3, frosting: "#FBF7F0", seed: 21 }, "Tarta nupcial blanca de tres pisos con cascada de flores"),
  "tarta-boda-semidesnuda": tieredCake({ tiers: 2, frosting: "#FFF7EC", naked: true, seed: 22, flowers: ["#ffffff", "#F2C5CF", "#CDBFE3"] }, "Tarta de boda semidesnuda de dos pisos con flores"),
  "cupcakes-variados": cupcakesScene(
    [
      { liner: "#F6D9DE", frosting: "#FBF7F0", topping: "cherry" },
      { liner: "#CDBFE3", frosting: "#F2B8C6", topping: "sprinkles" },
      { liner: "#BFE3D0", frosting: "#8A5E46", topping: "berry" },
    ],
    "Caja de cupcakes variados",
    31,
  ),
  "cupcakes-red-velvet": cupcakesScene(
    [
      { liner: "#A8323F", frosting: "#FFF4EA", topping: "crumbs" },
      { liner: "#A8323F", frosting: "#FFF4EA", topping: "crumbs" },
      { liner: "#A8323F", frosting: "#FFF4EA", topping: "crumbs" },
    ],
    "Cupcakes red velvet con frosting de queso",
    32,
  ),
  "cupcakes-personalizados": cupcakesScene(
    [
      { liner: "#F6D9DE", frosting: "#F2B8C6", topping: "topper" },
      { liner: "#BCD8EE", frosting: "#FBF7F0", topping: "topper" },
      { liner: "#F7E3A1", frosting: "#CDBFE3", topping: "topper" },
    ],
    "Cupcakes personalizados con toppers decorados",
    33,
    ["#FFF8F4", "#EDE6F6"],
  ),
  "galletas-decoradas": cookiesScene("decorated", "Galletas decoradas con glasa de colores", 41),
  "galletas-mantequilla": cookiesScene("butter", "Galletas de mantequilla artesanas", 42),
  "cookies-chocolate": cookiesScene("chips", "Cookies con pepitas de chocolate", 43),
  "brownie-nueces": brownieScene("#4A2E22", "Brownie de chocolate y nueces", 51, "nuts"),
  "blondie-frambuesa": brownieScene("#E2B97A", "Blondie de chocolate blanco y frambuesa", 52, "raspberry"),
  "vasitos-tiramisu": dessertCups("tiramisu", "Vasitos individuales de tiramisú", 61),
  "tartaletas-limon": dessertCups("lemon", "Tartaletas de limón con merengue tostado", 62),
  macarons: dessertCups("macarons", "Macarons de colores pastel", 63),
  "pack-cumpleanos": giftScene("birthday", "Pack de cumpleaños con caja regalo, cupcake y velas", 71),
  "pack-merienda": giftScene("merienda", "Pack de merienda con galletas y caja regalo", 72),
  "mesa-dulce": giftScene("table", "Mesa dulce para eventos con cupcakes y macarons", 73),
  "huesos-santo": seasonalScene("huesos", "Huesos de santo y buñuelos de temporada", 81),
};

for (const [name, content] of Object.entries(images)) writeFileSync(path.join(OUT, `${name}.svg`), content);
writeFileSync(path.join(OUT, "hero-tarta.svg"), hero());
writeFileSync(path.join(OUT, "obrador.svg"), storefront("Fachada de la repostería con toldo y escaparate"));

// Imagen para redes sociales (Open Graph) en JPG: las redes no admiten SVG.
const og = svg(
  1200,
  630,
  `<rect width="1200" height="630" fill="#FBF7F2"/><g transform="translate(560 -60) scale(0.72)">${hero().replace(/<svg[^>]*>|<\/svg>|<title>.*?<\/title>/g, "")}</g>
<rect x="60" y="210" width="6" height="210" fill="#C29A4A"/>
<text x="90" y="290" font-family="Georgia, serif" font-style="italic" font-size="64" fill="#3B2A22">Repostería</text>
<text x="90" y="370" font-family="Georgia, serif" font-style="italic" font-size="64" fill="#3B2A22">artesanal</text>
<text x="92" y="420" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#7A6458">Tartas personalizadas · Pedidos online</text>`,
  "Repostería artesanal",
);
sharp(Buffer.from(og))
  .jpeg({ quality: 86 })
  .toFile(path.join(OUT, "og-default.jpg"))
  .then(() => console.log(`✔ ${Object.keys(images).length + 2} ilustraciones + og-default.jpg en public/demo`));
