# Informe de remediación — registro seguro de evidencia MOD11

**Fecha:** 2026-07-28  
**Owner:** AI-SR-FULL  
**Alcance:** hallazgo bloqueante R1 y núcleo R2.1 (backend/media y tests)

## Correcciones

- `registerEvidence` exige un `ExecutionOrderEvidenceUploadIntent` que coincida simultáneamente con `mediaAssetId`, `executionOrderId` y `tenantId` antes de consultar el asset, persistir evidencia o reclamarlo.
- Se conserva el aislamiento por tenant/schema y el estado de cuarentena: un asset `AVAILABLE` no sustituye la autorización del intent.
- Se añadió un test negativo cross-OT del mismo tenant; no consulta Media ni ejecuta claim.
- `customerAcceptance.artifactId` y el campo legacy `customerSignatureRef` ahora fallan cerrado si no son un UUID de MediaAsset vinculado a una evidencia de la misma OT y tenant. No existe bypass legacy.

## Deuda de contrato R2.1

El contrato vigente declara `artifactId` como `string` libre y no expresa que deba ser un MediaAsset vinculado a la OT. La implementación no amplía silenciosamente el contrato: valida en backend y rechaza explícitamente con `CUSTOMER_ACCEPTANCE_ARTIFACT_NOT_LINKED` cuando no puede verificar el vínculo. La evolución tipada del contrato (identificador de artefacto Media/OT o referencia equivalente) queda registrada para R2.1 y requiere coordinación con EM-ARCH antes de congelarse/versionarse.

## Fuera de alcance

No se implementó rate limiting.

## Cierre R2.1 — ciclo de retención

- La ruta genérica `POST /media/upload` rechaza `execution_evidence` también en
  la validación del DTO; la carga de evidencia conserva el flujo dedicado con
  cuarentena, magic bytes, checksum SHA-256 y tenant resuelto desde contexto.
- El `POST /:id/evidence` devuelve el contrato mínimo de evidencia y no expone
  `tenantId` ni `actorUserId`. Los endpoints de recibo y descarga validan
  `mediaAssetId` con `ParseUUIDPipe`.
- El reconciliador conserva `QUARANTINED` como `PENDING_ANALYSIS`, recupera
  claims idempotentes y terminaliza claims imposibles sin promover cuarentena.
- El worker registra el soft-delete en `<tenant>.audit_logs` dentro de la misma
  transacción y borra el objeto mediante `StoragePort` antes de marcar
  `DELETED`; los fallos de storage dejan el asset en `EXPIRED` para retry.

### Consulta DATA-ENG

Se consultó `INFORME-MOD11-DATA-RETENTION-REVERSIBILITY-R2.4-G6-v1.0.md`.
La retención de `evidence_upload_intents` queda gobernada por R2.4 y no se
añade una migración de tablas en R2.1: este bloque completa el TTL del objeto
físico y no altera la retención del registro canónico de evidencia/auditoría.
