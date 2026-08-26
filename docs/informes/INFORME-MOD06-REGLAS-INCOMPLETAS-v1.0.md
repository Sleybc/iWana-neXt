# INFORME-MOD06-REGLAS-INCOMPLETAS-v1.0

**Versión:** 1.0
**Fecha:** 2026-08-19
**Clasificación:** Técnico — Confidencial
**Módulo:** MOD06 — Comercial
**Tipo:** Remediación de alerta operativa (cobertura tributaria)

---

## 1. Qué significaba el mensaje

La franja **Reglas incompletas** / «N bloqueos o riesgos en tributación o integridad de combos» no es un error de la tabla de planes. El resumen `GET /commercial/dashboard/summary` calcula:

`rulesGapCount = activeBundlesWithInactiveItemsCount + taxRulesCoverageGapCount`

`taxRulesCoverageGapCount` vale `activePlansCount` cuando **no hay ninguna** `tax_rule` activa en vigencia con **al menos una** `tax_rule_application` activa. En el tenant de la captura: **8 planes activos y cobertura 0** → el 8.

Causa raíz: la migración 023 enlazaba `tax_definitions.code = tax_rules.tax_type`. Los presets son `IVA_19` / `IVA_EXENTO`; el legado es `IVA`. El cruce no insertaba filas.

## 2. Alcance aplicado

| Superficie | Cambio |
| --- | --- |
| CTA «Revisar reglas» | Si el hueco dominante es tributario, aterriza en **Aplicación de impuestos** (`taxation/tax-rules-app`), no en el catálogo de Impuestos. |
| Migración tenant `114` | Backfill de aplicaciones cuando ya hay `tax_rules` (el cruce 023 `code = tax_type` no coincidía). |
| Migración tenant `115` | Siembra las 5 reglas IVA base (019 no podía tras borrar `tax_classifications` en 025) y vuelve a aplicar el backfill. Este tenant tenía **0 reglas** y 8 planes activos. |
| `TenantSeedService.seedTaxPresets` | Tras sembrar presets, corre el SQL de aplicaciones. |

## 3. Evidencia

| Gate | Estado |
| --- | --- |
| Jest portal (`commercial-alerts`, `CommercialAlertsStrip`, `CommercialClient`) | 41 PASS |
| Jest worker (`tenant-seed.service`) | 4 PASS |
| Jest `@iwana/db` orden de migraciones tenant | 6 PASS |
| Migración tenant local `tenant_iwana` | 115 aplicada: 5 reglas IVA + 5 aplicaciones; cobertura > 0; 8 planes activos ya no cuentan como hueco |

## 4. Qué debe hacer el operador

Tras migrar, recargar Comercial. Si el aviso sigue, hay combos activos con ítems inactivos: el CTA irá a Combos. Si solo era cobertura tributaria, la franja desaparece.
