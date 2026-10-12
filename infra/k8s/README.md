# Kubernetes (referencia)

> **Plantilla no probada en un clúster.** Estos manifiestos se han validado solo
> sintácticamente en este entorno (YAML con `python3` + `yaml.safe_load_all` y unas
> comprobaciones de coherencia propias: etiquetas/selectores, nombres de Secret y
> ConfigMap, puertos y `securityContext`). No se han aplicado a ningún clúster ni
> validado contra el esquema de la API (`kubectl`, `kustomize` y `kubeconform` no
> están disponibles aquí). El despliegue recomendado del proyecto sigue siendo
> Vercel + Supabase + Upstash; esto es la alternativa para quien necesite su propio
> clúster.

## Qué incluye

| Fichero | Contenido |
| --- | --- |
| `namespace.yaml` | Namespace `reposteria` con Pod Security Admission `restricted` (enforce/audit/warn). |
| `serviceaccount.yaml` | Cuentas de servicio sin token montado (app, cron, backup). |
| `configmap.yaml` | Configuración no secreta (`APP_ENV`, `NEXT_PUBLIC_SITE_URL`, `TRUST_PROXY=nginx`, SMTP host, sesiones del panel...). |
| `externalsecret.yaml` | `ExternalSecret` (External Secrets Operator) para los secretos de la app, la cabecera de cron, el token de métricas, la copia de seguridad y rclone. Ningún secreto en claro. |
| `deployment.yaml` | App Next.js standalone: `runAsNonRoot`, `readOnlyRootFilesystem`, `drop: [ALL]`, seccomp `RuntimeDefault`, sondas `/api/health` (startup/liveness) y `/api/health/ready` (readiness), recursos, `topologySpreadConstraints` por zona y nodo, `preStop`. |
| `service.yaml` | Service `ClusterIP` `reposteria-app` (puerto 80 → 3000). |
| `hpa.yaml` | HPA 3–20 réplicas: CPU 65 %, memoria 75 %, subida rápida y bajada lenta. |
| `pdb.yaml` | PodDisruptionBudget `minAvailable: 2`. |
| `ingress.yaml` | Ingress (ingress-nginx) con TLS de cert-manager, límites por IP (general, `/admin/login`, formularios/APIs públicas), webhook de Stripe sin ModSecurity y `/api/metrics` + `/api/cron` cerrados al exterior. |
| `networkpolicy.yaml` | Denegar todo + DNS, ingress→app, Prometheus→app, cron→app, app→PgBouncer/Redis, app→Internet (443/587/465 sin rangos privados ni metadatos), backup→PostgreSQL/443. |
| `cronjobs.yaml` | `/api/cron/jobs` cada minuto, `/api/cron` diario (04:17 Europe/Madrid) y copia de seguridad cada hora (backup.sh + rclone a almacenamiento externo). |
| `backup-pvc.yaml` | Volumen de las copias cifradas locales. |
| `kustomization.yaml` | Une todo, namespace, etiquetas comunes e imágenes. |
| `optional/servicemonitor.yaml` | Scrape de `/api/metrics` con Prometheus Operator y bearer token. |
| `optional/cilium-egress-fqdn.yaml` | Salida por nombre de dominio (Stripe, Supabase, SMTP, Slack) si el CNI es Cilium. |
| `optional/clustersecretstore-aws.example.yaml` | Ejemplo de `ClusterSecretStore` (AWS Secrets Manager + IRSA). |

## Requisitos del clúster

- Kubernetes ≥ 1.30 (`preStop.sleep`, `CronJob.timeZone`, `matchLabelKeys` en
  `topologySpreadConstraints`, `unhealthyPodEvictionPolicy`).
- CNI que aplique NetworkPolicy (Calico, Cilium, Antrea...). Sin él las políticas se
  aceptan pero **no tienen efecto**.
- metrics-server (para el HPA).
- Controlador de ingress compatible con las anotaciones `nginx.ingress.kubernetes.io/*`
  en el namespace `ingress-nginx`, y cert-manager con un `ClusterIssuer`
  `letsencrypt-prod`.
- External Secrets Operator ≥ 0.16 (API `external-secrets.io/v1`) y un
  `ClusterSecretStore` llamado `reposteria-store`.
- PgBouncer, PostgreSQL 16 y Redis en el namespace `reposteria-data` (o servicios
  gestionados: ver "Adaptaciones").
- kube-state-metrics y Prometheus en el namespace `monitoring` (para las alertas de
  CronJobs y copias de `infra/monitoring/alerts.yml`).

### Aviso sobre ingress-nginx

El proyecto comunitario **ingress-nginx** anunció su retirada (mantenimiento de
mejor esfuerzo solo hasta marzo de 2026, sin parches de seguridad después). Las
anotaciones de `ingress.yaml` son específicas de ese controlador. Para un clúster
nuevo conviene usar **Gateway API** (`Gateway` + `HTTPRoute`) con una implementación
mantenida (Envoy Gateway, NGINX Gateway Fabric, Traefik, Cilium...) y trasladar los
límites de peticiones y el WAF a sus políticas equivalentes. Si sigues con
ingress-nginx: última versión disponible, `allow-snippet-annotations: "false"` y el
webhook de admisión sin exponer (CVE-2025-1974, "IngressNightmare").

## Cómo aplicarlo

1. Crea en tu gestor de secretos las entradas `reposteria/production/app` y
   `reposteria/production/backup` con las propiedades que lista
   `externalsecret.yaml` (mismos nombres que las variables de entorno del contrato).
2. Sustituye los marcadores: `reposteria.example.com`, `ghcr.io/example/...`,
   `PROYECTO.supabase.co`, `smtp.example.com`, buckets y el `ClusterIssuer`.
3. Fija las imágenes por digest en `kustomization.yaml`.
4. Ejecuta las migraciones **fuera de los pods de la app** (job de CI/CD con
   `DIRECT_URL` y el rol propietario del esquema) antes de desplegar una versión
   que las necesite. Después aplica `prisma/sql/least-privilege.sql` y comprueba con
   `npm run db:check-security`.
5. Valida y aplica:

   ```bash
   kubectl kustomize infra/k8s > /tmp/reposteria.yaml
   kubeconform -strict -summary -ignore-missing-schemas /tmp/reposteria.yaml   # validación de esquema
   kubectl apply --dry-run=server -k infra/k8s                                 # validación en el API server
   kubectl apply -k infra/k8s
   kubectl -n reposteria rollout status deploy/reposteria-app
   ```

6. Comprueba: `kubectl -n reposteria get externalsecret` (todas `SecretSynced`),
   `curl -fsS https://reposteria.example.com/api/health`,
   `curl -i https://reposteria.example.com/api/metrics` (debe dar **403** desde fuera)
   y `kubectl -n reposteria get cronjob`.

## IP real del cliente (`TRUST_PROXY=nginx`)

La app lee la IP de `X-Real-IP`, que ingress-nginx rellena con `$remote_addr`. Para
que sea la IP del visitante y no la del balanceador:

- Service del controlador con `externalTrafficPolicy: Local`, **o**
- PROXY protocol entre balanceador y controlador (`use-proxy-protocol: "true"` en el
  ConfigMap del controlador y activado en el balanceador).

No actives `use-forwarded-headers` salvo que delante haya otro proxy de confianza
(p. ej. Cloudflare, ver `infra/cloudflare/README.md`), o cualquiera podría falsear su
IP. Las NetworkPolicy garantizan que a la app solo se llega a través del ingress.

## Decisiones y compromisos

- **Readiness con BD y Redis**: si la BD cae, todos los pods salen del Service y el
  ingress devuelve 503 en todo el sitio (también en páginas de catálogo que podrían
  servirse desde caché). Es intencionado para no aceptar pedidos que no se pueden
  guardar; la liveness (`/api/health`) no depende de la BD, así que no hay reinicios
  en cascada.
- **Caché de Next.js por pod**: `/app/.next/cache` es un `emptyDir`. Con varias
  réplicas la caché ISR/de imágenes no se comparte; si se usa revalidación bajo
  demanda, configura un `cacheHandler` compartido (Redis).
- **Límites del ingress**: son por IP y por réplica del controlador, no globales. El
  rate limit de la app (Redis) es el que aplica límites globales.
- **ModSecurity** arranca en modo detección. Revisa los logs del controlador antes de
  activar el bloqueo (`SecRuleEngine On`).
- **Cron**: `concurrencyPolicy: Forbid` y `activeDeadlineSeconds: 55` evitan
  solapamientos del job de cada minuto. Si la app no responde, el Job falla y
  saltan las alertas `ReposteriaCronJobNotSucceeding` / `ReposteriaJobsStalled`.
- **Copias**: hora a hora en el PVC + subida inmutable con rclone a un bucket externo
  con versionado/bloqueo de objetos y caducidad de 35 días. La clave privada age no
  está en el clúster. Prueba la restauración al menos una vez al mes con
  `scripts/restore.sh` contra una BD temporal y mide el RTO real.

## Adaptaciones habituales

- **BD/Redis gestionados (Supabase, Upstash, RDS...)**: en `networkpolicy.yaml`
  sustituye los destinos `reposteria-data` por `ipBlock` con las IPs/rangos del
  proveedor (o confía en la regla de salida 443/5432/6543/6379 añadiendo esos
  puertos). Supabase usa 5432 (directa) y 6543 (pooler).
- **Sin External Secrets Operator**: crea los Secret `reposteria-app-secrets`,
  `reposteria-cron-auth` (clave `authorization-header` con el texto
  `Authorization: Bearer <CRON_SECRET>`), `reposteria-backup-secrets` y
  `reposteria-backup-offsite` con Sealed Secrets o SOPS; nunca en claro en git.
- **Rotación de secretos**: el Deployment lleva la anotación de Stakater Reloader;
  sin Reloader, haz `kubectl rollout restart deploy/reposteria-app` tras rotar.
