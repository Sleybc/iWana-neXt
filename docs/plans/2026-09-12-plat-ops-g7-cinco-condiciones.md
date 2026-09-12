# Diagnóstico y plan — las cinco condiciones de G7 (autorización de producción)

**Fecha:** 2026-09-12
**Modo activo:** AI-PLAT-OPS (on-demand)
**Naturaleza:** auditoría de estado + plan. **No se ejecutó infraestructura, despliegue, migración, backup ni restore.** Ningún secreto fue leído, escrito ni registrado.
**Autoridad aplicable:** [ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md) §3 · [ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md) (Aprobado) · [ADR-078](../adrs/ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md) (**Propuesto**) · [Protocolo §3/§4](../roles/Protocolo_Colaboracion_Multiagente_v1.md) · [RUNBOOK-RELEASE-ROLLBACK-v1.0](../runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md)
**Contexto de entrada:** G6 GO; G6.5 con evidencia reunida sobre `63f3546f` (corrida 34706464854: E2E_SETUP=OK, 30 passed, 0 failed/skipped/flaky, E2E_CLEANUP=OK).

---

## 1. Bloqueo de gobernanza previo a las cinco condiciones

**[BLOQUEO] ADR-078 está en estado `Propuesto`** (`docs/adrs/ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md:4`). ADR-078 declara que sucede a ADR-070 (superado) y que este «se marcará `Superado` **solo** cuando este ADR quede aprobado». ADR-070 sigue marcado `Aprobado` (`docs/adrs/ADR-070-Diferimiento-Dominio-Productivo.md:4`) y no contiene marca de superación.

Consecuencia operativa: **la norma vigente del repositorio sigue difiriendo formalmente cuatro de las cinco condiciones** (ADR-070 (superado) §Decisión 4 difiere explícitamente restore global, restore por tenant y rollback por digest; §8.5 del runbook marca TLS `DIFERIDO`). Ejecutar hoy los ensayos contradice un ADR aprobado. La aprobación de ADR-078 por el CTO no es un trámite: es el acto que reabre el expediente y habilita a AI-PLAT-OPS a producir evidencia sin violar la gobernanza.

Esto **no** es un pendiente de ingeniería y **no** lo desbloquea ningún agente.

---

## 2. Tabla de estado de las cinco condiciones

| # | Condición ADR-069 §3 | Estado | Evidencia principal |
|---|---|---|---|
| 1 | **Dominio productivo** | **AUSENTE** (parametrización PARCIAL) | `nginx/nginx.prod.conf:45,55,143` · `.env.production.example:118,119,127,128` · `.github/workflows/ci.yml:177-188` |
| 2 | **TLS** | **AUSENTE** (procedimiento CUMPLE, ejecución nula) | `nginx/nginx.prod.conf:53-64,90,161` · `docker-compose.prod.yml:66-71` · `secrets/` solo `.gitkeep` · runbook §8.5 |
| 3 | **Rollback por componente** | **PARCIAL** — documentado íntegro, **cero ensayado** salvo reversibilidad de migraciones | runbook §5.1–§5.7 (líneas 256-366) · §7.3 (línea 477) · `packages/database/src/cli/tenant-revert.ts` |
| 4 | **Restore global** | **PARCIAL** — capacidad real en PostgreSQL, drill solo en dev; MinIO y Redis sin procedimiento | `scripts/db/backup.mjs`, `scripts/db/restore.mjs` · `package.json:15,16,18` · `RUNBOOK-SEC-P1-VENTANA-EXPAND-CONTRACT-v1.0.md:66,255-275` |
| 5 | **Restore por tenant** | **AUSENTE** — sin herramienta y sin ensayo | `scripts/db/backup.mjs` (sin `--schema`) · `scripts/db/restore.mjs` (sin `--schema`) · runbook §6.2 (líneas 397-420), nunca ejecutado |

Ninguna de las cinco está en **CUMPLE**. G7 es **NO-GO** y ningún agente puede moverlo (ADR-069 §3; ADR-078 §Reglas 1).

---

## 3. Detalle por condición

### 3.1 Dominio productivo — AUSENTE

**(a) Qué existe.** La parametrización está a medias y es deliberada:

- `nginx/nginx.prod.conf:143` — `server_name portal.REPLACE_ME_PRODUCTION_DOMAIN;` (vhost del portal, único parametrizado).
- `nginx/nginx.prod.conf:45` y `:55` — `server_name _;` en el redirect HTTP y en el vhost HTTPS principal. **El FQDN principal no está parametrizado**: es un `default_server` comodín, no un nombre. Al definir el dominio hay que sustituir dos placeholders y además convertir dos comodines en nombres reales.
- `.env.production.example:118,119,127,128` — `NEXT_PUBLIC_WEB_API_URL`, `NEXT_PUBLIC_PORTAL_API_URL`, `CORS_ORIGIN`, `FRONTEND_URL`, todas sobre `REPLACE_ME_PRODUCTION_DOMAIN`.
- `.env.production.example:60-63` — cuatro referencias `invalid/…:approval-required` (`PGBOUNCER_IMAGE`, `MINIO_IMAGE`, `MINIO_MC_IMAGE`, `NGINX_IMAGE`). **Sí exigen aprobación del CTO**: son el riesgo 6 de ADR-070 (superado), inventariado en `.env.production.example:43`.
- `.github/workflows/ci.yml:177-188` — gate `Block unresolved production prerequisites (R3.5)`: si existe un `.env.production` con `REPLACE_ME`/`approval-required` en línea no comentada, el job falla. Intacto.
- `apps/api/src/app.config.production-urls.spec.ts` — con `NODE_ENV=production` la API exige `FRONTEND_URL` y `CORS_ORIGIN` y rechaza `localhost`/`127.0.0.1`/`0.0.0.0`/`::1`. `api-prod` no arranca sin FQDN real. Es el cierre de la Fase 1 de G7 (`INFORME-PLAT-OPS-G7-FASE-01-v1.0.md` §2).

**(b) Qué falta.** Las seis decisiones del CTO (ADR-078 §D3 P2): FQDN, hosting, CA y método ACME, propietario de la zona DNS, ventana operativa, targets RPO/RTO. Sin hosting no se sabe si ACME HTTP-01 es viable, y sin eso no se elige método. Falta además decidir si `FRONTEND_URL` —hoy valor único— sirve a dos frontends (deuda declarada en `INFORME-PLAT-OPS-G7-FASE-01-v1.0.md` §4).

**(c) Verificación ejecutable.** Tras sustituir los valores en un `.env.production` local no versionado:

```bash
docker compose --profile production --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml config --quiet   # exit 0
grep -nE '(^[^#]*=[^#]*(approval-required|REPLACE_ME))' .env.production   # sin coincidencias
grep -n 'REPLACE_ME_PRODUCTION_DOMAIN' nginx/nginx.prod.conf             # sin coincidencias
```

Y el paso de resolución pública, que es lo que convierte la parametrización en dominio:

```bash
getent hosts <FQDN> && getent hosts portal.<FQDN>
```

**(d) Evidencia a archivar.** FQDN aprobado, fecha y acta de la decisión del CTO, SHA del commit que sustituye placeholders, código de salida de `config --quiet`, conteo de coincidencias residuales (`0`), plataforma y duración. **Nunca** el contenido de `.env.production` ni valores de variables.

---

### 3.2 TLS — AUSENTE

**(a) Qué existe.** El plano de datos está listo para recibir certificado, y solo eso:

- `nginx/nginx.prod.conf:53-64` — `listen 443 ssl`, `http2 on`, `ssl_protocols TLSv1.3`, `ssl_certificate /etc/nginx/tls/fullchain.pem` y `privkey.pem`.
- `nginx/nginx.prod.conf:44-46` — redirect 301 HTTP→HTTPS incondicional.
- `docker-compose.prod.yml:66-71` — monta `./nginx/nginx.prod.conf` y `./secrets:/etc/nginx/tls:ro`. `secrets/` contiene **solo** `.gitkeep`: no hay ni debe haber material de CA en el repo.
- `nginx/nginx.prod.conf:90` y `:161` — HSTS `max-age=300` en ambos vhosts, valor de preflight deliberado (riesgo 4 de ADR-070 (superado)).
- `apps/api/src/main.ts:58` — `helmet({...})` con solo `crossOriginResourcePolicy` configurado.
- `docs/runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md` §8.1–§8.4 — emisión, validación, renovación, recarga y procedimiento de certificado caducado, con comandos exactos. §8.5 declara el estado: **DIFERIDO**, sin emisión, renovación ni handshake.
- `docs/plans/2026-08-01-mod11-g7-cierre-produccion.md` Task 2 Step 2 — script de verificación TLS ya escrito y nunca ejecutado (valida redirect 3xx, `Location` al FQDN, health HTTPS 200 y `Verify return code: 0 (ok)` con `-verify_hostname`).

**(b) Qué falta.**

1. **Ningún certificado ni CA.** Requisito raíz: decisión de hosting y método ACME.
2. **No existe el camino de emisión.** No hay servicio `certbot` en `docker-compose.prod.yml` ni `location /.well-known/acme-challenge/` **antes** del `return 301` en `nginx.prod.conf`. Con HTTP-01, el challenge sería redirigido a HTTPS y fallaría. Es el riesgo 5 de ADR-070 (superado), aún abierto.
3. **No hay renovación**: ningún scheduler, servicio ni volumen compartido.
4. **Doble fuente de HSTS — a verificar antes de emitir.** Helmet no recibe configuración de `strictTransportSecurity` (`apps/api/src/main.ts:58-63`), por lo que la API emite su HSTS por defecto (mucho mayor que 300 s), y `nginx.prod.conf:77` documenta que no se usa `proxy_hide_header` ni `headers-more`. Las respuestas de `location /api/` podrían llevar dos cabeceras HSTS con `max-age` divergentes, anulando el preflight corto. **No es una afirmación de defecto: es una comprobación obligatoria antes del primer handshake**, porque HSTS no es reversible en el navegador.
5. `scripts/generate-certs.ps1` es autofirmado de desarrollo y **no** satisface esta condición en ningún caso (runbook §8.1).

**(c) Verificación ejecutable.** El script de `docs/plans/2026-08-01-mod11-g7-cierre-produccion.md` Task 2 Step 2 sirve tal cual. Complementos mínimos:

```bash
openssl x509 -in <ruta-fuera-del-repo>/fullchain.pem -noout -issuer -subject -dates
docker compose --profile production --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml exec -T nginx-prod nginx -t
certbot renew --dry-run
curl -sI https://<FQDN>/api/v1/health | grep -ci '^strict-transport-security:'   # esperado: 1
```

**(d) Evidencia a archivar.** Emisor, `subject`, fechas de validez, resultado booleano del handshake (`Verify return code: 0`), versión de OpenSSL, conteo de cabeceras HSTS, código de salida de `nginx -t`, resultado del `renew --dry-run`, duración y operador. **Nunca** clave privada, cadena completa, cabeceras crudas ni salida bruta de `s_client`.

---

### 3.3 Rollback por componente — PARCIAL

**(a) Qué existe.** El runbook cubre **todos** los componentes exigidos, uno por uno:

| Componente | Sección | Línea |
|---|---|---|
| Nginx / configuración TLS | §5.1 | 260 |
| Web y portal | §5.2 | 275 |
| API | §5.3 | 299 |
| Worker | §5.4 | 312 |
| Migrator y base de datos | §5.5 | 324 |
| PostgreSQL, Redis, MinIO, Typesense | §5.6 | 347 |
| Rollback completo | §5.7 | 355 |

La cobertura **no es solo global**: §5.2 documenta además la interacción no obvia entre el rollback por digest y `NEXT_PUBLIC_WEB_API_URL`/`NEXT_PUBLIC_PORTAL_API_URL`, que se bakean en build — volver a un digest anterior devuelve también su dominio de API, y cambiar de dominio es un rebuild, no un reinicio.

Sobre migraciones: `packages/database/src/migrations/tenant/revert.ts` y `packages/database/src/cli/tenant-revert.ts` existen; el revert tenant es asimétrico por diseño (nunca itera tenants, `--schema` obligatorio, `--dry-run` disponible) y algunos `down()` exigen `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true`. El gate 6 del protocolo §4 (línea 209) exige `down()` ejercitado sin `throw` incondicional. **Esa parte está ensayada**: revert de la pública `020` y de la tenant `099` con re-aplicación, 2026-08-01, base aislada (`INFORME-PLAT-OPS-R3.4-EVIDENCIA-v1.0.md`; runbook §10 marca esa única casilla).

**(b) Qué falta.**

1. **El ensayo reproducible de §7.2 está PENDIENTE** y el propio runbook lo declara: §7.3 línea 477. No hay un solo rollback de imagen ejecutado.
2. **No existe registro de imágenes.** `ADR-073-Cadena-de-Suministro-de-Imagenes.md:68` (propuesto) dice literalmente que hoy no lo hay. Sin registro no hay digests inmutables que registrar como punto de rollback: CI construye las imágenes (`.github/workflows/ci.yml:56` job `production-images`) pero no las publica. **El rollback por digest no es ejecutable hoy por ausencia de registro, no por falta de procedimiento.** Esto convierte la condición 3 en dependiente de una decisión de infraestructura que ADR-073 deja abierta.
3. No existe acta de release (el runbook §2 la exige fuera del repositorio, y por diseño no está aquí).

**(c) Verificación ejecutable.** Por componente, con digest origen/destino registrados:

```bash
docker compose --profile production --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps api-prod
docker compose --profile production --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml ps --format '{{.Service}} {{.Health}}'
```

Y para migraciones, sin tocar datos:

```bash
pnpm --filter @iwana/db migration:show
pnpm --filter @iwana/db migration:tenant:revert --schema=<tenant_schema> --dry-run
```

(Nota de invocación del runbook §5.5: en pnpm 10 / Windows **no** se usa el separador `--`.)

**(d) Evidencia a archivar.** Por componente: nombre, digest origen y destino, código de salida, estado de healthcheck (`healthy`), duración de la ventana, operador y veredicto. Para migraciones: identificador de migración, schema, `--dry-run` sí/no, resultado. **Nunca** logs brutos, variables de entorno ni contenido de tablas.

---

### 3.4 Restore global — PARCIAL

**(a) Qué existe.** Más de lo que el runbook de release refleja: hay **herramienta real**, creada por la Task 7 del plan SEC-P1 posterior a ADR-078.

- `scripts/db/backup.mjs` — `pg_dump -Fc` de la base completa, todos los schemas tenant incluidos; modo `docker` (por defecto) u `host`; destino `BACKUP_DIR` (`.backups/`, ignorado por git).
- `scripts/db/restore.mjs` — `pg_restore` sobre una base destino **nombrada explícitamente** (`--target`), nunca la base por defecto; `--list`/`--dry-run` no destructivos; confirmación por TTY tecleando el nombre exacto del dump, `--yes` obligatorio sin TTY.
- `scripts/db/purge-backups.mjs` — retención (10 dumps / 14 días), dry-run por defecto.
- `package.json:15,16,18` — `db:backup`, `db:restore`, `db:purge-backups`.
- `docs/runbooks/RUNBOOK-SEC-P1-VENTANA-EXPAND-CONTRACT-v1.0.md:255-275` (§4.3) — procedimiento operativo y política de retención, custodia PLAT-OPS.
- `docs/runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md` §6.1 y §6.3 (líneas 372-451) — criterios de PASS del restore, incluido uno que es exactamente el invariante de pgBouncer: «una transacción tenant aplica `SET LOCAL search_path` al schema aprobado y se revierte al fallar».

**(b) Qué falta.**

1. **El drill solo está marcado en dev.** `RUNBOOK-SEC-P1-VENTANA-EXPAND-CONTRACT-v1.0.md:66` — `dev [x] (local ops) · staging [ ] · prod [ ]`; y su §5.10 prohíbe marcar staging/prod con evidencia de dev. Para G7 hace falta el drill en el entorno objetivo.
2. **No hay evidencia archivada en el formato de ADR-069.** Existen dumps en `.backups/` (los más antiguos del 2026-08-08) pero un dump no es evidencia de restore.
3. **MinIO: no hay procedimiento de restore.** `RUNBOOK-MEDIA-MINIO-v1.0.md` §Backup de bucket contiene una sola línea `mc mirror s3-prod/… s3-backup/…` hacia un alias `s3-backup` que no está definido en ninguna parte, sin dirección inversa, sin verificación de referencias de `media_assets` y sin checksum. Un restore global de PostgreSQL sin los objetos de MinIO deja `media_assets` apuntando a ficheros inexistentes.
4. **Redis: no hay backup.** `docker-compose.yml:82` — `redis-server --save 60 1`, snapshot RDB sin AOF; ningún procedimiento copia o restaura ese volumen. El runbook §5.6 solo dice «restaurar solo si el plan aprobado cubre pérdida de estado»: **ese plan no existe**.
5. **No hay RPO/RTO declarados en ningún ADR.** Verificado: las únicas apariciones (`ADR-070 (superado):16,18,39,106`, `ADR-078:105,106`) los nombran como decisión **pendiente del CTO**. Sin targets aprobados, el plan G7 Task 5 Step 4 marca la condición como NO-GO por definición.

**(c) Verificación ejecutable.** Drill completo sobre base desechable:

```bash
pnpm db:backup
pnpm db:restore --list --from <dump>
pnpm db:restore --target dbiw_restore_test --from <dump> --yes
```

Y las comprobaciones de PASS del runbook §6.3, contra la base restaurada:

```sql
SELECT count(*) FROM public.tenants;
SELECT count(*) FROM information_schema.schemata WHERE schema_name LIKE 'tenant\_%';
BEGIN; SET LOCAL search_path TO <tenant_schema>; SELECT count(*) FROM migrations; ROLLBACK;
```

Al terminar, `DROP DATABASE dbiw_restore_test`.

**(d) Evidencia a archivar.** SHA del commit, checksum del dump, base destino (no productiva), conteo de tenants y de schemas antes/después, booleano de `SET LOCAL search_path` PASS, código de salida de `pg_restore`, duración medida y comparación contra el RTO aprobado, operador. **Nunca** el dump, rutas con PII, conteos de filas de negocio ni connection strings.

---

### 3.5 Restore por tenant — AUSENTE (la más débil de las cinco)

**(a) Qué existe.** Únicamente documentación, nunca ejecutada:

- `docs/runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md` §6.2 (líneas 397-420): obtener el `schema_name` desde `public.tenants` (nunca derivarlo de un slug de entrada), validarlo contra el contrato `^tenant_[a-z][a-z0-9_]{0,54}$` y ejecutar `pg_dump --schema="<schema_name_verificado>"`.
- §6.3 (líneas 421-451): el restore tenant de ensayo se hace en base aislada comprobando que exista **solo** el schema objetivo; `DROP SCHEMA … CASCADE` nunca como atajo; reemplazo en productiva exige ventana, bloqueo de escrituras, backup previo y autorización del CTO.
- El runbook ya registra la trampa semántica (línea ~419): **un backup tenant no contiene la fila de `public.tenants` ni los objetos globales que la aplicación requiere.** Recuperar un tenant exige el dump tenant **y** un backup global compatible.

**(b) Qué falta — esto es lo grave.**

1. **No existe herramienta.** `scripts/db/backup.mjs` toma `-Fc -d <DB_NAME>` sin opción `--schema` (su cabecera dice explícitamente «del entorno completo, incluidos todos los schemas de tenant»). `scripts/db/restore.mjs` restaura una base completa contra `--target` y **no tiene noción de schema**. La capacidad que SEC-P1 construyó es global; la condición 5 de ADR-069 quedó fuera de su alcance.
2. **No existe el procedimiento de reinyección.** Restaurar `tenant_x` sin tocar los demás requiere pasos que nadie ha escrito: aislar el schema, reconciliar la fila de `public.tenants` y el estado de migraciones de ese schema, y verificar que el resto de tenants queda intacto. El runbook describe el **ensayo aislado**, no la **operación sobre una base viva con otros tenants**, que es lo que la condición exige.
3. **Cero ensayos.** Ninguna evidencia, ni en dev.
4. Un restore tenant mal hecho es una violación de aislamiento multi-tenant: es el escenario que el protocolo manda escalar a AI-SEC-ENG.

**(c) Verificación ejecutable.** Con la herramienta que hoy no existe, la ruta manual del runbook §6.2/§6.3 sobre base desechable:

```bash
pg_dump --host "$DB_HOST" --port "$DB_PORT" --username "$DB_BOOTSTRAP_USER" \
  --dbname "$DB_NAME" --schema="<tenant_schema_verificado>" \
  --format=custom --no-owner --no-privileges --file="<ruta-fuera-del-repo>.dump"

createdb --host "$RESTORE_DB_HOST" --username "$RESTORE_ADMIN_USER" dbiw_tenant_restore_test
pg_restore --exit-on-error --no-owner --no-privileges \
  --dbname=dbiw_tenant_restore_test "<ruta-fuera-del-repo>.dump"
```

Comprobación de que **solo** llegó el schema objetivo y de que el aislamiento se mantiene:

```sql
SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant\_%';
BEGIN; SET LOCAL search_path TO <tenant_schema>; SELECT count(*) FROM migrations; ROLLBACK;
```

El ensayo solo cuenta si la base de origen tiene **al menos dos** schemas tenant y se verifica que el segundo no fue alterado (conteo de objetos antes/después).

**(d) Evidencia a archivar.** Identificador del tenant **anonimizado** (nunca slug ni razón social), número de schemas presentes en la base restaurada (esperado: 1), número de schemas intactos en la base de origen, booleano de `SET LOCAL search_path` PASS, código de salida de `pg_restore`, duración, operador. **Nunca** conteos de filas de negocio, nombres de tenant reales ni dumps.

---

## 4. Hallazgos colaterales (fuera de las cinco condiciones, pero tocan G7)

| # | Hallazgo | Ubicación | Severidad |
|---|---|---|---|
| H-1 | **Sin registro de imágenes**: el rollback por digest carece de sustrato | `ADR-073-Cadena-de-Suministro-de-Imagenes.md:68` (propuesto) | Alta — bloquea la condición 3 |
| H-2 | `RUNBOOK-MEDIA-MINIO-v1.0.md` §Rotación de credenciales prescribe `kubectl rollout restart deployment/iwana-api`. **Kubernetes está fuera del baseline Compose sin ADR** (runbook release §1, línea 40) | `docs/runbooks/RUNBOOK-MEDIA-MINIO-v1.0.md` | Media — runbook inejecutable en el baseline real |
| H-3 | Posible doble cabecera HSTS (helmet por defecto + `add_header` de Nginx) con `max-age` divergentes | `apps/api/src/main.ts:58` · `nginx/nginx.prod.conf:77,90,161` | Media — verificar **antes** del primer handshake |
| H-4 | `FRONTEND_URL` es un valor único para dos frontends | `.env.production.example:128` · `INFORME-PLAT-OPS-G7-FASE-01-v1.0.md` §4 | Media |
| H-5 | Redis sin política de backup ni de pérdida de estado aceptable | `docker-compose.yml:82` | Media — entra en RPO |
| H-6 | `scripts/nginx-config.test.mjs` solo valida `proxy_pass` de `/api/` y `/health`; no hay test que proteja los placeholders ni los `server_name` | `scripts/nginx-config.test.mjs` | Baja — automatizable en CI |

---

## 5. Precedente de formato de evidencia G7 en `docs/informes/`

**No existe ningún G7 de producción otorgado en el histórico.** Hay que decirlo con precisión porque el repositorio usa la etiqueta «G7» en **dos sentidos incompatibles**:

| Sentido | Qué autoriza | Ejemplos |
|---|---|---|
| **G7 de ADR-069 §3** — autorización de producción | Desplegar | **Ninguno otorgado.** Registro vigente: `INFORME-MOD11-FLOW-CABLEADO-v1.0.md` §15.13 → *NO-GO por diseño* |
| **G7 de cierre de fase/módulo** (ADR-022 §3, regla de completitud) | Habilitar el módulo N+1 | Los ~10 informes `…-CIERRE-G7-…` de MOD12 |

El más explícito al respecto es `INFORME-MOD12-CIERRE-MODULO-v1.0.md:43`: «El G7 cierra el módulo en alcance MVP […] **no** constituye cierre en producción (ADR-022 §3)», con el estado del propio informe declarando «Producción **NO desplegada**» (línea 5). Reutilizar esos informes como precedente de autorización productiva sería un error de lectura.

**Lo que sí es reutilizable es el formato de evidencia**, y viene de G6.5, no de G7: `INFORME-MOD11-FLOW-CABLEADO-v1.0.md:749-753` (§15.13). Su fila de G6.5 es exactamente la forma que ADR-069 §Consecuencias autoriza — identificador de corrida, SHA, jobs, conteo `29/0/0/0/0`, exit code, flaky y cleanup — sin un solo token, cookie, reporte bruto ni payload. **Ese es el molde para las cinco filas del futuro informe G7**, con la tabla de gates de `INFORME-PLAT-OPS-G7-FASE-01-v1.0.md` §7 como estructura de registro (G6 / G6.5 / G7 por separado, protocolo §7 línea 332).

Y el destino del informe ya está nombrado por el plan suspendido: `docs/informes/INFORME-MOD11-G7-EVIDENCIA-PRODUCCION-v1.0.md` (Task 5 de `docs/plans/2026-08-01-mod11-g7-cierre-produccion.md`).

---

## 6. Lista priorizada de lo que falta

| Prioridad | Tarea | Dueño | Bloquea |
|---|---|---|---|
| **P0** | Aprobar o rechazar **ADR-078** | **CTO** | Las cinco condiciones |
| **P1** | Las seis decisiones de F0.2: FQDN, hosting, CA/ACME, propietario DNS, ventana, **targets RPO/RTO** | **CTO** (PLAT-OPS propone) | 1, 2 y el criterio de PASS de 4 y 5 |
| **P2** | Decidir el **registro de imágenes** (ADR-073 (propuesto) capa 3) | CTO vía EM-ARCH | 3 |
| **P3** | **Construir la capacidad de restore por tenant**: `--schema` en `backup.mjs`/`restore.mjs` o script hermano, + procedimiento de reinyección de `public.tenants` | PLAT-OPS, revisión SEC-ENG | 5 |
| **P4** | Procedimiento de **backup/restore de MinIO** (alias, dirección inversa, checksum, verificación contra `media_assets`) y corrección de H-2 | PLAT-OPS | 4 |
| **P5** | Política de **Redis**: backup del RDB o declaración aprobada de pérdida de estado aceptable | PLAT-OPS propone, CTO aprueba | 4, RPO |
| **P6** | Cablear **ACME**: `location /.well-known/acme-challenge/` antes del `return 301`, servicio cliente ACME y volúmenes compartidos | PLAT-OPS, revisión SEC-ENG | 2 |
| **P7** | Verificar y resolver **H-3** (doble HSTS) antes de cualquier emisión | PLAT-OPS + SEC-ENG | 2 |
| **P8** | **Drill de restore global en el entorno objetivo** (no dev) con evidencia en formato ADR-069 | PLAT-OPS | 4 |
| **P9** | **Ensayo de rollback por componente** (api, portal, web, worker, nginx, migrator) del §7.2 | PLAT-OPS | 3 |
| **P10** | **Ensayo de restore por tenant** con ≥2 schemas y verificación de no-afectación del segundo | PLAT-OPS, auditoría SEC-ENG | 5 |
| **P11** | Automatizar en CI lo automatizable: guarda de placeholders en `nginx.prod.conf` y `server_name`, extendiendo `scripts/nginx-config.test.mjs` (protocolo §4: los gates automatizables se automatizan, no se verifican a mano) | PLAT-OPS | — |
| **P12** | Emisión TLS y handshake público sobre el FQDN aprobado | PLAT-OPS | 2 |
| **P13** | Consolidar `INFORME-MOD11-G7-EVIDENCIA-PRODUCCION-v1.0.md` y recomendación | EM-ARCH | G7 |

---

## 7. Orden de ejecución y dependencias

```
P0  ADR-078 aprobado (CTO)
 │
 ├──> P1  Seis decisiones F0.2 (CTO) ──┬──> P6  Cableado ACME ──> P7 HSTS ──> P12 Emisión TLS ─┐
 │                                     └──> Sustitución de placeholders (dominio) ─────────────┤
 │                                                                                             │
 ├──> P2  Registro de imágenes (CTO/EM-ARCH) ──> P9  Ensayo rollback por componente ───────────┤
 │                                                                                             │
 ├──> P3  Capacidad restore por tenant ──┐                                                     │
 ├──> P4  Backup/restore MinIO + H-2     ├──> P8  Drill restore global ──> P10 Restore tenant ─┤
 ├──> P5  Política Redis                 ┘        (criterio de PASS = RPO/RTO de P1)           │
 │                                                                                             │
 └──> P11 Guardas en CI (independiente, ejecutable en paralelo desde P0)                       │
                                                                                               │
                                              P13 Informe G7 + recomendación EM-ARCH <─────────┘
                                                              │
                                                              └──> Decisión G7: solo el CTO
```

**Dependencias duras que no admiten atajo:**

1. **P1 antes que P6, P7 y P12.** Sin hosting no se sabe si HTTP-01 es viable; cablear ACME antes de esa decisión puede ser trabajo tirado (y si se adopta subdominio por tenant, el método cambia obligatoriamente a DNS-01 con wildcard — dependencia registrada en ADR-070 (superado) §Insumos).
2. **P1 antes de cerrar P8 y P10.** Los ensayos se pueden *correr* sin RPO/RTO, pero no se pueden *declarar PASS*: el criterio de aceptación es la comparación contra targets aprobados (plan G7 Task 5 Step 4).
3. **P2 antes que P9.** Sin registro no hay digest que restaurar; un «rollback» sin digest inmutable no es evidencia.
4. **P3 antes que P10.** No se ensaya una capacidad que no existe.
5. **P8 antes que P10.** Un tenant no se recupera solo: necesita el global compatible (runbook §6.2).
6. **P11 es independiente** y conviene adelantarla: cierra por CI el riesgo de que un placeholder se sustituya por accidente antes de tiempo.

**Paralelizable desde P0:** P3, P4, P5 y P11 no dependen de ninguna decisión del CTO más allá de la reapertura. Son el camino crítico real de las condiciones 4 y 5 y hoy nadie los está ejecutando.

---

## 8. Bloqueos declarados

- **[BLOQUEO] ADR-078 en `Propuesto`.** Ningún trabajo de las cinco condiciones es legítimo mientras ADR-070 (superado) siga vigente y sin marca de superación. Requiere acto del CTO.
- **[BLOQUEO] Seis decisiones de F0.2 sin tomar.** Condiciones 1 y 2 no tienen ruta de verificación sin ellas; 4 y 5 no tienen criterio de PASS.
- **[BLOQUEO] Sin registro de imágenes (ADR-073 (propuesto) capa 3).** La condición 3 no es verificable por digest hoy. Es cambio de alcance de infraestructura: escala al orquestador con consulta a AI-SEC-ENG.

---

## 9. Referencias

- `docs/adrs/ADR-069-Gates-G6.5-Merge-Readiness.md` · `ADR-070 (superado)` · `ADR-073 (propuesto)` · `ADR-078`
- `docs/runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md` §5, §6, §7.3, §8, §10
- `docs/runbooks/RUNBOOK-SEC-P1-VENTANA-EXPAND-CONTRACT-v1.0.md` §0.2, §4.3
- `docs/runbooks/RUNBOOK-MEDIA-MINIO-v1.0.md`
- `docs/informes/INFORME-PLAT-OPS-G7-FASE-01-v1.0.md` · `INFORME-PLAT-OPS-R3.4-EVIDENCIA-v1.0.md`
- `docs/informes/INFORME-MOD11-FLOW-CABLEADO-v1.0.md` §15.13
- `docs/informes/CHECKLIST-MOD12-INVENTARIO-EXISTENCIAS-GATES-G6-G7-v1.0.md`
- `docs/plans/2026-08-01-mod11-g7-cierre-produccion.md` Tasks 2 y 5
- `docs/roles/Protocolo_Colaboracion_Multiagente_v1.md` §3 (líneas 109-130), §4 (líneas 200-209), §7 (línea 332)
