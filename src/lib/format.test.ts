import { describe, expect, it } from "vitest";
import { metaDescription } from "@/lib/format";

describe("metaDescription", () => {
  it("deja igual los textos cortos y limpia espacios", () => {
    expect(metaDescription("  Tartas   artesanales en Málaga.  ")).toBe("Tartas artesanales en Málaga.");
  });
  it("corta los largos en una palabra completa, sin pasar del máximo", () => {
    const largo = "Repostería artesanal en el Mercado de Bailén (Málaga): tartas personalizadas, tartas de cumpleaños y de boda, cupcakes, galletas y postres hechos a mano con ingredientes de calidad.";
    const d = metaDescription(largo);
    expect(d.length).toBeLessThanOrEqual(158);
    expect(d.endsWith("…")).toBe(true);
    expect(largo.startsWith(d.slice(0, -1))).toBe(true);
    expect(d).not.toMatch(/[\s,]…$/);
  });
});
