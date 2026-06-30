# ADR-032 — Retiro del feature flag TAXATION_USE_CATALOG

**Estado:** Aprobado
**Fecha:** 2026-04-21
**Autores:** Sr. Dev Fullstack / Engineering Manager

## Contexto

El feature flag `TAXATION_USE_CATALOG` fue introducido en F3 (ADR-031) para permitir una transición gradual del motor tributario legacy (basado en `TaxClassification`) al nuevo motor de catálogo (basado en `TaxDefinition` + tabla puente `tax_rule_applications`). Con F4 completada (portal completamente migrado al nuevo motor) y el backfill de datos en F5 completado, el flag puede ser retirado de forma segura.

## Decisión

Se retira el flag `TAXATION_USE_CATALOG` del código base en la fase F6 de este programa. El nuevo motor de catálogo es el único activo a partir de este commit.

## Consecuencias

- El motor legacy (TaxClassificationService.resolveClassification) queda eliminado del code path productivo.
- La tabla `tax_classifications` es eliminada por la migración 025.
- Los endpoints CRUD legacy de `/commercial/tax-classifications` y `/commercial/tax-rules` (crear/actualizar/eliminar) son removidos de la API.
- Las columnas `estrato_min` y `estrato_max` de `tax_rules` son removidas (ya reemplazadas por `stratum_from`/`stratum_to` en migración 020).
- `GET /commercial/tax-rules` se mantiene, pero reimplementado en `TaxApplicationService.listRules()` sin dependencia de `TaxClassificationService`.
- `TaxRuleReadAdapter` y `TaxRuleReadPort` son removidos (no tenían consumidores externos).

## Cumplimiento ADR-031 §D6

Esta ADR documenta el cierre del checklist D6 de ADR-031 (cutover checklist).
