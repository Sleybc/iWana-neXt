# Informe — MOD12 Existencias — Auditoría de ejecución del PRD (Fases 1–4)

**Version:** 1.0
**Fecha:** 2026-07-20
**Estado:** Emitido — H1/H2 **remediados** 2026-07-20; DoD suites en verde restaurado
**Modo activo:** EM (auditoría) + Orchestrator
**Responsable:** AI-EM-ARCH (auditor ≠ productor)
**PRD auditado:** docs/prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md
**Alcance:** verificación independiente de la ejecución de las Fases 1–4 contra código en `main` (HEAD `8d9cbd6d`), no re-lectura de informes previos como evidencia primaria.

---

## 1. Resumen ejecutivo

La ejecución del PRD es **sustancialmente conforme**: las cuatro fases están implementadas, trazables y en `main`, con la cadena documental completa (PRD → specs → ADR-054/055/059 → prompts → informes G5/G6/G7 por fase → informe vivo actualizado). Las decisiones de diseño D1–D6 y los invariantes críticos (reservas, idempotencia, tenant isolation, costeo) se verificaron directamente en el código y coinciden con lo aprobado.

**Sin embargo, el DoD "tests nuevos y existentes de inventario en verde (API y portal)" estuvo incumplido** hasta la remediación H1/H2 (2026-07-20): la suite API fallaba en `inventory.module.spec.ts` y el caso positivo de `StockTransferDialog.spec.tsx` no abría el `Select` custom. Ambos eran defectos del **arnés de test**, no del producto. **Remediados** — ver §6 y checklist `CHECKLIST-MOD12-INVENTARIO-EXISTENCIAS-GATES-G6-G7-v1.0.md`. No se recomienda reabrir G7.

## 2. Verificación por fase (evidencia en código)

| Fase | Contrato PRD §7 | Verificado | Evidencia |
| --- | --- | --- | --- |
| F1 | `GET /inventory/movements` (+`/:id`), `POST /inventory/adjustments` (solo ADMIN), pestaña Existencias, redirect deep-link | ✅ | `inventory.controller.ts:286-311`; `StockWorkspace.tsx` + subvistas; redirect `InventoryClient.tsx:493-506` (CA-06) |
| F2 | `GET /inventory/replenishment/suggestions`, valoración en dashboard | ✅ | `inventory.controller.ts:472`; `replenishment.service` + `inventory-dashboard.service` con specs |
| F3A | 6 endpoints `counts` (close solo ADMIN), migración tenant 071 | ✅ | `inventory.controller.ts:479-533`; `071_create_stock_counts.ts`; `cycle-count.service.ts:409` emite ajuste `CYCLE_COUNT` |
| F3B | Sin endpoints nuevos; invariante `0 ≤ reserved ≤ onHand` en punto único; migración 072 | ✅ | `stock-balance.service.ts:199-247` (invariante + mensajes en español + guarda anti lost-update); `072_reconcile_stock_reservations.ts` idempotente, acota `reserved ≤ onHand`, `down()` reversible |
| F4 | Migración 080 `average_cost`, promedio móvil con lock, sellado de salidas, cadena de valoración | ✅ | `080_add_inventory_item_average_cost.ts` (backfill + reversible, fiel a ADR-059); `inventory-costing.service.ts` (fórmula D-F4-4, advisory lock por ítem, cadena `averageCost‖lastPurchaseCost‖standardCost‖baseCost`) |

Decisiones de diseño re-verificadas: **D1** (`recordAdjustment` → `origin=ADJUSTMENT`, `originContext='inventory.adjustment'`, `originRefId=<reason>`, `stock-ledger.service.ts:891-911`), **D2** (RBAC exacto en controller), **D3** (serializados bloqueados con mensaje que dirige a retorno/baja), **D4** (no se duplica la validación anti-negativo), **D6** (`idempotencyKey` requerido). RF-09 extremo a extremo: `stock-movement-query.service.ts:177-192` expone `adjustmentReason` y el portal lo traduce (`inventory-labels.ts:252`). OpenAPI: 42 `@ApiOperation` en el controller.

La deuda del cierre G7 F4 «commits de F4 pendientes de integrar a main» quedó **saldada**: `c87d4ea2` (F4) y `2746811e` (3B G6) están en `main`.

## 3. Hallazgos

### H1 — Alta · Suite API de inventario en rojo (regresión de arnés introducida por F4)

`apps/api/src/modules/inventory/tests/inventory.module.spec.ts` falla determinísticamente: el `RootTestModule` del spec no provee `InventoryCostingService`, dependencia añadida a `StockLedgerService` en Fase 4 (`c87d4ea2`). Resultado real: **Tests: 1 failed, 3 skipped, 272 passed**. Producción **no** está afectada: `inventory.module.ts:113` registra el servicio. Impacto: el smoke de compilación del módulo — la red que detecta exactamente este tipo de omisión — está caído.

### H2 — Alta · Caso positivo de reservas (3B) sin cobertura efectiva en portal

`StockTransferDialog.spec.tsx` («ofrece el producto cuando queda material disponible tras las reservas») falla determinísticamente y **nunca pudo pasar tal como está escrito**: consulta `getByRole('option', …)` sin abrir el `Select` de `@iwana/ui`, que es un combobox custom que solo monta `role="option"` con el listbox abierto (`Select.tsx:543-575`, anterior a la spec — `1e0e1368` vs `635c2a4d`). El test negativo del mismo archivo pasa trivialmente (`queryByRole` → null + texto del `PortalAlert`). El comportamiento de producto sí es correcto (`isTransferableBalance` usa disponible = onHand − reservado), pero el criterio EV del caso positivo de 3B queda sin verificación automatizada. Resultado real portal: **Tests: 1 failed, 256 passed**.

### H3 — Media · Proceso: los gates verificaron subconjuntos, no la suite del módulo

Los informes G6/G7 citan corridas parciales (p. ej. «Jest costing + ledger 31/31», «12/12 portal remediaciones»). Por eso H1 y H2 atravesaron los gates declarando «suites en verde». Recomendación normativa: el checklist de cierre G6/G7 debe exigir la corrida **completa** de la suite del módulo en API y portal (`npx jest src/modules/inventory` y `npx jest src/components/inventory`), no los subconjuntos tocados por la fase.

### H4 — Baja · Deuda P3 (cerrada 2026-07-20)

- **`tabular-nums` en KPI/costos:** aplicado en `InventoryDashboard` (KPI + breakdown), `InventoryMetaItem`, columna costo de `InventoryItemsTable` y líneas de kardex con costo unitario.
- **Rebuild `@iwana/db` en DoD post-entity (G5-O1):** incorporado al checklist G6/G7 como gate obligatorio cuando la fase toca entidades.

### Observaciones fuera de alcance MOD12

- Scripts `dev-reset-platform-admin.mjs` / `dev-verify-platform-login.mjs` y entradas en `package.json`: commit separado (platform-admin dev), no parte de este PRD.
- Cobertura ≥ 80% (RNF-06): **re-ejecutada** — ver §7 (statements **80.27%**, lines **80.51%** en `modules/inventory`).

## 4. Impacto (tenant / seguridad / escala / regulación)

- **Tenant:** sin hallazgos — aislamiento verificado en los emisores (`TenantContext.getOrThrow` + `runInTenantSchema` por transacción).
- **Seguridad:** sin hallazgos — RBAC del contrato respetado (ajustes y cierre de conteo solo ADMIN); sin PII en lo revisado.
- **Escala:** sin hallazgos nuevos — kardex paginado sobre índices existentes; lock de costeo por ítem serializa recepciones concurrentes según CA-F4-02.
- **Regulación:** sin impacto en esta auditoría; el efecto contable/fiscal de ajustes sigue diferido a verificación con fuente oficial (RNF-07), consistente con el PRD.

## 5. Veredicto

| Pregunta | Respuesta |
| --- | --- |
| ¿La ejecución implementa el PRD (F1–F4)? | **Sí** — contratos, decisiones e invariantes verificados en código |
| ¿DoD íntegro hoy? | **Sí** — tras remediación H1/H2 (suites API + portal completas en verde) |
| ¿Reabrir G7? | **No** — defectos de arnés, producto conforme; se registran como deuda alta con plan de pago inmediato |
| ¿Bloquea el módulo siguiente (ADR-016)? | **No**, condicionado a remediar H1/H2 antes del próximo cierre de fase de cualquier módulo |

## 6. Delegación (prompts de remediación)

| Hallazgo | Estado | Evidencia |
| --- | --- | --- |
| **H1** — `InventoryCostingService` en `inventory.module.spec.ts` | ✅ Remediado | `InventoryCostingService` en providers; suite API inventario 0 failed |
| **H2** — `StockTransferDialog.spec.tsx` abre `Select` antes de `role="option"` | ✅ Remediado | Patrón `userEvent` + combobox «Producto»; suite portal inventario 0 failed |
| **H3** — Checklist G6/G7 exige suite completa del módulo | ✅ Norma emitida | `CHECKLIST-MOD12-INVENTARIO-EXISTENCIAS-GATES-G6-G7-v1.0.md` |
| **H4** — P3 `tabular-nums` + rebuild `@iwana/db` en DoD | ✅ Remediado | UI costos/KPI + checklist §2; G5-O1 operativizado |
| **RNF-06** — Cobertura ≥ 80% inventario API | ✅ Verificado | statements 80.27%, lines 80.51% (273 tests) |

Registro: informe vivo del submódulo actualizado.

## 7. Re-verificación independiente de la remediación (AI-EM-ARCH, 2026-07-20)

Auditor ≠ productor: la remediación H1/H2 se ejecutó en sesión aparte; esta sección registra la re-corrida **independiente** del auditor sobre el working tree remediado (base `8d9cbd6d` + specs modificadas sin commitear).

| Evidencia | Resultado |
| --- | --- |
| Diff H1 | ✅ `InventoryCostingService` importado y añadido a providers del `RootTestModule` (2 líneas, patrón vigente del spec) |
| Diff H2 | ✅ Ambos tests abren el combobox «Producto» con `userEvent` antes de consultar `role="option"`; el caso negativo ahora afirma además la opción placeholder «Sin productos disponibles para entregar» (deja de pasar trivialmente); mock `matchMedia` para el `menuStyle` del `Select` |
| Suite API inventario completa | ✅ **0 failed** — 273 passed, 3 skipped (34 suites, 1 skipped) |
| Suite portal inventario completa | ✅ **0 failed** — 257 passed (55 suites) |
| Typecheck `@iwana/api` + `@iwana/portal` | ✅ limpios (`tsc --noEmit`) |
| H3 | ✅ Checklist emitido y referenciado desde el informe vivo |
| H4 P3 | ✅ `tabular-nums` en dashboard/meta/tabla/kardex; rebuild `@iwana/db` en checklist |
| RNF-06 cobertura | ✅ statements **80.27%**, lines **80.51%** (`npx jest src/modules/inventory --coverage`, 273 passed) |

**Hallazgo nuevo de la re-auditoría (H5 — Baja, corregido en el acto):** al registrar la remediación en la bitácora del informe vivo se **sobrescribió** la fila «CTO confirma G7 Fase 04 (GO producción)» en lugar de añadir una nueva — pérdida de trazabilidad de una aprobación del CTO. Restaurada por el auditor (la fila vuelve a preceder a la entrada de auditoría). Recordatorio normativo: la bitácora es *append-only*.

**Veredicto final:** H1–H4 y RNF-06 **remediados y verificados**. DoD íntegro. Commits pendientes: remediación MOD12 (este informe + specs + P3) separada de scripts platform-admin.
