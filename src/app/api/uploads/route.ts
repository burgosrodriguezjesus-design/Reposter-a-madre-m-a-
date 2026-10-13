import { NextResponse } from "next/server";
import { savePrivateImage, signedMediaUrl, UploadError } from "@/lib/storage";
import { limitByIp, penalizeClient } from "@/lib/rate-limit";
import { PRIVATE_NO_STORE } from "@/lib/http";
import { log } from "@/lib/logger";
import { inc } from "@/lib/metrics";

/**
 * Subida de fotos de referencia/inspiración por parte de los clientes.
 * Se guardan en almacenamiento PRIVADO: se devuelve una referencia opaca (para el pedido) y una
 * URL firmada temporal para la vista previa.
 */
export async function POST(request: Request) {
  if (!(await limitByIp("upload", 12, 10 * 60_000))) {
    return NextResponse.json({ error: "Demasiadas subidas seguidas. Espera unos minutos." }, { status: 429, headers: PRIVATE_NO_STORE });
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 11 * 1024 * 1024) return NextResponse.json({ error: "La imagen supera los 10 MB" }, { status: 413, headers: PRIVATE_NO_STORE });
  if (!(request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    return NextResponse.json({ error: "Solicitud no válida" }, { status: 400, headers: PRIVATE_NO_STORE });
  }
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No se ha recibido ninguna imagen" }, { status: 400, headers: PRIVATE_NO_STORE });
    const { ref } = await savePrivateImage(file);
    return NextResponse.json({ url: ref, previewUrl: signedMediaUrl(ref, 3600) }, { headers: PRIVATE_NO_STORE });
  } catch (error) {
    if (error instanceof UploadError) {
      inc("uploads_rejected_total");
      await penalizeClient(2);
      return NextResponse.json({ error: error.message }, { status: 400, headers: PRIVATE_NO_STORE });
    }
    log.error("upload.failed", { error });
    return NextResponse.json({ error: "No se pudo subir la imagen" }, { status: 500, headers: PRIVATE_NO_STORE });
  }
}
