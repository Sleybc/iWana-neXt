# PROMPT DE EJECUCIÓN — MOD05/MOD06/MOD07 · IVA de internet por punto de servicio (ADR-093)

**Version:** 1.1 — **superado** el 2026-10-12 por [v1.2](PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.2.md) (C-API-3 v1.2: soporte de estrato acotado al contrato)
**Estado:** Emitido — G4 firmado (Ola 1 lanzada el 2026-10-12)
**Fecha:** 2026-10-12
**Plantilla:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md) (en revisión)
**Emisor:** AI-EM-ARCH (modo Orchestrator)
**Plan:** [2026-10-12-mod05-iva-punto-servicio.md](../plans/2026-10-12-mod05-iva-punto-servicio.md) v1.1
**Spec UX congelada:** [2026-10-12-mod05-iva-punto-servicio-ux-spec.md](../specs/2026-10-12-mod05-iva-punto-servicio-ux-spec.md) v1.0, ratificada (§8)

## 0. Estado verificado contra el árbol (no contra los informes)

| Bloque | Estado | Verificación |
| --- | --- | --- |
| Precondición | ✅ | `59e425ee` y `8f571e45` en `main` |
| T1 | ✅ sin commitear | Enums `VatConcept`, `NetworkType`, `ServiceUsage`, `VatLegalBasis` en `packages/shared/src/enums/taxation/`; `IInternetVatResolverPort` exportado desde `TaxationModule`; resolvedor puro. Lanza `RangeError` con uso residencial sin estrato |
| T2 | ✅ sin commitear | `144_vat_service_point.ts` = C-DDL-2 (columnas, tres CHECK, backfill conservador idéntico; solo `PLAN` → `INTERNET_ACCESS`); registrada en `runner.ts` |
| T5 | ✅ ratificada con ajustes | spec §8 |

**No re-despachar T1, T2 ni T5.**

## 1. Cambios v1.0 → v1.1: C-API-3 pasa a v1.1

Surgen de la ratificación de la spec. T3 aún no ha arrancado, así que no hay re-sync de trabajo hecho.

| # | Cambio | Causa |
| --- | --- | --- |
| (a) | **Activar exige `serviceUsage`.** Un contrato sin uso no pasa a `ACTIVE`: 422 `SERVICE_USAGE_REQUIRED`. El `RangeError` del resolvedor (residencial sin estrato) se traduce a 422 `STRATUM_REQUIRED`, **nunca a 500** | Respaldo de CA-UX-IVA-03; la v1.0 no decía qué pasa con un uso nulo al activar |
| (b) | `TaxAssignmentSnapshot` (perfil tributario del suscriptor) añade `taxCategory: TaxCategory`, leída por `TaxCatalogReadPort` | Respaldo de CA-UX-IVA-20 sin que el portal consulte Taxation |
| (c) | `SubscriberTaxProfileService` deja de **crear** sugerencias de IVA por estrato (`_suggestVatInSchema`); conserva las de otros tributos. Las asignaciones de IVA existentes no se borran ni se modifican | ADR-093 D6: el IVA ya no se sugiere por suscriptor |

## 2. Bloques de la Ola 2 (en paralelo)

### T3 · `sr-backend` — Contrato como punto de servicio

Lo de v1.0 §3 T3, más los cambios (a), (b) y (c).

**Propiedad exclusiva:**
- `apps/api/src/modules/crm/contracts/**`;
- los Zod de contrato en `@iwana/shared`;
- y, **solo para (b) y (c)**: `crm/subscribers/subscriber-tax-profile.service.ts`, `crm/subscribers/dto/subscriber-tax-profile-snapshot.dto.ts` y sus specs.

El marcador `deprecated` de `vatTreatment` en OpenAPI va en el controlador de suscriptores; no hagas otros cambios ahí.

**Stop/go:** `pnpm exec turbo run test --filter=@iwana/api --force` con conteo real, más un test integrado contra Postgres real que cubra:
- activación con concepto y uso → instantánea correcta para estrato 2 con soporte (`EXEMPT`), estrato 3 con soporte (`EXCLUDED`) y estrato 2 sin soporte (`STANDARD`);
- activación sin concepto → 422;
- activación sin uso → 422;
- `JURIDICA` + `RESIDENTIAL` → 422;
- `/service-point` en un contrato activo → recalcula y audita sin PII.

### T4 · `sr-backend` — Catálogo

Sin cambios respecto a v1.0 §3 T4. **Stop/go:** turbo API `--force`; crear un ítem sin `vatConcept` → 400; plan con `networkType` por defecto `FIXED`; filtro "sin concepto fiscal".

### T6 · `fe-platform` — UI según la spec ratificada

Lo de v1.0 §3 T6, contra la spec congelada (23 CA) y C-API-3 v1.1. Puede arrancar en paralelo con T3 y T4.

**T3 y T4 publican sus Zod y tipos en `@iwana/shared` como primer paso de su sesión**, igual que hizo T1. T6 **no escribe** en `@iwana/shared`: esos archivos son de T3 y T4. Mientras no estén publicados, T6 avanza en lo que no depende de ellos:
- retiro de la columna IVA y del banner (CA-UX-IVA-18 y 19). CA-UX-IVA-20 espera a que T3 publique `taxCategory`;
- el selector de concepto, que usa el enum `VatConcept` de T1, ya publicado.

`taxCategory` llega en el snapshot del perfil; no consultes Taxation desde el portal.

**Stop/go:** `pnpm exec turbo run test --filter=@iwana/portal --force` con conteo real; `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre los archivos tocados sin reglas duras violadas; un test por CA de los grupos 3.1–3.4.

## 3. Ola 3 — cierre

Sin cambios respecto a v1.0 §3. T7 debe verificar además:
- que el permiso de Media cubre a los roles que crean o actualizan contratos (spec §6);
- que la URL firmada del soporte no se persiste ni se registra.

## 4. Restricciones

Las de v1.0 §4.
