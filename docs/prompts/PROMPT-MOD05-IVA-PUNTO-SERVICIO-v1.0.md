# PROMPT DE EJECUCIÓN — MOD05/MOD06/MOD07 · IVA de internet por punto de servicio (ADR-093)

**Version:** 1.0 — **superado** el 2026-10-12 por [v1.1](PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.1.md) (C-API-3 v1.1); sus secciones no modificadas siguen siendo fuente
**Estado:** Emitido — G4 se firma cuando el CTO lanza la Ola 1
**Fecha:** 2026-10-12
**Plantilla:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md) (en revisión)
**Emisor:** AI-EM-ARCH (modo Orchestrator)
**Decisión:** [ADR-093](../adrs/ADR-093-Tratamiento-IVA-Internet-por-Punto-y-Linea-de-Servicio.md) — Aprobado 2026-10-12
**Plan:** [2026-10-12-mod05-iva-punto-servicio.md](../plans/2026-10-12-mod05-iva-punto-servicio.md)
**Origen:** escalación E-1 / SUB-C03 de [INFORME-MOD05-SUBSCRIBERS-AUDITORIA-CUMPLIMIENTO-v1.0](../informes/INFORME-MOD05-SUBSCRIBERS-AUDITORIA-CUMPLIMIENTO-v1.0.md)

---

## 0. Cómo se usa

Cada agente ejecuta solo su bloque. Los bloques de una misma ola corren en paralelo contra los contratos de §2. Un cambio de contrato se coordina vía AI-EM-ARCH: se versiona este prompt, nunca se parchea en silencio. Si algo no se resuelve dentro de la sesión, emitir `[BLOQUEO]` antes de cerrarla.

**Precondición de arranque:** la remediación de suscriptores (B1–B13) debe estar **commiteada** antes de lanzar la Ola 1. Esta fase toca `crm/contracts`, `commercial` y `taxation`, y el diff debe poder revisarse por separado.

## 1. Alcance

**Dentro:** ADR-093 D1–D5 sobre los conceptos facturables existentes y sobre el contrato como punto de servicio.

- Función canónica en Taxation.
- `vatConcept` y `networkType` en el catálogo.
- Uso, estrato, soporte e instantánea fiscal en el contrato.
- Presentación del IVA por contrato en la ficha.

**Fuera:**
- Billing (no existe).
- `tax_regime` → `vatResponsibility` y responsabilidades RUT (SUB-M03, ADR-093 D6; fase propia).
- Retirar físicamente `subscribers.vat_treatment`: aquí solo se **deprecia**.
- Los puntos ⚠ de ADR-093 §6, que quedan para el contador.
- Habeas Data (E-2).
- Placeholders (E-3).

## 2. Contratos congelados

### C-TAX-1 v1.0 — enums y puerto (`@iwana/shared` + `apps/api/src/modules/taxation/ports/`)

```ts
export enum VatConcept {
  INTERNET_ACCESS = 'INTERNET_ACCESS',
  ACTIVATION_INHERENT = 'ACTIVATION_INHERENT',   // instalación, conexión, reconexión, puesta en marcha
  EQUIPMENT_SALE = 'EQUIPMENT_SALE',
  EQUIPMENT_LEASE = 'EQUIPMENT_LEASE',           // ⚠ ADR-093 V8
  INDEPENDENT_SERVICE = 'INDEPENDENT_SERVICE',   // mantenimiento, soporte, IP fija ⚠ V9
  TELEVISION = 'TELEVISION',                     // ⚠ V9
  TELEPHONY = 'TELEPHONY',                       // fuera del motor canónico (V10)
}
export enum NetworkType { FIXED = 'FIXED', MOBILE = 'MOBILE' }
export enum ServiceUsage { RESIDENTIAL = 'RESIDENTIAL', NON_RESIDENTIAL = 'NON_RESIDENTIAL' }
export enum VatLegalBasis { ET_481_H = 'ET_481_H', ET_476_7 = 'ET_476_7', ET_468 = 'ET_468' }

export interface InternetVatInput {
  vatConcept: VatConcept;
  networkType: NetworkType;
  usage: ServiceUsage;
  stratum: number | null;          // 1–6; null permitido solo si usage = NON_RESIDENTIAL
  stratumEvidenceAvailable: boolean;
}
export type InternetVatResult =
  | { status: 'RESOLVED'; treatment: VatTreatment; legalBasis: VatLegalBasis; ratePercent: 0 | 19;
      requiresAccountantReview: boolean }     // true para EQUIPMENT_LEASE, INDEPENDENT_SERVICE, TELEVISION
  | { status: 'NOT_CANONICAL'; reason: 'TELEPHONY' };  // se resuelve por reglas de Taxation (ADR-031)

// Taxation (MOD07), función pura sin I/O
export abstract class IInternetVatResolverPort {
  abstract resolve(input: InternetVatInput): InternetVatResult;
}
```

**Tabla de verdad obligatoria (ADR-093 D2/D3):**
- `INTERNET_ACCESS` y `ACTIVATION_INHERENT` con `FIXED + RESIDENTIAL + stratum 1–2 + evidencia` → `EXEMPT / ET_481_H / 0`.
- Mismo caso con stratum 3 → `EXCLUDED / ET_476_7 / 0`.
- Mismos dos casos **sin evidencia** → `STANDARD / ET_468 / 19`.
- `RESIDENTIAL` con stratum 4–6, todo `NON_RESIDENTIAL` y todo `MOBILE` → `STANDARD / ET_468 / 19`.
- `EQUIPMENT_SALE` → `STANDARD`.
- `EQUIPMENT_LEASE`, `INDEPENDENT_SERVICE` y `TELEVISION` → `STANDARD` con `requiresAccountantReview: true`.
- `TELEPHONY` → `NOT_CANONICAL`.
- `RESIDENTIAL` sin estrato → error de validación, nunca un tratamiento por defecto.

`VatTreatment` es el enum existente (`EXEMPT | EXCLUDED | STANDARD`).

### C-DDL-2 v1.0 — migración tenant `144_vat_service_point.ts`

```sql
ALTER TABLE contracts
  ADD COLUMN service_usage varchar(20) NULL CHECK (service_usage IN ('RESIDENTIAL','NON_RESIDENTIAL')),
  ADD COLUMN installation_stratum smallint NULL CHECK (installation_stratum BETWEEN 1 AND 6),
  ADD COLUMN stratum_evidence_media_id uuid NULL,
  ADD COLUMN vat_snapshot jsonb NULL,  -- { treatment, legalBasis, ratePercent, inputs, resolvedAt, adrVersion: 'ADR-093' }
  ADD CONSTRAINT chk_contract_residential_stratum
    CHECK (service_usage IS DISTINCT FROM 'RESIDENTIAL' OR installation_stratum IS NOT NULL);
ALTER TABLE catalog_items ADD COLUMN vat_concept varchar(30) NULL;
ALTER TABLE plan_details ADD COLUMN network_type varchar(10) NOT NULL DEFAULT 'FIXED'
  CHECK (network_type IN ('FIXED','MOBILE'));
```

- Nombres de tabla verificados: `plan_details` y `catalog_items` (entidades `@Entity`, 2026-10-12).
- **Backfill conservador (ADR-093 §4):**
  - `contracts.service_usage = 'RESIDENTIAL'` solo si el suscriptor del contrato es `NATURAL` con segmento `RESIDENTIAL`; en cualquier otro caso, `'NON_RESIDENTIAL'`.
  - `installation_stratum` se copia de `subscribers.stratum` solo cuando el uso queda `RESIDENTIAL`.
  - `stratum_evidence_media_id` queda `NULL`: un contrato heredado sin soporte resuelve 19 % hasta que el operador lo adjunte.
  - `catalog_items.vat_concept`: solo `PLAN` → `'INTERNET_ACCESS'`. `PRODUCT` y `SERVICE` quedan `NULL` y se emite un **reporte de ítems sin concepto** para el operador. No se adivina.
- Reversible `up/down/up`. El preflight reporta conteos por regla de backfill.
- `contracts` y `subscribers` viven en el mismo schema de tenant y el backfill es DDL de la migración: no viola boundary.

### C-API-3 v1.0 — DTOs (`@iwana/shared`, Zod)

**Contrato** (`CreateContract`, `CreateContractFromExpediente`, `UpdateContract`):
- Nuevos campos: `serviceUsage?: ServiceUsage`, `installationStratum?: number | null`, `stratumEvidenceMediaId?: string | null`.
- Respuesta: añade esos tres campos más `vatSnapshot: { treatment, legalBasis, ratePercent, requiresAccountantReview, resolvedAt } | null`.
- Validaciones:
  - Un suscriptor `JURIDICA` no admite `RESIDENTIAL` (422).
  - `RESIDENTIAL` exige estrato.
  - Esos tres campos solo se editan en `DRAFT`; en `ACTIVE`, solo por una acción explícita `PATCH /crm/contracts/:id/service-point`, auditada.
- `createFromExpediente` toma uso y estrato del expediente con la misma regla conservadora del backfill.

**Catálogo** (create/update de ítem):
- `vatConcept: VatConcept`: **obligatorio** para ítems nuevos; opcional en update para no romper legados.
- Plan: `networkType: NetworkType` con default `FIXED`.
- La respuesta incluye ambos.

**Instantánea fiscal:** se calcula vía `IInternetVatResolverPort` para el plan del contrato:
- al pasar `DRAFT → ACTIVE`;
- en cada cambio por `/service-point`.

Si el plan no tiene `vatConcept`, la activación **falla cerrado** (422, mensaje que nombra el ítem).

**Suscriptor:** `vatTreatment` sigue en la respuesta, marcado `deprecated` en OpenAPI. No se elimina en esta fase.

## 3. Bloques

### Ola 1 (en paralelo)

#### T1 · `sr-backend` — Motor canónico en Taxation (C-TAX-1)

**Propiedad exclusiva:**
- `packages/shared/src/enums/` (archivos nuevos de C-TAX-1);
- `apps/api/src/modules/taxation/**` (puerto, adaptador, servicio puro y su registro en `TaxationModule`, exportando el puerto).

1. Publicar primero los enums y tipos en `@iwana/shared`: T2, T3 y T4 los consumen.
2. Implementar la tabla de verdad completa con tests parametrizados (una fila por combinación) y comentarios de fundamento por artículo.
3. Exportar `IInternetVatResolverPort` desde `TaxationModule`.

**Fuera de alcance:** CRM, Commercial, la UI, y los `VatTreatmentService` / `SubscriberTaxProfileService` existentes.
**Stop/go:** `pnpm exec turbo run test --filter=@iwana/api --filter=@iwana/shared --force` con conteo real; la tabla de verdad cubierta al 100 %.

#### T2 · `data-eng` — Migración 144 y backfill (C-DDL-2)

**Propiedad exclusiva:** `packages/database/src/migrations/tenant/144_*`, su registro en `runner.ts`, y el mapeo de columnas en `contract.entity.ts`, `catalog-item.entity.ts` y `plan-detail.entity.ts` (solo los `@Column`).
**Stop/go:** test integrado `up/down/up` contra Postgres real con filas sembradas de cada regla de backfill, y reporte de conteos y de ítems sin concepto.

#### T5 · `prod-ux` — Spec UX del punto de servicio fiscal

Salida: `docs/specs/2026-10-12-mod05-iva-punto-servicio-ux-spec.md`, con criterios `CA-UX-IVA-nn`, contra C-API-3. Debe cubrir:

1. Campos del contrato (crear, convertir desde expediente y editar el punto de servicio):
   - uso del servicio, con explicación de por qué importa;
   - estrato del predio de instalación;
   - carga del soporte (recibo o certificado);
   - estados: sin soporte (aviso de que se cobrará 19 %), JURIDICA (uso residencial deshabilitado con motivo) y contrato activo (edición solo por la acción dedicada).
2. Presentación del IVA **por contrato** en la ficha 360° (pestaña Servicios / `ContractDetailDrawer`): tratamiento, fundamento legible y aviso de revisión del contador cuando aplique.
3. **Destino de la columna IVA del listado de suscriptores** y del `VatTreatmentBanner` / `TaxProfileBlock` (ADR-093 D6). Opciones a decidir: retirar la columna, cambiarla a "IVA por contrato (varía)", o resumir.
4. Selector de concepto fiscal en el formulario de ítem del catálogo, con etiquetas en lenguaje de negocio, sin códigos.

**Fuera de alcance:** código, tokens, copy legal fuera de lo necesario.

### Ola 2 (tras T1 publicado y T2 en `main`; T3, T4 y T6 en paralelo)

#### T3 · `sr-backend` — Contrato como punto de servicio (C-API-3, lado CRM)

**Propiedad exclusiva:** `apps/api/src/modules/crm/contracts/**` y los Zod de contrato en `@iwana/shared`.
- Validaciones de C-API-3.
- Acción `/service-point` auditada sin PII. El soporte se referencia por id de media, nunca por URL.
- Instantánea al activar vía el puerto.
- Fallo cerrado si el plan no tiene concepto.
- `createFromExpediente` con la regla conservadora.

**Fuera de alcance:** `crm/subscribers/**`, salvo el marcador `deprecated` de `vatTreatment` en OpenAPI.

#### T4 · `sr-backend` — Catálogo (C-API-3, lado Commercial)

**Propiedad exclusiva:** `apps/api/src/modules/commercial/**` y los Zod de catálogo en `@iwana/shared`.
- `vatConcept` obligatorio en creación.
- `networkType` en el plan.
- Listado filtrable por "sin concepto fiscal".

#### T6 · `fe-platform` — UI según la spec T5 ratificada

**Propiedad exclusiva:** `apps/portal/src/components/crm/subscribers/{CreateContractDialog,ConvertExpedienteToContractDialog,ContractDetailDrawer,ServiciosTab,SubscribersListClient,VatTreatmentBanner,TaxProfileBlock}*` y el formulario de ítem en `apps/portal/src/components/commercial/catalog/**`.
- Consume C-API-3 desde `@iwana/shared`.
- Carga el soporte con el endpoint de media existente.
- **No arranca hasta que AI-EM-ARCH ratifique la spec T5.**

### Ola 3 — cierre

- T7 `sec-eng`: el soporte de estrato es PII (acceso por URL firmada, permisos, auditoría sin PII); validaciones de C-API-3; fallo cerrado.
- T8 `sr-qa`: matriz CA ↔ test; tabla de verdad; integración de activación contra Postgres real; cobertura ≥ 80 % en statements y branches de `taxation`, `crm/contracts` y `commercial`.
- Auxiliares: `boundary-reviewer` (CRM → Taxation solo por puerto), `contract-drift-reviewer` (C-TAX-1, C-API-3), `gate-verifier`, `docs-governance`.

## 4. Restricciones no negociables

1. CRM y Commercial consumen Taxation **solo** por `IInternetVatResolverPort`.
2. El IVA canónico **no es configurable por tenant**.
3. La regla `RESIDENTIAL` sin estrato nunca degrada a un valor por defecto; sin soporte, siempre 19 %.
4. Migraciones reversibles; el backfill nunca adivina conceptos de productos ni de servicios.
5. Sin PII en logs, auditoría ni URLs; el soporte es un adjunto de media.
6. Comando de gate: `pnpm exec turbo run test --filter=<paquete> --force`, con conteo real.

## 5. Entregables documentales

`docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-{T#}-v1.0.md` por bloque, con ruta, conteo real y deuda por severidad.

## 6. Criterio de salida (G6 de la fase)

Tabla de verdad completa y verde. Un contrato no se activa sin concepto fiscal en su plan. Un contrato residencial de estrato 1–3 sin soporte resuelve 19 %. JURIDICA no admite uso residencial. La UI muestra el IVA por contrato. SEC-ENG y SR-QA en GO. Con eso **SUB-C03 queda cerrado**.
