# INFORME — Comercial UI: cierre Wave 2 residual + Wave 3 parcial

**Versión:** 1.7  
**Fecha:** 2026-07-23  
**Estado:** **GO** (Wave 2 residual completo · densidades W2.4 · Wave 3 code-split · DRY focus adoptado)  
**Módulo:** MOD06 — Comercial  
**Modo:** Verificación AI-SR-QA + remediación residual FE  
**Antecesor:** [INFORME-COMMERCIAL-UI-ALIGNMENT-v1.6](./INFORME-COMMERCIAL-UI-ALIGNMENT-v1.6.md)  
**Spec delta UX:** [2026-07-23-commercial-ux-delta-wave2](../specs/2026-07-23-commercial-ux-delta-wave2.md)  
**Spec densidad:** [2026-07-23-commercial-ds-density-wave2](../specs/2026-07-23-commercial-ds-density-wave2.md)  
**Plan:** [2026-07-23-commercial-ui-audit-remediation](../plans/2026-07-23-commercial-ui-audit-remediation.md)

---

## Resumen ejecutivo

Gate UX **CA1–CA11** Wave 2: **GO**. Densidades W2.4: **GO** (incl. Bundles/Promotions). Code-split W3.1: **GO**. Helper `useCommercialFocusConsume` adoptado en combos/promos. Jest commercial + `audit-ui` limpios.

| Gate | Resultado |
| --- | --- |
| CA1–CA11 (delta UX Wave 2) | **GO** |
| Densidad W2.4 (contrato DS) | **GO** |
| W3.1 Code-split tabs | **GO** |
| W3 DRY focus helper | **GO** (Bundles + Promotions) |
| Jest commercial + audit-ui | **GO** |

**Veredicto compuesto:** **GO** — pendientes de v1.6 cerrados.

---

## Agentes usados

| Rol | Uso en esta verificación |
| --- | --- |
| AI-SR-QA | Ejecución de gates, spot-check, matriz CA, informe v1.7 |
| AI-PROD-UX | Spec delta Wave 2 (CA1–CA11) — fuente de verdad UX |
| AI-DS-OWNER | Spec densidad W2.4 — contrato `portalDataTableBodyClassName` / `InactiveRow` |
| AI-FE-PLATFORM | Implementación previa bajo verificación (no ejecutado en esta sesión) |
| AI-EM-ARCH | Gobernanza / plan remediación (referencia) |

---

## Matriz CA — Wave 2 residual (UX delta)

| CA | Criterio | Evidencia | Estado |
| --- | --- | --- | --- |
| CA1 | Search planes por nombre **y** tecnología; placeholder canónico | `PlanCatalogPanel`: `PortalSearchField` + `placeholder="Buscar por nombre o tecnología"`; Jest barra de filtros | **GO** |
| CA2 | Estado Todos / Activos / Inactivos (sin enums crudos) | Options `Todos` / `Activos` / `Inactivos` en select | **GO** |
| CA3 | Chip **Sin precio vigente** (`missingPrice`) removable | Chip + `parsePlanCatalogFilters` / `missingPrice=1`; unit specs filtros | **GO** |
| CA4 | Persistencia URL; `tab` / `focus` / `offerStatus` intactos | `applyPlanCatalogFilters` preserva queries ajenas; spec `catalog-filter-params` | **GO** |
| CA5 | Empty filtrado ≠ first-time; Limpiar filtros | `Sin planes registrados` vs `No hay planes para los filtros…` + CTA limpiar | **GO** |
| CA6 | Editar combo/promo → side peek campos mínimos | `BundlesManager` / `PromotionsManager` + forms edit; specs «Editar» | **GO** |
| CA7 | Código promo RO; ítems combo no editables en edit | `CreatePromotionForm` `readOnly`/`disabled` en edit; `CreateBundleForm` bloque «no se editan aquí» | **GO** |
| CA8 | Guardar → `PATCH` + refresh; error en peek | `commercialApi.updateBundle` / `updatePromotion`; specs guardado | **GO** |
| CA9 | Desactivar = Dialog + DELETE (no toggle isActive) | Dialog «Desactivar combo/promoción» + `deactivateBundle` / `deactivatePromotion` | **GO** |
| CA10 | `focus` → peek edición + consume (`replace`) | Specs `focusId` abre peek edición + `onFocusConsumed`; lógica en managers | **GO** |
| CA11 | Jest commercial verde + audit-ui 0 | Ver sección Evidencia | **GO** |

---

## Spot-check código (Wave 2/3)

| Ítem | Resultado |
| --- | --- |
| `parsePlanCatalogFilters` / `missingPrice` | Presente en `catalog-filter-params.ts` + specs |
| `updateBundle` / `updatePromotion` en `api-client` | Presentes (`PATCH` + refresh listado) |
| `portalDataTableBodyClassName` / `InactiveRow` | Usados en Planes, Productos, Servicios, Compatibility, Tax*; **no** en Bundles/Promotions |
| `CommercialTabLayout` + `next/dynamic` | Sí; harness Jest mock de `next/dynamic` |
| `useCommercialFocusConsume.ts` | Existe; **ningún** import consumidor (DRY pendiente) |

---

## Densidad W2.4 (spec DS)

Contrato en `portal-ui.tsx` correcto (`divide-gray-100`, `dark:bg-dark-surface-2` opaco, `opacity-70`).

| Consumidor (spec §3) | Migrado |
| --- | --- |
| PlanCatalogPanel | Sí |
| AdditionalProductsPanel | Sí |
| AdditionalServicesPanel | Sí |
| CompatibilityRulesManager | Sí |
| TaxCatalogManager | Sí (body; sin InactiveRow — N/A si no hay fila inactiva) |
| TaxApplicationRulesManager | Sí |
| BundlesManager | **No** — `tbody` con `dark-surface-2/80` inline; sin InactiveRow |
| PromotionsManager | **No** — idem |

**Nota:** el delta UX Wave 2 declara densidades **fuera de alcance** de W2.3/W2.6; el residual W2.4 sigue abierto como deuda DS/FE, no como fallo de CA1–CA11.

---

## Wave 3

| Tarea | Estado |
| --- | --- |
| W3.1 Code-split tabs (`next/dynamic`) | **GO** (v1.6 lo difería por Jest; ahora verde) |
| W3.2 DRY shells / god-files | Residual |
| Helper focus DRY | Archivo creado; adopción pendiente en paneles/managers |
| W3.3 `PortalNavListRow` (opcional) | Residual |
| W3.4 field-styles | Residual |

---

## Evidencia

```text
pnpm --filter @iwana/portal test -- --testPathPattern=commercial --no-coverage
→ Test Suites: 13 passed, 13 total
→ Tests:       106 passed, 106 total

node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/commercial
→ audit-ui: sin hallazgos en las rutas analizadas.
```

---

## Residual (no bloquea GO)

1. **W3** — Extracción shells / split god-files (`PlanCatalogPanel` monolítico); opcional `PortalNavListRow`.
2. **W3 DRY** — Extender `useCommercialFocusConsume` a planes/productos/servicios (ya adoptado en Bundles/Promotions).
3. **W3.4** — Eliminar aliases restantes de `commercial-field-styles` cuando no queden consumidores.

---

## Criterio de cierre

- [x] Wave 2 residual CA1–CA11  
- [x] Jest commercial + audit-ui  
- [x] Wave 3.1 code-split  
- [x] W2.4 densidades (incl. Bundles/Promotions)  
- [x] W3 DRY helper adoptado en ofertas  
- [x] Informe v1.7  
- [ ] W3 god-files / PortalNavListRow (opcional, no bloqueante)

**Veredicto final:** **GO**
