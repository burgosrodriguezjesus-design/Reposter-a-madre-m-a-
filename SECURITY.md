# Política de seguridad

Gracias por ayudar a proteger la web de Repostería Madre Mía y los datos de nuestros clientes.
Este documento explica qué versiones mantenemos, cómo comunicarnos una vulnerabilidad, qué
plazos nos comprometemos a cumplir y bajo qué condiciones puedes investigar de buena fe.

## Versiones soportadas

| Versión | Soporte de seguridad |
| --- | --- |
| Rama `main` (lo desplegado en producción) | ✅ Sí |
| Cualquier commit, rama o etiqueta anterior | ❌ No: corregimos sobre `main` y desplegamos |
| Copias o forks de terceros | ❌ No |

Solo hay una versión en producción. Las correcciones se publican con un despliegue normal
(CI + análisis de seguridad + staging + aprobación) o, en casos críticos, con el procedimiento de
urgencia, que mantiene los mismos controles automáticos.

## Cómo informar de una vulnerabilidad

**No abras una incidencia pública, una PR ni un comentario** con detalles de la vulnerabilidad.

Usa uno de estos canales privados:

1. **Correo cifrado (preferido):** `seguridad@tudominio.es`
   - Cifra el mensaje con nuestra clave OpenPGP (u otra clave publicada en
     `https://www.tudominio.es/.well-known/security.txt`).
   - Huella de la clave: `XXXX XXXX XXXX XXXX XXXX  XXXX XXXX XXXX XXXX XXXX` *(pendiente de publicar)*.
   - Si no puedes usar PGP, envía un primer correo **sin detalles técnicos** pidiendo un canal
     seguro y te responderemos.
2. **GitHub:** pestaña *Security* → *Report a vulnerability* (informe privado de
   vulnerabilidades de GitHub), si está activado en el repositorio.

> Nota para los mantenedores: sustituye `tudominio.es` y la huella por los datos reales,
> publica `/.well-known/security.txt` (RFC 9116) con los mismos datos y activa el *Private
> vulnerability reporting* en *Settings → Code security*.

### Qué incluir

- Descripción del problema e impacto que estimas (qué podría hacer un atacante).
- Componente o URL afectada (sitio público, API, panel `/admin`, webhook de pagos...).
- Pasos para reproducirlo, prueba de concepto mínima y capturas si ayudan.
- Fecha y hora (UTC) de tus pruebas y la IP de origen, para identificarlas en nuestros registros.
- Si quieres aparecer en los agradecimientos y con qué nombre.

**No incluyas datos personales de clientes** aunque hayas llegado a verlos: describe el tipo de
dato y un identificador técnico (p. ej. número de pedido) y elimina cualquier copia.

## Nuestros plazos de respuesta

| Paso | Plazo máximo |
| --- | --- |
| Acuse de recibo | 3 días hábiles |
| Evaluación inicial y severidad (CVSS v4) | 7 días naturales |
| Corrección o mitigación — **crítica** | 7 días naturales |
| Corrección o mitigación — **alta** | 30 días naturales |
| Corrección o mitigación — **media** | 90 días naturales |
| Corrección o mitigación — **baja** | Mejor esfuerzo, en el siguiente ciclo |
| Información sobre el progreso | Al menos cada 14 días hasta el cierre |

Si la vulnerabilidad afecta a datos personales, valoraremos además la notificación a la
autoridad de control (AEPD) en el plazo de 72 horas del RGPD y, si procede, a las personas
afectadas.

### Divulgación coordinada

Te pedimos un plazo de **90 días** desde el acuse de recibo (o hasta que se publique la
corrección, si ocurre antes) antes de hacer pública cualquier información. Acordaremos contigo
la fecha y el contenido de la divulgación y te reconoceremos el hallazgo si lo deseas. No
ofrecemos recompensas económicas (no hay programa de *bug bounty*).

## Alcance

**Dentro del alcance** (solo con las condiciones de la sección siguiente):

- El sitio público y sus API (`/api/*`) en el dominio de producción.
- El panel de administración (`/admin`), **solo** para vulnerabilidades que no requieran
  acceder a cuentas ajenas (p. ej. fallos de autenticación, control de acceso o sesiones que
  puedas demostrar sin usar credenciales de otros).
- El código de este repositorio y su configuración de CI/CD e infraestructura.

**Fuera del alcance:**

- Ataques de denegación de servicio (DoS/DDoS), pruebas de carga o de estrés, y cualquier
  escaneo automatizado de alto volumen contra producción.
- Ingeniería social, *phishing*, ataques físicos o contra el personal, la tienda o proveedores.
- Servicios de terceros (Stripe, Vercel, Supabase, Upstash, proveedores de correo, mapas...):
  infórmales directamente según sus propias políticas.
- Informes sin impacto demostrable: cabeceras «recomendadas» ausentes sin escenario de
  explotación, *clickjacking* en páginas sin acciones sensibles, autocompletado de formularios,
  versiones de software sin vulnerabilidad aplicable, SPF/DMARC informativos, etc.
- Vulnerabilidades que requieran un dispositivo o navegador comprometido o desactualizado.

## Pruebas autorizadas y *safe harbor*

Solo están autorizadas las pruebas que cumplan **todas** estas condiciones:

- Usas exclusivamente cuentas, pedidos y datos **tuyos o de prueba**. Si accedes por error a
  datos de otra persona, detente, no los conserves ni los compartas y avísanos de inmediato.
- No degradas el servicio: nada de DoS, fuerza bruta masiva, spam de formularios o pedidos
  falsos que la tienda tenga que preparar. Respeta los límites de peticiones.
- No modificas ni borras datos que no sean tuyos y no intentas mantener el acceso
  (puertas traseras, persistencia) ni moverte a otros sistemas.
- No realizas pagos reales fraudulentos ni intentas eludir cobros; usa importes mínimos y
  cancela los pedidos de prueba.
- Nos informas sin demora y no divulgas el problema antes del plazo acordado.

Si actúas de buena fe y dentro de estas condiciones:

- consideraremos tu investigación **autorizada** y no emprenderemos ni apoyaremos acciones
  legales contra ti por ella;
- si un tercero inicia acciones por tus pruebas autorizadas, dejaremos constancia de que
  actuaste conforme a esta política;
- trabajaremos contigo para entender y resolver el problema con rapidez.

Esta política no puede autorizar pruebas contra sistemas de terceros ni eximirte de la ley
aplicable. Si dudas de si una prueba está permitida, **pregúntanos antes** en el canal de
seguridad.

## Controles de seguridad del proyecto (resumen)

Para quien revise el código o quiera contribuir:

- CI en cada PR: lint, tipos, tests unitarios y de integración contra PostgreSQL real,
  comprobación de RLS y mínimo privilegio, arranque de la app y pruebas DAST ligeras
  (`.github/workflows/ci.yml`).
- Análisis de seguridad en cada PR y semanalmente: CodeQL, Semgrep (con reglas propias en
  `.semgrep/`), `npm audit`, OSV-Scanner, Gitleaks sobre todo el historial, Trivy (código,
  IaC e imagen) y OWASP ZAP baseline contra una instancia efímera
  (`.github/workflows/security.yml`).
- Despliegue solo desde `main`, con CI y análisis en verde, staging, aprobación manual,
  prueba de humo y *rollback* automático (`.github/workflows/deploy.yml`).
- Lista de comprobación OWASP ASVS en cada PR (`.github/pull_request_template.md`).
