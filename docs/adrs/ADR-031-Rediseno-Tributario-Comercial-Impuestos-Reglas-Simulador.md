---
title: "ADR-031 — Rediseño tributario comercial: Impuestos + Reglas de aplicación + Simulador"
status: "Aprobado"
date: "2026-04-21"
approvedAt: "2026-04-21"
approvedBy: "CTO Humano"
author: "AI-EM-ARCH (Modo Architect)"
module: "MOD06"
references:
  - AGENTS.md
  - docs/prds/PRD_Sistema_ISP_Colombia_v2_3.md
  - docs/adrs/ADR-028-Extraccion-Modulo-Comercial.md
  - docs/adrs/ADR-029-Bounded-Context-Taxation-Catalogo-Unificado.md
  - docs/hlds/HLD-MOD06-ARQUITECTURA-v1.0.md
  - docs/superpowers/specs/2026-04-20-reglas-comerciales-design.md
---

# ADR-031: Rediseño tributario comercial — Impuestos + Reglas de aplicación + Simulador

## Estado

Aprobado por CTO el 2026-04-21. Depende de ADR-029 (también aprobado).

## Contexto

La pestaña tributaria del módulo comercial se entregó en ADR-028 con dos secciones que el negocio percibe ambiguas:

- "Clasificaciones tributarias" en `apps/api/src/modules/commercial/entities/tax-classification.entity.ts`.
- "Reglas de asignación" en `apps/api/src/modules/commercial/entities/tax-rule.entity.ts`.

Validación con negocio expuesta en sesión de diseño del 2026-04-20:

1. Los términos "clasificación" y "asignación" suenan sinónimos y generan confusión operativa.
2. La clasificación basada en flags (`appliesIva`, `appliesRetefuente`, `appliesReteIca`, `appliesEstampillas`) oculta qué impuestos existen y cuál es su tasa.
3. El modelo no expresa naturalmente impuestos territoriales por municipio.
4. El simulador no explica por qué una regla ganó prioridad.
5. Existe deuda técnica: columnas duplicadas `estrato_min`/`estrato_max` y `stratum_from`/`stratum_to` en `tax_rule.entity.ts`.

## Decisión

Se adopta un modelo tributario comercial basado en tres conceptos claros y visibles al negocio: Impuestos, Reglas de aplicación y Simulador. Se abandona el naming "clasificación tributaria" como concepto visible.

### D1. Tres secciones visibles al negocio

- **Impuestos** — catálogo de tributos. Consumido desde `TaxationModule` (ADR-029), no dueño local.
- **Reglas de aplicación** — condiciones bajo las cuales cada impuesto aplica a un cliente. Propiedad de `CommercialModule`.
- **Simulador tributario** — herramienta de verificación que explica qué impuestos aplican a un cliente concreto y qué regla hizo match.

### D2. Condiciones soportadas desde v1 en las reglas

Segmento, tipo de persona, estrato (rango), municipio, base mínima, producto o plan. Las reglas tienen vigencia y prioridad explícita.

### D3. Resultado de una regla

Una regla no devuelve una clasificación opaca. Devuelve una lista de impuestos aplicables con su tratamiento (exento, excluido, gravado, con o sin override de tasa). Esto permite mezclar IVA + Retefuente + ReteICA + estampillas en el mismo match.

### D4. Simulador explica match

El simulador recibe: segmento, tipo de persona, estrato, municipio, producto, base. Devuelve impuestos aplicables, tratamiento, regla ganadora y motivo de desempate por prioridad.

### D5. Evolución de modelo de datos

- `commercial.tax_application_rules` (nuevo nombre funcional de `tax_rules`) con condiciones explícitas.
- `commercial.tax_rule_applications` (tabla puente) con `tax_rule_id`, `tax_definition_id` (FK lógica a Taxation), `treatment`, `rate_override`.
- `tax_classifications` queda como estructura interna legacy durante la migración; se deprecará tras el corte.
- `TaxationModule` es dueño del catálogo, no Commercial.

### D6. Territoriales manuales por tenant en v1

Los tributos territoriales (ICA por municipio, estampillas) se crean manualmente por el tenant como `TaxDefinition`. No se integra maestro DANE completo en v1, pero el campo `municipalityCode` se valida contra referencias DANE existentes en el repo. Se deja trazado para integración futura.

### D7. UX: tres componentes explícitos

- `TaxCatalogManager` — catálogo (read-only hacia Taxation; admin avanzado vive en MOD07).
- `TaxApplicationRulesManager` — CRUD de reglas de aplicación.
- `TaxSimulatorPanel` — simulador.

Reemplaza al actual `TaxRulesManager` monolítico. Se mantiene el punto de integración en `CommercialTabLayout`.

### D8. Deuda técnica que cierra este ADR

- Unifica columnas de estrato: se conserva `stratum_from` / `stratum_to`; `estrato_min` / `estrato_max` se marcan para eliminación en la migración correspondiente.
- Documenta explícitamente que "exento" y "excluido" son tratamientos de IVA dentro de una regla, no impuestos separados en el catálogo.

## Alternativas consideradas

### A. Solo renombrar las secciones (descartada)

No resuelve la raíz: el modelo sigue siendo indirecto, la simulación sigue sin explicar prioridad y no habilita catálogo transversal para Purchasing.

### B. Mantener clasificaciones como abstracción y agregar dashboards (descartada)

Añade complejidad sin claridad. El negocio seguiría pensando en clasificaciones opacas en lugar de en impuestos concretos.

### C. Impuestos + Reglas + Simulador apoyado en Taxation (elegida)

Alinea el modelo con el lenguaje del negocio, reduce ambigüedad, prepara el catálogo para consumo futuro por Purchasing y materializa la recomendación de ADR-029.

## Consecuencias

### Positivas

- Negocio puede responder "qué impuestos existen", "cuándo aplican" y "qué resultado obtiene un cliente" sin ambigüedad.
- Simulador trazable: explica regla ganadora y motivo de prioridad.
- Catálogo se desacopla de Commercial y pasa a Taxation sin refactor posterior.
- Cierra deuda técnica de columnas duplicadas de estrato.

### Costos y tradeoffs

- Requiere migración de datos desde `tax_classifications` y `tax_rules` actuales.
- Requiere evolución del puerto de lectura tributario expuesto a CRM.
- Frontend debe reestructurarse en tres componentes; se evita mantener el manager monolítico actual.

### Riesgos aceptados

- Primera iteración sin maestro DANE oficial: se acepta uso controlado de códigos ya presentes en el repo.
- La integración DIAN y cálculo financiero final siguen fuera de alcance (Billing futuro).

## Consecuencias documentales

- Actualización de HLD-MOD06.
- Actualización de la spec de reglas comerciales (`docs/superpowers/specs/2026-04-20-reglas-comerciales-design.md`) para reflejar el nuevo naming y la dependencia hacia Taxation.
- Nuevos DTOs y contratos en `apps/api/src/modules/commercial/dto/tax.dto.ts` y `apps/portal/src/lib/api-client.ts`.
- Tests afectados: `apps/api/src/modules/commercial/tests/tax-classification.service.spec.ts` y `apps/api/src/modules/commercial/tax.controller.http.spec.ts`.

## Referencias

- AGENTS.md
- docs/adrs/ADR-028-Extraccion-Modulo-Comercial.md
- docs/adrs/ADR-029-Bounded-Context-Taxation-Catalogo-Unificado.md
- docs/hlds/HLD-MOD06-ARQUITECTURA-v1.0.md
- docs/superpowers/specs/2026-04-20-reglas-comerciales-design.md
