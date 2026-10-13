-- ════════════════════════════════════════════════════════════════════════════
--  Mínimo privilegio y Row Level Security (RLS) para la base de datos de producción.
--
--  Roles:
--    reposteria_owner     → dueño del esquema; SOLO para migraciones (DIRECT_URL).
--    reposteria_app       → el que usa la aplicación (DATABASE_URL): lee y escribe datos,
--                           no puede cambiar el esquema, vaciar tablas ni modificar la auditoría.
--    reposteria_readonly  → copias de seguridad e informes: solo lectura.
--
--  Ejecución (como superusuario o como "postgres" en Supabase), una vez y tras cada migración:
--    psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/sql/least-privilege.sql
--  Contraseñas (nunca en este archivo; usa contraseñas largas aleatorias):
--    ALTER ROLE reposteria_app LOGIN PASSWORD '...';
--    ALTER ROLE reposteria_readonly LOGIN PASSWORD '...';
--  Comprobación automática: npm run db:check-security
-- ════════════════════════════════════════════════════════════════════════════

SET client_min_messages = warning;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'reposteria_app') THEN
    CREATE ROLE reposteria_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'reposteria_readonly') THEN
    CREATE ROLE reposteria_readonly NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

-- Nadie más puede crear objetos en el esquema público
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO reposteria_app, reposteria_readonly;

-- Aplicación: datos sí, estructura no
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO reposteria_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO reposteria_app;
-- Auditoría: solo añadir y leer (borrado de >2 años permitido por el trigger para la conservación)
REVOKE UPDATE, TRUNCATE ON "AuditLog" FROM reposteria_app;
-- Historial de migraciones: solo lectura para la aplicación
REVOKE INSERT, UPDATE, DELETE ON "_prisma_migrations" FROM reposteria_app;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM reposteria_app;

-- Lectura para copias de seguridad
GRANT SELECT ON ALL TABLES IN SCHEMA public TO reposteria_readonly;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO reposteria_readonly;

-- Límites de recursos por rol (protección frente a consultas desbocadas y bloqueos)
ALTER ROLE reposteria_app SET statement_timeout = '15s';
ALTER ROLE reposteria_app SET lock_timeout = '10s';
ALTER ROLE reposteria_app SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE reposteria_app CONNECTION LIMIT 80;
ALTER ROLE reposteria_readonly SET statement_timeout = '0';
ALTER ROLE reposteria_readonly CONNECTION LIMIT 4;

-- ───────────── Row Level Security ─────────────
-- Se activa en TODAS las tablas. Con Supabase esto bloquea la API REST/GraphQL pública (roles
-- anon/authenticated): ningún cliente puede leer datos de otro aunque conozca la URL del proyecto.
-- La aplicación y las copias tienen políticas explícitas.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    -- Sin FORCE: el dueño (migraciones y scripts de mantenimiento con DIRECT_URL) no queda bloqueado
    EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', t.tablename);
    EXECUTE format('DROP POLICY IF EXISTS app_access ON public.%I', t.tablename);
    EXECUTE format('CREATE POLICY app_access ON public.%I TO reposteria_app USING (true) WITH CHECK (true)', t.tablename);
    EXECUTE format('DROP POLICY IF EXISTS readonly_access ON public.%I', t.tablename);
    EXECUTE format('CREATE POLICY readonly_access ON public.%I FOR SELECT TO reposteria_readonly USING (true)', t.tablename);
  END LOOP;
END
$$;

-- Supabase: los roles de la API pública no tienen ningún privilegio sobre nuestras tablas
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated';
  END IF;
END
$$;
