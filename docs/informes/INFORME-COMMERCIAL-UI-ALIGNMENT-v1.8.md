# INFORME — Comercial UI: cierre residual Wave 3

**Versión:** 1.8  
**Fecha:** 2026-07-23  
**Estado:** **GO** (residual W3.2–W3.4 cerrado)  
**Módulo:** MOD06 — Comercial  
**Modo:** Remediación FE + verificación  
**Antecesor:** [INFORME-COMMERCIAL-UI-ALIGNMENT-v1.7](./INFORME-COMMERCIAL-UI-ALIGNMENT-v1.7.md)  
**Plan:** [2026-07-23-commercial-ui-audit-remediation](../plans/2026-07-23-commercial-ui-audit-remediation.md)

---

## Resumen ejecutivo

Se cerró el residual documentado en v1.7 sin rediseño ni tokens de marca nuevos. Identidad y operación comercial siguen **GO**.

| Ítem residual v1.7 | Resultado |
| --- | --- |
| W3 DRY `useCommercialFocusConsume` → planes/productos/servicios | **GO** |
| W3.4 Eliminar `commercial-field-styles.ts` | **GO** (archivo borrado) |
| W3.2 Split `PlanCatalogPanel` (helpers + table + form peek) | **GO** |
| W3.3 `PortalNavListRow` + migración Actividad | **GO** |
| Jest commercial + `audit-ui` | **GO** (13/106 · 0 hallazgos) |

**Veredicto compuesto:** **GO** — cola Wave 3 del plan de remediación cerrada.

---

## Agentes

| Rol | Uso |
| --- | --- |
| AI-DS-OWNER | Contrato carril rápido `PortalNavListRow` v1.0 (GO) |
| AI-FE-PLATFORM | Focus DRY, field-styles, split PlanCatalog, NavListRow + migración |
| AI-SR-QA / orquestador | Jest commercial + audit-ui + informe v1.8 |

---

## Cambios

### Focus DRY
- `PlanCatalogPanel`, `AdditionalProductsPanel`, `AdditionalServicesPanel` consumen `useCommercialFocusConsume` (mismo patrón que Bundles/Promotions).
- Sin `focusConsumedRef` local.

### Field-styles
- Consumidores migrados a `portal-ui` (`portalTextareaClassName`, `portalFieldClassName`, `portalSelectTriggerClassName`, `portalTableRowHoverClassName`).
- Eliminado `apps/portal/src/components/commercial/commercial-field-styles.ts`.

### Split PlanCatalog
| Archivo | Rol | ~líneas |
| --- | --- | --- |
| `plan-catalog-helpers.ts` | schema + helpers puros | ~161 |
| `PlanCatalogTable.tsx` | filtros + tabla | ~231 |
| `PlanCatalogFormPeek.tsx` | side peek + form | ~485 |
| `PlanCatalogPanel.tsx` | orquestador (API pública intacta) | ~608 |

Antes: monolito ~1285+ líneas.

### PortalNavListRow
- Primitive en `portal-ui.tsx` (`portalNavListRowClassName` + interactive/static).
- `AttentionRow` / `RecentChangeRow` en `CommercialActivityPanel` migrados.

---

## Evidencia

```text
pnpm --filter @iwana/portal exec jest --testPathPattern="components/commercial" --no-coverage
→ Test Suites: 13 passed, 13 total
→ Tests:       106 passed, 106 total

node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/commercial
→ audit-ui: sin hallazgos en las rutas analizadas.
```

---

## Residual

Ninguno bloqueante del plan Wave 1–3. Deuda futura (fuera de alcance de este cierre):

- Shells DRY genéricos products↔services / bundles↔promos (`CommercialResourcePanel`) — opcional si reaparece duplicación.
- Edición de composición de combo / campos promo fuera de `Update*Dto` — requiere backend explícito.

---

## Criterio de cierre

- [x] W3 DRY focus en catálogo  
- [x] W3.4 field-styles eliminado  
- [x] W3.2 PlanCatalog partido  
- [x] W3.3 PortalNavListRow  
- [x] Jest commercial + audit-ui  
- [x] Informe v1.8  

**Veredicto final:** **GO**
