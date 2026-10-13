# Despliegue seguro

Cómo llega el código a producción sin pasar por encima de los controles: entornos, pipeline de CI/CD,
ajustes obligatorios de GitHub y Vercel, despliegue sin corte, migraciones y vuelta atrás.

> **Estado:** `.github/workflows/deploy.yml` es una **plantilla no probada**: en el entorno donde se
> construyó no había cuenta de Vercel ni de GitHub Actions. `ci.yml` y `security.yml` tampoco se han
> ejecutado en GitHub desde este entorno (las pruebas de la app que lanzan —unitarias, integración,
> DAST propio y E2E— sí se ejecutaron en local: ver
> [Arquitectura y amenazas §7](../seguridad/arquitectura-y-amenazas.md#7-ataques-solicitados-control-y-prueba)).
> Valida el primer despliegue en staging y un *rollback* de prueba antes de depender de ellos. Los
> manifiestos de `infra/k8s/` y `docker-compose.prod.yml` también están marcados como no probados en un
> clúster / demonio Docker real.

Documentos relacionados: [Gestión de secretos](./gestion-de-secretos.md) ·
[Arquitectura y amenazas](../seguridad/arquitectura-y-amenazas.md).

---

## 1. Entornos

| Entorno | `APP_ENV` | Dónde | Datos | Secretos |
| --- | --- | --- | --- | --- |
| Desarrollo | `development` | Local (`docker-compose.yml` para PostgreSQL) | Demo (`npm run db:seed`) | Propios de cada desarrollador (`.env`, no versionado) |
| CI | `staging` | Runners de GitHub, servicios `postgres:16` y `redis:7` efímeros | Demo | Aleatorios por ejecución (`.github/actions/prepare-test-env`) |
| Staging | `staging` | Vercel: `preview` o un Custom Environment (`VERCEL_STAGING_TARGET`) | Ficticios; nunca copia de producción sin anonimizar | Distintos de producción; Stripe en modo prueba |
| Producción | `production` | Vercel (principal); alternativas `docker-compose.prod.yml` o `infra/k8s/` | Reales | Gestor de secretos del proveedor |

### Arranque fail-closed (`src/lib/env.ts`, invocado en `src/instrumentation-node.ts`)

Se considera producción si `APP_ENV=production`, o si `NODE_ENV=production` y `APP_ENV` no es
`staging` ni `development` (por tanto, **olvidar `APP_ENV` en un despliegue compilado equivale a
producción**). Si hay errores, la instancia lanza una excepción al arrancar y no sirve tráfico.

| Comprobación | Producción | Otros entornos |
| --- | --- | --- |
| `DATABASE_URL` definida | Error | Error |
| Claves de cifrado válidas (`DATA_ENCRYPTION_KEYS`, `DATA_HASH_KEY`, clave activa en el anillo) | Error | Error |
| `NEXT_PUBLIC_SITE_URL` con `https://` | Error | Aviso |
| `CRON_SECRET` ≥ 32 caracteres | Error | Aviso |
| `METRICS_TOKEN` ≥ 32 caracteres (si está definida) | Error | Error |
| `STRIPE_WEBHOOK_SECRET` si hay `STRIPE_SECRET_KEY` | Error | Error |
| Clave de Stripe real (`sk_live_`/`rk_live_`) fuera de producción | — | Error |
| Clave de Stripe de prueba en `APP_ENV=production` | Aviso | — |
| En Vercel, `STORAGE_DRIVER=supabase` o `database` | Error | Error |
| `TRUST_PROXY`, `REDIS_URL`, `SMTP_HOST`, `ALERT_EMAIL`/`ALERT_WEBHOOK_URL` | Aviso | Aviso |
| `ADMIN_PASSWORD` todavía definida, `PASSWORD_BREACH_CHECK=false`, `DATABASE_URL` sin `sslmode=require` | Aviso | — |

En Vercel, un error de configuración hace que `/api/health/ready` no responda 200, la prueba de humo
de `deploy.yml` falla y el despliegue nuevo **no** se promociona (se creó con `--skip-domain`).

## 2. Pipeline de CI/CD

```
PR ──▶ CI (ci.yml) + Security (security.yml) ──▶ revisión + checks obligatorios ──▶ merge a main
main ──▶ CI + Security (push) ──▶ Deploy (deploy.yml, workflow_run)
           gate: CI y Security en success para el MISMO SHA, ese SHA es la cabeza de main, no desplegado aún
           ──▶ staging: migraciones → (least-privilege) → vercel deploy → humo → (DAST opcional)
           ──▶ production: aprobación manual → anotar despliegue actual → migraciones → (least-privilege)
               → vercel deploy --prod --skip-domain → humo → vercel promote → humo en dominio
               → si falla: vercel rollback al anterior + humo + aviso a ALERT_WEBHOOK_URL
```

### 2.1 `ci.yml` (PR, push a `main`, manual)

| Job | Qué ejecuta | Bloquea si |
| --- | --- | --- |
| `static` — Lint, tipos y tests unitarios | `npm ci`, `prisma validate`, `npm run lint`, `npm run typecheck`, `npm test` | Cualquier paso falla |
| `integration` — Integración, build, arranque y DAST ligero | Entorno efímero (migraciones con rol propietario, seed, `least-privilege.sql`, app con rol `reposteria_app`), `npm run test:integration`, `npm run db:check-security`, `npm run build`, arranque y `/api/health`, `npm run test:security` | Cualquier paso falla; en `db:check-security` solo los fallos marcados críticos; en DAST cualquier comprobación fallida |
| `e2e` — Playwright | Build, arranque, `npm run test:e2e` | Cualquier comprobación falla. Se ejecuta siempre (no hay variable para omitirlo) |

Permisos del token: `contents: read`. Acciones fijadas por SHA; `persist-credentials: false`.

### 2.2 `security.yml` (PR, push a `main`, lunes 03:17 UTC, manual)

| Job | Herramienta | Regla de bloqueo |
| --- | --- | --- |
| `codeql` | CodeQL `security-extended` | **No rompe el workflow.** Solo bloquea el merge si se activa la regla "Code scanning results" en la protección de `main`; el *gate* de despliegue no la consulta. |
| `semgrep` | Registro (`p/default`, `p/owasp-top-ten`, `p/typescript`, `p/react`, `p/nextjs`, `p/secrets`, `p/jwt`) + `.semgrep/rules.yml` | Cualquier hallazgo de severidad **ERROR**. WARNING solo se informa. |
| `npm-audit` | `npm audit --omit=dev --audit-level=high` | Vulnerabilidad **HIGH o CRITICAL** en dependencias de producción |
| `osv-scanner` | OSV-Scanner sobre `package-lock.json` | Cualquier vulnerabilidad conocida no exceptuada en `osv-scanner.toml` (excepciones con `ignoreUntil`) |
| `gitleaks` | Gitleaks, historial completo | **Cualquier** secreto detectado (`.gitleaks.toml`) |
| `trivy-fs` | Trivy fs (vuln, secret, misconfig) | CRITICAL/HIGH con arreglo disponible (`ignore-unfixed`); excepciones en `.trivyignore` |
| `trivy-iac` | Trivy config sobre Kustomize renderizado, `Dockerfile`, Compose | CRITICAL/HIGH |
| `trivy-image` | Build del `Dockerfile` (destino `runtime`) + Trivy imagen | Imagen ejecutándose como root; CRITICAL/HIGH con arreglo |
| `zap-baseline` | OWASP ZAP baseline **pasivo** contra la app efímera en `localhost` | Reglas marcadas **FAIL** en `.zap/rules.tsv` (`-I`: los WARN no rompen) |

Los informes SARIF se suben a *Code scanning* (salvo PR desde forks).

### 2.3 `deploy.yml`

- Disparo: `workflow_run` de "CI" o "Security" completados en `main`, o manual en `main`. `workflow_run`
  usa siempre la definición de la rama por defecto: una PR no puede cambiar el workflow para desplegar.
- `gate`: consulta la API de GitHub y continúa solo si `ci.yml` **y** `security.yml` del evento `push`
  en `main` terminaron en `success` para ese SHA, si ese SHA sigue siendo la cabeza de `main` y si no
  hay ya un despliegue correcto de ese SHA en `production` (salvo `force`).
- Concurrencia `deploy-production`, sin cancelar despliegues en curso.
- `staging`: `prisma migrate deploy` con `DIRECT_URL`; `least-privilege.sql` si hay `ADMIN_DATABASE_URL`;
  `vercel deploy --target=$VERCEL_STAGING_TARGET`; prueba de humo (`.github/scripts/smoke-test.sh`: 3
  respuestas seguidas de `/api/health` 200 y `/api/health/ready` 200 con `"status":"ok"`); DAST contra
  staging si `STAGING_DAST=true`.
- `production`: espera la aprobación del entorno; anota el despliegue que sirve el dominio (destino del
  *rollback*); migraciones; `vercel deploy --prod --skip-domain`; humo sobre la URL del despliegue;
  `vercel promote`; humo sobre `PRODUCTION_URL`; si algo falla tras la promoción, `vercel rollback` y humo;
  aviso a `ALERT_WEBHOOK_URL`.
- Los secretos de la app no pasan por GitHub: el build se hace en Vercel con sus variables de entorno.

**Resumen de qué impide desplegar:** cualquier fallo de CI (lint, tipos, unitarias, integración,
`db:check-security` crítico, build, arranque, DAST, E2E si está activo), vulnerabilidades HIGH/CRITICAL
(npm audit, Trivy) o conocidas (OSV), cualquier secreto (Gitleaks), Semgrep ERROR, ZAP FAIL, imagen como
root, prueba de humo fallida en staging, falta de aprobación en producción.

## 3. Ajustes obligatorios en GitHub

| Ajuste | Valor |
| --- | --- |
| Protección de `main` (Branch protection o Ruleset) | PR obligatoria; ≥ 1 aprobación; "Require review from Code Owners" (`.github/CODEOWNERS`); descartar aprobaciones al hacer push; conversaciones resueltas; historial lineal; sin *force push* ni borrado; aplicar también a administradores. |
| Checks obligatorios | Los de `ci.yml`: "Lint, tipos y tests unitarios", "Integración, build, arranque y DAST ligero", "E2E (Playwright, Chromium)". Los de `security.yml`: "Semgrep (registro + reglas propias)", "npm audit (producción, HIGH+)", el job de OSV-Scanner, "Gitleaks (historial completo)", "Trivy filesystem (vuln, secret, misconfig)", "Trivy IaC (Dockerfile, compose, Kubernetes)", "Trivy imagen (Dockerfile → runtime)", "OWASP ZAP baseline (app efímera en el propio job)", "CodeQL (javascript-typescript, security-extended)". "Require branches to be up to date". |
| Code scanning | El job de CodeQL ya falla con hallazgos de severidad de seguridad ≥ 7,0. Opcional: regla "Code scanning results" en la protección de `main` para el resto de herramientas SARIF. |
| Environment `staging` | Secretos y variables de [Gestión de secretos §3.2](./gestion-de-secretos.md#32-despliegue-github-environments-deployyml). "Deployment branches": solo `main`. |
| Environment `production` | **Required reviewers** (al menos una persona distinta de quien hace el merge, "Prevent self-review"), "Deployment branches": solo `main`, secretos propios. |
| Environment `cron` | Sin revisores (se ejecuta cada 5 min), "Deployment branches": solo `main`. Secreto `CRON_SECRET` (el de producción) y variable `PRODUCTION_URL`. Lo usa `.github/workflows/cron-jobs.yml`; con Vercel Pro, variable de repositorio `CRON_VIA_GITHUB=false`. |
| Actions | "Allow GitHub Actions to create and approve pull requests": desactivado; permisos por defecto del `GITHUB_TOKEN`: solo lectura. |
| Code security | Dependabot alerts y security updates activados; Secret scanning y *push protection*; Private vulnerability reporting (`SECURITY.md`). |

## 4. Ajustes obligatorios en Vercel

1. **Despliegue automático de la integración Git desactivado** en `vercel.json`:

   ```json
   "git": { "deploymentEnabled": false }
   ```

   Así Vercel no publica `main` sin CI/Security ni aprobación, y los *preview* de ramas no revisadas
   no ejecutan `prisma migrate deploy` (incluido en `vercel-build`) contra la BD de Preview. Todo
   despliegue pasa por `deploy.yml` (o por un `vercel deploy` manual de un miembro del proyecto:
   limita quién lo es). Comprueba tras el primer push que Vercel no inicia un build por su cuenta.
   Alternativa equivalente: Project Settings → Git → Ignored Build Step.
2. Variables de entorno separadas por entorno (Production / Preview o `staging`), con `APP_ENV` explícito
   y marcadas como *Sensitive*. En Production, `DIRECT_URL` del rol de la app (no del propietario): las
   migraciones ya se aplican en `deploy.yml`, y con ellas aplicadas `prisma migrate deploy` en
   `vercel-build` no tiene nada pendiente (ver [Gestión de secretos](./gestion-de-secretos.md)).
3. Deployment Protection en las URLs de despliegue y `VERCEL_AUTOMATION_BYPASS_SECRET` para la prueba de humo.
4. Firewall según `infra/vercel/firewall.json` e `infra/vercel/README.md`.
5. Acceso al equipo de Vercel con 2FA y solo para quien lo necesite.
6. Cron: `/api/cron/jobs` cada minuto si el plan lo permite (en `vercel.json` está diario).

## 5. Despliegue sin corte

### Vercel
Cada despliegue es inmutable. El nuevo se crea sin dominio (`--skip-domain`), se prueba y después
`vercel promote` mueve el dominio de forma atómica. Las peticiones en curso terminan en la versión
anterior. *Rollback* instantáneo con `vercel rollback` (§7). Tras un *rollback*, Vercel deja de asignar
dominios automáticamente hasta el siguiente `vercel promote` (lo hace el siguiente despliegue correcto).

### Kubernetes (`infra/k8s/`)
- `Deployment` con `RollingUpdate`, `maxUnavailable: 0`, `maxSurge: 25%`, `revisionHistoryLimit: 5`.
- `startupProbe` y `livenessProbe` en `/api/health`; `readinessProbe` en `/api/health/ready` (BD).
- `preStop: sleep 5` y `terminationGracePeriodSeconds: 30` para drenar conexiones.
- `PodDisruptionBudget` con `minAvailable: 2`; HPA de 3 a 20 réplicas; reparto por zona y nodo.
- Fijar la imagen por *digest* en `kustomization.yaml`. El manifiesto usa `runAsUser: 10001`, igual
  que la imagen (`USER 10001:10001`). Los pods no reciben `DIRECT_URL` (rol propietario).
- Migraciones fuera de los pods (job de CI/CD con `DIRECT_URL` del propietario) antes del `kubectl apply`.

### Docker Compose (`docker-compose.prod.yml`)
- 3 réplicas de `app` con *healthcheck*; el servicio `migrate` se ejecuta antes que la app.
- `docker compose up -d` recrea **todas** las réplicas a la vez al cambiar la imagen: hay corte. Para
  evitarlo, despliegue gradual (complemento `docker rollout`, de terceros, o escalar a 6, esperar a
  *healthy* y volver a 3).
- Un único host no ofrece alta disponibilidad (lo indica el propio archivo).

## 6. Migraciones de base de datos: expandir → migrar → contraer

`vercel rollback` y `kubectl rollout undo` revierten el código, **no** el esquema. Las migraciones se
aplican antes de publicar el código nuevo, así que durante un tiempo la versión anterior funciona contra
el esquema nuevo. Por eso cada cambio incompatible se divide en despliegues separados:

| Fase | Despliegue | Ejemplo: renombrar `notes` a `internalNotes` |
| --- | --- | --- |
| 1. Expandir | Migración solo aditiva (columnas/tablas nuevas *nullable* o con valor por defecto, índices `CONCURRENTLY` si la tabla es grande). El código escribe en ambos sitios y lee del antiguo. | Añadir `internalNotes`; escribir en las dos. |
| 2. Migrar | Rellenar datos en lotes (script idempotente, como `scripts/encrypt-data.ts`). El código lee del nuevo con respaldo al antiguo. | Copiar `notes` → `internalNotes` (cifrado si es dato personal). |
| 3. Contraer | Cuando ninguna versión desplegable usa lo antiguo (incluido el destino de *rollback*), migración que lo elimina. | Borrar `notes`. |

Reglas:
- Nunca en un solo despliegue: `DROP`/`RENAME` de columnas o tablas, `NOT NULL` sin valor por defecto,
  cambio de tipo incompatible.
- Columnas con datos personales: añadirlas a `ENCRYPTED_FIELDS` (`src/lib/db.ts`) y, si se buscan, a
  `BLIND_INDEXES`; tras el despliegue, `npm run db:encrypt`.
- Tras cada migración: `npm run db:least-privilege` (reaplica permisos y RLS a las tablas nuevas) y
  `npm run db:check-security`.
- `prisma migrate deploy` no tiene migraciones inversas: un error de esquema se corrige con una migración
  nueva hacia delante; restaurar la copia (PITR) es el último recurso y pierde los datos posteriores.
- Las migraciones usan `DIRECT_URL` (sin PgBouncer en modo transacción).

## 7. Vuelta atrás (*rollback*)

| Situación | Acción |
| --- | --- |
| Falla la prueba de humo **antes** de promocionar | Nada que revertir: el despliegue nuevo no tiene dominio. Corregir y volver a desplegar. |
| Falla la prueba de humo **después** de promocionar | `deploy.yml` ejecuta `vercel rollback <despliegue anterior>` y comprueba el dominio. Revisar el resumen del job. |
| Problema detectado más tarde (Vercel) | `vercel rollback <url-anterior> --token …` o *Instant Rollback* en el panel. Después, revertir el commit en `main` para que el siguiente despliegue no lo reintroduzca. |
| Kubernetes | `kubectl -n reposteria rollout undo deploy/reposteria-app` y `kubectl -n reposteria rollout status deploy/reposteria-app`. |
| Compose | Volver a la etiqueta anterior (`APP_VERSION=<anterior>`) y desplegar de forma gradual. |
| Migración defectuosa | Migración correctiva hacia delante. Si hay corrupción de datos: restauración desde copia o PITR (`scripts/restore.sh`, `infra/postgres/README.md`) en una BD nueva, verificación y cambio de `DATABASE_URL`. |
| Secreto mal configurado | Corregir la variable y volver a desplegar (en Vercel, las variables se fijan en cada despliegue). |

Tras cualquier *rollback*: comprobar `/api/health/ready`, cola de trabajos (`jobs_pending`, `jobs_failed`
en `/api/metrics`), pagos recientes en Stripe frente a pedidos y la integridad de la auditoría
(`/admin/auditoria`).

## 8. Lista de comprobación previa a producción

Configuración
- [ ] `APP_ENV=production` y `NEXT_PUBLIC_SITE_URL=https://…` definidos; la app arranca sin errores de `checkEnvironment` y revisados sus avisos.
- [ ] Claves de cifrado y `DATA_HASH_KEY` propias de producción, guardadas también fuera de la app para restaurar copias.
- [ ] `DATABASE_URL` con el rol `reposteria_app` y `sslmode=require`; `DIRECT_URL` del runtime sin rol propietario.
- [ ] `npm run db:least-privilege` aplicado y `npm run db:check-security` sin fallos (y avisos revisados).
- [ ] `npm run db:encrypt` tras desplegar esta versión (cifra tokens y fotos existentes) y `npm run db:encrypt -- --check` con código 0.
- [ ] `STRIPE_SECRET_KEY` live (preferiblemente restringida) y `STRIPE_WEBHOOK_SECRET` del endpoint de producción con los eventos listados en `src/app/api/stripe/webhook/route.ts`.
- [ ] `CRON_SECRET` y `METRICS_TOKEN` ≥ 32 caracteres; cron de `/api/cron` diario y `/api/cron/jobs` cada minuto (Vercel Pro) o cada 5 min con `cron-jobs.yml` (entorno `cron` de GitHub).
- [ ] `TRUST_PROXY` acorde a la plataforma; `REDIS_URL` si hay varias instancias.
- [ ] `ALERT_EMAIL` y/o `ALERT_WEBHOOK_URL` definidos y probados.
- [ ] `STORAGE_DRIVER=supabase` (Vercel) con bucket privado para fotos de clientes, o `STORAGE_DRIVER=database` (fotos en la BD; las de clientes cifradas).
- [ ] `SMTP_ALLOW_PLAINTEXT` sin definir (en producción la app no arranca con `true`); SPF, DKIM y DMARC del dominio de envío.
- [ ] `ADMIN_PASSWORD` borrada tras crear el primer propietario; el propietario tiene MFA y códigos de recuperación guardados; `SEED_DEMO=false` si se siembra en producción.

Plataforma y pipeline
- [ ] Verificado que un push a `main` no despliega por sí solo (`vercel.json` ya desactiva la integración Git, §4).
- [ ] Protección de `main`, checks obligatorios y entornos de GitHub configurados (§3); revisores en `production`.
- [ ] Primer despliegue completo en staging y *rollback* de prueba realizados con `deploy.yml`.
- [ ] Firewall/WAF aplicado (`infra/vercel/`, `infra/cloudflare/` o `infra/nginx/`).

Datos y continuidad
- [ ] Copias cifradas con `age` programadas, copia fuera del servidor y simulacro de restauración con la clave privada.
- [ ] PITR del proveedor activado (o WAL archivado en autoalojado).
- [ ] Monitorización externa de `/api/health/ready` y alertas de `infra/monitoring/` (o equivalente).

Documentación y avisos
- [ ] `SECURITY.md` con contacto y huella PGP reales; `SECURITY_CONTACT` definido y `/.well-known/security.txt` respondiendo 200.
- [ ] Textos legales (privacidad, cookies, condiciones) revisados.
