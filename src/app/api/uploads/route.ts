import { NextResponse } from "next/server";
import { saveImage, UploadError } from "@/lib/storage";
import { limitByIp } from "@/lib/rate-limit";

/** Subida de fotos de referencia/inspiración por parte de los clientes. */
export async function POST(request: Request) {
  if (!(await limitByIp("upload", 12, 10 * 60_000))) {
    return NextResponse.json({ error: "Demasiadas subidas seguidas. Espera unos minutos." }, { status: 429 });
  }
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No se ha recibido ninguna imagen" }, { status: 400 });
    const image = await saveImage(file, "references", 1600);
    return NextResponse.json({ url: image.url });
  } catch (error) {
    if (error instanceof UploadError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[upload]", error);
    return NextResponse.json({ error: "No se pudo subir la imagen" }, { status: 500 });
  }
}
