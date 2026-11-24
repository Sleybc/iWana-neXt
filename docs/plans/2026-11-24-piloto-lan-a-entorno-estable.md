# Del piloto LAN a un entorno estable — plan

**Fecha:** 2026-11-24 · **Estado:** propuesto, sin ejecutar · **Dueño de ejecución:** AI-PLAT-OPS (fases 0-3), AI-SEC-ENG audita la fase 2
**Origen:** auditoría del piloto del 2026-11-24 sobre `10.0.0.254` (commit `2a8ebb0e`).
**Fuentes:** [runbook §1.3](../runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md#13-piloto-de-consola-por-ip-en-la-lan) · [ADR-095](../adrs/ADR-095-Topologia-Productiva-Dominio-TLS-Hosting.md) · [informe Docker](../informes/INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md)

**Meta:** que el entorno arranque solo con el repo, sobreviva a un reinicio, registre la IP real del cliente, tenga respaldo restaurable y no dependa de archivos sueltos en `~/.local/share/iwana-pilot`.

## Límite de este plan

Las fases 0 a 3 dejan un **entorno interno estable en la LAN**. No lo convierten en producción: eso es G7 y depende de que el CTO declare la beta mínima y cierre D2 (hosting) de ADR-095. La fase 4 solo lista lo que esa activación exige; no se ejecuta desde aquí. Mientras no ocurra, el entorno opera con **datos de prueba** (ADR-078: la PII real exige dominio productivo).

## Hallazgos que el plan cierra

| # | Hallazgo | Evidencia | Fase |
| --- | --- | --- | --- |
| H1 | Healthcheck de `api-prod` usa `wget`; la imagen no lo trae. El stack no arranca sin un override externo | `docker-compose.prod.yml:208`; `compose.pilot.yml` | 0 |
| H2 | El worker corre con un Dockerfile alterno fuera del repo (Chromium copiado a mano) | `worker.Dockerfile` local, 2 líneas de diferencia | 0 |
| H3 | Docker Desktop: nginx ve a todos los clientes como `172.22.0.1`; límite de 100 req/min compartido y auditoría con IP falsa | logs de `iwana_nginx_prod`; `rate-limit-tracker.ts:34` | 1 |
| H4 | Sin arranque automático tras un reinicio | `AutoStart: false`, sin `Linger` | 1 |
| H5 | `ufw` **inactivo**: sin firewall de host. Decisión del CTO (2026-11-24): toda la `10.0.0.0/24` debe ver el servidor; se cierra todo lo demás | `sudo ufw status verbose` | 1 |
| H6 | Contraseña y secreto TOTP del administrador en un mismo archivo, más el QR | `pilot-admin.json`, `mfa-piloto-privado.png` | 2 |
| H7 | Clave de la CA raíz sin cifrar en el servidor y sin `nameConstraints` | `pilot-root-ca.key` | 2 |
| H8 | La API usa la cuenta raíz de MinIO | `S3_ACCESS_KEY_ID` = `MINIO_ROOT_USER` | 0 y 2 |
| H9 | Sin respaldos; datos dentro de `Docker.raw` | sin cron ni timers | 3 |
| H10 | Sin SMTP: el alta en dos pasos (ADR-115 (en revisión)) no entrega correos | `mailer.service.ts` modo dev | 2 |
| H11 | Postgres, Redis, MinIO y Typesense sin límite de memoria | `docker inspect`: `mem=0` | 0 |
| H12 | Menores: redirección con `$host`, healthcheck de nginx por `/`, `pgbouncer` sin uso, imágenes sin digest | `nginx.prod.conf:59`; `docker-compose.prod.yml:97` | 0 |

## Fase 0 — El repo arranca solo (código, sin tocar el servidor)

Ola de infraestructura: exige G6.5 antes de la fase 1 (ADR-107).

- [x] **0.1 Healthcheck de la API (H1).** En `docker-compose.prod.yml`, sustituir el `wget` de `api-prod` por el probe con `node` que ya corre en el piloto:
      `['CMD','node','-e',"fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]`.
      Prueba: añadir a `scripts/nginx-config.test.mjs` —o a un `scripts/compose-prod.test.mjs` nuevo si no cabe— un caso que falle si un healthcheck de un servicio con imagen propia invoca `wget` o `curl`.
- [x] **0.2 Build del worker (H2).** *Hecho 2026-11-24: la imagen se construye solo con el repo y lanza Chromium 145.0.7632.6 sin red. El fallo era DNS transitorio del daemon (`EAI_AGAIN`), no el Dockerfile; requisito de red documentado en el runbook §1.3.* Reproducir `docker compose ... build worker-prod` con el `apps/worker/Dockerfile` del repo y leer el error real del paso `playwright-core ... install` (el log local solo muestra `EAI_AGAIN` de DNS). Si es red del build: documentar el requisito en el runbook. Si es defecto del Dockerfile: corregirlo ahí. Cierre: imagen construida solo con el repo.
- [x] **0.3 Cuenta de servicio de MinIO (H8).** En `minio-init` (`docker-compose.yml`), crear un usuario con `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` y una política limitada al bucket `S3_BUCKET` cuando difieran de la raíz. Pasar ambas variables al servicio. Actualizar `RUNBOOK-MEDIA-MINIO-v1.0.md`.
- [x] **0.4 Límites de memoria en datos (H11).** Declarar `deploy.resources.limits` por servicio en el overlay de producción para `postgres`, `redis`, `minio` y `typesense`, con variable y default como los de las apps. Dimensionar contra la RAM del host de la fase 1. *Defaults 2g/512m/1g/1g; el stack completo queda en 8 GiB sobre un host de 30 GiB.*
- [x] **0.5 Menores (H12).** *Hechos: healthcheck de nginx a `/health`, `$host` conservado con su porqué y digests de postgres, redis y typesense. `pgbouncer` sale del perfil `production` (CTO, 2026-11-24): el aprovisionamiento de tenants del worker abre conexiones con `-c search_path`, que no sobrevive al modo transacción. Quedan fuera las cuatro imágenes `approval-required` (pgbouncer, minio, mc, nginx), que el inventario de `.env.production.example` (ADR-070 (superado), riesgo 6) reserva a decisión del CTO: no se fijan aquí.*
      - `nginx.prod.conf`: healthcheck del contenedor a `https://127.0.0.1/health` (ya previsto en ADR-079 D4).
      - Redirección del 80: decidir con AI-SEC-ENG si se fija el host. Con acceso por IP y dominios aún sin aprobar, `$host` es lo que permite un solo archivo; si se conserva, dejar el porqué en una línea.
      - `pgbouncer`: o la API lo usa (`DB_HOST=pgbouncer`, `DB_PORT=6432`, ya compatible con `SET LOCAL`) o sale del perfil `production`. Decide AI-EM-ARCH.
      - Fijar por digest las cinco imágenes de `.env.production.example` que hoy van por tag.
- [x] **0.6 Commitear lo pendiente.** `scripts/generate-secrets.sh` (escapado de `\n` de las claves JWT) y `scripts/dev.mjs` (`DOCKER_CONTEXT`) son correctos y están sin commitear.
- [ ] **0.7 Gates.** `node --test scripts/nginx-config.test.mjs`, `pnpm test:tooling`, `docker compose ... config --quiet` en las tres formas (base, LAN, VPS) y CI verde del SHA. *Locales verdes el 2026-11-24 (nginx-config 8/8, tooling 268/268, compose base/LAN/VPS OK, citas 0 bloqueantes); falta el CI del SHA, que exige push.*

**Cierre de fase:** en un daemon limpio, los dos comandos del runbook §1.3 levantan el stack sin ningún archivo fuera del repo salvo `.env` y TLS.

## Fase 1 — El servidor (host)

Requiere `sudo`; lo ejecuta el operador. Es una ventana con corte.

- [ ] **1.1 Docker Engine en lugar de Docker Desktop (H3, H4).** Instalar Docker Engine y el plugin Compose desde el repositorio oficial, `systemctl enable --now docker`. El entorno estable usa el contexto `default`; Docker Desktop queda solo para desarrollo. Los contenedores ya tienen `restart: unless-stopped`.
- [ ] **1.2 Mover los datos.** Con el stack detenido: `pnpm db:backup` y copia del bucket desde el daemon de Desktop; restaurar en el Engine con `pnpm db:restore`. Alternativa válida si los datos son solo de prueba: partir de volúmenes vacíos y repetir el alta inicial con el 443 limitado al operador (runbook §1.3 paso 1).
- [ ] **1.3 Firewall (H5).** Docker Engine publica puertos saltándose `ufw`, así que la restricción va en la cadena `DOCKER-USER`: permitir 80/443 hacia `10.0.0.254` desde toda la `10.0.0.0/24` (decisión del CTO, 2026-11-24) y descartar cualquier otro origen. Además `ufw enable` con SSH limitado a los equipos de administración. Persistir las reglas. *Artefacto listo (2026-11-24): `scripts/lan/docker-user-firewall.sh` y la unidad `iwana-lan-firewall.service`. Falta ejecutarlo con `sudo` en el host con Engine.*
- [ ] **1.4 Verificar.** Desde **otro equipo**: redirección 80→443, certificado aceptado, inicio de sesión, MFA y renovación de sesión (pendientes que el informe Docker ya lista). En los logs de nginx debe aparecer la IP real del cliente, no la de un gateway. Reiniciar el servidor y comprobar que el stack vuelve sano sin intervención. Desde un origen fuera de la `10.0.0.0/24`, el 443 no responde. Como toda la subred llega al servidor, el alta inicial con base vacía se hace con el 443 limitado temporalmente al operador.
- [ ] **1.5 Retirar el piloto.** Borrar el proyecto `iwana-pilot` de Docker Desktop y sus volúmenes `*_prod` una vez verificado el nuevo (acción destructiva: la ejecuta el usuario).

## Fase 2 — Secretos, identidad y correo

- [ ] **2.1 Administrador (H6).** Crear cuentas personales de administrador, cada una con su MFA en un autenticador propio. Desactivar la cuenta creada por el script del piloto. Borrar `pilot-admin.json`, `mfa-piloto-privado.png`, `check-browser.cjs` y los logs de `~/.local/share/iwana-pilot`.
- [ ] **2.2 CA interna (H7).** Reemitir la CA con `nameConstraints` limitada a `IP:10.0.0.254` (y al nombre interno si se adopta), clave cifrada y guardada **fuera del servidor**. Emitir el certificado de servidor, instalar la nueva raíz en los clientes y **retirar la raíz anterior** de cada equipo. Anotar el vencimiento y quién renueva (runbook §8.3-8.4). *Artefacto listo: `scripts/lan/issue-internal-ca.sh`. Sin subárbol DNS, la raíz permite solo `iwana.invalid`: por RFC 5280 un tipo sin subárbol quedaría libre. Falta emitir fuera del servidor y repartir la raíz.*
- [ ] **2.3 Rotar secretos.** Generar un `.env` nuevo para el entorno estable (no reutilizar `.env.pilot`): contraseñas de base, Redis, MinIO raíz, cuenta de servicio S3 (0.3), Typesense y claves de firma. Las claves `MFA_ENCRYPTION_KEY`, `PII_ENCRYPTION_KEY` y `PII_HASH_KEY` solo se cambian si se parte de volúmenes vacíos; con datos, seguir `RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md`. `PII_DECRYPT_LEGACY_MFA=false` en una base nueva.
- [ ] **2.4 SMTP (H10).** Configurar `SMTP_*` con un relay real y probar el alta en dos pasos de ADR-115 (en revisión) de punta a punta. Sin esto no se pueden dar de alta usuarios.
- [ ] **2.5 Revisión.** `sec-eng` audita el resultado contra el checklist pre-producción antes de dar acceso a más personas.

## Fase 3 — Respaldo y operación

- [ ] **3.1 Respaldo programado (H9).** Timer de systemd que ejecute `pnpm db:backup` cada hora y `pnpm db:purge-backups` según retención; copia diaria del bucket. Destino **fuera del host** y cifrado (runbook §6). *Artefacto listo: `scripts/lan/backup.sh` y timers `iwana-backup-db` (cada hora, 48 dumps o 14 días) e `iwana-backup-media` (diario). El destino fuera del host (`IWANA_OFFSITE_CMD`) espera la decisión del CTO.*
- [ ] **3.2 Ensayo de restore.** Restaurar un respaldo global y uno por tenant en una base aislada y registrar tiempos (runbook §6.3 y §7). Sin restore ensayado, el respaldo no cuenta.
- [ ] **3.3 Monitoreo mínimo.** Alerta si `/api/v1/health` deja de responder, si un contenedor queda `unhealthy`, si el disco pasa del 80 % y a 30 días del vencimiento del certificado. *Artefacto listo: `scripts/lan/healthwatch.sh` y timer cada 5 min, con fallos en el journal como `err`. Sin SMTP no hay correo de alerta.*
- [x] **3.4 Documentos.** Actualizar el runbook §1.3 (Docker Engine obligatorio, `DOCKER-USER`, ruta de respaldo) y la nota del piloto en el informe Docker, retirando sus dos pendientes cuando 1.4 los cubra. *Runbook v1.5 y nota del informe hechas; los dos pendientes siguen hasta 1.4.*

## Fase 4 — Producción (no se ejecuta desde este plan)

Se activa cuando el CTO declare la beta mínima (ADR-095 §Activación). Lo que este servidor **no** cumple hoy para ser el hosting de D2: IP pública con 80/443, UPS, enlace redundante, seguridad física y respaldos fuera del sitio. Además: FQDN `app.iwana.co` y `portal.iwana.co`, Let's Encrypt por HTTP-01, HSTS a un año tras el primer handshake, RPO/RTO de D6 medidos, dictamen jurídico de ubicación de datos y go de G7. El portal de empresas y los enlaces firmados de archivos siguen fuera del acceso por IP hasta tener esos nombres.

## Decisiones que necesita el plan

| Decisión | Quién | Bloquea |
| --- | --- | --- |
| ¿Se conservan los datos del piloto o se parte de cero? | CTO | 1.2, 2.3 |
| ¿Acceso por IP o por nombre interno (DNS de la LAN)? Un nombre permite probar portal y archivos | CTO | 2.2 |
| `pgbouncer`: usarlo o retirarlo del perfil | AI-EM-ARCH | 0.5 |
| Relay SMTP a usar | CTO | 2.4 |
| Destino de los respaldos fuera del host | CTO | 3.1 |

## No verificado al escribir este plan

Acceso desde otro equipo, causa real del fallo del build del worker (0.2) y el código de aplicación fuera de lo que el proxy expone. H3 se midió desde el propio host.
