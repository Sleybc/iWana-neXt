# INFORME — MOD11 R1 backend: idempotencia de upload-intent de evidencia

**Versión:** 1.0
**Estado:** Evidencia de implementación — sujeto a review G6
**Fecha:** 2026-07-30
**Owner:** AI-SR-FULL
**Contrato:** `docs/specs/2026-07-27-mod09-mod11-ot-instalacion-contrato-api.md`

## Cambio implementado

- `POST /api/v1/tasks/execution-orders/:id/evidence-assets` lee `Idempotency-Key`, `If-Match` y `X-Correlation-Id`, y los propaga mediante el contexto de comando.
- La operación usa `execution_order.evidence_asset` con fingerprint SHA-256 server-side del binario y metadata técnica mínima. El registro es tenant-aware y queda enlazado al upload-intent antes de invocar Media, impidiendo reservar un segundo intent en retries concurrentes.
- Replay con clave y fingerprint idénticos devuelve el intent/asset original antes de evaluar `If-Match`; una clave con fingerprint u operación incompatibles responde `409 IDEMPOTENCY_CONFLICT`.
- `RegisterEvidenceDto.capturedAt` queda alineado como `capturedAt?: string | null` con Zod, `@iwana/shared` y OpenAPI. No se modificó el puerto ni la implementación Media/quarantine.

## Evidencia reproducible

| Validación | Resultado |
| --- | --- |
| Tests service + HTTP + reliability | **114 passed** |
| Swagger contract | **3 passed** |
| API typecheck | **exit 0** |
| API lint | **exit 0** |
| Shared typecheck | **exit 0** |
| Shared contract test | **3 passed** |
| Suite API completa | **225 suites passed, 4 skipped; 2734 tests passed, 15 skipped** |

Tests R1: `execution-orders.evidence.service.spec.ts`, `execution-orders.controller.http.spec.ts` y `execution-order-reliability.service.spec.ts` cubren primer request, replay con `If-Match` obsoleto, fingerprint conflict, operation conflict, version conflict, headers obligatorios y ausencia de creación duplicada en Media.
