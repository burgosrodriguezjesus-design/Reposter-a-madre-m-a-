-- Contraseñas provisionales: el usuario debe cambiarla antes de usar el panel (ASVS V2.1).
ALTER TABLE "AdminUser" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
