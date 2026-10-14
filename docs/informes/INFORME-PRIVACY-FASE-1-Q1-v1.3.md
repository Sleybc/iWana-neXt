# INFORME-PRIVACY-FASE-1-Q1-v1.3

**Fecha:** 2026-10-14  
**Bloque:** Q1Δ2 — adenda A22 a la migración tenant 146  
**Estado:** implementada y comprobada en PostgreSQL real. Sin commit.

## Entrega

- `ck_data_subject_requests_verified_before_processing` ahora exige identidad verificada únicamente para `EN_TRAMITE`, `PRORROGADA` y `RESUELTA`.
- Se añadió `ck_data_subject_requests_non_legitimated_without_identity`: permite `NO_PROCEDENTE` sin identidad solo con `legal_basis = 'SOLICITANTE_NO_LEGITIMADO'`.
- El CHECK también rechaza `legal_basis IS NULL` cuando falta identidad. PostgreSQL acepta resultados `NULL` de una expresión CHECK; la condición explícita evita que un fundamento ausente eluda la regla.
- El resto de la migración 146, incluido el backfill, no cambió. No se modificaron entidades, contratos ni el registro de migraciones.

## Verificación

| Comando | Evidencia real |
| --- | --- |
| `pnpm --filter @iwana/db exec jest --runInBand --no-cache src/migrations/tenant/146_privacy_module.spec.ts` | **1 suite aprobada; 3 tests aprobados.** |
| `pnpm --filter @iwana/db exec jest --config jest.integration.config.js migrations/tenant/146_privacy_module.integration.spec.ts --runInBand --no-cache` | PostgreSQL alcanzable en `127.0.0.1:5433/dbiw`; schema efímero limpiado. **1 suite aprobada; 10 tests aprobados.** Ejecutó `up/down/up`. |
| `pnpm exec prettier --check packages/database/src/migrations/tenant/146_privacy_module.ts packages/database/src/migrations/tenant/146_privacy_module.spec.ts packages/database/src/migrations/tenant/146_privacy_module.integration.spec.ts` | Pasa; los tres archivos cumplen el formato. |

La integración prueba por separado los cuatro casos A22: `NO_PROCEDENTE` sin identidad pasa con el fundamento de falta de legitimación y falla con otro fundamento; `TRASLADADA` sin identidad pasa; `RESUELTA` sin identidad falla. El caso sin fundamento también se rechaza para cerrar el bypass por `NULL`.

El `up/down/up` real conservó el backfill previo en sus fixtures: `consent_records` 2 filas (1 resuelta, 1 no resuelta; 2 autorizaciones destino), `habeas_data_consents` 2 filas (1 resuelta, 1 no resuelta; 1 autorización destino) y `arco_requests` 2 filas (1 resuelta, 1 no resuelta; 2 solicitudes destino). Las filas fuente permanecieron tras `down`.

## Ruta y deuda

- La ruta `docs/informes/INFORME-PRIVACY-FASE-1-Q1-v1.3.md` estaba libre al inicio (`Test-Path` devolvió `False`). El cambio se limitó a la migración 146 y sus dos specs, preservando el trabajo sin commitear preexistente.
- **Deuda nueva:** ninguna.
- **P1 heredada — G6.5:** sigue pendiente la integración de la migración pública 027, fuera del alcance de Q1Δ2.
- **P2 heredada — operación:** conciliar por tenant los registros heredados no resueltos. Los conteos informados son fixtures sintéticos y no describen datos productivos.

**Resultado Q1Δ2:** A22 queda reforzada en PostgreSQL; la migración 146 pasa `up/down/up` y los cuatro casos solicitados pasan contra la base real. No se hizo commit ni se ejecutó la Fase 04 de suscriptores.
