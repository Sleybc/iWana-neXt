# PROMPT — MOD12 · Remediación G7 NO-GO Fase H6 — H6-R1

> **Estado: Emitido — EJECUTABLE.** Origen: G7 **NO-GO** 2026-07-21 ([INFORME-MOD12-CIERRE-MODULO-FASE-H6-G5-G6-G7-v1.0.md](../informes/INFORME-MOD12-CIERRE-MODULO-FASE-H6-G5-G6-G7-v1.0.md) v1.2). No reabrir N+1 ni declarar cierre hasta GO de re-G7.

## Vinculos

- Spec (enmiendas): `docs/specs/2026-07-21-mod12-cierre-modulo-fase-h6-design.md` (D-H6-5, CA-H6-06, CA-H6-07)
- ADR-060 (sin cambio de decisión RBAC/SQL/sin DDL)
- Prompt padre: `docs/prompts/PROMPT-MOD12-CIERRE-MODULO-FASE-H6-v1.0.md` (cerrado con defecto; este R1 lo remedia)

## Destinatarios

| Track | Agente | Alcance |
| --- | --- | --- |
| Backend | **AI-SR-FULL** | B1 vida útil día-exacta; CA-H6-06 EV-1; aislamiento real; autorrechazo; `recordWriteOff` interno |
| Portal | **AI-FE-PLATFORM** | Desacoplar `canApprove` de `canAdjustStock` |
| Plataforma | **AI-PLAT-OPS** | Instalar Chromium Playwright; dejar entorno reproducible |
| Verificación | **AI-SR-QA** | Re-ejecutar E2E MOD12 + gates; **no** auto-aprobar G7 |
| Deuda CA-H6-07 | **AI-EM-ARCH** (ya firmada enmienda) + QA registra dueños de ~29 | Lista deuda cross-módulo |

---

## 1. Objetivo

Levantar el NO-GO de G7 cumpliendo las cinco condiciones del veredicto, sin DDL y sin relajar segregación ADMIN.

---

## 2. Paso A — Vida útil día-exacta (B1) · AI-SR-FULL

1. Reescribe `calculateUsefulLife` en `serialized-asset-useful-life.util.ts`:
   - Vencimiento = misma semántica que PG: `purchase_date + useful_life_months` (usar / alinear `usefulLifeExpiryDate`).
   - `monthsRemaining` / `monthsElapsed` / `status` se derivan de esa fecha vs `referenceDate` (día UTC), **no** de `monthsBetween` por año/mes ignorando día.
   - Umbral «por vencer» = `USEFUL_LIFE_ALERT_THRESHOLD_MONTHS` (3) medido sobre la fecha de vencimiento.
2. El predicado SQL en `listUsefulLifeAlerts` **conserva** la forma `purchase_date + useful_life_months * INTERVAL '1 month'` (indexable). No materializar.
3. Elimina o reduce `matchesUsefulLifeAlertSqlPredicate` como evidencia de CA-H6-06 (puede quedar como helper de unidad, **no** como prueba de paridad).
4. **CA-H6-06 EV-1** (`EV1_REAL_DB=1`): inserta activos de prueba en schema tenant real; consulta SQL/listado; compara clasificación con `calculateUsefulLife` para:
   - cuatro estados: sin-dato, vigente, por-vencer, vencida;
   - días de compra **1, 28, 29, 30, 31** (y el caso 2026-04-30 · 6 m · ref 2026-07-21 → tras unificación día-exacta debe ser **vigente**, no alerta);
   - caso 2025-01-15 · 12 m · ref 2026-01-01 → **por-vencer** (aún no vencida día-exacta), no «vencida» mal etiquetada en filtro por-vencer.
5. Actualiza specs unitarios del helper (`serialized-asset-useful-life.util.spec.ts`) a la nueva semántica.

**Stop:** si hace falta índice nuevo → escala EM-ARCH.

---

## 3. Paso B — Aislamiento real (B3) · AI-SR-FULL

Reescribe `useful-life-alerts.isolation.spec.ts` de una de estas formas (preferida la 1):

1. **Dos schemas tenant reales** (patrón EV-1 / `serialized-asset.isolation.spec.ts`): datos en A y B; listado en contexto A no ve filas de B.  
2. **O** assert del SQL/parámetros emitidos (`getQueryAndParameters` / spy del QB) que demuestre `tenant_id = :tenantId` en el predicado — sin que el mock «filtre» el resultado por el test.

El mock actual que filtra por tenant en el stub **no** cumple.

---

## 4. Paso C — Menores seguridad · AI-SR-FULL + AI-FE-PLATFORM

1. Test: ADMIN solicitante recibe 400 al **rechazar** su propia baja (`assertApproverDistinct` en reject) — espejo de CA-H6-02.  
2. `StockLedgerService.recordWriteOff`: marcar como **interno** (comentario + visibilidad / no exportar como API pública del módulo; sin endpoint nuevo). Objetivo: no reabrir N1 por caller futuro del Modulith.  
3. Portal: `canApprove` **independiente** de `canAdjustStock` (misma regla ADMIN hoy, flags distintos) — evita desincronización futura.

---

## 5. Paso D — Chromium + E2E reproducible (B2) · AI-PLAT-OPS → AI-SR-QA

1. AI-PLAT-OPS: instalar browsers Playwright del proyecto (`pnpm exec playwright install chromium` o el script del repo); documentar en nota breve si falta en CI/dev.  
2. AI-SR-QA (no el productor del arnés H6): re-ejecutar  
   `npx playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-inventory-scm.spec.ts`  
   y adjuntar exit code + totales.  
3. Registrar deuda cross-módulo de los ~29 fallos portal **con dueño** (WFM → MOD09, settings → MOD0x, comercial → MOD06, etc.) en el informe H6-R1 — sin reclamar CA-H6-07 sobre ellos (enmienda firmada).

---

## 6. Entregables

- Código + tests (EV-1 CA-H6-06, aislamiento, autorrechazo, flags UI).  
- `docs/informes/INFORME-MOD12-CIERRE-MODULO-FASE-H6-R1-v1.0.md` (productor) con evidencia reproducible.  
- Handoff a AI-EM-ARCH para **re-G5 / re-G6 / re-G7**. El productor **no** emite GO de gate.

## 7. Verificación mínima

```powershell
$env:EV1_REAL_DB='1'; pnpm --filter @iwana/api test -- src/modules/inventory --coverage=false
pnpm --filter @iwana/portal test -- inventory
pnpm lint
pnpm typecheck
npx playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-inventory-scm.spec.ts
```

## 8. Stop/go

| Stop | Go (listo para re-G7) |
| --- | --- |
| Helper y SQL divergen en algún borde día 28–31 | CA-H6-06 EV-1 verde con esos bordes |
| Aislamiento sigue siendo mock que filtra | Spec demuestra tenant real o predicado emitido |
| E2E no arranca / no reproducible por QA | Chromium OK + 41/41 (o fallos atribuidos en alcance MOD12) |
| Se declara cierre sin re-G7 | Handoff a EM-ARCH únicamente |
