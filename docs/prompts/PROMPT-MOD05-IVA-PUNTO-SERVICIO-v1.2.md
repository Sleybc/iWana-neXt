# PROMPT DE EJECUCIÓN — MOD05/MOD06/MOD07 · IVA de internet por punto de servicio (ADR-093)

**Version:** 1.2 — **superado** el 2026-10-12 por [v1.3](PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.3.md) (S-T7-01)
**Estado:** Emitido — G4 vigente
**Fecha:** 2026-10-12
**Plantilla:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md) (en revisión)
**Emisor:** AI-EM-ARCH (modo Orchestrator)
**Plan:** [2026-10-12-mod05-iva-punto-servicio.md](../plans/2026-10-12-mod05-iva-punto-servicio.md) v1.2

## 0. Estado verificado contra el árbol

| Bloque | Estado | Verificación |
| --- | --- | --- |
| T1, T2, T5 | ✅ | sin cambios desde v1.1 |
| T3 | ✅ con hallazgo F-2 | Códigos 422 `SERVICE_USAGE_REQUIRED` y `STRATUM_REQUIRED`; el `RangeError` se traduce (`contracts.service.ts:607`); instantánea vía el puerto; `taxCategory` en `packages/shared/src/schemas/tax-profile-snapshot.ts`; el perfil ya no sugiere IVA (`_suggestNonVatApplications`) |
| T4 | ✅ | `vatConcept` obligatorio en `create-catalog-item.dto.ts:37`; `networkType` opcional con default |
| T6 | ✅ con hallazgo F-1 | El listado ya no presenta IVA; `TaxProfileBlock` filtra `TaxCategory.VAT` (línea 486) |

**No re-despachar T1 a T6.**

## 1. Hallazgos que motivan la v1.2

| # | Hallazgo | Severidad | Evidencia |
| --- | --- | --- | --- |
| **F-1** | Solo `ADMIN` puede subir a Media (`media/media.controller.ts:68`), y solo ADMIN, NOC, ACCOUNTANT y SUPPORT pueden pedir la URL firmada (`:115`). Los contratos los operan ADMIN, SALES y SUPPORT: **SALES no puede adjuntar el soporte**, así que sus clientes residenciales de estratos 1–3 quedarían al 19 % | Alto (funcional; el error favorece cobrar de más, no de menos) | líneas citadas |
| **F-2** | `stratumEvidenceMediaId` lo envía el cliente en create, update y `/service-point` **sin validar** (`contracts.service.ts:93,193,358,434`), y el beneficio se decide con `stratumEvidenceMediaId != null` (`:604`). Cualquier UUID, aunque no exista o pertenezca a otro registro, **habilita el tratamiento exento o excluido** | **Alto (integridad fiscal)** | líneas citadas |

**Causa de F-2: defecto del emisor.** C-API-3 v1.0 declaró el campo como entrada del cliente. La corrección es de contrato.

## 2. C-API-3 v1.2 (cambios sobre v1.1)

**Enmienda ratificada para Ola 2-bis (2026-10-12):** la carga se limita a la allowlist vigente de `MediaUsage.GENERAL`, porque esta ola no modifica `media/**`.

1. **`stratumEvidenceMediaId` deja de ser entrada.** Se retira de `CreateContract`, `CreateContractFromExpediente`, `UpdateContract` y `UpdateServicePoint`. Solo lo escribe el servidor y sigue en la respuesta. Un cuerpo que lo traiga → 400.
2. **Endpoints acotados al contrato** (CRM usa `MediaService`, exportado por `MediaModule`, con el mismo precedente que `tenant.service.ts`; `POST /media/upload` sigue siendo solo de ADMIN):
   - `POST /crm/contracts/:id/stratum-evidence` (multipart, un archivo; `MediaUsage.GENERAL`, máximo 10 MiB; MIME permitidos: `image/png`, `image/webp`, `image/jpeg`, `image/gif`, `image/x-icon`, `image/vnd.microsoft.icon`. `MediaService` valida los bytes mágicos. PDF no está permitido.)
     - Roles y permiso: los de gestión de contratos (ADMIN, SALES, SUPPORT, SYSTEM_ADMIN con permiso de gestión).
     - Requiere `serviceUsage = RESIDENTIAL` y estrato 1–3; si no, 422 `STRATUM_EVIDENCE_NOT_APPLICABLE`.
     - Guarda el asset y fija el id.
     - En `DRAFT` solo lo asocia. En `ACTIVE` recalcula la instantánea y audita igual que `/service-point`.
     - Si reemplaza un soporte, el asset anterior se elimina de forma lógica.
     - Respuesta: el contrato.
   - `DELETE /crm/contracts/:id/stratum-evidence`
     - Mismos roles.
     - Quita el soporte, elimina el asset de forma lógica y recalcula si el contrato está activo (vuelve a 19 %).
   - `GET /crm/contracts/:id/stratum-evidence/signed-url`
     - Roles de lectura del contrato.
     - Valida que el asset pertenece a **ese** contrato.
     - Expiración ≤ 300 s; la URL no se persiste ni se registra.
     - Audita `STRATUM_EVIDENCE_ACCESS` (actor, contrato; sin URL).
3. **El resolvedor recibe `stratumEvidenceAvailable` solo de un asset verificado:** existe, no está eliminado y pertenece al contrato. Nunca de un id sin comprobar.
4. **Datos heredados:** si un contrato ya tiene `stratum_evidence_media_id` (asignado por la vía de v1.1 durante desarrollo), la migración no lo toca. Al activar o recalcular se verifica con la regla 3; si no pasa, el resultado es `STANDARD` y se deja aviso en el log, sin PII.

**Ajuste de la spec (registrado en §8 de la spec, sin cambio de criterios):** en la creación, el archivo se elige en el formulario y se sube justo después de crear el borrador. Si la carga falla, el borrador queda guardado y el error ofrece reintentar, como ya pide CA-UX-IVA-08.

## 3. Bloques de la Ola 2-bis (en paralelo)

### T9 · `sr-backend` — Soporte de estrato acotado al contrato (F-1, F-2)

**Propiedad exclusiva:** `apps/api/src/modules/crm/contracts/**`, los Zod de contrato en `@iwana/shared` y la importación de `MediaModule` en `ContractsModule`. **No** modifica `media/**`.
**Stop/go:**
- `pnpm exec turbo run test --filter=@iwana/api --force` con conteo real.
- Integración contra Postgres real:
  - SALES sube el soporte a un contrato residencial de estrato 2 → EXEMPT tras activar;
  - un cuerpo con `stratumEvidenceMediaId` → 400;
  - subir a un contrato no residencial → 422;
  - URL firmada de un asset ajeno → 404/403;
  - DELETE en un contrato activo → STANDARD y auditado;
  - un contrato heredado con id inexistente → STANDARD.

### T10 · `fe-platform` — Consumo de los endpoints acotados

**Propiedad exclusiva:** `CreateContractDialog`, `ConvertExpedienteToContractDialog`, `ContractDetailDrawer` (y sus specs) y la sección de contratos de `apps/portal/src/lib/api-client.ts`. Retira el uso de `/media/upload` en estos flujos.
**Puede arrancar en paralelo con T9** contra C-API-3 v1.2. No escribe en `@iwana/shared`.
**Stop/go:** `pnpm exec turbo run test --filter=@iwana/portal --force` con conteo real; `audit-ui.mjs` sin reglas duras violadas; tests de CA-UX-IVA-08 (cargar, reemplazar, quitar, fallo con reintento) contra los endpoints nuevos.

## 4. Cierre (Ola 3, tras T9 y T10)

T7 `sec-eng` y T8 `sr-qa` según v1.0 §3 y v1.1 §3. T7 verifica F-1 y F-2 cerrados contra el código, más los cuatro controles de §2.2–2.3.
