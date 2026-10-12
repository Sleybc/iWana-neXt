# PROMPT DE EJECUCIÓN — MOD05/MOD08 Suscriptores · Remediación de cumplimiento

**Version:** 1.1 — **superado** el 2026-10-12 por [v1.2](PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-v1.2.md)
**Estado:** Emitido — G4 firmado por el CTO al lanzar la Ola 1 (2026-10-12); sigue vigente para la v1.1
**Fecha:** 2026-10-12
**Plantilla:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md) (en revisión)
**Emisor:** AI-EM-ARCH (modo Orchestrator)
**Informe de origen:** [INFORME-MOD05-SUBSCRIBERS-AUDITORIA-CUMPLIMIENTO-v1.0.md](../informes/INFORME-MOD05-SUBSCRIBERS-AUDITORIA-CUMPLIMIENTO-v1.0.md) (corregido 2026-10-12)
**Plan:** [2026-10-11-mod05-subscribers-remediacion-cumplimiento.md](../plans/2026-10-11-mod05-subscribers-remediacion-cumplimiento.md) v1.1
**Mapa ratificado:** [2026-10-11-mod05-subscriber-list-field-role-map.md](../specs/2026-10-11-mod05-subscriber-list-field-role-map.md) §6 (ratificación con cambios)

## Cambios v1.0 → v1.1 (re-sync de contrato)

| # | Cambio | Causa |
| --- | --- | --- |
| 1 | **C-API-2 v1.1**: se declara la finalidad *"Etiqueta de la fila"* para `firstName`, `lastName`, `businessName` y `commercialName`, que entran en la proyección base. `nit` y `nitVerificationDigit` siguen la regla de `documentNumber`. Los campos restringidos por rol son **opcionales** en el tipo | `[BLOQUEO]` de B2 y B3: la v1.0 dejaba el listado y el selector sin etiqueta. **Defecto del emisor, no de los agentes** |
| 2 | **B2 absorbe a B6**: aplica directamente el mapa ratificado y la restricción del listado a 5 roles (decisión D3 del CTO, PRD Fase 04 §9.4) | El mapa ya está ratificado; un bloque menos sobre el mismo archivo |
| 3 | **C-NORM-1 v1.1**: `RUT` se normaliza como `NIT`; `OTHER` como `PASAPORTE` | Deuda media del informe B1: la v1.0 no los definía y el backfill falla cerrado |
| 4 | **B5** asume explícitamente el corte de escritores y lectores hacia las columnas cifradas (`party_contact`, `whatsapp`) y C-NORM-1 v1.1 | Deuda media del informe B1 |
| 5 | **Restricción de despliegue**: la migración 143 no se despliega sin B5 | Al retirar `idx_party_document_active`, la unicidad del Party queda solo en la aplicación hasta que B5 escriba el HMAC |

B1 está **cerrado** (`59e425ee`) y no se re-despacha. B4 está **cerrado** y ratificado.

## 1. Entradas obligatorias

Las de v1.0 §1, más la spec ratificada (§6) y los informes de B1 a B4 en `docs/informes/INFORME-MOD05-SUBSCRIBERS-REMEDIACION-B{1..4}-v1.0.md`.

## 2. Contratos congelados

| ID | Versión | Contrato | Productor | Consumidores |
| --- | --- | --- | --- | --- |
| C-DDL-1 | 1.0 | Implementado en `packages/database/src/migrations/tenant/143_subscriber_party_pii_hmac.ts` | `data-eng` ✅ | B5 |
| C-API-1 | 1.0 | `POST /crm/subscribers/search`, cuerpo `{ documentNumber?, nit?, email?, phone? }` (al menos uno, Zod en `@iwana/shared`), respuesta `{ data: SubscriberListItem[] }`. Se elimina `GET /crm/subscribers/search` | B2 | B3 |
| **C-API-2** | **1.1** | ver §2.1 | B2 | B3 |
| C-PORT-1 | 1.0 | `IPartyWritePort.ensurePartyWithRole` sin cambio de firma; `EnsurePartyInput.documentNumber` siempre en texto plano; el adaptador normaliza, cifra y calcula el HMAC | B5 | CRM, MOD12 Compras |
| **C-NORM-1** | **1.1** | `normalizeDocumentNumber(type, raw)`: CC/CE/NIT/TI/**RUT** → solo dígitos; PASAPORTE/PEP/PTP/**OTHER** → alfanumérico en mayúsculas sin espacios | B5 (la v1.0 la produjo `data-eng`) | backfill, B5 |

### 2.1 C-API-2 v1.1 — `SubscriberListItem`

```ts
// @iwana/shared — fuente única; el portal no declara tipos paralelos.
export interface SubscriberListItem {
  // Base: todos los roles con acceso al listado
  id: string; status: SubscriberStatus; personType: PersonType;
  customerSegment: CustomerSegment; stratum: number | null; documentType: DocumentType | null;
  firstName: string | null; lastName: string | null;          // finalidad: etiqueta de la fila
  businessName: string | null; commercialName: string | null; // finalidad: etiqueta de la fila
  createdAt: string;
  // Restringidos por rol (mapa ratificado): AUSENTES (no null) cuando el rol no los recibe
  documentNumber?: string; nit?: string; nitVerificationDigit?: string;
  phone?: string; altContactPhone?: string; whatsapp?: string; email?: string;
  address?: string; neighborhood?: string; city?: string;
  latitude?: number; longitude?: number;
}
```

`SUBSCRIBER_LIST_FIELD_PURPOSE` añade una sola entrada nueva, `rowLabel: 'Etiqueta de la fila: distinguir al suscriptor en el listado y en el selector'`, que cubre los cuatro campos de nombre. No se añade ninguna otra finalidad. Quedan fuera del listado `birthDate`, `legalRepresentativeId`, `manualOverrideReason`, `externalId`, `createdBy`, `userId`, `partyId` y las columnas de trazabilidad de conversión.

## 3. Bloques

### B2 · `sr-backend` · Ola 1-bis — Superficie PII (absorbe B6)

Lo de v1.0 §3 B2, con estos cambios:
1. `SubscriberListItem` según C-API-2 v1.1, publicado desde `@iwana/shared` **antes** de tocar el controlador, para que B3 lo consuma.
2. `subscriber-projection.ts` implementa **el mapa ratificado** (spec §6), no un mapa por defecto. Un rol sin entrada en el mapa no recibe ningún campo restringido (fail-closed).
3. `GET /crm/subscribers` se restringe a `ADMIN`, `NOC`, `SALES`, `SUPPORT` y `ACCOUNTANT` (decisión D3; cubre RNF-S404-02 y CA-S404-10 del PRD Fase 04). `POST /search` lleva la misma lista. `GET :id` y `/360` **no cambian de roles** en este bloque.
**Fuera de alcance:** `subscriber-creation.service.ts`, parties, DDL, Habeas Data, IVA.
**Stop/go:** el de v1.0, más un test por rol que verifique presencia/ausencia de cada campo restringido y un test de 403 para `TECHNICIAN` y `AUDITOR` en el listado. `pnpm --filter @iwana/api test -- --force` con conteo real.

### B3 · `fe-platform` · Ola 1-bis — Consumo del contrato

Lo de v1.0 §3 B3, con estos cambios:
1. Consumir `SubscriberListItem` desde `@iwana/shared`. Los campos restringidos son opcionales: `formatSubscriberName` y `formatSubscriberOption` usan su cadena de *fallback* **actual** sin texto nuevo. Si un fallback necesita copy nuevo, `[BLOQUEO]`.
2. La columna de documento del listado **no** se añade en este bloque (es cambio visible; queda para una tarea de UI con PROD-UX).
**Puede arrancar en paralelo con B2** contra C-API-2 v1.1 tal como está escrito arriba.
**Stop/go:** el de v1.0.

### B5 · `sr-backend` · Ola 2 — Identidad y conversión

Lo de v1.0 §3 B5, con estos añadidos:
- C-NORM-1 v1.1 (`RUT`, `OTHER`) con tests.
- Los escritores de `party_contact` y de `whatsapp` escriben **solo** las columnas cifradas y HMAC; los lectores leen las cifradas. La retirada física de las columnas en claro es una migración posterior, tras ejecutar `--apply` del backfill por tenant.
- `PartyService.create`, `findByDocument` y el adaptador de C-PORT-1 resuelven la unicidad por `document_number_hmac`.
Arranca cuando B2 haya cerrado (comparten `subscribers.service.ts`).

### B7 `sec-eng` y B8 `sr-qa` — sin cambios respecto a v1.0

### No despachables

Sin cambios: Habeas Data (E-2) y fiscal (E-1).

## 4. Restricciones, entregables y criterio de salida

Los de v1.0 §4-§6, más: **no desplegar la migración 143 sin B5 en el mismo release.**
