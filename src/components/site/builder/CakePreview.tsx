/** Vista previa ilustrada de la tarta según las opciones elegidas (orientativa). */
const SPONGE_COLORS: Record<string, string> = {
  vainilla: "#EBC28A",
  chocolate: "#6B4A3A",
  "red-velvet": "#A8323F",
  zanahoria: "#C98A4B",
  limon: "#F2D477",
};

function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + (amount > 0 ? (255 - v) * amount : v * amount))));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

export function CakePreview({
  colors,
  spongeId,
  coveringId,
  decorationIds,
  text,
  tiers,
}: {
  colors: string[];
  spongeId: string;
  coveringId: string;
  decorationIds: string[];
  text: string;
  tiers: number;
}) {
  const main = colors[0] ?? "#F6D9DE";
  const accent = colors[1] ?? "#FFFFFF";
  const gold = colors.includes("#C9A45C");
  const naked = coveringId === "naked";
  const ganache = coveringId === "ganache";
  const frosting = ganache ? "#5A3A2C" : main;
  const sponge = SPONGE_COLORS[spongeId] ?? "#EBC28A";
  const has = (id: string) => decorationIds.includes(id);

  const levels = tiers === 2 ? [{ rx: 150, h: 120, bottom: 330 }, { rx: 100, h: 95, bottom: 216 }] : [{ rx: 160, h: 150, bottom: 330 }];
  const topLevel = levels[levels.length - 1];
  const topY = topLevel.bottom - topLevel.h;

  return (
    <svg viewBox="0 0 400 400" className="h-auto w-full" role="img" aria-label="Vista previa orientativa de tu tarta">
      <defs>
        <radialGradient id="pv-bg" cx="50%" cy="40%" r="70%">
          <stop offset="0" stopColor="#FFFDF9" />
          <stop offset="1" stopColor="#F6E7DC" />
        </radialGradient>
        <linearGradient id="pv-shade" x1="0" x2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.14" />
          <stop offset="0.4" stopColor="#fff" stopOpacity="0.1" />
          <stop offset="1" stopColor="#000" stopOpacity="0.18" />
        </linearGradient>
      </defs>
      <rect width="400" height="400" rx="32" fill="url(#pv-bg)" />
      <ellipse cx="200" cy="352" rx="190" ry="26" fill="#3B2A22" opacity="0.08" />
      <ellipse cx="200" cy="344" rx="185" ry="28" fill="#fff" />
      <ellipse cx="200" cy="341" rx="160" ry="22" fill="none" stroke="#C29A4A" strokeWidth="2" opacity="0.7" />

      {levels.map((l, idx) => {
        const top = l.bottom - l.h;
        const ry = l.rx * 0.22;
        const body = `M${200 - l.rx},${top} L${200 - l.rx},${l.bottom} A${l.rx},${ry} 0 0 0 ${200 + l.rx},${l.bottom} L${200 + l.rx},${top} Z`;
        return (
          <g key={idx}>
            <path d={body} fill={naked ? "#FFF7EC" : frosting} />
            {naked &&
              [0, 1, 2].map((i) => {
                const lh = (l.h - 20) / 3;
                const y1 = top + 4 + i * (lh + 6);
                const y2 = y1 + lh;
                return (
                  <path
                    key={i}
                    d={`M${200 - l.rx},${y1} A${l.rx},${ry} 0 0 0 ${200 + l.rx},${y1} L${200 + l.rx},${y2} A${l.rx},${ry} 0 0 1 ${200 - l.rx},${y2} Z`}
                    fill={sponge}
                    opacity="0.85"
                  />
                );
              })}
            <path d={body} fill="url(#pv-shade)" />
            {!naked && colors[1] && (
              <path
                d={`M${200 - l.rx},${l.bottom - 22} A${l.rx},${ry} 0 0 0 ${200 + l.rx},${l.bottom - 22} L${200 + l.rx},${l.bottom - 8} A${l.rx},${ry} 0 0 1 ${200 - l.rx},${l.bottom - 8} Z`}
                fill={accent}
                opacity="0.9"
              />
            )}
            <ellipse cx="200" cy={top} rx={l.rx} ry={ry} fill={naked ? "#FFF7EC" : shade(frosting, 0.18)} />
            {(has("drip") || gold) &&
              Array.from({ length: 11 }, (_, i) => {
                const x = 200 - l.rx + ((i + 0.5) * 2 * l.rx) / 11;
                const t = (x - 200) / l.rx;
                const y = top + ry * Math.sqrt(1 - t * t);
                const len = 14 + ((i * 37) % 30);
                return <rect key={i} x={x - 6} y={y - 4} width="12" height={len} rx="6" fill={has("drip") ? (gold ? "#C9A45C" : "#4A2E22") : "#C9A45C"} />;
              })}
          </g>
        );
      })}

      {/* decoración superior */}
      <g>
        {has("frutas") && (
          <>
            <circle cx="165" cy={topY - 6} r="11" fill="#C2324B" />
            <circle cx="190" cy={topY - 12} r="10" fill="#3E4C8A" />
            <circle cx="215" cy={topY - 6} r="11" fill="#C2324B" />
            <circle cx="238" cy={topY - 10} r="9" fill="#3E4C8A" />
          </>
        )}
        {has("flores-naturales") &&
          [
            [150, topY - 8, "#F2B8C6"],
            [250, topY - 6, "#FFFFFF"],
            [200, topY - 18, "#CDBFE3"],
          ].map(([x, y, c], i) => (
            <g key={i}>
              {[0, 72, 144, 216, 288].map((a) => (
                <ellipse
                  key={a}
                  cx={(x as number) + Math.cos((a * Math.PI) / 180) * 9}
                  cy={(y as number) + Math.sin((a * Math.PI) / 180) * 9}
                  rx="9"
                  ry="6"
                  fill={c as string}
                  transform={`rotate(${a} ${(x as number) + Math.cos((a * Math.PI) / 180) * 9} ${(y as number) + Math.sin((a * Math.PI) / 180) * 9})`}
                />
              ))}
              <circle cx={x as number} cy={y as number} r="5" fill="#E7C46B" />
            </g>
          ))}
        {has("macarons") &&
          [
            [175, topY - 14, "#CDBFE3"],
            [225, topY - 12, "#F7E3A1"],
          ].map(([x, y, c], i) => (
            <g key={i}>
              <ellipse cx={x as number} cy={(y as number) + 6} rx="16" ry="6" fill={c as string} />
              <rect x={(x as number) - 14} y={(y as number) - 1} width="28" height="5" rx="2" fill="#FFF7EC" />
              <ellipse cx={x as number} cy={(y as number) - 3} rx="16" ry="7" fill={c as string} />
            </g>
          ))}
        {has("topper") && (
          <g>
            <line x1="170" y1={topY} x2="170" y2={topY - 60} stroke="#C29A4A" strokeWidth="3" />
            <line x1="230" y1={topY} x2="230" y2={topY - 60} stroke="#C29A4A" strokeWidth="3" />
            <text x="200" y={topY - 62} textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontSize="28" fill="#C29A4A">
              {(text || "¡Felicidades!").slice(0, 14)}
            </text>
          </g>
        )}
        {has("foto") && <ellipse cx="200" cy={topY} rx={topLevel.rx * 0.5} ry={topLevel.rx * 0.11} fill="#BCD8EE" stroke="#fff" strokeWidth="3" />}
        {(has("figuras") || has("tematica")) && (
          <g>
            <circle cx="200" cy={topY - 30} r="22" fill={accent} stroke="#C29A4A" strokeWidth="2" />
            <text x="200" y={topY - 23} textAnchor="middle" fontSize="20">
              ✨
            </text>
          </g>
        )}
      </g>

      {text && !has("topper") && (
        <text x="200" y={levels[0].bottom - levels[0].h / 2 + 8} textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontSize="22" fill={naked ? "#3B2A22" : shade(frosting, -0.55)}>
          {text.slice(0, 22)}
        </text>
      )}
    </svg>
  );
}
