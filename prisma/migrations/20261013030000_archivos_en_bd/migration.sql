-- Almacenamiento de fotos en la base de datos (STORAGE_DRIVER=database): alternativa a Supabase
-- Storage para Vercel cuando no se quiere depender de una clave de servicio adicional.
CREATE TABLE "StoredFile" (
    "key" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("key")
);
