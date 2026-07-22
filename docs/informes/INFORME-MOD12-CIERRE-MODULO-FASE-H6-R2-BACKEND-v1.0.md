# INFORME — MOD12 · Cierre módulo · Fase H6-R2 · Backend (Paso 2)

| Campo | Valor |
| --- | --- |
| Versión | 1.0 |
| Fecha | 2026-07-21 |
| Agente | AI-SR-FULL |
| Prompt | `docs/prompts/PROMPT-MOD12-CIERRE-MODULO-FASE-H6-R2-v1.0.md` Paso 2 |
| Estado | Completado (sin G7; sin commit) |

## Alcance ejecutado

1. **Eliminación** de `matchesUsefulLifeAlertSqlPredicate` en `serialized-asset-useful-life.util.ts` y referencias en código de tests (comentario EV-1 actualizado).
2. **Cobertura del clamp** `addMonthsUtc` / `setUTCDate(0)` vía `usefulLifeExpiryDate` y `calculateUsefulLife` (día 31 → mes destino más corto; umbral +3m sobre `referenceDate`).
3. **`coverageThreshold` path-specific** en `apps/api/jest.config.js` (glob `**/serialized-asset-useful-life.util.ts`, ≥80 % stmts/branches/functions/lines). Sin umbral global del API.

## Archivos

| Archivo | Cambio |
| --- | --- |
| `apps/api/src/modules/inventory/services/serialized-asset-useful-life.util.ts` | Borrada `matchesUsefulLifeAlertSqlPredicate`; `parseUtcDateOnly` sin ramas muertas `??` |
| `apps/api/src/modules/inventory/tests/serialized-asset-useful-life.util.spec.ts` | Casos clamp día 31; umbral +3m; sin `referenceDate`; ISO incompleto |
| `apps/api/src/modules/inventory/tests/useful-life-alerts.parity.ev1.spec.ts` | Comentario: paridad = SQL ↔ `calculateUsefulLife` / `usefulLifeExpiryDate` |
| `apps/api/jest.config.js` | `coverageThreshold` path-specific |

## Verificación

```text
EV1_REAL_DB=1 · inventory suite --coverage=false
→ 47 suites / 365 tests PASS (incluye useful-life-alerts.parity.ev1)

util.spec + coverage collectCoverageFrom=**/serialized-asset-useful-life.util.ts
→ 23 tests PASS
→ stmts 100% | branches 100% | funcs 100% | lines 100%
→ coverageThreshold OK
```

## Confirmaciones Stop/Go (track backend)

| Criterio R2 backend | Resultado |
| --- | --- |
| `matchesUsefulLifeAlertSqlPredicate` borrada | Sí — 0 matches en `apps/api/src` |
| Util ≥80 % con threshold path-specific | Sí — 100 % en las cuatro métricas |

**Nota:** este informe no cierra G7 (aprobador ≠ productor).
