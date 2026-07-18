# ADR-054: Conteo físico / inventario cíclico como documento que reconcilia el saldo contra el conteo real

**Version:** 1.0
**Estado:** ✅ Aprobado
**Aprobado por:** CTO Humano (2026-07-18)
**Fecha:** 2026-07-18
**Fecha de aprobación CTO:** 2026-07-18
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Modulo:** MOD12 Inventario / SCM (submodulo Existencias)
**PRD relacionado:** docs/prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md
**HLD relacionado:** docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md
**ADR antecedente:** docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md
**Spec de diseño:** docs/specs/2026-07-18-mod12-existencias-conteo-fisico-fase03A-design.md
**Prompt de ejecucion:** docs/prompts/PROMPT-MOD12-EXISTENCIAS-CONTEO-FISICO-FASE-03A-v1.0.md

---

## Contexto

El submódulo Existencias (Fases 1-2, ambas en G7 GO) permite consultar el kardex, registrar ajustes manuales puntuales y ver la reposición sugerida. Pero no existe forma estructurada de **reconciliar el saldo del sistema contra la realidad física** de una bodega: hoy, si el operador cuenta el estante y difiere del sistema, la única vía es registrar ajustes manuales ítem por ítem (`POST /inventory/adjustments`, ADR implícito de Fase 1), sin documento que agrupe el ejercicio, congele lo esperado, muestre las diferencias ni deje traza de "quién contó qué y cuándo".

El PRD §7 planificó Fase 3 como "conteos físicos + reservas efectivas". La verificación de factibilidad (2026-07-18) confirmó una **asimetría de riesgo** entre ambas mitades:

- **Conteos físicos:** aditivo y limpio — un documento nuevo que reutiliza el ledger existente sin tocar rutas críticas.
- **Reservas efectivas:** modifica rutas críticas existentes (validación de disponible en despacho y transferencia, guardado anti-negativo de `StockBalanceService`), con riesgo de sobre-venta si se implementan a medias.

Por esa asimetría, el CTO decidió (2026-07-18) **dividir la Fase 3 en 3A (conteos físicos) y 3B (reservas efectivas)**, cada una con su propio gate. Este ADR gobierna únicamente **3A**; 3B tendrá su propio ADR cuando se defina (cierre de 3A, ADR-016).

**Cimientos existentes confirmados (no se reconstruyen):**
- `StockLedgerService.recordMovementWithManager` es público, idempotente por `idempotencyKey`, acepta múltiples líneas y un `EntityManager` externo → invocable dentro de la transacción del conteo (patrón ya usado por `goods-receipt`, `counter-purchase`, `stock-issue`).
- `StockAdjustmentReason.CYCLE_COUNT` ya existe desde Fase 1 (`stock-adjustment-reason.enum.ts`).
- `StockBalance` (item × location × lot × condition, `quantityOnHand`) es la fuente del "esperado".
- Patrón "documento + líneas + numeración PREFIJO-######" con plantilla directa en `StockIssue`/`GoodsReceipt` (migración `057`, helper `generateSequentialNumber` en `purchasing.service.ts:952`).

---

## Decision

Se adopta el **conteo físico** como un **documento de reconciliación** que, al cerrarse, ajusta el saldo del sistema para que quede exactamente igual a lo contado, registrando el efecto por el ledger existente.

Características de la decisión:

1. **Documento nuevo con líneas.** Se crean dos entidades tenant: `stock_counts` (cabecera: `countNumber` `CNT-######`, `status`, `locationId`, filtro de alcance opcional por categoría, notas, actor, `closedAt`, `stockMovementId` del ajuste aplicado) y `stock_count_lines` (`countId`, `itemId`, `lotId`, `condition`, `expectedQty` congelado, `countedQty` nullable, `variance` derivada). Migración tenant **071** registrada a mano en `TENANT_MIGRATIONS` y entidades en `@iwana/db`. Plantilla: `057_create_stock_issues`.

2. **Reconciliación contra saldo vivo, no contra el snapshot.** `expectedQty` se congela al crear el conteo (foto de `StockBalance` para mostrar la variación al operador), pero el **delta aplicado al cierre se calcula contra el saldo vivo** (`delta = countedQty − onHand_actual_al_cierre`), de modo que el saldo final quede **exactamente igual a lo contado**. Esto es el objetivo de un conteo físico ("el estante dice X → el sistema dice X") y evita que un movimiento concurrente entre el congelado y el cierre deje el saldo desalineado. La variación esperado−contado se conserva como dato informativo del documento.

3. **Un solo ajuste por cierre, vía ledger, reutilizando ADJUSTMENT.** Al cerrar, el conteo emite **un** `StockMovement` con una línea por cada renglón con delta ≠ 0, usando `origin = ADJUSTMENT`, `originContext = 'inventory.cycle-count'`, `originRefId = <countId>`, `idempotencyKey = 'cycle-count:<countId>'`, y cada línea con `StockAdjustmentReason.CYCLE_COUNT` como razón. **No se agrega un valor `CYCLE_COUNT` al enum `StockMovementOrigin`** (evita migración de enum, irreversible en PostgreSQL); el conteo es distinguible en el kardex por su `originContext` y trazable a su documento por `originRefId`. Coherente con la decisión D1 de Fase 1 (la razón viaja en el contexto/ref del movimiento).

4. **Alcance a ítems no serializados.** Los conteos cubren ítems `CONSUMABLE` (los que admiten ajuste por cantidad). Los ítems `SERIALIZED`/`FIXED_ASSET` se excluyen del alcance del conteo: su reconciliación es por estado/ubicación de activo (ciclo de vida de `SerializedAsset`), no por delta de cantidad, y `recordAdjustment` ya los rechaza (D3 de Fase 1). La auditoría de activos serializados queda fuera de 3A.

5. **Idempotencia y no doble aplicación.** El cierre es idempotente por `idempotencyKey='cycle-count:<countId>'` y por el `stockMovementId` persistido en la cabecera; un segundo cierre devuelve el movimiento existente sin re-aplicar. Un conteo sin variaciones se cierra sin emitir movimiento (`stockMovementId` null).

6. **Un solo motor de stock.** El conteo **no** escribe `StockBalance` directamente; el único camino sigue siendo `StockLedgerService` → `StockBalanceService.applyDeltaWithManager`. El documento de conteo orquesta, no muta saldos por su cuenta.

7. **RBAC por sensibilidad.** Crear, capturar y consultar conteos: `ADMIN`, `NOC`, `SUPPORT` (trabajo operativo de campo). **Cerrar** un conteo (aplica el ajuste, muta saldo): **solo `ADMIN`**, en paridad con el ajuste manual de Fase 1 (D2).

---

## Reglas de boundary

1. El conteo físico vive dentro de MOD12 `InventoryModule`; no crea un bounded context nuevo. Un `CycleCountService` es un provider adicional del mismo módulo que inyecta `StockLedgerService` y lee `StockBalance`.
2. El stock solo se mueve por `StockLedgerService`; el servicio de conteo no escribe saldos directamente.
3. Las entidades de conteo no llevan FKs cross-module; las referencias externas (si las hubiera) son `*RefId` opacos, como en `StockIssue`.
4. No se modifica ninguna ruta existente de despacho, transferencia o ajuste manual (eso es 3B / fuera de alcance).

---

## Alternativas descartadas

1. **Ajustes manuales sueltos (statu quo).** No agrupan el ejercicio, no congelan lo esperado, no muestran diferencias ni dejan traza documental del conteo. Insuficiente para inventario cíclico auditable.
2. **Añadir `CYCLE_COUNT` al enum `StockMovementOrigin`.** Distinguiría el conteo en el kardex a nivel de origen, pero exige `ALTER TYPE ... ADD VALUE` (migración de enum no reversible de forma trivial) y actualizar labels/filtros. Se prefiere reutilizar `ADJUSTMENT` + `originContext`, decisión del CTO (2026-07-18).
3. **Reconciliar contra el snapshot congelado (delta = counted − expected).** Más simple, pero si hay movimientos entre el congelado y el cierre, el saldo final no queda igual a lo contado. Se prefiere reconciliar contra saldo vivo (punto 2 de la decisión).
4. **Bloquear la bodega durante el conteo (freeze duro que impide despachos).** Correcto en teoría pero introduce acoplamiento y complejidad operativa desproporcionada para el MVP; la reconciliación contra saldo vivo lo hace innecesario en 3A.
5. **Conteos + reservas en una sola fase.** Descartado por la asimetría de riesgo; se dividió en 3A/3B (decisión CTO).

---

## Impacto

- **Multi-tenant:** entidades por schema tenant; queries filtran `tenantId`; migración por `TENANT_MIGRATIONS`. Sin impacto en `public`.
- **Seguridad:** cierre restringido a ADMIN; auditoría vía `AuditInterceptor` (CUD) y traza en el `StockMovement` resultante.
- **Escala:** un conteo se acota a una bodega (y opcionalmente una categoría); el número de líneas es del orden de los ítems de esa bodega. Sin impacto en la escala objetivo.
- **Regulación:** el inventario cíclico auditable favorece control interno; sin requisito regulatorio específico citado (marcar "requiere verificación con fuente oficial" si se invoca uno).
- **Reversibilidad:** migración 071 con `down()` que elimina las dos tablas; sin `ALTER TYPE` que revertir (por reutilizar ADJUSTMENT).

---

## Consecuencias

**Positivas:** reconciliación auditable con traza documental; reutiliza el ledger y la razón CYCLE_COUNT existentes; sin migración de enum; no toca rutas críticas; base para 3B (reservas) y para conteos serializados futuros.

**Negativas / deuda aceptada:** no cubre activos serializados en 3A; no bloquea la bodega durante el conteo (aceptable por reconciliación contra saldo vivo); el conteo de múltiples bodegas requiere múltiples documentos.

**Requiere ADR posterior:** Fase 3B (reservas efectivas) — modifica el guardado anti-negativo y las validaciones de disponible; su propio ADR definirá cuándo se reserva (creación vs aprobación de salida), el comportamiento en transferencias y la migración de las tres validaciones a `onHand − reserved`.

---

## Aprobación CTO

**Aprobado por el CTO Humano el 2026-07-18.** Autoriza la ejecución de la Fase 03A (`PROMPT-MOD12-EXISTENCIAS-CONTEO-FISICO-FASE-03A-v1.0.md`) una vez cerrado el G7 de Existencias Fase 2 (también confirmado el mismo día).
