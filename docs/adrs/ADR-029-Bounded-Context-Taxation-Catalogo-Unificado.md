---
title: "ADR-029 — Catálogo unificado de impuestos como Bounded Context propio (Taxation / MOD07)"
status: "Aprobado"
date: "2026-04-21"
approvedAt: "2026-04-21"
approvedBy: "CTO Humano"
author: "AI-EM-ARCH (Modo Architect)"
module: "MOD07"
references:
  - AGENTS.md
  - docs/prds/Stack_Tecnologico.md
  - docs/prds/PRD_Sistema_ISP_Colombia_v2_3.md
  - docs/hlds/HLD-MOD06-ARQUITECTURA-v1.0.md
  - docs/adrs/ADR-028-Extraccion-Modulo-Comercial.md
  - docs/specs/2026-04-20-reglas-comerciales-design.md
  - docs/specs/2026-04-21-taxation-bounded-context-design.md
---

# ADR-029: Catálogo unificado de impuestos como Bounded Context propio (Taxation)

## Estado

Aprobado por CTO el 2026-04-21.

## Contexto

El ADR-028 extrajo `CommercialModule` (MOD06) como bounded context y alojó ahí las entidades `tax_classifications` y `tax_rules`. Durante la ejecución del rediseño tributario comercial (ver spec `2026-04-20-reglas-comerciales-design.md` y su evolución a `2026-04-21-taxation-bounded-context-design.md`) se identifican tres realidades:

1. El catálogo de impuestos de Colombia (IVA, Retefuente, ReteICA, Estampillas, tributos territoriales) no es exclusivo de ventas. Lo consumen facturación electrónica, compras y nómina.
2. `TaxRegime` en `packages/shared/src/enums/tax-regime.enum.ts` solo distingue `SIMPLIFIED` y `COMMON`, calculado exclusivamente desde `personType` del `Subscriber`. No modela proveedores (gran contribuyente, régimen simple, autorretenedor) ni otros terceros.
3. El roadmap del PRD v2.3 anticipa Purchasing (RF-PUR-01..08) e Inventario (RF-INV-*) en fase 6, y Nómina/RRHH posterior. Todos necesitarán el mismo catálogo.

Si el catálogo permanece dentro de `CommercialModule`, cuando entre Purchasing aparecerán dos caminos igualmente malos: duplicar entidades de impuestos en Purchasing, o forzar a Purchasing a depender de internals de Commercial. Ambos violan boundaries del modulith (AGENTS.md §Architecture Rules).

## Decisión

Se adopta `TaxationModule` (MOD07) como bounded context propio con las siguientes propiedades:

### D1. Ownership del catálogo

`TaxationModule` es dueño de la entidad `tax_definitions` del tenant. Ningún otro módulo crea, modifica ni lee directamente esa tabla.

### D2. Catálogo transversal con `context`

Cada `TaxDefinition` incluye un campo `context` con valores `SALES | PURCHASE | BOTH`. Esto permite mantener un solo catálogo físico y, a la vez, filtrar en consumo según el bounded context que lo solicita.

### D3. Lo que NO vive en Taxation

- Reglas de aplicación a clientes: propiedad de `CommercialModule`.
- Reglas de aplicación a proveedores: propiedad del futuro `PurchasingModule`.
- Perfiles fiscales de terceros (`SubscriberTaxProfile`, `SupplierTaxProfile`): propiedad del bounded context dueño del rol.
- Cálculo financiero final de facturas: propiedad del futuro `BillingModule`.

### D4. Consumo por puertos tipados

Otros módulos consumen Taxation vía un puerto `ITaxCatalogReadPort` con operaciones mínimas: `getTaxById`, `listTaxes(context)`, `resolveSystemPreset(code)`. No se expone el repositorio TypeORM, ni la entidad interna, ni el DataSource.

### D5. Presets del sistema para Colombia

Al provisionar un tenant se siembra un set de `TaxDefinition` base: IVA 19%, IVA exento, IVA excluido, Retefuente servicios, ReteICA, Estampillas departamentales (placeholder). El tenant puede desactivarlos, duplicarlos o crear custom; nunca editar los presets sistema.

### D6. Migración desde Commercial

`CommercialModule` conserva `tax_rules` y `tax_classifications` mientras se ejecuta la migración. Los registros de `tax_classifications` y los campos `taxType` + `ratePercentage` de `tax_rules` se portan a `tax_definitions` con `context = SALES`. El cambio es aditivo: Commercial pasa a consumir Taxation vía puerto antes de eliminar las tablas locales.

## Alternativas consideradas

### A. Dejar todo dentro de CommercialModule (descartada)

Mínimo costo inmediato, máximo costo futuro. Obliga a refactor cuando entre Purchasing, con alto riesgo de duplicación e inconsistencia fiscal entre ventas y compras.

### B. Biblioteca compartida en `packages/shared` (descartada)

No puede tener estado ni entidades TypeORM del tenant. Rompe el principio de schema por tenant y mezcla catálogo operativo con tipos compartidos.

### C. Bounded context propio (elegida)

Respeta el modulith, habilita boundaries claros, reduce duplicación futura y mantiene multi-tenancy por schema sin ambigüedad.

## Consecuencias

### Positivas

- Purchasing, Payroll y Billing podrán consumir el catálogo sin tocar Commercial.
- Presets del sistema quedan centralizados en un único módulo auditable.
- Habilita `context = SALES | PURCHASE | BOTH` sin explosión de modelo.
- Desacopla el catálogo de la lógica de aplicación (reglas y perfiles).

### Costos y tradeoffs

- Migración aditiva desde Commercial requiere dos pasos: crear Taxation y mover datos.
- Commercial debe evolucionar para consumir puerto en lugar de entidad directa.
- Añade un módulo más al modulith, con su propio ciclo de pruebas y documentación.

### Riesgos aceptados

- Durante la migración conviven tablas en Commercial y Taxation. Se acepta ventana controlada por feature flag o por release.
- La primera versión de Taxation no incluirá motor de cálculo financiero ni integración DIAN; solo catálogo y presets.

## Consecuencias documentales

Obliga a:

- Publicar `HLD-MOD07-TAXATION-v1.0.md`.
- Actualizar `HLD-MOD06-ARQUITECTURA-v1.0.md` para referenciar Taxation como dependencia upstream.
- Incorporar requisitos al PRD vía addendum (ver PRD-ADDENDUM-TAXATION-PARTIES-v1.0).
- Actualizar la spec de reglas comerciales `2026-04-20-reglas-comerciales-design.md` con la dependencia hacia Taxation.

## Referencias

- AGENTS.md — reglas de boundaries y modulith
- docs/prds/Stack_Tecnologico.md
- docs/prds/PRD_Sistema_ISP_Colombia_v2_3.md — secciones RF-PUR, RF-INV
- docs/adrs/ADR-028-Extraccion-Modulo-Comercial.md
- docs/hlds/HLD-MOD06-ARQUITECTURA-v1.0.md
- docs/specs/2026-04-20-reglas-comerciales-design.md
