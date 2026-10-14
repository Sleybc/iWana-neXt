# PROMPT DE EJECUCIÓN — MOD05/MOD03 · Soporte de estrato en PDF (fase D-PDF)

**Version:** 1.0
**Estado:** Emitido — G4 se firma al lanzar la Ola 1; fase aprobada por el CTO el 2026-10-12
**Fecha:** 2026-10-12
**Plantilla:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md) (en revisión)
**Emisor:** AI-EM-ARCH (modo Orchestrator)
**Plan:** [2026-10-12-mod05-iva-soporte-pdf.md](../plans/2026-10-12-mod05-iva-soporte-pdf.md)
**Decisión de origen:** D-PDF del [plan IVA v1.3+](../plans/2026-10-12-mod05-iva-punto-servicio.md); ADR-093 D5 (soporte del estrato)

---

## 0. Por qué

El soporte del estrato (certificado municipal de estratificación, recibo digital de un servicio público) suele ser **PDF**. Hoy se sube como `MediaUsage.GENERAL`, que solo admite imágenes. Además:
- la verificación del soporte comprueba el uso, no la pertenencia al contrato (deuda **S-T7-02**, Media);
- el portal acepta GIF e íconos (deuda **S-T7-03**, Baja).

Un uso de Media dedicado cierra las tres cosas.

**Impacto declarado:**
- **Multi-tenant:** sin cambio; `media_assets` vive en el schema `public` con `tenant_schema`.
- **Seguridad:** el soporte deja de compartir uso con los assets genéricos, y su acceso queda acotado al contrato.
- **Escala:** sin efecto.
- **Regulación:** ADR-093 D5.

## 1. Contratos congelados

### C-MEDIA-1 v1.0

- **Nuevo valor** `MediaUsage.STRATUM_EVIDENCE = 'stratum_evidence'` en `packages/database/src/entities/media-asset.entity.ts`.
- **Restricciones** en `MEDIA_CONSTRAINTS`: máximo 10 MiB; MIME `application/pdf`, `image/jpeg`, `image/png`, `image/webp`. Validación de bytes mágicos obligatoria; el PDF ya está en `media/magic-bytes.ts:28`.
- **El uso no lo puede pedir el cliente.** `POST /media/upload` rechaza `stratum_evidence` (400) y su enum de OpenAPI no lo lista. Solo lo crea el endpoint acotado del contrato.
- **`GET /media/:id/signed-url` genérico** rechaza assets `stratum_evidence` (404, sin revelar que existen). Se consultan solo por `GET /crm/contracts/:id/stratum-evidence/signed-url`, que audita.

### C-DDL-3 v1.0

- **Migración pública `026_media_usage_stratum_evidence.ts`.** Amplía `chk_media_assets_usage` para incluir `'stratum_evidence'`, siguiendo el patrón idempotente de la migración 020 (detecta si ya está incluido). El `down` falla con un mensaje claro si existen filas `stratum_evidence`; no las borra.
- **Migración tenant `145_contract_stratum_evidence_unique.ts`.** `CREATE UNIQUE INDEX uq_contracts_stratum_evidence ON contracts (stratum_evidence_media_id) WHERE stratum_evidence_media_id IS NOT NULL`. Un mismo asset no puede respaldar dos contratos. El preflight reporta duplicados y aborta si los hay.

### C-API-4 v1.0 (cambia el comportamiento interno de C-API-3 v1.2, no su forma)

- `POST /crm/contracts/:id/stratum-evidence` guarda el asset con `usage = STRATUM_EVIDENCE` y acepta los cuatro MIME de C-MEDIA-1.
- **Soporte verificado** = el asset existe, no está eliminado, `usage = STRATUM_EVIDENCE`, y su id es el `stratum_evidence_media_id` de **ese** contrato (único por C-DDL-3). Un id heredado con uso `GENERAL` **no** cuenta como verificado: resuelve `STANDARD` al recalcular. Solo hay datos de desarrollo afectados.
- Error de tipo no admitido: 422 `STRATUM_EVIDENCE_TYPE_NOT_ALLOWED`, con la lista de formatos en lenguaje de negocio.

## 2. Bloques

### Ola 1 (en paralelo; también en paralelo con T11 de la fase IVA, sin archivos compartidos)

#### P1 · `data-eng` — Migraciones 026 (pública) y 145 (tenant)

**Propiedad exclusiva:**
- `packages/database/src/migrations/public/026_*`;
- `packages/database/src/migrations/tenant/145_*`;
- su registro en los runners;
- el valor nuevo del enum en `media-asset.entity.ts`.

**No** toca `crm/contracts/**`, que es de T11.
**Stop/go:** integración `up/down/up` contra Postgres real de ambas migraciones; el `down` de la 026 aborta con filas `stratum_evidence`; el preflight de la 145 reporta duplicados.

#### P3 · `fe-platform` — Portal

**Propiedad exclusiva:** `CreateContractDialog`, `ConvertExpedienteToContractDialog`, `ContractDetailDrawer` (y sus specs), y la sección de contratos de `apps/portal/src/lib/api-client.ts`.
1. `accept` = `application/pdf,image/jpeg,image/png,image/webp` (cierra S-T7-03).
2. La ayuda del control nombra los formatos en lenguaje de negocio ("PDF o imagen JPG, PNG o WEBP, hasta 10 MB"), sin códigos MIME.
3. Mensaje para el 422 `STRATUM_EVIDENCE_TYPE_NOT_ALLOWED`.
4. **Menor de deriva heredado de T11:** `contractsApi.create` (`api-client.ts:6582-6587`) debe tipar su payload contra el esquema de `POST /crm/contracts`, que exige `subscriberId`. Si no tiene consumidores, retirarlo y justificarlo en el informe.

**Stop/go:** `pnpm exec turbo run test --filter=@iwana/portal --force` con conteo real; `audit-ui.mjs` sin reglas duras violadas; test de carga de PDF y de rechazo de un tipo no admitido.

### Ola 2 (tras P1 en `main` **y** T11 cerrado)

#### P2 · `sr-backend` — Media y verificación en contratos

**Propiedad exclusiva:** `apps/api/src/modules/media/**` y `apps/api/src/modules/crm/contracts/**` (incluido el `@Index` de la entidad para C-DDL-3).

Implementa C-MEDIA-1 y C-API-4:
- restricciones del nuevo uso;
- rechazo en el `upload` genérico;
- 404 en el `signed-url` genérico;
- carga del contrato con el nuevo uso;
- verificación por uso **y** pertenencia;
- id heredado `GENERAL` → `STANDARD`.

**Stop/go:**
- turbo API `--force` con conteo real.
- Integración contra Postgres real:
  - un PDF válido se sube y, tras activar el contrato, resuelve `EXEMPT` en estrato 2;
  - un PDF con extensión falsa (bytes mágicos que no corresponden) → 422;
  - `POST /media/upload` con `usage=stratum_evidence` → 400;
  - `signed-url` genérico de un soporte → 404;
  - un contrato heredado con un asset `GENERAL` → `STANDARD`;
  - dos contratos con el mismo asset → rechazado por el índice.

### Ola 3 — cierre

- `sec-eng`: C-MEDIA-1 (aislamiento del nuevo uso frente a los endpoints genéricos), bytes mágicos de PDF y cierre de S-T7-02 y S-T7-03.
- `sr-qa`: matriz de los stop/go P1–P3; cobertura ≥ 80 % en statements y branches de `media` y `crm/contracts`.
- `gate-verifier` y `docs-governance`.

## 3. Restricciones

1. El uso `stratum_evidence` **nunca** se crea ni se consulta por los endpoints genéricos de Media.
2. Ninguna fusión ni borrado de assets existentes; los ids heredados se resuelven por regla (`STANDARD`), no por limpieza.
3. Sin PII en logs ni en la auditoría; la URL firmada no se persiste.
4. Gate: `pnpm exec turbo run test --filter=<paquete> --force`, con conteo real.

## 4. Fuera de alcance

Billing, `tax_regime`, Habeas Data, placeholders (E-3), la redacción histórica de `audit_logs` (decisión del CTO tras T12) y el escaneo antivirus de PDF. Este último es una deuda que se registra; `sec-eng` dirá si lo eleva.
