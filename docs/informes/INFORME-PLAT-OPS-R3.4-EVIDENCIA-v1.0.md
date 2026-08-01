# Informe de evidencia — R3.4 release y rollback

**Tipo:** Informe operativo
**Versión:** 1.0
**Fecha:** 2026-07-30
**Responsable:** AI-PLAT-OPS
**Estado:** Evidencia parcial; **reversibilidad de migraciones ensayada (2026-08-01)**; R3.4 no cerrado en su totalidad
**Artefacto:** [RUNBOOK-RELEASE-ROLLBACK-v1.0.md](../runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md)

## 1. Alcance de esta evidencia

Este informe registra únicamente verificaciones ejecutadas durante la creación del runbook. No registra como probados backups, restores, rollback ni certificados de producción.

> **Nota de vigencia (2026-07-30).** Después de recolectar esta evidencia, el perfil `production` se separó a `docker-compose.prod.yml` y la invocación pasó a requerir los dos archivos: `docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile production --env-file .env.production ...`. Los comandos citados abajo se conservan tal como se ejecutaron y **no se reescriben**; para reproducirlos hoy hay que añadir `-f docker-compose.prod.yml`. Ver [INFORME-PLAT-OPS-REPRODUCIBILIDAD-PRODUCTION-v1.0.md](./INFORME-PLAT-OPS-REPRODUCIBILIDAD-PRODUCTION-v1.0.md).

## 2. Verificaciones ejecutadas

| Control | Comando / fuente | Resultado | Alcance |
|---|---|---|---|
| Configuración estructural del perfil production | `docker compose --profile production --env-file .env.production.example -f docker-compose.yml config --quiet` | **PASS**, código `0`, salida vacía | Valida interpolación de Compose; no despliega ni valida imágenes operativas, secretos, migraciones o TLS. |
| Presencia de secretos/certificados en Git | `git check-ignore -v secrets/iwana-selfsigned.crt secrets/iwana-selfsigned.key` y `git ls-files secrets` | **PASS**: ambos patrones ignorados; solo `secrets/.gitkeep` versionado | No prueba que exista un certificado operativo. |
| Estado local del directorio `secrets/` | listado de `secrets/` | **Solo `.gitkeep`** | No hay certificado disponible para probar. |
| Estado de cambios previos | `git status --short` | Cambios preexistentes no pertenecientes a R3.4 | No fueron modificados ni incluidos. |

## 3. Pendientes que bloquean el cierre

| Evidencia requerida | Estado | Responsable / decisión |
|---|---|---|
| Reversibilidad de migraciones public y tenant (gate "Migrations reversible") | **EJECUTADO 2026-08-01** — ver §4 | AI-PLAT-OPS; base aislada, datos sintéticos, sin PII. |
| Ensayo reproducible de rollback por componente y completo | **PENDIENTE** | AI-PLAT-OPS, con QA; registrar commit/digests y códigos de salida. |
| Restore global PostgreSQL verificado | **PENDIENTE** | AI-PLAT-OPS + DATA-ENG; datos protegidos y destino aislado. |
| Restore por schema tenant verificado | **PENDIENTE** | AI-PLAT-OPS + DATA-ENG; seleccionar tenant autorizado y no registrar PII. |
| Dominio y proveedor de CA para producción | **PENDIENTE / ESCALADO** | **CTO**. La decisión registrada exige CA reconocida; ver [escalación R3.5 §8.6](../runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md#86-escalación-al-cto-decisión-humana-pendiente). |
| Emisión, renovación, recarga Nginx y handshake público | **PENDIENTE** | AI-PLAT-OPS; requiere provisión R3.5 y revisión SEC-ENG. |
| Referencias operativas de imágenes de producción | **PENDIENTE según R3.1** | Aprobación del release / CTO según corresponda. |

## 4. Evidencia ejecutable — reversibilidad de migraciones (2026-08-01)

### 5.1 Entorno aislado

Se ejecutó sobre un PostgreSQL **aislado y desechable**, sin tocar la infraestructura compartida de desarrollo (`iwana_postgres_dev` quedó intacto, en uso por otros carriles):

| Ítem | Valor |
|---|---|
| Contenedor | `iwana_postgres_r34` (eliminado al terminar) |
| Imagen | `postgres:18.3-alpine` (default del compose del repo) |
| Red / puerto | red propia `iwana_r34_net`; `127.0.0.1:15434:5432` |
| Bootstrap / roles | `iwana` (superuser) + `iwana_app` / `iwana_migrator` (NOSUPERUSER) vía `docker/postgres/init` (ruta SEC-04) |
| DB | `dbiw`; tenants sintéticos `tenant_r34_a` / `tenant_r34_b` (slugs `r34-a`/`r34-b`, `status=ACTIVE`, emails `.invalid`) |
| Commit | `31aef714a7b66664fd85e89ed03c5fc0207f5183` |
| Fecha UTC | 2026-08-01 |

Comandos de entorno para cada invocación del migrator (secretos de laboratorio solo en la sesión, nunca en el repo):

```powershell
$env:DB_HOST='127.0.0.1'; $env:DB_PORT='15434'; $env:DB_NAME='dbiw'
$env:DB_MIGRATOR_USER='iwana_migrator'; $env:DB_MIGRATOR_PASSWORD='<lab>'
$env:DB_USER='iwana'; $env:DB_PASSWORD='<lab>'
```

### 5.2 Migraciones hacia adelante (up)

| Comando | Resultado |
|---|---|
| `pnpm --filter @iwana/db build` | PASS (tsc sin errores) |
| `pnpm --filter @iwana/db migration:run` | PASS — 20/20 migraciones public (001→020) |
| `CREATE SCHEMA tenant_r34_a/b` + `GRANT USAGE, CREATE ON SCHEMA ... TO iwana_migrator` | prerequisito del runner (el provisioning real lo hace el worker, ADR-017/018); sin el grant el runner falla con `no schema has been selected to create in` |
| `pnpm --filter @iwana/db migration:tenant:run` | PASS — 95/95 migraciones tenant (000→099) por schema, `EXIT=0` |

Post-up (schema `tenant_r34_a`, igual en `tenant_r34_b`):

```sql
SELECT COUNT(*) FROM tenant_r34_a.typeorm_migrations;                    -- 95
SELECT name FROM tenant_r34_a.typeorm_migrations ORDER BY id DESC LIMIT 1; -- ExtendEvidenceUploadIntentStatus0990000000000
-- chk_execution_order_evidence_upload_intents_status →
-- CHECK (status IN ('PENDING','PENDING_ANALYSIS','AVAILABLE','REJECTED','EXPIRED','FAILED'))  ← 099 aplicada
```

### 5.3 Revert public (migración 020, `AddMediaAssetStatusAndClaim`)

| Paso | Comando | Resultado |
|---|---|---|
| Estado previo | `SELECT ... WHERE column_name IN ('asset_status','claim_ref','checksum_sha256')` | 3 columnas presentes; `chk_media_assets_usage` con `execution_evidence`; `chk_media_assets_asset_status` presente |
| Revert | `pnpm --filter @iwana/db migration:revert` | PASS — `Migration AddMediaAssetStatusAndClaim1784419208000 has been reverted successfully`, `EXIT=0` (sin flag: la tabla `media_assets` está vacía, la guarda no bloquea) |
| Verificación | `information_schema.columns` + `pg_constraint` | 0 columnas de lifecycle; `chk_media_assets_usage` de vuelta a 5 valores (sin `execution_evidence`); `chk_media_assets_asset_status` eliminado; registro en `EnablePgTrgm` (019) |
| Re-aplicar | `pnpm --filter @iwana/db migration:run` | PASS — 020 re-ejecutada; columnas y CHECKs restaurados; registro en 020 |

### 5.4 Revert tenant (migración 099, `ExtendEvidenceUploadIntentStatus`)

Datos sintéticos insertados en `tenant_r34_a.execution_order_evidence_upload_intents` (sin PII): 2 filas transitorias (`PENDING`, `FAILED` con `media_asset_id IS NULL`), 1 fila `AVAILABLE`, 1 fila `PENDING` **con** `media_asset_id` (caso "evidencia enlazada").

| Paso | Comando | Resultado |
|---|---|---|
| Plan | `pnpm --filter @iwana/db migration:tenant:revert --schema=tenant_r34_a --dry-run` | PASS — anuncia `revertiría tenant_r34_a <- ExtendEvidenceUploadIntentStatus0990000000000 (exige IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true si el schema tiene datos)` |
| Guarda (sin flag) | `pnpm --filter @iwana/db migration:tenant:revert --schema=tenant_r34_a --yes` | **BLOQUEADO** `EXIT=1`: `Rollback de ExtendEvidenceUploadIntentStatus bloqueado: 3 intent(s) siguen en PENDING o FAILED y el CHECK anterior los rechaza...` — schema intacto (CHECK 6 estados, 4 filas, registro con 099) |
| Invariante + atomicidad (flag, evidencia enlazada presente) | `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true pnpm --filter @iwana/db migration:tenant:revert --schema=tenant_r34_a --yes` | **FALLA CONTROLADA** `EXIT=1`: el `down()` borra las transitorias NULL y el `ADD CONSTRAINT` de 4 estados falla por la fila `PENDING` con `media_asset_id` (`check constraint ... violated by some row`) → **transacción revierte todo**: CHECK 6 estados, 4 filas y registro intactos. El revert nunca deja el schema a medias ni destruye evidencia enlazada. |
| Limpieza del dato sintético enlazado | `DELETE ... WHERE status='PENDING' AND media_asset_id IS NOT NULL` | 1 fila eliminada (dato de laboratorio; su supervivencia es la protección demostrada arriba) |
| Revert destructivo (flag) | `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true pnpm --filter @iwana/db migration:tenant:revert --schema=tenant_r34_a --yes` | **PASS** `EXIT=0` — CHECK vuelve a 4 estados (`PENDING_ANALYSIS','AVAILABLE','REJECTED','EXPIRED'`), **sin `PENDING`/`FAILED`**; filas transitorias eliminadas; fila `AVAILABLE` sobrevive; registro en `ExecutionOrderServerScope0980000000000` (098) |
| Re-aplicar | `pnpm --filter @iwana/db migration:tenant:run` | PASS — runner aplica solo la 099 pendiente; CHECK de vuelta a 6 estados; registro en 099; fila `AVAILABLE` intacta |

### 5.5 Desviaciones detectadas y corregidas en el runbook

1. **Invocación del revert tenant.** La ayuda del CLI documenta el separador `--` (`migration:tenant:revert -- --schema=...`), pero en pnpm 10 / Windows el `--` no es consumido y `parseArgs` lo rechaza (`Argumento no reconocido: "--"`). La forma operativa verificada es sin el separador. El runbook §5.5 ahora cita los comandos exactos y deja la nota; la alineación de la ayuda del CLI queda para el carril de ingeniería.
2. **Requisito del flag destructivo.** §5.5 ahora documenta `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true` acotado a la sesión, con qué borra (solo transitorias con `media_asset_id IS NULL` en 099) y qué hace si una fila sobrevive (aborta la transacción completa).
3. **Prerequisito del runner tenant.** El runner asume schema existente + grants (lo crea el provisioning). El runbook ya indicaba migrar con `DB_MIGRATOR_USER`; la evidencia confirma el fallo sin grants.

## 5. Dictamen

- **Gate "Migrations reversible": GO técnico con evidencia.** Las migraciones public (001–020) y tenant (000–099) se aplicaron en base aislada con código de salida real; la migración public `020` se revirtió y re-aplicó; la tenant `099` (CHECK `chk_execution_order_evidence_upload_intents_status`) se revirtió con guardas verificadas (bloqueo sin flag, aborto atómico ante evidencia enlazada, revert destructivo controlado que devuelve el CHECK a 4 estados **sin `PENDING`/`FAILED`**) y se re-aplicó. La reversibilidad de las migraciones del release queda **ensayada**.
- **R3.4 no está cerrado en su totalidad.** Siguen **PENDIENTES**: el ensayo reproducible de rollback por componente/imagen (§7.2 del runbook), el restore global PostgreSQL verificado y el restore por schema tenant verificado.
- **No se autoriza release de producción.** El go final de G7/CTO es requisito ineludible, y los pendientes de restore y ensayo por componente bloquean el cierre completo de R3.4.
