# ADR-055: Reservas efectivas de stock — el disponible descuenta lo comprometido

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
**ADR antecedente:** docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md · docs/adrs/ADR-054-Conteo-Fisico-Inventario-Ciclico.md
**Spec de diseño:** docs/specs/2026-07-18-mod12-existencias-reservas-fase03B-design.md
**Prompt de ejecucion:** docs/prompts/PROMPT-MOD12-EXISTENCIAS-RESERVAS-FASE-03B-v1.0.md (**ejecutable** tras esta aprobación)

---

## Contexto

La columna `stock_balances.quantity_reserved` existe desde la migración `047` y **nunca se escribe**: `StockBalanceService.applyDeltaWithManager` solo muta `quantityOnHand`, por lo que `reserved` es siempre `0`. En consecuencia, "disponible" y "existencia física" son hoy el mismo número.

Esto produce un hueco operativo real: una salida de material (`StockIssue`) creada y aprobada **no aparta nada**. Entre su creación y su despacho, cualquier otra operación —otra salida, una transferencia, una venta— puede consumir ese mismo stock. El primero que despacha gana y el segundo falla en el mostrador, cuando el material ya fue prometido a una cuadrilla.

**Estado verificado del código (factibilidad 2026-07-18):**

- `StockIssue` descuenta stock **solo en `dispatch`** (`stock-issue.service.ts:369-551` → ledger); `create` (`:233-300`) y `cancel` (`:654-677`) no tocan saldos.
- Las validaciones de "disponible" miran **solo `quantityOnHand`**, ignorando lo comprometido, en tres puntos: `stock-issue.service.ts:111-133` (pre-despacho), `stock-ledger.service.ts:910-932` (transferencia y salidas directas) y el guardado anti-negativo de `stock-balance.service.ts:105-107` (`onHand + delta < 0`).
- Ya hay **dos consumidores que asumen la semántica correcta** y hoy funcionan por accidente (porque `reserved` es 0): `replenishment.service.ts:141` calcula `available = onHand − reserved` (Fase 2) y, en el portal, `stock-overview.ts:89` hace lo mismo para "Por producto" y el drawer de detalle.
- `StockLocationsMatrix.tsx:135-138,600-605` rotula una columna "Disponible" pero muestra `onHand` — **sobreestimaría** en cuanto `reserved` deje de ser 0.

La Fase 3 se dividió por asimetría de riesgo (ADR-054, decisión CTO 2026-07-18): **3A conteos** (aditivo, ya cerrado con G7 GO) y **3B reservas** (este ADR), que sí modifica rutas críticas de despacho y el guardado que impide saldos negativos. Implementar reservas a medias —escribir `reserved` sin migrar las validaciones— produciría **sobre-venta**: es el riesgo que este ADR debe cerrar de forma completa o no abrirse.

---

## Decision

Se adoptan las **reservas efectivas**: el stock comprometido por salidas abiertas se aparta en `quantity_reserved`, y todo el sistema pasa a decidir contra **disponible = existencia − reservado**.

Características de la decisión:

1. **Invariante central del saldo.** Para toda fila de `stock_balances` se sostiene `0 ≤ quantity_reserved ≤ quantity_on_hand`, y se define `disponible = quantity_on_hand − quantity_reserved`. Este invariante es la regla que impide la sobre-venta y se valida en el único punto de mutación de saldos.

2. **Ciclo de la reserva atado al ciclo de la salida.** La reserva la crea y la libera el documento `StockIssue`, no el operador:
   - **Crear** salida (estado `REQUESTED`): reserva `requestedQty` por línea. Si el disponible no alcanza, la creación falla con 400 en español (no se crea una promesa que el inventario no puede sostener).
   - **Editar** salida: ajusta la reserva por el delta de `requestedQty` (validando disponible al aumentar).
   - **Cancelar**: libera la reserva completa; sin efecto en existencia.
   - **Despachar**: libera la reserva (`requestedQty`) y descuenta la existencia (`dispatchedQty`) **en la misma transacción**, de modo que la reserva propia nunca bloquea su propio despacho ni queda huérfana si se despacha menos de lo pedido.

3. **Un solo motor de saldos, extendido.** `StockBalanceService.applyDeltaWithManager` sigue siendo el **único** punto que muta saldos; se extiende para aceptar un `reservedDelta` opcional junto al delta de existencia, y es allí donde se verifica el invariante del punto 1. Ningún servicio escribe `quantity_reserved` por su cuenta.

4. **Las validaciones de disponible migran a `onHand − reserved`.** Los tres puntos identificados pasan a decidir contra disponible: el pre-despacho de salidas, el `getAvailableQuantity` del ledger (transferencias y salidas directas) y el guardado del balance, que pasa de "no dejar existencia negativa" a "no dejar existencia por debajo de lo reservado". Esta es la parte que convierte la reserva en efectiva en lugar de cosmética.

5. **Los movimientos directos respetan reservas ajenas.** Transferencia, venta, consumo interno, orden de trabajo y baja no reservan (son operaciones inmediatas, sin ciclo de vida), pero **sí validan contra disponible**: no pueden consumir stock comprometido por una salida abierta de otro documento.

6. **Entradas y conteos no alteran la reserva.** Recepción de compra, compra de mostrador y retorno solo suman existencia (el disponible sube en consecuencia). El **cierre de conteo físico (ADR-054)** ajusta existencia contra lo contado sin tocar `reserved`; si un conteo dejara la existencia por debajo de lo reservado, el invariante lo rechaza y el operador debe resolver primero las salidas comprometidas — comportamiento deliberado: el conteo no puede "desaparecer" material ya prometido sin decisión explícita.

7. **Sin columnas nuevas; una migración de reconciliación.** La reserva de una salida abierta es exactamente la suma de `requestedQty` de sus líneas, de modo que no se agregan columnas. Se emite la migración tenant **072** que **recalcula** `quantity_reserved` desde las salidas abiertas existentes (idempotente, ejecutable más de una vez sin efecto acumulativo), para que el invariante sea cierto desde el primer arranque y no queden salidas heredadas sin respaldo de reserva.

8. **El disponible es el número que ve el usuario.** El portal muestra existencia, reservado y disponible de forma consistente; `StockLocationsMatrix` deja de rotular `onHand` como "Disponible" y pasa a restar lo reservado. `stock-overview.ts` y la reposición sugerida (Fase 2) ya calculan disponible correctamente y quedan validados, no reescritos.

---

## Reglas de boundary

1. Las reservas viven dentro de MOD12 `InventoryModule`; no crean bounded context nuevo.
2. `quantity_reserved` solo se muta a través de `StockBalanceService.applyDeltaWithManager`; ningún otro servicio la escribe.
3. El invariante `reserved ≤ onHand` se verifica en ese mismo punto, no distribuido en los llamadores.
4. No se introducen patrones nuevos (sin locks distribuidos, sin CQRS): la consistencia se apoya en la transacción de PostgreSQL ya usada por el ledger.

---

## Alternativas descartadas

1. **Reservar en `APPROVED` en lugar de al crear.** Deja una ventana entre la solicitud y la aprobación en la que el material puede desaparecer, que es justo el problema a resolver. Se descarta: reservar al crear es la protección que el operador espera.
2. **Escribir `reserved` sin migrar las validaciones.** Sería una reserva cosmética: el número se mostraría pero cualquier ruta podría consumir el stock comprometido, con **sobre-venta** silenciosa. Es el modo de fallo que este ADR existe para evitar; se descarta explícitamente.
3. **Columna `reservedQty` por línea de salida.** Daría trazabilidad fina de cuánto reservó cada línea, a costa de una migración de schema y de un segundo lugar donde la verdad puede desincronizarse. Innecesaria: la reserva es derivable de `requestedQty` de líneas abiertas, y la migración 072 la reconcilia.
4. **Bloqueo pesimista de filas de saldo durante todo el ciclo de la salida.** Correcto en teoría, inviable en operación: mantendría bloqueos abiertos durante horas o días entre creación y despacho.
5. **Reservar también en transferencias.** Las transferencias son inmediatas (una sola operación que descuenta y suma); reservar y liberar en el mismo instante añade complejidad sin beneficio.

---

## Impacto

- **Multi-tenant:** sin cambios de aislamiento; la migración 072 corre por schema tenant vía `TENANT_MIGRATIONS`.
- **Seguridad:** sin nuevas superficies ni cambios de RBAC. Los mensajes de rechazo por disponible insuficiente no exponen datos de otros documentos.
- **Escala:** el cálculo de disponible es aritmética sobre la fila de saldo ya leída; sin consultas adicionales en el camino crítico. La reconciliación 072 es un recálculo agregado, acotado a las salidas abiertas del tenant.
- **Regulación:** sin requisito regulatorio específico citado.
- **Riesgo funcional principal:** un cambio de comportamiento **visible** — operaciones que hoy pasan podrían rechazarse por disponible insuficiente cuando el stock está comprometido. Es el efecto buscado, y debe comunicarse con mensajes claros en español que indiquen cuánto hay comprometido.
- **Reversibilidad:** la migración 072 revierte poniendo `quantity_reserved = 0` (vuelve al estado previo, donde disponible = existencia).

---

## Consecuencias

**Positivas:** elimina la sobre-venta de material prometido; el disponible pasa a ser un número confiable para operación y para la reposición sugerida; corrige la inconsistencia de `StockLocationsMatrix`; habilita a futuro reservas por orden de trabajo o por contrato sin volver a tocar el motor de saldos.

**Negativas / deuda aceptada:** operaciones que antes pasaban ahora pueden rechazarse (efecto buscado, requiere buena comunicación en UI); las salidas abiertas de larga vida inmovilizan stock hasta despacharse o cancelarse — no se incluye caducidad automática de reservas en 3B.

**Requiere ADR posterior:** caducidad/expiración automática de reservas y reservas de origen distinto a `StockIssue` (orden de trabajo, contrato comercial), si el negocio las pide.
