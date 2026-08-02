# RUNBOOK — Release y rollback

**Tipo:** Runbook operativo
**Módulo:** TRANSVERSAL — Plataforma / release / recuperación
**Versión:** 1.1
**Fecha:** 2026-08-02 (v1.0: 2026-07-30)
**Autor:** AI-PLAT-OPS
**Estado:** Documentado; **no autoriza producción**. Desde 2026-08-01 existe evidencia ejecutada de **reversibilidad de migraciones** (revert public 020 y revert tenant 099 con re-aplicación, ver [evidencia R3.4](../informes/INFORME-PLAT-OPS-R3.4-EVIDENCIA-v1.0.md)). El ensayo de rollback por componente/imagen y las pruebas de restore global/tenant siguen pendientes.
**Cambio v1.0 → v1.1 (2026-08-02):** reencuadre por [ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md). El expediente de dominio productivo y TLS pasa de **`BLOQUEADO — STOP/NO-GO`** a **`DIFERIDO — sin trabajo en curso`**: no hay decisión detenida esperando al CTO, hay una decisión tomada de no abordarlo hasta que se cumpla el disparador de reactivación. **Ningún procedimiento cambia** — §5, §6 y §8 se conservan íntegros como insumo de la reactivación.

> **Cómo leer este runbook hoy.** Todos sus procedimientos son correctos y ejecutables, pero **ninguno está planificado**: el programa está en construcción modular y no va a producción ([ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md)). Lo que aquí figura como "pendiente" es **condición de un release futuro**, no trabajo atrasado. Se reactiva con el disparador de ADR-070 — en particular, y sin excepción, si se procesa PII de personas reales aunque el entorno no se llame producción.
**R3:** R3.4
**Referencias:** [Plan de remediación G6, R3.1–R3.5](../plans/2026-07-28-mod09-mod11-ot-instalacion-remediacion-g6.md) · [Protocolo de colaboración §2, §4 y §6](../roles/Protocolo_Colaboracion_Multiagente_v1.md) · [Stack tecnológico](../prds/Stack_Tecnologico.md) · [Migraciones DB](RUNBOOK-DB-MIGRATIONS-v1.1.md) · [Least privilege](RUNBOOK-DB-LEAST-PRIVILEGE-v1.0.md)

> **Regla de verdad:** este documento define un procedimiento reproducible. No registra como ejecutados un backup, un restore, una emisión/renovación de certificado ni un rollback mientras no exista evidencia fechada y revisable. Ver [evidencia R3.4](../informes/INFORME-PLAT-OPS-R3.4-EVIDENCIA-v1.0.md).

---

## 1. Propósito y límites

Este runbook opera el baseline Docker Compose on-premise del repositorio:

```text
PostgreSQL → pgBouncer → API → web / portal
Redis ───────────────────────────→ worker
MinIO ───────────────────────────→ API / worker
Typesense ───────────────────────→ API
Nginx-prod ── TLS ───────────────→ API / web / portal
```

Cubre:

- orden de arranque y migraciones;
- criterios de abort y stop/go;
- rollback por componente y rollback completo;
- backup y restore global y por schema tenant;
- ensayo reproducible de recuperación;
- certificados R3.5, renovación, recarga de Nginx y certificado caducado.

No cambia topología, código de aplicación, contratos ni política de seguridad. Kubernetes, service mesh, multi-cloud o una herramienta nueva quedan fuera del baseline y requieren ADR aprobado.

### 1.1 Autoridad y responsabilidades

| Responsabilidad | Dueño |
|---|---|
| Recomendación técnica y cierre de fase | AI-EM-ARCH |
| Go de producción / excepciones / RPO-RTO / ventana | **CTO vía G7** |
| Ejecución de Compose, migrator, Nginx, backup y rollback | AI-PLAT-OPS |
| Orden y contenido de migraciones | AI-SR-FULL / AI-DATA-ENG cuando aplique |
| Controles TLS, secretos y PII | AI-SEC-ENG define y audita; AI-PLAT-OPS implementa |
| Evidencia E2E y criterios de calidad | AI-SR-QA |

Un release sin go de G7, sin rollback declarado o sin backup/restore verificable es **NO-GO**.

### 1.2 Condiciones pendientes de un release aún no planificado

> **Reencuadre v1.1 ([ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md)):** estos cuatro puntos se listaban como *"bloqueos conocidos"*. No bloquean nada hoy — son **condiciones de entrada de un release que no está planificado**. Permanecen visibles porque deben cumplirse antes del primer despliegue, no porque haya trabajo detenido.

Estos puntos no se resuelven en este commit y deben permanecer visibles en el registro de release:

1. `.env.production.example` contiene referencias `approval-required`; sirve para validar la forma de Compose, no para desplegar.
2. `secrets/` contiene únicamente `.gitkeep`; no hay certificado de producción disponible en el repositorio ni debe haberlo.
3. Las referencias exactas de algunas imágenes de producción y el dominio/proveedor TLS requieren aprobación o provisión externa según R3.1/R3.5.
4. No existe en esta entrega evidencia de restore global, restore tenant, rollback ensayado por componente/imagen, emisión, renovación o handshake TLS de producción. La **reversibilidad de migraciones sí está ensayada** desde 2026-08-01 en base aislada: revert de la migración public `020` (sin datos de evidencia) y revert de la tenant `099` (`ExtendEvidenceUploadIntentStatus`) con y sin el flag destructivo, ambos con re-aplicación posterior. Ver [evidencia R3.4](../informes/INFORME-PLAT-OPS-R3.4-EVIDENCIA-v1.0.md).

Mientras cualquiera de estos bloqueos afecte al entorno objetivo, el paso operativo es detenerse y escalar, no sustituirlo por un supuesto.

---

## 2. Registro de release y prerrequisitos

Crear el registro de la ventana **fuera del repositorio** y sin secretos. Como mínimo debe contener:

- `release_id`, commit SHA y tag de cada imagen, preferiblemente digest;
- versión de migraciones públicas y lista de schemas tenant activos;
- entorno, operador, ventana UTC y go de G7;
- imagen anterior por componente y punto exacto de rollback;
- ubicación externa cifrada de los backups y sus checksums;
- evidencia de restore vigente: global y, si el release afecta tenants, al menos un restore tenant representativo;
- certificado activo, emisor, dominio, fecha de expiración y método de renovación;
- criterio de abort acordado. No inventar un umbral de lag: R3.3 indica “sin umbral aprobado” hasta medirlo y obtener aprobación del CTO.

### 2.1 Preflight seguro

Ejecutar con el archivo de entorno real, local y no versionado. `config` debe usar `--quiet` para no imprimir secretos:

```bash
docker compose --profile production --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml config --quiet
```

Comprobar además:

```bash
docker compose --profile production --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml ps

git rev-parse HEAD
```

El segundo comando solo registra el SHA en el acta; no registrar el contenido de `.env.production`, tokens, claves, connection strings ni dumps.

### 2.2 Condiciones de entrada

- El commit y las imágenes fueron construidos y verificados por CI; no usar tags flotantes.
- `config --quiet` termina con código `0`.
- Todos los secretos son inyectados por el mecanismo operativo aprobado; no están en imágenes, Compose, workflows ni logs.
- El dominio productivo y el certificado de CA reconocida están definidos/provisionados para R3.5. El autofirmado de `scripts/generate-certs.ps1` solo es válido para desarrollo o staging cerrado.
- Existe un backup previo con checksum y restore verificado. Si no existe la evidencia, declarar **NO-GO**.
- El rollback es compatible con el estado de datos. Una migración irreversible o no probada impide avanzar.
- El responsable de datos confirma el alcance de tenants activos y el plan de restore.
- La ventana de mantenimiento, RPO/RTO y excepciones tienen decisión del CTO; este runbook solo propone el procedimiento.

---

## 3. Orden de arranque de un release

Ejecutar los pasos en orden. No arrancar API, web, portal ni worker antes de terminar las migraciones aprobadas.

### Paso 0 — Congelar y tomar el punto de rollback

1. Anunciar inicio de ventana y activar mantenimiento o detener el tráfico de escritura según el plan aprobado.
2. Registrar commit SHA, imágenes anterior/nueva y configuración no secreta.
3. Confirmar backup global y backups tenant requeridos; verificar que los restores correspondientes ya fueron ensayados.
4. Confirmar que el rollback no depende de una migración `down()` no revisada.

### Paso 1 — Arrancar dependencias de datos

```bash
docker compose --profile production --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml up -d postgres redis minio typesense
```

Esperar los healthchecks de PostgreSQL, Redis, MinIO y Typesense. Después arrancar pgBouncer:

```bash
docker compose --profile production --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml up -d pgbouncer
```

No cambiar el supuesto de tenancy: pgBouncer usa `POOL_MODE=transaction` y no conserva `search_path`; cada transacción debe aplicar `SET LOCAL search_path` mediante el código aprobado.

### Paso 2 — Ejecutar migraciones, primero públicas y luego tenant

El migrator debe usar `DB_MIGRATOR_USER`/`DB_MIGRATOR_PASSWORD`, nunca la identidad de runtime de la API. El artefacto de migración debe:

1. aplicar migraciones públicas en orden;
2. enumerar los tenants activos desde `public.tenants`;
3. aplicar las migraciones tenant en el runner explícito y en orden;
4. propagar cualquier código de salida distinto de cero;
5. aplicar/verificar least privilege cuando corresponda.

En el perfil de producción, usar el servicio `migrator-prod` únicamente cuando su imagen y entrypoint hayan pasado el gate R3.1:

```bash
docker compose --profile production --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml up --abort-on-container-exit \
  --exit-code-from migrator-prod migrator-prod
```

Un código de salida distinto de cero, una migración parcial o un tenant fallido detienen el release. No aceptar un log de “migraciones completas” si el proceso no propagó el código de salida real.

La ruta canónica de diagnóstico de migraciones está en [RUNBOOK-DB-MIGRATIONS-v1.1.md](RUNBOOK-DB-MIGRATIONS-v1.1.md): `pnpm db:migrate:all` compila `@iwana/db`, ejecuta public y tenant, y deja trazabilidad del runner. Ejecutarla en producción solo si la imagen/ventana aprobada lo contempla; no mezclar dos actores DDL concurrentes.

Verificar como mínimo:

```sql
SELECT id, slug, schema_name, status
FROM public.tenants
ORDER BY created_at ASC;

SELECT *
FROM public.typeorm_migrations
ORDER BY id DESC;
```

### Paso 3 — Arrancar aplicaciones

```bash
docker compose --profile production --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml up -d api-prod web-prod portal-prod worker-prod
```

Esperar `api-prod` healthy antes de publicar Nginx. Validar el endpoint sin mostrar headers ni tokens:

```bash
docker compose --profile production --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml exec -T api-prod \
  wget -qO- http://127.0.0.1:3000/api/v1/health
```

### Paso 4 — Arrancar o recargar Nginx

```bash
docker compose --profile production --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml up -d nginx-prod

docker compose --profile production --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml exec -T nginx-prod nginx -t
```

Validar externamente el dominio aprobado:

```bash
curl --fail --silent --show-error https://<dominio-aprobado>/health
curl --fail --silent --show-error https://<dominio-aprobado>/api/v1/health
```

### Paso 5 — Smoke y cierre de ventana

- API: health `200` y smoke funcional aprobado por QA.
- Web y portal: carga por HTTPS, sin acceso directo en claro que evite el ingress.
- Worker: proceso activo y sin errores de arranque; no borrar colas para “limpiar” el resultado.
- PostgreSQL/Redis/MinIO/Typesense/pgBouncer: healthchecks verdes.
- Nginx: `nginx -t` y handshake con cadena válida.
- Registrar hora, resultado y responsable de cada check.
- Retirar mantenimiento solo con recomendación de EM-ARCH y go de G7 confirmado.

---

## 4. Criterios de abort

Abortar antes de publicar tráfico nuevo si ocurre cualquiera de estos eventos:

| Señal | Acción inmediata |
|---|---|
| `config --quiet` falla o falta una variable obligatoria | No arrancar; corregir el secret store/configuración y repetir preflight. |
| Imagen sin digest/tag aprobado o pull/build distinto al registro | Detener; resolver aprobación de release. |
| Backup ausente, checksum inválido o restore previo no verificable | **NO-GO**; no hacer una copia “a posteriori” y llamarla evidencia. |
| PostgreSQL, Redis, MinIO, Typesense o pgBouncer no saludables | Mantener tráfico en mantenimiento; diagnosticar dependencia. |
| Migrator retorna código distinto de cero, hay tenant parcial o migración ambigua | Detener; conservar logs sanitizados y decidir rollback/restauración con DATA-ENG/CTO. |
| API no responde `/api/v1/health` o web/portal no arranca | No publicar Nginx; volver a imagen anterior según §5. |
| `nginx -t` falla, cadena TLS inválida o certificado expirado | No recargar; mantener el certificado anterior válido o declarar NO-GO. Nunca sustituir por autofirmado en producción. |
| Error funcional crítico, pérdida de aislamiento tenant o logs con secretos/PII | Abort inmediato y escalar a EM-ARCH/SEC-ENG. |
| Lag, DLQ o discrepancia sin umbral aprobado | Registrar la medición; no inventar un criterio numérico de abort. Si el comportamiento es claramente anómalo, abortar por decisión de G7. |

Abortar no significa ejecutar automáticamente un `down()` de migración. Primero se identifica el punto de fallo y se elige rollback de imagen, reversión revisada o restore.

---

## 5. Rollback por componente

Usar siempre los tags/digests **anteriores** registrados en el acta. No usar `latest` ni editar el `.env.production` sin dejar una nueva copia del registro no secreta.

### 5.1 Nginx / configuración TLS

1. No recargar una configuración que no pasa `nginx -t`.
2. Restaurar el archivo de configuración y/o el par de certificado anterior desde el almacenamiento externo autorizado.
3. Validar y recargar:

   ```bash
   docker compose --profile production --env-file .env.production \
     -f docker-compose.yml -f docker-compose.prod.yml exec -T nginx-prod nginx -t
   docker compose --profile production --env-file .env.production \
     -f docker-compose.yml -f docker-compose.prod.yml exec -T nginx-prod nginx -s reload
   ```

4. Confirmar `/health` y el handshake TLS. Si no existe certificado válido anterior, dejar producción en NO-GO; no degradar a HTTP ni a autofirmado.

### 5.2 Web y portal

1. Mantener API y datos si son compatibles.
2. Cambiar `WEB_IMAGE`/`PORTAL_IMAGE` o el override operativo al digest anterior.
3. Recrear solo el componente afectado:

   ```bash
   docker compose --profile production --env-file .env.production \
     -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps web-prod portal-prod
   ```

4. Verificar carga por Nginx y smoke de QA. No borrar volúmenes.

### 5.3 API

1. Detener el despliegue nuevo y conservar sus logs sanitizados.
2. Volver al digest anterior solo si el esquema actual es compatible con ese binario.
3. Recrear API y esperar el healthcheck:

   ```bash
   docker compose --profile production --env-file .env.production \
     -f docker-compose.yml -f docker-compose.prod.yml up -d api-prod
   ```

4. Si la migración cambió el contrato o eliminó datos, no forzar una imagen anterior: usar restore global o tenant según §6 con autorización CTO.

### 5.4 Worker

1. Detener el worker nuevo sin borrar Redis ni sus colas:

   ```bash
   docker compose --profile production --env-file .env.production \
     -f docker-compose.yml -f docker-compose.prod.yml stop worker-prod
   ```

2. Arrancar el digest anterior y verificar que los jobs pendientes sean compatibles.
3. Si el payload o el contrato cambió, mantener el worker detenido y escalar a SR-FULL/EM-ARCH; no consumir jobs con un binario incompatible.

### 5.5 Migrator y base de datos

- Si el migrator falla antes de aplicar cambios, detenerlo, revisar la causa y corregir el artefacto.
- Si una migración pública transaccional falló, revertir solo la última migración mediante el comando revisado y aprobado:

  ```bash
  pnpm --filter @iwana/db migration:revert   # revierte UNA migración public (la última del registro)
  pnpm --filter @iwana/db migration:run      # re-aplica
  ```

  Antes de revertir conviene inspeccionar el plan con `pnpm --filter @iwana/db migration:show`. La ruta canónica de diagnóstico completa está en [RUNBOOK-DB-MIGRATIONS-v1.1.md](RUNBOOK-DB-MIGRATIONS-v1.1.md).
- Para tenant, operar únicamente sobre el schema afectado y solo si existe un `down()` revisado y una evidencia de ensayo. El revert tenant es **asimétrico por diseño**: nunca itera tenants; el schema es un argumento obligatorio:

  ```bash
  pnpm --filter @iwana/db migration:tenant:revert --schema=<tenant_schema> --dry-run   # plan sin tocar nada
  pnpm --filter @iwana/db migration:tenant:revert --schema=<tenant_schema> --yes      # revierte UNA migración
  ```

  > **Nota de invocación (2026-08-01).** La ayuda del CLI documenta el separador `pnpm ... migration:tenant:revert -- --schema=...`, pero en pnpm 10 / Windows el `--` no es consumido por pnpm y `parseArgs` del CLI lo rechaza. La forma operativa verificada es **sin** el separador (`--schema=...` directo). Mantener esta nota hasta alinear la ayuda del CLI.

  Algunos `down()` de tenant exigen declarar intención destructiva con `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true` cuando el schema contiene filas de negocio (p. ej. `095`, `099`, `000`). El flag se exporta **acotado a la sesión** que ejecuta el revert; el CLI no lo fija y no ofrece opción para hacerlo. Sin el flag, el `down()` aborta sin tocar nada; con el flag, elimina únicamente filas transitorias (`PENDING`/`FAILED` con `media_asset_id IS NULL` en el caso de `099`) y cualquier fila que sobreviva y viole el CHECK previo aborta la transacción completa — el revert nunca deja el schema a medias.
- Si hay DDL no reversible, datos transformados o múltiples tenants afectados, usar restore desde el backup verificado. No declarar éxito por que la API arranque: comprobar migraciones, tenants y smoke.

### 5.6 PostgreSQL, Redis, MinIO y Typesense

- No cambiar una imagen de almacenamiento sin compatibilidad explícita con el volumen existente.
- PostgreSQL: restore según §6; respetar el rol migrator y el aislamiento por schema.
- Redis: conservar colas y estado; restaurar solo si el plan aprobado cubre pérdida de estado y hay backup verificable.
- MinIO: restaurar objetos desde el backup S3/MinIO aprobado y validar referencias de `media_assets`; seguir [RUNBOOK-MEDIA-MINIO-v1.0.md](RUNBOOK-MEDIA-MINIO-v1.0.md).
- Typesense: reconstruir/reindexar solo con procedimiento del servicio aprobado; no confundir un índice reconstruible con un backup de PostgreSQL.

### 5.7 Rollback completo

1. Activar mantenimiento y detener escrituras/consumidores.
2. Conservar evidencia y registrar el motivo de abort.
3. Detener API, web, portal, worker y Nginx; dejar las dependencias de datos aisladas.
4. Restaurar imágenes anteriores.
5. Revertir migración solo si está revisada y es reversible; de lo contrario, restore global o tenant.
6. Arrancar dependencias → migrator aprobado/validación → API → web/portal/worker → Nginx.
7. Repetir healthchecks, smoke, aislamiento tenant y handshake TLS.
8. Mantener la ventana abierta hasta que CTO/G7 decida cierre. Emitir informe de ejecución separado con rollback sí/no y evidencias.

---

## 6. Backup y restore PostgreSQL

Los backups contienen datos potencialmente personales y se tratan como PII bajo la gobernanza del proyecto. Guardarlos cifrados, con acceso mínimo, retención aprobada y fuera del repositorio. Nunca poner passwords, dumps o rutas con PII en logs o commits.

### 6.1 Backup global

Usar `pg_dump` desde un host/contenedor de operaciones aprobado. La contraseña debe llegar por `.pgpass` o secret store fuera del repo; no usarla como argumento ni imprimirla.

```bash
pg_dump \
  --host "$DB_HOST" --port "$DB_PORT" \
  --username "$DB_BOOTSTRAP_USER" --dbname "$DB_NAME" \
  --format=custom --no-owner --no-privileges \
  --file="/secure-backups/<release-id>/postgres-global-<utc>.dump"

sha256sum "/secure-backups/<release-id>/postgres-global-<utc>.dump" \
  > "/secure-backups/<release-id>/postgres-global-<utc>.sha256"
```

El backup global debe abarcar `public` y los schemas tenant. Verificar al menos:

```bash
pg_restore --list \
  "/secure-backups/<release-id>/postgres-global-<utc>.dump" \
  > "/secure-backups/<release-id>/postgres-global-<utc>.toc"
```

La existencia del dump, su checksum y `pg_restore --list` **no equivalen** a un restore probado. El estado solo es “verificado” después de restaurar en una base aislada y ejecutar las comprobaciones de §6.3.

### 6.2 Backup por tenant

Obtener el schema desde `public.tenants`; nunca derivarlo de un slug recibido directamente ni concatenar input sin validación:

```sql
SELECT id, slug, schema_name, status
FROM public.tenants
WHERE id = '<tenant-id-ya-autorizado>'
  AND status = 'ACTIVE';
```

El valor debe cumplir el contrato de schemas tenant `^tenant_[a-z][a-z0-9_]{0,54}$`. Con el `schema_name` verificado por el operador, ejecutar:

```bash
pg_dump \
  --host "$DB_HOST" --port "$DB_PORT" \
  --username "$DB_BOOTSTRAP_USER" --dbname "$DB_NAME" \
  --schema="<schema_name_verificado>" \
  --format=custom --no-owner --no-privileges \
  --file="/secure-backups/<release-id>/<schema_name_verificado>-<utc>.dump"
```

Un backup tenant no contiene por sí solo la fila de `public.tenants`, ni garantiza objetos globales requeridos por la aplicación. Para recuperar un tenant completo se deben conservar ambos: el backup tenant y el backup global compatible.

### 6.3 Restore y criterios de evidencia

El primer restore de cada tipo se hace en una base aislada, con datos sintéticos o una copia protegida aprobada. Nunca probar restauración destructiva sobre el único origen.

**Restore global de ensayo:**

```bash
createdb --host "$RESTORE_DB_HOST" --port "$RESTORE_DB_PORT" \
  --username "$RESTORE_ADMIN_USER" "<restore_db_global>"

pg_restore --exit-on-error --no-owner --no-privileges \
  --dbname="<restore_db_global>" \
  "/secure-backups/<release-id>/postgres-global-<utc>.dump"
```

**Restore tenant de ensayo:** restaurar el dump en una base aislada y comprobar que existe únicamente el schema objetivo. En una base productiva, un reemplazo de schema requiere ventana, bloqueo de escrituras del tenant, backup previo y autorización CTO; `DROP SCHEMA ... CASCADE` nunca se ejecuta como atajo.

**Criterios de PASS del restore:**

- `pg_restore` termina con código `0` y sin errores ocultos;
- existe `public` y el schema tenant objetivo;
- `public.tenants` conserva el inventario esperado en el restore global;
- las tablas de migraciones y el estado esperado están presentes;
- se conecta la API con el usuario de runtime sin privilegios de migración;
- una transacción tenant aplica `SET LOCAL search_path` al schema aprobado y se revierte al fallar;
- healthcheck y smoke funcionan sin cruzar tenants;
- se registra duración, checksum, base destino no productiva y operador, sin datos de negocio.

Hasta completar estos puntos, el backup/restore es **PENDIENTE** y no habilita release.

---

## 7. Ensayo reproducible de R3.4

El ensayo debe ser aislado, repetible y ejecutarse con el mismo commit, manifiestos de imagen y orden del release. No usar datos reales de suscriptores.

### 7.1 Preparación

1. Provisionar una carpeta temporal segura fuera del repo para dumps, logs y overrides.
2. Usar un entorno Compose aislado y datos sintéticos: `public` + al menos dos schemas tenant.
3. Registrar SHA, digests, versión de Compose y fecha UTC.
4. Generar backup global y tenant siguiendo §6; generar checksums.
5. Restaurar ambos en bases aisladas y adjuntar el resultado de §6.3.

### 7.2 Ejecución del rollback controlado

1. Arrancar dependencias y ejecutar migraciones con el mismo orden de §3.
2. Arrancar la versión nueva y guardar healthchecks.
3. Inyectar un fallo controlado en **una sola** superficie no destructiva (por ejemplo, una configuración/imagen de ensayo definida en un override temporal fuera del repo). No modificar el Compose versionado ni usar una imagen no aprobada en producción.
4. Activar abort, detener el componente fallido y aplicar §5.1–§5.6 según la superficie.
5. Si el fallo afecta al esquema o a datos, ejecutar el restore global/tenant de ensayo; si solo afecta a imagen, demostrar rollback de imagen sin restaurar datos.
6. Repetir arranque en orden y comprobar health, smoke, aislamiento tenant y TLS.
7. Comparar el estado esperado y documentar `rollback_required`, duración, resultado y evidencia enlazada.

### 7.3 Condición de cierre del ensayo

El ensayo cuenta únicamente con evidencia que muestre comandos completos, códigos de salida, commit/digests, destino aislado y resultados de health/smoke. Un procedimiento escrito, un dump no restaurado o un log de arranque no son evidencia de rollback.

**Estado de esta versión:** la **reversibilidad de migraciones** (public y tenant, incluyendo la migración con CHECK `chk_execution_order_evidence_upload_intents_status` 099 y sus guardas) quedó **ensayada el 2026-08-01** en un PostgreSQL aislado y desechable, con datos sintéticos y dos schemas tenant; ver [INFORME-PLAT-OPS-R3.4-EVIDENCIA-v1.0.md](../informes/INFORME-PLAT-OPS-R3.4-EVIDENCIA-v1.0.md). El **ensayo reproducible completo de §7.2** (fallo inyectado en una superficie por componente + rollback de imagen y/o restore global/tenant con el mismo commit y manifiestos) sigue **PENDIENTE** y bloquea declarar R3.4 cerrado en su totalidad.

---

## 8. Certificados TLS — R3.5

### 8.1 Decisión y prerrequisitos

La decisión registrada para producción es usar un certificado emitido por una CA reconocida. El dominio y el proveedor siguen siendo decisiones/insumos del CTO. El autofirmado generado por `scripts/generate-certs.ps1` es solo para desarrollo/staging cerrado y no autentica el servidor ante usuarios reales.

Antes de emitir:

- confirmar dominio productivo bajo control DNS;
- elegir CA y método de validación; HTTP-01 es la ruta recomendada para un dominio único, DNS-01 es obligatorio si se requieren wildcards;
- confirmar ventana y responsable de renovación;
- guardar la clave privada solo en el secret store o volumen protegido fuera de Git;
- no incluir la clave en `.env.production.example`, Compose, imágenes, workflows, tickets ni logs.

### 8.2 Emisión

La implementación R3.5 debe proporcionar un webroot/volumen compartido con Nginx y el cliente ACME, y servir `/.well-known/acme-challenge/` antes del redirect HTTP→HTTPS. El procedimiento conceptual es:

```bash
certbot certonly --webroot \
  --webroot-path /secure-acme-webroot \
  --domain <dominio-aprobado> \
  --email <correo-operativo-aprobado> \
  --agree-tos --no-eff-email
```

El path operativo final depende del mecanismo aprobado; no ejecutar este ejemplo en producción hasta tener dominio, CA, volúmenes y controles de secreto confirmados. Nginx debe servir `fullchain.pem` y `privkey.pem`, no `cert.pem` sin la cadena intermedia.

Validar antes de recargar:

```bash
openssl x509 -in /secure-certificates/fullchain.pem \
  -noout -issuer -subject -dates

docker compose --profile production --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml exec -T nginx-prod nginx -t
```

La evidencia R3.5 completa requiere handshake real contra el dominio público, cadena validada, emisor, expiración y renovación forzada/ensayada. Ninguno de esos hechos se afirma en este documento.

### 8.3 Renovación y recarga de Nginx

Renovar antes del vencimiento mediante el scheduler/servicio ACME aprobado. Una renovación que no recarga Nginx no cambia el certificado servido:

```bash
certbot renew --dry-run

docker compose --profile production --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml exec -T nginx-prod nginx -t

docker compose --profile production --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml exec -T nginx-prod nginx -s reload

openssl s_client -connect <dominio-aprobado>:443 \
  -servername <dominio-aprobado> -verify_return_error </dev/null
```

El `dry-run` solo es evidencia de la ruta de renovación del cliente ACME; no prueba el certificado servido hasta comprobar el handshake posterior.

### 8.4 Certificado próximo a caducar o caducado

**Próximo a caducar:** abrir cambio de renovación, verificar que el job ACME está habilitado, ejecutar renovación controlada, `nginx -t`, reload y handshake. No eliminar el certificado anterior hasta confirmar el nuevo.

**Caducado:**

1. Confirmar hora del host y fecha del certificado; descartar un falso positivo por reloj.
2. Marcar producción en estado de incidente y no aceptar un bypass a HTTP o autofirmado.
3. Emitir/obtener un certificado válido de CA reconocida y copiarlo al volumen protegido mediante reemplazo controlado, con permisos mínimos.
4. Ejecutar `nginx -t`, `nginx -s reload` y handshake con `-verify_return_error`.
5. Confirmar `/health`, registrar la nueva fecha de expiración y notificar a CTO/SEC-ENG.
6. Si no hay certificado válido disponible, mantener el servicio en **NO-GO** y escalar; no afirmar recuperación TLS por el mero hecho de que Nginx esté “Up”.

### 8.5 Estado R3.5

**DIFERIDO** por [ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md) (Aprobado, CTO 2026-08-02). Siguen sin cubrir dominio/proveedor, emisión, renovación ensayada, reload evidenciado y handshake público — y así deben permanecer hasta la reactivación. La presencia de un archivo autofirmado local, si existiera, no satisface R3.5 en ningún caso.

### 8.6 Expediente TLS — diferido, con insumos conservados

**Estado:** **DIFERIDO POR [ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md) — sin trabajo en curso.**

> **Reencuadre v1.1 (2026-08-02).** Esta sección estaba marcada `BLOQUEADO — STOP/NO-GO`, un estado de emergencia operativa que se leía como trabajo detenido esperando al CTO. **No lo hay.** El CTO decidió el 2026-08-02 no abordar la definición del dominio productivo hasta que se cumpla el disparador de reactivación de ADR-070: cierre del roadmap modular, necesidad de un entorno externo, o —sin excepción— procesamiento de PII de personas reales. Todo el análisis de abajo se **conserva íntegro** como insumo de esa reactivación; nada de esto caduca.

**Al reactivar, la primera pregunta es el hosting**, no el dominio: ACME HTTP-01 exige el puerto 80 alcanzable desde Internet, y esa condición determina cuál de las tres opciones es viable. El CTO ya declaró disponer de un dominio de marca en uso para marketing, así que la opción por defecto es un subdominio de ese dominio (`app.…`, `portal.…`) y no hay paso de registro.

> **Registro histórico — decisión del CTO del 2026-07-31** *(superada en su forma por ADR-070, vigente en su contenido técnico)*: el CTO autorizó diferir la implementación de CA/TLS hasta la definición formal del dominio productivo. QA-34/TLS no bloquea G6 ni G6.5; **bloquea G7** hasta que se verifique un certificado de CA reconocida, terminación TLS efectiva y redirección HTTPS sobre el dominio aprobado. QA-34 queda en el checklist de calidad como `DIFERIDO`.

#### Opciones evaluadas (insumo de reactivación)

| Opción | Alcance y requisitos principales | Evaluación |
|---|---|---|
| **1. Let's Encrypt ACME HTTP-01** | Un FQDN productivo único; DNS A/AAAA bajo control del equipo; puerto 80 público hasta Nginx; webroot/volumen compartido para `/.well-known/acme-challenge/`; cliente ACME, renovación automática y recarga controlada. | **Recomendada**: CA reconocida, automatizable y coherente con el baseline Compose/Nginx sin introducir topología nueva. |
| **2. CA comercial reconocida vía ACME HTTP-01** | Los mismos requisitos de HTTP-01, más cuenta/provisión y condiciones comerciales del proveedor elegido. | Alternativa si el CTO exige una CA comercial, soporte o política de emisión distinta. |
| **3. CA reconocida vía ACME DNS-01** | Control operativo del proveedor DNS y credencial API restringida, guardada fuera de Git en el secret store; automatización segura de TXT; aplica si se necesitan wildcards o no se puede exponer HTTP-01. | Alternativa condicionada; aumenta el alcance de secretos y la coordinación con DNS. |

**Recomendación de AI-PLAT-OPS:** aprobar **Opción 1 — Let's Encrypt ACME HTTP-01** para el primer FQDN productivo, salvo que el CTO requiera wildcard, no pueda habilitar puerto 80 o exista una restricción contractual que fuerce otra CA. No se recomienda DNS-01 solo por conveniencia.

#### Requisitos de entrada antes de cualquier emisión

1. CTO registra el FQDN productivo, la CA/proveedor elegido, el responsable de renovación y la ventana; DNS queda bajo control explícito del responsable autorizado.
2. DNS público resuelve el FQDN al endpoint correcto. Para HTTP-01, el puerto 80 debe ser alcanzable y `/.well-known/acme-challenge/` debe servirse antes del redirect HTTP→HTTPS.
3. El cliente ACME y el webroot se ejecutan con volumen protegido; la clave privada se guarda únicamente en el secret store o volumen externo con permisos mínimos. Nunca se copia a Git, imágenes, Compose, workflows, tickets o logs.
4. AI-SEC-ENG revisa TLS, permisos, exposición del challenge, gestión de secretos y renovación; AI-PLAT-OPS prepara `nginx -t`, reload controlado y rollback al certificado anterior.
5. La evidencia de aceptación debe incluir emisor, cadena, fechas, handshake público con verificación, `/api/v1/health`, renovación ensayada (`dry-run` cuando aplique) y recarga efectiva de Nginx, sin registrar claves, tokens ni datos de backup.

#### Impacto HSTS

El HSTS de un año solo puede habilitarse después de validar el dominio y una cadena de CA reconocida. Una vez recibido por el navegador, fuerza HTTPS y elimina el fallback operativo a HTTP; por tanto, un DNS incorrecto, certificado inválido o renovación fallida se convierte en un error duro para clientes previamente sujetos a HSTS. La presencia de HSTS no sustituye el certificado ni autoriza usar autofirmado. No se habilita ni se modifica HSTS como parte de esta escalación.

#### Criterio de decisión stop/go

| Estado | Criterio |
|---|---|
| **STOP/NO-GO** | Falta decisión CTO sobre dominio/CA/proveedor; DNS o puerto requerido no están bajo control; el challenge no es públicamente validable; no hay almacenamiento seguro de la clave; `nginx -t` falla; la cadena no es reconocida; no existe handshake público verificable; renovación/reload o rollback no están ensayados; o falta el go de G7/CTO. Nunca degradar a HTTP ni sustituir por autofirmado. |
| **GO técnico para proponer a G7/CTO** | Opción aprobada y documentada; requisitos de DNS/CA/secretos revisados por SEC-ENG; certificado válido servido por Nginx; `nginx -t`, reload, handshake público y `/api/v1/health` PASS; renovación y rollback con evidencia localizable; ventana y plan de incidente aprobados. El GO final sigue siendo de G7/CTO. |

---

## 9. Registro posterior y escalación

El informe de ejecución del release debe registrar:

- release, SHA/digests y ventana;
- migraciones public/tenant ejecutadas y resultado por tenant sin PII;
- backup/restore usado y checksums, sin adjuntar dumps al repo;
- healthchecks, smoke, TLS y recarga Nginx;
- abort y rollback: componente, causa, hora, duración, resultado;
- incidentes, deuda y acciones pendientes.

Escalar inmediatamente a AI-EM-ARCH y, si toca seguridad, a AI-SEC-ENG cuando haya cambio de topología, exposición de secreto/PII, pérdida de aislamiento, fallo de restore o desacuerdo con un ADR/PRD. Los RPO/RTO, la ventana y cualquier excepción requieren decisión CTO.

---

## 10. Checklist de go/no-go

> **No aplica hasta la reactivación de [ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md).** Las casillas sin marcar no son deuda atrasada: son las condiciones de un release que aún no se planifica. La única marcada —reversibilidad de migraciones, 2026-08-01— se conserva como evidencia válida. Cuando se reactive, este checklist se recorre entero desde cero.

- [ ] G7: recomendación de AI-EM-ARCH y aprobación CTO registradas.
- [ ] SHA/digests y rollback por componente registrados.
- [ ] `docker compose ... config --quiet` PASS con el entorno real.
- [ ] Dependencias healthy.
- [ ] Migraciones public y tenant ejecutadas por migrator, con código de salida real.
- [x] Reversibilidad de migraciones public y tenant ensayada en base aislada (2026-08-01; revert public `020` y tenant `099` con re-aplicación; ver [evidencia R3.4](../informes/INFORME-PLAT-OPS-R3.4-EVIDENCIA-v1.0.md)).
- [ ] Backup global con checksum y restore verificado.
- [ ] Backup tenant requerido con checksum y restore verificado.
- [ ] Healthcheck `/api/v1/health` y smoke QA PASS.
- [ ] Certificado CA reconocido, cadena, expiración y handshake PASS.
- [ ] Renovación/reload de Nginx ensayados o ventana aprobada con evidencia vigente.
- [ ] Ensayo reproducible de rollback PASS y archivado.
- [ ] Sin secretos, PII o dumps en Git/logs.

Si una casilla no tiene evidencia localizable, el estado es **NO-GO o PENDIENTE**, nunca PASS por inspección.
