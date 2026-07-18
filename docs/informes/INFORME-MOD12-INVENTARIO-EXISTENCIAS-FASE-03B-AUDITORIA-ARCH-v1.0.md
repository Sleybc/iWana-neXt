# Informe - MOD12 Existencias Fase 03B — Auditoría ARCH (review de segunda capa G5)

**Version:** 1.0
**Fecha:** 2026-07-18
**Estado:** ✅ **G5 GO** — pasa a G6 con **una condición de evidencia** (ver §5). G7 no procede aún.
**Modo activo:** Architect (review de segunda capa)
**Auditor:** AI-EM-ARCH (no productor de la entrega)
**Entrega auditada:** docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-03B-v1.0.md
**ADR:** ADR-055 (Aprobado CTO) · **Spec:** docs/specs/2026-07-18-mod12-existencias-reservas-fase03B-design.md
**Prompt:** docs/prompts/PROMPT-MOD12-EXISTENCIAS-RESERVAS-FASE-03B-v1.0.md
**Rama:** `feat/mod12-existencias-fase-03b-reservas`

---

## 1. Resumen ejecutivo

Fase de mayor riesgo del submódulo: cambia el guardado que impide la sobre-venta. Se auditó releyendo el código entregado y re-ejecutando los gates de forma independiente, con foco en el criterio de stop del prompt (§8b): **entregar reservas sin migrar las validaciones estaba prohibido**.

**Veredicto: G5 GO.** El criterio de stop se cumplió — la implementación es completa y, en un punto, **mejor de lo que el propio informe de fase declara**. No hay hallazgos bloqueantes de código.

**Pero G7 no procede todavía**, y no por formalismo: esta fase entrega un **invariante de runtime bajo transacciones concurrentes**, y toda su evidencia actual son tests unitarios con el `EntityManager` mockeado. No existe ninguna verificación contra PostgreSQL real — ni E2E manual (§7.5 del prompt, declarado pendiente por el ejecutor) ni Playwright automatizado (verificado: **no hay ningún test E2E de reservas**). Es la única fase del submódulo cuya corrección depende de comportamiento transaccional real, y es justo la que carece de evidencia de integración.

## 2. Conformidad con ADR-055 y decisiones D-F3B (verificado en código)

| Decisión | Resultado | Evidencia |
| --- | --- | --- |
| D-F3B-1 invariante `0 ≤ reserved ≤ onHand` | ✅ Conforme | `stock-balance.service.ts:196-208` — tres bordes: existencia negativa, reserva negativa, y reserva > existencia; mensajes en español con existencia/comprometido. También cubierto en la rama de creación de fila (`:165-175`) |
| D-F3B-2 motor único + `reservedDelta` | ✅ Conforme | `applyDeltaWithManager` acepta `reservedDelta` (`:17,145`); helper canónico `getAvailabilityWithManager` (`:99-129`). Redondeo a 2 decimales (`roundQty`) evita deriva de flotantes — buena decisión no exigida |
| D-F3B-3 reservar al crear | ✅ Conforme | `stock-issue.service.ts:356` → `reserveLineQuantity` valida disponible y aplica `reservedDelta: +qty` |
| D-F3B-4 ajustar al editar | ✅ Conforme | `:700` libera previas y `:721` reserva nuevas; además `:728-729` cubre **cambio de bodega origen** (libera en la anterior, reserva en la nueva) — borde no exigido explícitamente por la spec |
| D-F3B-5 liberar al cancelar | ✅ Conforme | `:768` |
| D-F3B-6 despacho no se auto-bloquea | ✅ Conforme | `:494-496` libera la reserva propia **antes** de validar disponible (`:498-512`), en la misma transacción, con comentario que cita la decisión. Idempotencia preservada: retorno temprano si ya hay `stockMovementId` (`:447-453`) → un reintento **no** libera dos veces |
| D-F3B-7 tres validaciones migradas | ✅ Conforme | (1) pre-despacho `:500-511` usa `availability.available`; (2) ledger `transfer` `stock-ledger.service.ts:313,329` delega en el helper canónico; (3) guardado del balance, §D-F3B-1 |
| D-F3B-8 movimientos directos respetan reservas ajenas | ✅ Conforme (por diseño) | Venta, consumo interno, OT y baja no tienen pre-chequeo explícito, pero **todas** pasan por `recordMovementWithManager` → `applyDeltaWithManager`, donde el invariante las rechaza. Cobertura estructural universal; test en `stock-ledger.service.spec.ts` («rejects transfer that would consume stock reserved by another issue») |
| D-F3B-9 conteo no rompe el invariante | ✅ Conforme | Test `cycle-count.service.spec.ts` — «rechaza cierre que dejaría existencia por debajo de lo reservado (CA-F3B-08)» |
| D-F3B-10 migración 072 | ✅ Conforme (**supera lo declarado**) | Ver §3 |
| D-F3B-11 portal | ✅ Conforme | `StockLocationsMatrix.tsx:414-417,623-640` — columnas Existencia/Reservado/Disponible con `available = onHand − reserved`; spec dedicado («no rotula onHand como disponible») |
| Sin endpoints ni columnas nuevas | ✅ Conforme | Solo cambios de comportamiento; sin DDL de columnas |

## 3. Corrección al informe de fase (a favor del ejecutor)

El informe de fase justifica CA-F3B-09 diciendo que la migración es «idempotente **a nivel runner** (skip si aplicada)» — una garantía más débil que la exigida por el prompt (§3.4: un `UPDATE` que *asigna*, nunca que acumula).

La lectura del SQL muestra que **la migración es genuinamente idempotente por sí misma**, con independencia del runner: `SET quantity_reserved = LEAST(sb.quantity_on_hand, COALESCE(c.reserved_qty, 0))` **asigna** el valor recalculado (`072_reconcile_stock_reservations.ts:41-44`). Además:

- **Acota y deja traza** cuando el reservado calculado excede la existencia (`LEAST` + `RAISE NOTICE` con el conteo, `:57-82`) — exactamente lo pedido.
- **Reconciliación completa**, no parcial: un segundo `UPDATE` pone a cero los saldos sin salidas abiertas (`:62-76`), evitando reservas huérfanas.
- Manejo correcto de `lot_id` nulo con `IS NOT DISTINCT FROM` (`:50,75`).
- Reversible: `down()` → `quantity_reserved = 0` (`:87-92`). Registrada en `runner.ts:32,139`.

Se recomienda corregir la evidencia de CA-F3B-09 en el informe de fase: la propiedad es más fuerte de lo documentado.

## 4. Gates re-ejecutados por el auditor (independientes)

| Gate | Resultado |
| --- | --- |
| Jest API `src/modules/inventory` | ✅ **33 suites / 256 tests PASS** |
| Jest portal `src/components/inventory` | ✅ **49 suites / 234 tests PASS** |
| Lint `@iwana/api` + `@iwana/portal` | ✅ Limpio |
| Typecheck `@iwana/api` + `@iwana/portal` + `@iwana/db` | ✅ Limpio |
| Cobertura de los puntos críticos | ✅ `stock-balance.service.spec.ts` cubre las **cuatro esquinas** del invariante exigidas por el prompt (reserva feliz, reserva sobre disponible, liberación bajo cero, existencia bajo reservado); issue cubre crear/rechazar/liberar-antes-del-ledger (D-F3B-5)/idempotencia/cancelar |
| **E2E (manual §7.5 o automatizado)** | ❌ **Ausente** — ver §5 |

## 5. Condición de evidencia para G6 → G7 (único hallazgo abierto)

**EV-1 — Falta evidencia de integración real; es la fase que más la necesita.**

Toda la verificación actual usa `EntityManager` mockeado. Eso prueba la *lógica* del invariante, no su *comportamiento transaccional*: que las reservas se apliquen y liberen dentro de la misma transacción, que un despacho concurrente no pueda saltarse el guardado, y que la migración 072 reconcilie correctamente sobre datos reales. En las fases 1, 2 y 3A existía smoke Playwright que cubría el flujo; **aquí no hay ninguno** (verificado: `e2e/tests/portal-inventory-scm.spec.ts` no contiene ningún test de reservas).

Dado que el propósito íntegro de 3B es impedir la sobre-venta en operación concurrente, **G7 no puede otorgarse solo con evidencia unitaria**. Condición para elevar a G7:

1. Ejecutar el **E2E manual del prompt §7.5** con `pnpm dev`: crear salida → verificar que el disponible baja y la existencia no → intentar transferir ese stock comprometido (debe dar 400) → despachar (existencia baja, reserva liberada) → cancelar otra salida (reserva liberada) → cerrar un conteo que dejaría existencia bajo lo reservado (rechazado).
2. Verificar la **migración 072 contra la base real**: aplicarla, **re-ejecutarla directamente** (no solo vía runner) para comprobar que no acumula, y revertirla.
3. Preferible (paridad con F1/F2/F3A): dejar un **smoke Playwright de reservas** que evite que esta garantía se rompa en el futuro sin que nadie lo note.

Sin esta evidencia, el riesgo residual no es teórico: un error de límite transaccional dejaría la sobre-venta abierta con todos los tests en verde.

## 6. Observación de gobernanza

La fase está en la rama `feat/mod12-existencias-fase-03b-reservas` y, al momento de esta auditoría, **sin commitear** (todo en working tree). Se recomienda commitear de inmediato para eliminar el riesgo de pérdida, y llevar a `main` siguiendo el patrón de las fases anteriores. La rama parte de `main` al día, sin divergencia.

## 7. Trazabilidad de gates

| Gate | Aprobador | Veredicto |
| --- | --- | --- |
| G5 (review técnico de segunda capa) | AI-EM-ARCH | ✅ **GO** — criterio de stop cumplido; sin hallazgos bloqueantes de código |
| G6 (experiencia, DS, QA) | PROD-UX / DS-OWNER / SR-QA | Pendiente — debe incluir **EV-1** como evidencia obligatoria |
| G7 (validación final) | AI-EM-ARCH | **No procede aún** — requiere G6 cerrado + EV-1 |
| Producción | CTO | Pendiente |

## 8. Decisión

**[G5] GO a G6.** La implementación cumple ADR-055 y las once decisiones D-F3B; el criterio de stop del prompt se respetó íntegramente y la migración supera lo documentado. **G7 queda condicionado a EV-1**: evidencia de integración real (E2E manual §7.5 + verificación de la migración contra base real), por tratarse de un invariante de runtime cuya corrección los tests unitarios con manager mockeado no pueden demostrar.
