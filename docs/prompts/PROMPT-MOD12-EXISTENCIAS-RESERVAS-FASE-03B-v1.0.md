# PROMPT - MOD12 Existencias — Reservas efectivas — Fase 03B

> **Estado: Emitido (G4) — EJECUTABLE** (criterios de entrada satisfechos 2026-07-18: **ADR-055 aprobado por el CTO** + Fase 3A cerrada con G7 GO y verificación independiente; ADR-016). Recordatorio de riesgo: esta fase cambia el guardado que impide la sobre-venta — ver el criterio de stop de §8.

## Vinculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`
- Convencion documental: `{TIPO}-{MODULO}-{FASE}-v{VERSION}.md`

## Modulo

- Nombre: Inventario / SCM — submódulo Existencias (stock)
- Codigo: MOD12
- Fase: 03B (Reservas efectivas)
- Version: 1.0
- Fecha: 2026-07-18
- Generado por: AI-EM-ARCH
- Destinatario: AI-SR-FULL (backend) + AI-FE-PLATFORM (portal)
- Nombre de archivo destino: `PROMPT-MOD12-EXISTENCIAS-RESERVAS-FASE-03B-v1.0.md`

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** el stock comprometido por salidas abiertas queda apartado en `quantity_reserved`, y **todas** las rutas que consumen inventario deciden contra `disponible = existencia − reservado`, cerrando la sobre-venta de material ya prometido.
- **Sí entra:** extensión de `applyDeltaWithManager` con `reservedDelta`; reserva/liberación en el ciclo de `StockIssue` (crear, editar, cancelar, despachar); migración de las tres validaciones de disponible; migración tenant **072** de reconciliación; corrección de `StockLocationsMatrix`; tests y evidencia.
- **No entra:** endpoints nuevos (esta fase cambia comportamiento, no contrato de rutas); caducidad automática de reservas; reservas de origen distinto a `StockIssue`; bloqueo pesimista de filas; costeo/valoración (Fase 4).

> **Naturaleza de la fase — leer antes de empezar.** Esta es la fase de mayor riesgo del submódulo: toca el guardado anti-negativo del que dependen despacho, transferencia y conteo. **Una implementación parcial es peor que ninguna**: escribir `reserved` sin migrar las validaciones (paso 4) deja reservas cosméticas y sobre-venta silenciosa. Si no se puede completar el paso 4, se detiene y se escala (§8).

## 2. Artefactos de entrada obligatorios

- PRD: `docs/prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md` §7 (contrato Fase 3B)
- ADR: `docs/adrs/ADR-055-Reservas-Efectivas-Disponible-Comprometido.md` (**debe estar Aprobado**)
- Spec de diseño: `docs/specs/2026-07-18-mod12-existencias-reservas-fase03B-design.md` (D-F3B-1…11, máquina de reserva, CA)
- ADR-054 + cierre G7 de Fase 3A (interacción conteo ↔ reservas)
- HLD: `docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md`
- Skills: `nestjs-expert`, `database-migration` + `postgresql`, `testing-patterns`, `frontend-dev-guidelines`, `core-components`, `system-vocabulary-review`, `openapi-spec-generation`

## 3. Instrucciones para el fullstack

### 3.1 Motor de saldos (SR-FULL) — hacer primero, es el cimiento

1. **`StockBalanceService.applyDeltaWithManager`** (`apps/api/src/modules/inventory/services/stock-balance.service.ts`): añadir un `reservedDelta` opcional al input, aplicándolo junto al delta de existencia sobre la misma fila y en la misma transacción.
   - Sustituir el guardado actual (`onHand + delta < 0` → error) por la verificación del **invariante D-F3B-1**: tras aplicar ambos deltas debe cumplirse `0 ≤ reserved_new ≤ onHand_new`. Un intento de dejar existencia por debajo de lo reservado se rechaza con `BadRequestException` en español indicando existencia y comprometido.
   - Este método sigue siendo el **único** escritor de `quantity_on_hand` y `quantity_reserved`. Ningún otro servicio los escribe.
2. **Helper de disponible**: exponer en el mismo servicio el cálculo de disponible por tupla (item × bodega × lote × condición) para que los llamadores no lo re-deriven cada uno por su cuenta.

### 3.2 Ciclo de la reserva en salidas (SR-FULL)

3. **`StockIssueService`** (`services/stock-issue.service.ts`), aplicando la máquina de la §4 del spec:
   - `create` (`:233-300`): reservar `requestedQty` por línea dentro de la transacción existente; si el disponible no alcanza, 400 sin crear el documento.
   - `update` (`:553-652`): ajustar la reserva por el delta de `requestedQty` (validar disponible al aumentar; liberar al disminuir).
   - `cancel` (`:654-677`): liberar la reserva completa de las líneas.
   - `dispatch` (`:369-551`): en la **misma transacción**, liberar `requestedQty` de reserva y descontar `dispatchedQty` de existencia (D-F3B-6) — así la reserva propia no bloquea su propio despacho y un despacho parcial no deja reserva huérfana. Mantener la idempotencia existente por `stockMovementId` / `idempotencyKey`.
   - Cuidado con la **doble aplicación**: la liberación debe ocurrir una sola vez por documento aunque se reintente el despacho.

### 3.3 Migrar las validaciones a disponible (SR-FULL) — paso crítico

4. Los tres puntos verificados pasan a decidir contra `onHand − reserved`:
   - `stock-issue.service.ts:111-133` (`getAvailableQuantity`, usado en pre-despacho `:433-444`).
   - `stock-ledger.service.ts:910-932` (`getAvailableQuantity`, usado por transferencia y salidas directas).
   - El guardado del balance, ya cubierto en el paso 1.
   Con esto, transferencia, venta, consumo interno, OT y baja dejan de poder consumir stock comprometido ajeno (D-F3B-8).

### 3.4 Migración de reconciliación (SR-FULL)

5. **`packages/database/src/migrations/tenant/072_reconcile_stock_reservations.ts`**: recalcula `quantity_reserved` de cada fila de `stock_balances` a partir de las líneas de salidas **abiertas** (documentos que no estén `DISPATCHED`, `RECEIVED` ni `CANCELLED`), agrupando por la misma tupla que identifica el saldo. Debe ser **idempotente** (un `UPDATE` que *asigna* el valor recalculado, nunca que acumula) y **reversible**: `down()` pone `quantity_reserved = 0`. Registrar a mano en `TENANT_MIGRATIONS` (`runner.ts`), import + entrada al final del array.
   - Si la reconciliación detectara una tupla donde el reservado calculado excede la existencia (dato heredado inconsistente), la migración debe **acotar al máximo disponible y dejar traza**, no violar el invariante.

### 3.5 Portal (FE-PLATFORM)

6. **`StockLocationsMatrix.tsx`** (`:135-138` agregado y `:600-605` desglose): dejar de rotular `quantityOnHand` como "Disponible". Mostrar existencia, reservado y disponible (= existencia − reservado), coherente con "Por producto".
7. **Verificar (no reescribir)** `stock-overview.ts` y la reposición sugerida de Fase 2: ya calculan disponible restando reservas; con reservas reales deben seguir correctos — cubrir con tests que usen `quantityReserved > 0`.
8. **Mensajes de error**: mapear los 400 de disponible insuficiente a texto claro en español (existencia y comprometido), con `PortalAlert`/`role="alert"` y foco al error (WCAG 2.2 AA).

### 3.6 Contratos, seguridad, tenant

- Sin endpoints ni shapes nuevos; cambia comportamiento (§5 del spec). Cualquier necesidad de endpoint nuevo → `[BLOQUEO]` a AI-EM-ARCH.
- Tenant desde JWT; `runInTenantSchema`; toda mutación de saldo dentro de transacción.
- Sin cambios de RBAC.

## 4. Restricciones no negociables

- `quantity_reserved` **solo** se muta vía `applyDeltaWithManager`; el invariante se verifica ahí, no en los llamadores.
- **No entregar la fase a medias**: reservas escritas sin validaciones migradas = sobre-venta. Es criterio de stop (§8).
- Sin columnas nuevas; migración 072 idempotente y reversible.
- Sin locks distribuidos, sin CQRS, sin patrones fuera del baseline.
- Sin `any`; texto visible en español sentence case, sin enums crudos.
- Solo append/edición acotada en archivos compartidos; pnpm (nunca npm/yarn).

## 5. Entregables tecnicos obligatorios

- Motor: `applyDeltaWithManager` con `reservedDelta` + invariante; helper de disponible.
- Salidas: reserva/ajuste/liberación/consumo en `create`/`update`/`cancel`/`dispatch`.
- Validaciones migradas en los tres puntos.
- Migración 072 + registro en runner.
- Portal: `StockLocationsMatrix` corregida; mensajes de error; verificación de `stock-overview` y reposición.
- Tests:
  - `stock-balance.service.spec.ts`: invariante en sus cuatro esquinas (reservar por encima del disponible, liberar por debajo de cero, dejar existencia bajo lo reservado, caso feliz).
  - `stock-issue.service.spec.ts`: reserva al crear, ajuste al editar, liberación al cancelar, **despacho que libera y descuenta**, despacho parcial, reintento idempotente, y el caso D-F3B-5 (la reserva propia no bloquea su despacho).
  - `stock-ledger.service.spec.ts`: transferencia/venta/baja rechazadas contra stock comprometido ajeno.
  - `cycle-count.service.spec.ts`: cierre de conteo que dejaría existencia < reservado es rechazado (CA-F3B-08).
  - `replenishment.service.spec.ts`: sugerencias correctas con `quantityReserved > 0`.
  - Portal: matriz por bodega con reservado; specs de `stock-overview` con reservas reales; mensaje de disponible insuficiente.
  - Migración: aplicar y revertir en dev; verificar idempotencia ejecutándola dos veces.
- OpenAPI: sin rutas nuevas; actualizar descripciones si cambian los errores documentados.

## 6. Entregables documentales obligatorios

- Informe de fase `docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-03B-v1.0.md`.
- Actualización del informe vivo `docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-DEFINICION-v1.0.md`.
- Si un desvío cambia el invariante o la máquina de reserva → actualizar ADR-055 vía AI-EM-ARCH (no parchear en implementación).

## 7. Criterios de aceptacion

CA-F3B-01…11 del spec (§7). Gates del ejecutor:

1. `pnpm db:migrate:all` aplica 072 en dev; re-ejecutarla **no** duplica reservas; `migration:revert` la revierte.
2. `pnpm --filter @iwana/api test -- src/modules/inventory` (**directorio completo** — lección de Fase 1: no solo las suites nuevas).
3. `pnpm --filter @iwana/portal test`.
4. `pnpm lint && pnpm typecheck` (obligatorio; no omitir lint).
5. E2E manual con `pnpm dev`: crear salida → verificar que el disponible baja y la existencia no; intentar transferir ese stock comprometido → 400; despachar la salida → existencia baja y reserva se libera; cancelar otra salida → reserva liberada; cerrar un conteo que dejaría existencia bajo lo reservado → rechazado.
6. Verificar que la reposición sugerida (F2) y "Por producto" muestran disponible correcto con reservas reales.

## 8. Criterio de stop/go

- Detenerse si: (a) ADR-055 no está aprobado; (b) **no se puede completar la migración de las tres validaciones** (§3.3) — entregar reservas sin ellas está prohibido; (c) la reconciliación 072 encuentra inconsistencias que el invariante no puede acotar; (d) aparece necesidad de endpoint, columna o patrón nuevo.
- Documentar causa en el informe de fase y escalar a AI-EM-ARCH con opciones (máx. 3) y recomendación.

## 9. Criterio de salida de la fase

- Invariante `0 ≤ reserved ≤ onHand` sostenido y verificado por tests en todas las rutas que mutan saldo.
- Ciclo completo de reserva probado (crear/editar/cancelar/despachar, incluido despacho parcial e idempotente).
- Sobre-venta cerrada: movimientos directos no consumen stock comprometido ajeno.
- Migración 072 aplicada, idempotente y revertible.
- Portal coherente: existencia / reservado / disponible en Por producto y Por bodega.
- Suites completas (API y portal) + lint + typecheck en verde; informe de fase e informe vivo actualizados; listo para G6 y luego G7.
