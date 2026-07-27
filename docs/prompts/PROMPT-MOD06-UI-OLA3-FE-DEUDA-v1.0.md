---
description: "Wave 3 Comercial UI — FE-PLATFORM: code-split tabs, DRY shells, split god-files, opcional PortalNavListRow."
name: "Commercial UI Wave3 FE-Debt"
argument-hint: "Tras Wave 2 o en paralelo de baja prioridad; no bloquea identidad"
agent: "fe-platform"
---

# Prompt de ejecución — Wave 3 · AI-FE-PLATFORM (deuda)

**Precondición:** Identidad ya GO; Wave 1 operativa GO recomendada. Wave 3 **no bloquea** gate de identidad.  
**Plan:** [2026-07-23-commercial-ui-audit-remediation](../../docs/plans/2026-07-23-commercial-ui-audit-remediation.md) · W3.1–W3.4  
**Hallazgos:** H32, H33, H38, H39.

## Alcance

1. **W3.1** `next/dynamic` (o import dinámico) por tab en `CommercialTabLayout.tsx`.  
2. **W3.2** Extraer shell DRY catálogo (products↔services) y ofertas (bundles↔promos); partir `PlanCatalogPanel` en table + form peek + hooks.  
3. **W3.3** (Opcional) Tras GO DS: implementar `PortalNavListRow` y migrar filas de Actividad.  
4. **W3.4** Eliminar `commercial-field-styles` si sin consumidores.

## Restricciones

- Sin cambio de comportamiento de negocio.  
- Referencia de patrón: inventory workspaces (no CRM list legacy).  
- Cobertura Jest sin regresión; `audit-ui.mjs` = 0.  
- No rediseñar visualmente; no inventar tokens de marca.

## Stop / go

- Bundle JS del shell commercial reducido de forma medible o justificada.  
- Archivos god-file por debajo de umbral razonable (~400–500 líneas por unidad) o split documentado.  
- Informe vivo: añadir sección deuda Wave 3 cerrada / residual.
