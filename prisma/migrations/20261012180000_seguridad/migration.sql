-- Seguridad, protección de datos y fiabilidad de pedidos.
-- Después de aplicarla ejecuta `npm run db:encrypt` (idempotente) para cifrar los datos personales
-- existentes y calcular sus índices ciegos.

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "DataRequestType" AS ENUM ('ACCESS', 'RECTIFICATION', 'ERASURE', 'PORTABILITY', 'OBJECTION', 'RESTRICTION');

-- CreateEnum
CREATE TYPE "DataRequestStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'COMPLETED', 'REJECTED');

-- DropIndex
DROP INDEX "AbandonedCart_email_key";

-- DropIndex
DROP INDEX "Customer_email_key";

-- DropIndex
DROP INDEX "LoginAttempt_email_createdAt_idx";

-- DropIndex
DROP INDEX "LoginAttempt_ip_createdAt_idx";

-- DropIndex
DROP INDEX "Order_customerEmail_idx";

-- DropIndex
DROP INDEX "Order_scheduledDate_idx";

-- DropIndex
DROP INDEX "Review_status_idx";

-- AlterTable
-- Las filas existentes reciben un marcador único; `npm run db:encrypt` calcula el índice ciego real.
ALTER TABLE "AbandonedCart" ADD COLUMN     "emailHash" TEXT;
UPDATE "AbandonedCart" SET "emailHash" = 'pending:' || "id";
ALTER TABLE "AbandonedCart" ALTER COLUMN "emailHash" SET NOT NULL,
ALTER COLUMN "cart" SET DATA TYPE TEXT USING "cart"::text;

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "failedLogins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "recoveryCodes" TEXT[],
ADD COLUMN     "role" "AdminRole" NOT NULL DEFAULT 'STAFF',
ADD COLUMN     "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN     "totpLastStep" INTEGER,
ADD COLUMN     "totpSecret" TEXT;
-- Los administradores existentes tenían acceso total: pasan a ser propietarios.
UPDATE "AdminUser" SET "role" = 'OWNER';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "emailHash" TEXT;
UPDATE "Customer" SET "emailHash" = 'pending:' || "id";
ALTER TABLE "Customer" ALTER COLUMN "emailHash" SET NOT NULL;

-- AlterTable
ALTER TABLE "GiftCard" ADD COLUMN     "purchaserEmailHash" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "recipientEmailHash" TEXT;
ALTER TABLE "GiftCard" ALTER COLUMN "purchaserEmailHash" DROP DEFAULT;

-- AlterTable
-- Los intentos antiguos guardaban IP y email en claro: se eliminan (solo sirven 24 h).
DELETE FROM "LoginAttempt";
ALTER TABLE "LoginAttempt" DROP COLUMN "email",
DROP COLUMN "ip",
ADD COLUMN     "emailHash" TEXT NOT NULL,
ADD COLUMN     "ipHash" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "anonymizedAt" TIMESTAMP(3),
ADD COLUMN     "checkoutUrl" TEXT,
ADD COLUMN     "customerEmailHash" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "customerPhoneHash" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "requestHash" TEXT;
ALTER TABLE "Order" ALTER COLUMN "customerEmailHash" DROP DEFAULT;

-- AlterTable
ALTER TABLE "OrderStatusEvent" ADD COLUMN     "actorEmail" TEXT,
ADD COLUMN     "actorId" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "stock" INTEGER;

-- AlterTable
ALTER TABLE "QuoteRequest" ADD COLUMN     "customerEmailHash" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "QuoteRequest" ALTER COLUMN "customerEmailHash" DROP DEFAULT;

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mfaVerified" BOOLEAN NOT NULL DEFAULT false,
    "mfaAttempts" INTEGER NOT NULL DEFAULT 0,
    "challenge" TEXT,
    "ipHash" TEXT,
    "deviceHash" TEXT,
    "deviceLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminPasskey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "deviceType" TEXT,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "AdminPasskey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "ipHash" TEXT,
    "details" JSONB,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupeKey" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataRequest" (
    "id" TEXT NOT NULL,
    "type" "DataRequestType" NOT NULL,
    "status" "DataRequestStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "email" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "details" TEXT,
    "verifyTokenHash" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminSession_userId_idx" ON "AdminSession"("userId");

-- CreateIndex
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");

-- CreateIndex
CREATE INDEX "AdminPasskey_userId_idx" ON "AdminPasskey"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_seq_key" ON "AuditLog"("seq");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Job_dedupeKey_key" ON "Job"("dedupeKey");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");

-- CreateIndex
CREATE INDEX "StripeEvent_processedAt_idx" ON "StripeEvent"("processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DataRequest_verifyTokenHash_key" ON "DataRequest"("verifyTokenHash");

-- CreateIndex
CREATE INDEX "DataRequest_status_idx" ON "DataRequest"("status");

-- CreateIndex
CREATE INDEX "DataRequest_emailHash_idx" ON "DataRequest"("emailHash");

-- CreateIndex
CREATE UNIQUE INDEX "AbandonedCart_emailHash_key" ON "AbandonedCart"("emailHash");

-- CreateIndex
CREATE INDEX "AbandonedCart_recoveredAt_emailSentAt_updatedAt_idx" ON "AbandonedCart"("recoveredAt", "emailSentAt", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_emailHash_key" ON "Customer"("emailHash");

-- CreateIndex
CREATE INDEX "GiftCard_purchaserEmailHash_idx" ON "GiftCard"("purchaserEmailHash");

-- CreateIndex
CREATE INDEX "GiftCard_recipientEmailHash_idx" ON "GiftCard"("recipientEmailHash");

-- CreateIndex
CREATE INDEX "LoginAttempt_ipHash_createdAt_idx" ON "LoginAttempt"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_emailHash_createdAt_idx" ON "LoginAttempt"("emailHash", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Order_scheduledDate_scheduledTime_idx" ON "Order"("scheduledDate", "scheduledTime");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_customerEmailHash_idx" ON "Order"("customerEmailHash");

-- CreateIndex
CREATE INDEX "Order_customerPhoneHash_idx" ON "Order"("customerPhoneHash");

-- CreateIndex
CREATE INDEX "Product_active_archived_categoryId_idx" ON "Product"("active", "archived", "categoryId");

-- CreateIndex
CREATE INDEX "QuoteRequest_customerEmailHash_idx" ON "QuoteRequest"("customerEmailHash");

-- CreateIndex
CREATE INDEX "Review_status_createdAt_idx" ON "Review"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminPasskey" ADD CONSTRAINT "AdminPasskey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────── Integridad a nivel de base de datos (defensa en profundidad) ─────────────
-- Prisma no modela CHECK; se mantienen aquí y las verifica `npm run db:check`.
ALTER TABLE "Product" ADD CONSTRAINT "Product_stock_nonnegative" CHECK ("stock" IS NULL OR "stock" >= 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_price_nonnegative" CHECK ("priceCents" >= 0);
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_price_nonnegative" CHECK ("priceCents" >= 0);
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_balance_valid" CHECK ("balanceCents" >= 0 AND "balanceCents" <= "initialCents");
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_redemptions_valid" CHECK ("maxRedemptions" IS NULL OR "redemptions" <= "maxRedemptions");
ALTER TABLE "Order" ADD CONSTRAINT "Order_amounts_valid" CHECK (
  "subtotalCents" >= 0 AND "discountCents" >= 0 AND "deliveryFeeCents" >= 0 AND "giftCardCents" >= 0 AND "totalCents" >= 0
);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_values_valid" CHECK ("quantity" > 0 AND "unitPriceCents" >= 0 AND "lineTotalCents" >= 0);

-- ───────────── Registro de auditoría de solo inserción ─────────────
-- Nadie (ni la propia aplicación) puede modificar entradas ni borrar las de menos de 2 años.
CREATE OR REPLACE FUNCTION audit_log_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'AuditLog es de solo inserción';
  ELSIF TG_OP = 'DELETE' AND OLD."createdAt" > now() - interval '730 days' THEN
    RAISE EXCEPTION 'No se pueden borrar entradas de auditoría de menos de 2 años';
  ELSIF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'AuditLog no se puede vaciar';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_no_update_delete" BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_guard();
CREATE TRIGGER "AuditLog_no_truncate" BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_guard();
