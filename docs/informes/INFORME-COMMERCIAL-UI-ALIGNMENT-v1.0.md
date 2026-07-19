# INFORME — Alineación UI Comercial (Firma iWana)

**Versión:** 1.0  
**Fecha:** 2026-07-18  
**Módulo:** MOD06 — Comercial (portal `/dashboard/commercial`)  
**Contrato:** [docs/specs/2026-07-12-commercial-ui-alignment-contract.md](../specs/2026-07-12-commercial-ui-alignment-contract.md)

## Resumen

Se cerró el remanente visual del contrato de alineación Firma iWana en el módulo Comercial del portal: Tributación pasó de listados en `Card` a tablas operativas `portalDataTable*`, formularios/modales unificaron field-styles y `portal-eyebrow`, y el simulador dejó de exponer UUIDs en copy visible.

## Cambios principales

| Área | Cambio |
| --- | --- |
| `TaxCatalogManager` | Listado tabular; labels `portal-eyebrow-muted`; errores con `PortalAlert` |
| `TaxApplicationRulesManager` | Listado tabular; sin fallback a UUID; acciones con variantes de `Button` |
| `TaxSimulatorPanel` | `Badge variant="lime"`; nombres de definición; empty/skeleton; field-styles |
| Modales create | Bundle/Promoción: textarea canónico, tildes, `PortalAlert` |
| Compatibilidad / ofertas | Hover `portalTableRowHoverClassName`; badges sin tipografía ad hoc |
| Catálogo productos/servicios | Textareas con `commercialTextareaClassName`; copy con tildes |
| `commercial-labels.ts` | Mapas tributarios + `resolveTaxLabel` (sin enum crudo) |
| `commercial-field-styles.ts` | Hover como reexport de portal-ui |

## Verificación

- `audit-ui.mjs apps/portal/src/components/commercial`: **P0/P1 = 0** (3 hallazgos P2 heurísticos `lime-50` en chips de filtro activos — revisados, acento de estado no fondo base).
- Jest `@iwana/portal` `components/commercial`: **8 suites / 22 tests PASS**.

## Criterios de cierre del contrato

- [x] Tributación en tabla `portalDataTable*`, sin `Card` de listado
- [x] Formularios/modales con field-styles + `portal-eyebrow`
- [x] Sin IDs técnicos ni enums crudos en copy visible del simulador
- [x] Audit sin P0/P1 deterministas; unit tests en verde

## Nota

No se regeneraron capturas E2E en esta pasada (harness local opcional). Las evidencias históricas siguen en `docs/informes/evidence/portal-commercial-ui-2026-07-11/`.
