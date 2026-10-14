# INFORME-MOD05-IVA-PUNTO-SERVICIO-T6-v1.0

**Fecha:** 2026-10-12  
**Bloque:** T6 — Portal / experiencia de IVA por punto de servicio  
**Estado:** Completado.

## Cambios entregados

- Formularios de creación, conversión y edición de borrador capturan el uso del servicio, estrato del predio y soporte cuando aplica. Los datos desconocidos del expediente quedan vacíos; no se infieren del tipo o segmento de persona ni del estrato del suscriptor. En persona jurídica se deshabilita residencial con el motivo visible. El soporte usa Media existente y el contrato conserva solo el identificador.
- Los contratos activos exponen una acción dedicada para editar el punto de servicio. El detalle muestra IVA por contrato con tarifa, fundamento traducido, fecha local y aviso de revisión contable; presenta estados sin instantánea sin recurrir al IVA legado.
- Se retiraron la columna IVA del listado, el contenido de `VatTreatmentBanner` y la representación/sugerencia de IVA por estrato en el perfil tributario. Los demás tributos y asignaciones existentes se conservan; el perfil enlaza a la pestaña Servicios.
- Los formularios del catálogo muestran el selector de concepto de cobro con etiquetas de negocio, ayudas para revisión contable y tipo de red del plan. Los listados usan `missingVatConcept=true` para localizar legados sin concepto.
- El cliente usa los tipos compartidos publicados por T3/T4 y un wrapper acotado para actualizar el punto de servicio y subir evidencia mediante Media.

## Criterios y verificación

La matriz automatizada cubre CA-UX-IVA-01 a CA-UX-IVA-23, incluidos los casos por combinación de tratamiento, fundamento y estado sin instantánea. CA-18 tiene una expectativa explícita en el listado de suscriptores.

Corrida focal ejecutada sin caché de Turbo:

```text
pnpm --filter @iwana/portal exec jest --runInBand \
  src/components/crm/subscribers/mod05-iva-punto-servicio-ui.spec.tsx \
  src/components/crm/subscribers/SubscribersListClient.spec.tsx \
  src/components/crm/subscribers/crm-contract-dialogs.portal.spec.tsx \
  src/components/commercial/catalog/catalog-tax-options.spec.ts \
  src/components/commercial/catalog/catalog-filter-params.spec.ts \
  src/components/commercial/catalog/PlanCatalogPanel.spec.tsx \
  src/components/commercial/catalog/PlanCatalogTable.spec.tsx \
  src/components/commercial/catalog/AdditionalProductsPanel.spec.tsx \
  src/components/commercial/catalog/AdditionalServicesPanel.spec.tsx

Test Suites: 9 passed, 9 total
Tests:       96 passed, 96 total
Snapshots:   0 total
```

El gate completo coordinado se ejecutó con:

```text
pnpm exec turbo run test --filter=@iwana/portal --force

Test Suites: 293 passed, 293 total
Tests:       2,956 passed, 1 skipped, 2,957 total
Snapshots:   0 total
Turbo:       Tasks 2/2 successful · Cached 0/2 · shared y portal con cache bypass
```

La auditoría `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs <archivos T6>` reportó **P0: 0, P1: 0, P2: 0**. Sus 8 hallazgos P3 son heurísticas de spinner. Se revisaron manualmente: corresponden a progreso de guardado, conversión, transición o carga puntual de un plan; no son carga primaria de página/tabla. El estado primario de carga del catálogo tributario del modal se sustituyó por `PortalSkeletonBlock`.

## Rutas entregadas

- Suscriptores y contratos: `apps/portal/src/components/crm/subscribers/ContractDetailDrawer.tsx`, `ConvertExpedienteToContractDialog.tsx`, `CreateContractDialog.tsx`, `ServiciosTab.tsx`, `SubscriberDetailClient.tsx`, `SubscriberTabsContainer.tsx`, `SubscribersListClient.tsx`, `TaxProfileBlock.tsx`, `VatTreatmentBanner.tsx`.
- Pruebas CRM: `apps/portal/src/components/crm/subscribers/ContractCard.spec.tsx`, `crm-contract-dialogs.portal.spec.tsx`, `mod05-iva-punto-servicio-ui.spec.tsx`, `SubscribersListClient.spec.tsx`.
- Catálogo: `apps/portal/src/components/commercial/catalog/AdditionalProductsPanel.tsx`, `AdditionalServicesPanel.tsx`, `PlanCatalogFormPeek.tsx`, `PlanCatalogPanel.tsx`, `PlanCatalogTable.tsx`, `catalog-filter-params.ts`, `catalog-tax-options.ts`, `plan-catalog-helpers.ts`, `plan-catalog-columns.spec.ts`.
- Pruebas catálogo: `apps/portal/src/components/commercial/catalog/PlanCatalogFormPeek.spec.tsx`, `PlanCatalogPanel.spec.tsx`, `PlanCatalogTable.spec.tsx`, `AdditionalProductsPanel.spec.tsx`, `AdditionalServicesPanel.spec.tsx`, `catalog-filter-params.spec.ts`, `catalog-tax-options.spec.ts`, `plan-catalog-columns.spec.ts`.
- Cliente tipado: `apps/portal/src/lib/api-client.ts`.

## Dependencia de seguridad para T7

La carga reutiliza `POST /media/upload` con `usage=general`, limitado hoy a `ADMIN`. La posible falta de permiso para operadores que crean o actualizan contratos es **deuda P2 preexistente**, compartida con T3 y no introducida por T6. T7 debe confirmar la cobertura de roles para cargar y consultar el soporte privado. T6 conserva solo el ID y no consume `publicUrl`. Véase [la spec ratificada, §6](../specs/2026-10-12-mod05-iva-punto-servicio-ux-spec.md#6-dependencia-para-revision-de-seguridad).

## Deuda nueva e identificada por severidad

| Severidad | Nueva | Preexistente relevante | Detalle                                                                                                       |
| --------- | ----: | ---------------------: | ------------------------------------------------------------------------------------------------------------- |
| P0        |     0 |                      0 | —                                                                                                             |
| P1        |     0 |                      0 | —                                                                                                             |
| P2        |     0 |                      1 | Roles actuales de Media restringidos a `ADMIN`; verificar operadores en T7. Misma deuda P2 registrada por T3. |
| P3        |     0 |                      0 | Las 8 heurísticas del audit-ui fueron revisadas y no aplican a cargas primarias.                              |
