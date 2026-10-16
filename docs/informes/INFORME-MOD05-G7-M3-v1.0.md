# INFORME-MOD05-G7-M3-v1.0

**Fecha:** 2026-10-15  
**Estado:** **NO-GO operativo**. M1-G1 quedó cableado y pasó la validación sintética; M1-G3 quedó documentado; M1-G2 no se puede ejecutar con el CLI de restore vigente.

## Alcance

Se revisó M1-G1 (cableado de claves), M1-G2 (rollback tenant sobre schema existente) y M1-G3 (orden de ventana de flota), según `PROMPT-MOD05-PRIVACY-G7-v1.0.md` §5.1–§5.2 M3. No se modificó `scripts/db/restore-tenant.mjs` ni se ejecutó nada contra entornos reales.

## Cambios y evidencia

- **M1-G1:** `docker-compose.prod.yml` entrega `PII_ENCRYPTION_KEY`, `PII_ENCRYPTION_KEY_PREVIOUS` y `PII_DECRYPT_LEGACY_MFA` a `api-prod` y `migrator-prod`. `.env.production.example` declara las tres variables con `approval-required`.
- Validación ejecutada con un `.env.production` local sintético, no versionado: `docker compose --profile production -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.production config --quiet` → **exit 0**. El archivo temporal se eliminó y se confirmó su ausencia; no se usaron claves operativas.
- **M1-G3:** el runbook MOD05 declara preflight, backups de flota y migraciones una sola vez; los pasos 3–10 se repiten por tenant.
- **M1-G2:** los runbooks describen la decisión aprobada por CTO y los pasos esperados, pero muestran el mecanismo como **NO-GO** con el CLI actual. No se hizo RENAME ni restore.

## Revisión de seguridad

La revisión `sec-eng` dio **GO** para el cableado de M1-G1 y sus placeholders, sin hallar exposición de PII o secretos en los artefactos revisados. Dio **NO-GO** para ejecutar M1-G2:

1. `scripts/db/restore-tenant.mjs:342-345, 613-619`: `assertNoRegistryConflicts` se ejecuta después de verificar que el schema destino no exista. Tras el RENAME, la fila vigente en `public.tenants` conserva el mismo ID y slug, por lo que la herramienta rechaza el restore antes de `pg_restore`.
2. `scripts/db/restore-tenant.mjs:278-285, 462-465, 630-633`: aun resolviendo la primera guarda, `injectTenantRow` reinyecta la fila mediante un `INSERT` simple y chocaría con el registro existente.

La decisión de RENAME no resuelve estas incompatibilidades del CLI. Los runbooks ahora prohíben iniciar el RENAME o el restore hasta corregir el contrato y demostrar el flujo completo en una base desechable. No se propone DML manual, omitir validaciones ni `DROP SCHEMA`.

## Resultado

| Gate                                     | Resultado                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| M1-G1 — variables API/migrator y ejemplo | **GO**; validación sintética de Compose exit 0                                              |
| M1-G2 — rollback con schema existente    | **NO-GO**; dos conflictos confirmados en el CLI vigente                                     |
| M1-G3 — ventana de flota                 | **Documentado** en el runbook MOD05; migraciones y respaldos se describen una vez por flota |
| M3 global                                | **NO-GO operativo** hasta resolver y ensayar M1-G2                                          |

Archivos actualizados: `docker-compose.prod.yml`, `.env.production.example`, `docs/runbooks/RUNBOOK-MOD05-PRIVACY-RELEASE-POR-TENANT-v1.0.md` y §6.3 de `docs/runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md`.

No se incluyeron claves, secretos, valores de configuración ni datos personales. No se creó commit.
