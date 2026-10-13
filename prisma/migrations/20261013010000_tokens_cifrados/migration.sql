-- Tokens de enlaces cifrados (AES-256-GCM en la aplicación) + índices ciegos HMAC para buscarlos.
-- Migración "expand": columnas nuevas opcionales. Después de desplegar, ejecuta
-- `npm run db:encrypt` para cifrar los tokens existentes y calcular sus índices ciegos.
ALTER TABLE "Customer" ADD COLUMN "unsubscribeTokenHash" TEXT;
ALTER TABLE "AbandonedCart" ADD COLUMN "tokenHash" TEXT;
CREATE UNIQUE INDEX "Customer_unsubscribeTokenHash_key" ON "Customer"("unsubscribeTokenHash");
CREATE UNIQUE INDEX "AbandonedCart_tokenHash_key" ON "AbandonedCart"("tokenHash");
