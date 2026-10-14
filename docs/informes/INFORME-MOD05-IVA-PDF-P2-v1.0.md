# INFORME MOD05 — D-PDF P2: Media y verificación de soporte

**Versión:** 1.0 · **Fecha:** 2026-10-13  
**Estado:** **CERRADO — gates P2 verificados**  
**Plan:** [D-PDF v1.1](../plans/2026-10-12-mod05-iva-soporte-pdf.md)  
**Prompt:** [P2 v1.0](../prompts/PROMPT-MOD05-IVA-PDF-v1.0.md)

## Resultado

P2 implementa la carga interna de soportes con `STRATUM_EVIDENCE`, el allowlist PDF/JPEG/PNG/WEBP de 10 MiB y comprobación de bytes mágicos. La carga genérica rechaza ese uso; el `signed-url` genérico responde 404. Contracts sube por el método interno de Media y considera verificado el soporte solo si el asset existe, no está eliminado, tiene el uso dedicado y figura en ese contrato. La entidad declara el índice único parcial `uq_contracts_stratum_evidence`.

La ruta del informe estaba libre antes de crearlo. No se modificaron archivos de migración, `@iwana/shared` ni el portal, y no se creó ninguna base de datos. No se encontró una sesión T11 activa al iniciar P2.

## Evidencia ejecutada

| Gate                | Resultado                                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript API      | `pnpm --filter @iwana/api typecheck` — exit 0 (`tsc --noEmit`)                                                                                             |
| API sin caché       | `pnpm exec turbo run test --filter=@iwana/api --force` — **338 suites y 4.783 tests aprobados**; 4 suites y 15 tests omitidos; Turbo **0 cached, 4 total** |
| Pruebas focalizadas | Media y Contracts — **2 suites / 105 tests aprobados**                                                                                                     |
| Integración real    | `E2E_TENANT_SLUG=iwana` contra `127.0.0.1:5433/dbiw` — **1 suite y 19 tests aprobados, 0 omitidos**                                                        |
| Formato             | Prettier en los archivos P2 — exit 0                                                                                                                       |
| Whitespace          | `git diff --check` en los archivos trackeados de P2 — exit 0                                                                                               |

La integración en [contracts.service.postgres.integration.spec.ts](../../apps/api/src/modules/crm/contracts/tests/contracts.service.postgres.integration.spec.ts) cubre los seis casos solicitados y pruebas IVA heredadas del mismo módulo: PDF válido → EXEMPT, PDF con bytes falsos → 422, uso dedicado en `/media/upload` → 400, signed URL genérica → 404, asset heredado `GENERAL` → STANDARD y reutilización del mismo asset → rechazo por unicidad.

La integración en [contracts.service.postgres.integration.spec.ts](../../apps/api/src/modules/crm/contracts/tests/contracts.service.postgres.integration.spec.ts) cubre los seis casos D-PDF solicitados y los casos IVA heredados del mismo módulo. Para satisfacer la precondición de `dbiw`, con autorización del usuario se aplicó la migración pública 026 en una transacción; después de la suite, el conteo de `STRATUM_EVIDENCE` fue **0** y se ejecutó `down` en otra transacción. La definición original de `chk_media_assets_usage` quedó restaurada y `typeorm_migrations` no recibió un registro para la 026. El fixture ahora crea `contracts` antes del índice único parcial.

## Cambios P2

- [media.service.ts](../../apps/api/src/modules/media/media.service.ts): límites y MIME de `STRATUM_EVIDENCE`, bytes mágicos, carga interna fija, rechazo de uso en carga genérica, bloqueo del signed URL genérico y signed URL interno de máximo 300 segundos.
- [contracts.service.ts](../../apps/api/src/modules/crm/contracts/contracts.service.ts): usa el método de carga y signed URL dedicados; verificación estricta del uso para el cálculo de IVA.
- [contract.entity.ts](../../apps/api/src/modules/crm/contracts/entities/contract.entity.ts): índice único parcial para impedir que dos contratos compartan un asset.
- Pruebas unitarias de Media y Contracts, y los seis casos de integración PostgreSQL enumerados arriba.

El esquema OpenAPI de `/media/upload` conserva su enum explícito de usos genéricos y no incluye `stratum_evidence`; `UploadMediaDto` aplica el mismo allowlist en runtime.

## Deuda nueva y bloqueos

| Severidad                  | Deuda nueva / estado                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| Alta                       | Ninguna identificada.                                                                                  |
| Media                      | Ninguna identificada.                                                                                  |
| Baja                       | Ninguna identificada.                                                                                  |
| Pendiente de clasificación | Escaneo antivirus para PDFs en Media; `sec-eng` asigna la severidad en el cierre D-PDF, según el plan. |
