import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { db } from "@/lib/db";
import { isEncryptedBuffer } from "@/lib/crypto";
import { deleteImage, deletePrivate, readPrivate, readPublic, savePrivateImage, saveImage } from "@/lib/storage";
import { GET as servePublic } from "@/app/uploads/[...path]/route";

const previous = process.env.STORAGE_DRIVER;

async function photo(): Promise<File> {
  const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#b97561" } }).png().toBuffer();
  return new File([new Uint8Array(png)], "foto.png", { type: "image/png" });
}

const serve = (url: string) =>
  servePublic(new Request(`http://localhost${url}`), { params: Promise.resolve({ path: url.replace("/uploads/", "").split("/") }) } as never);

describe("almacenamiento en la base de datos (STORAGE_DRIVER=database)", () => {
  beforeAll(() => {
    process.env.STORAGE_DRIVER = "database";
  });
  afterAll(() => {
    process.env.STORAGE_DRIVER = previous;
  });

  it("guarda, sirve y borra fotos públicas", async () => {
    const { url, width } = await saveImage(await photo(), "products");
    expect(url).toMatch(/^\/uploads\/products\/\d{4}-\d{2}\/[\w-]{16}\.webp$/);
    expect(width).toBe(40);
    const stored = await readPublic(url.slice("/uploads/".length));
    expect(stored?.subarray(8, 12).toString("latin1")).toBe("WEBP");

    const res = await serve(url);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");

    await deleteImage(url);
    expect(await readPublic(url.slice("/uploads/".length))).toBeNull();
    expect((await serve(url)).status).toBe(404);
  });

  it("las fotos de clientes se guardan cifradas y nunca se sirven por /uploads", async () => {
    const { ref } = await savePrivateImage(await photo());
    const key = `private/${ref.slice("private:".length)}`;
    const row = await db.storedFile.findUniqueOrThrow({ where: { key } });
    expect(isEncryptedBuffer(Buffer.from(row.data))).toBe(true);

    const plain = await readPrivate(ref);
    expect(plain?.subarray(8, 12).toString("latin1")).toBe("WEBP");
    expect((await serve(`/uploads/${key}`)).status).toBe(404);

    await deletePrivate(ref);
    await deletePrivate(ref); // idempotente
    expect(await db.storedFile.count({ where: { key } })).toBe(0);
    expect(await readPrivate(ref)).toBeNull();
  });
});
