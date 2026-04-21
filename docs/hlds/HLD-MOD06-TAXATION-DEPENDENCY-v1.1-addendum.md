---
title: "Addendum HLD MOD06 — Dependencia hacia Taxation y rediseño tributario"
version: "1.1-addendum"
owner: "Arquitectura de Soluciones"
date: "2026-04-21"
status: "Aprobado"
approvedAt: "2026-04-21"
approvedBy: "CTO Humano"
classification: "Confidencial — Uso Interno"
module: "MOD06"
parentDocument: "HLD-MOD06-ARQUITECTURA-v1.0.md"
references:
  - docs/hlds/HLD-MOD06-ARQUITECTURA-v1.0.md
  - docs/adrs/ADR-029-Bounded-Context-Taxation-Catalogo-Unificado.md
  - docs/adrs/ADR-031-Rediseno-Tributario-Comercial-Impuestos-Reglas-Simulador.md
  - docs/hlds/HLD-MOD07-TAXATION-v1.0.md
---

# Addendum HLD-MOD06 — Dependencia hacia Taxation y rediseño tributario

Este addendum complementa `HLD-MOD06-ARQUITECTURA-v1.0.md`. No lo reemplaza. Las referencias a `tax_classifications` y `tax_rules` del HLD original aplican hasta la ejecución de ADR-029 y ADR-031.

## 1. Cambio de ownership

`CommercialModule` deja de ser dueño del catálogo de impuestos. El catálogo pasa a `TaxationModule` (MOD07). Commercial conserva la **aplicación** de impuestos a clientes, no el catálogo.

## 2. Nuevo lenguaje de negocio

La pestaña tributaria pasa de `Clasificaciones tributarias` + `Reglas de asignación` a:

1. **Impuestos** (lectura al catálogo de Taxation).
2. **Reglas de aplicación** (propiedad de Commercial).
3. **Simulador tributario** (herramienta de verificación).

## 3. Dependencias

| Dependencia | Tipo | Puerto |
|---|---|---|
| TaxationModule | Upstream | `ITaxCatalogReadPort` |
| CrmModule | Downstream | `ITaxApplicationReadPort` (expuesto por Commercial, devuelve lista de impuestos aplicables) |
| BillingModule (futuro) | Downstream | Mismo puerto de lectura |

## 4. Evolución de tablas

| Tabla actual | Evolución |
|---|---|
| `commercial.tax_classifications` | Legacy durante migración; se deprecará |
| `commercial.tax_rules` | Renombre funcional a `tax_application_rules`; columnas `estrato_min`/`estrato_max` se eliminan en favor de `stratum_from`/`stratum_to` |
| `commercial.tax_rule_applications` (nuevo) | Tabla puente: `tax_rule_id` + `tax_definition_id` (FK lógica a Taxation) + `treatment` + `rate_override` |

## 5. Resolución tributaria

El puerto expuesto por Commercial deja de retornar un `TaxClassificationSnapshot` opaco. Retorna una lista de aplicaciones:

```ts
type TaxApplicationSnapshot = {
  taxDefinitionId: string;
  treatment: 'STANDARD' | 'EXEMPT' | 'EXCLUDED' | 'FIXED';
  effectiveRate: number | null;
  ruleId: string;
  priorityMatched: number;
};
```

El simulador explica qué regla ganó por prioridad y qué impuestos resultaron aplicables.

## 6. UX: componentes objetivo

Se reemplaza `TaxRulesManager.tsx` monolítico por:

- `TaxCatalogManager` (lectura al catálogo de Taxation).
- `TaxApplicationRulesManager`.
- `TaxSimulatorPanel`.

El punto de integración sigue siendo `CommercialTabLayout`.

## 7. Impacto en tests

- `apps/api/src/modules/commercial/tests/tax-classification.service.spec.ts`: se reescribe como `tax-application.service.spec.ts`.
- `apps/api/src/modules/commercial/tax.controller.http.spec.ts`: se actualizan rutas y contratos.
- Commercial mockea el puerto `ITaxCatalogReadPort` en pruebas unitarias.

## 8. Pendientes

- Feature flag de corte entre motor legacy y nuevo motor.
- Migración de datos existentes de `tax_classifications` a reglas explícitas.

## 9. Referencias

- ADR-029, ADR-031
- HLD-MOD07-TAXATION-v1.0.md
