# ADR-087: Cobertura de adjudicación y de conversión a OC como eje derivado, no como estado persistido

**Version:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-09-11
**Fecha aprobación:** 2026-09-11
**Aprobado por:** CTO Humano (G1) — opción 1, eje derivado `awardCoverage`; criterio: evitar refactorización futura del enum y sus guardas
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Modulo:** MOD12 Inventario / SCM — Compras
**Ownership:** MOD12 (estado de la solicitud de compra)
**PRD relacionado:** docs/prds/PRD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md (Aprobado) — RF-CMP-06
**PRD relacionado:** docs/prds/PRD-MOD12-COMPRAS-CIERRE-FLUJO-v1.0.md (Aprobado) — RF-06-01
**HLD relacionado:** docs/hlds/HLD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md (Aprobado)
**ADR base:** docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md (Aprobado)
**Origen:** Fase 30 — adjudicación por cotización con orden por proveedor; defecto detectado en la auditoría del 2026-09-11

---

## Contexto

### El defecto que obliga a decidir ahora

`createPurchaseOrderFromRequest` (`apps/api/src/modules/inventory/services/purchasing.service.ts:1004`)
marca `request.status = PurchaseRequestStatus.CONVERTED_TO_PO` de forma **incondicional** en sus dos
caminos de salida: el modo batch (`:1046`) y el modo legado (`:1065`). No comprueba si quedan líneas
de la solicitud sin ordenar.

La puerta de entrada del mismo método (`:1019`) exige `request.status === APPROVED`.

La combinación produce un estado terminal irreversible: **si se genera una orden de compra que cubre
solo parte de las líneas, la solicitud queda en `CONVERTED_TO_PO` y ninguna orden posterior podrá
emitirse jamás para las líneas restantes.** No existe transición de vuelta a `APPROVED` en ningún
punto del servicio.

Hoy el defecto está parcialmente enmascarado porque el portal genera todas las órdenes en una sola
llamada batch (`buildOrdersFromAwards` en
`apps/portal/src/components/inventory/purchase-orders-from-awards.ts:59` agrupa **todos** los awards
persistidos). Pero basta con adjudicar parte de las líneas y generar la orden para varar la
solicitud, y el requisito funcional de la Fase 30 —adjudicar a un proveedor lo que cumple y dejar el
resto abierto— convierte ese camino en el flujo principal.

### Lo que el arreglo obliga a nombrar

Corregir el defecto exige que la solicitud **permanezca en `APPROVED`** mientras queden líneas sin
ordenar. Eso deja al sistema sin una forma de expresar *«esta solicitud ya tiene una orden emitida,
pero no está terminada»*. Una solicitud recién aprobada y una solicitud con dos de cuatro productos
ya ordenados compartirían estado, y tanto la bandeja como el banner de siguiente acción
(`getPurchaseNextAction`, `apps/portal/src/components/inventory/purchase-workbench.ts:196`) las
leerían como equivalentes.

La pregunta que este ADR resuelve no es si hay que corregir el defecto —eso no está en discusión—
sino **dónde vive la información de cobertura**: en el enum de estado persistido o en un eje
derivado.

### El precedente que ya existe en el módulo

`PurchaseRequestFulfillmentStatus` (`packages/shared/src/enums/inventory/purchase-request-fulfillment-status.enum.ts`)
resuelve un problema de la misma familia —cuánto de lo ordenado ya se recibió— **sin persistir nada**.
Se calcula en `apps/api/src/modules/inventory/utils/purchase-request-fulfillment.ts:28` a partir de
los estados de línea y se adjunta en `purchasing-query.service.ts` tanto al listado como al detalle.
Está en producción y es la técnica que el programa ya tiene consolidada para este tipo de eje.

---

## Decision propuesta

### D1. La cobertura es un eje derivado llamado `awardCoverage`, calculado, nunca persistido

Se añade `PurchaseRequestAwardCoverage` en
`packages/shared/src/enums/inventory/purchase-request-award-coverage.enum.ts` con cinco valores:
`NOT_AWARDED`, `PARTIALLY_AWARDED`, `FULLY_AWARDED`, `PARTIALLY_ORDERED`, `FULLY_ORDERED`.

Se resuelve en un helper puro nuevo,
`apps/api/src/modules/inventory/utils/purchase-request-award-coverage.ts`, a partir de los
`lineStatus` de las líneas no canceladas ni rechazadas, siguiendo literalmente el patrón del helper
de fulfillment. Se adjunta en `getRequestDetail` y en `listRequests`
(`purchasing-query.service.ts`), igual que `fulfillmentStatus`.

### D2. `PurchaseRequestStatus` no cambia

No se añade `PARTIALLY_CONVERTED_TO_PO` ni ningún otro valor. El enum persistido sigue expresando el
**ciclo administrativo** de la solicitud —quién la aprobó, si fue rechazada, si ya se convirtió— y no
el grado de avance del abastecimiento.

### D3. Una solicitud parcialmente ordenada permanece en `APPROVED`

`createPurchaseOrderFromRequest` deja de marcar `CONVERTED_TO_PO` incondicionalmente y pasa a
recalcular, dentro de la misma transacción, con `resolvePurchaseRequestConversion(lines)`: solo si
**toda** línea no cancelada ni rechazada está en `ORDERED | PARTIALLY_RECEIVED | RECEIVED` la
solicitud pasa a `CONVERTED_TO_PO`. En cualquier otro caso permanece en `APPROVED`.

La guarda de entrada (`:1019`) **no se modifica**. Con D3 deja de ser un obstáculo por sí sola: una
solicitud parcialmente ordenada sigue siendo `APPROVED` y por tanto vuelve a entrar sin excepción
alguna en el método.

### D4. El backfill de datos varados es parte de la decisión, no una tarea aparte

La migración tenant `128_harden_purchase_request_line_awards.ts` devuelve a `APPROVED` toda solicitud
en `CONVERTED_TO_PO` que conserve líneas en `OPEN | PENDING_QUOTE | AWARDED`. Sin este paso, las
solicitudes ya varadas en producción siguen muertas aunque el código quede corregido: el defecto no
se arregla solo hacia adelante.

El `down` de la migración **no revierte** el backfill. Es una corrección de datos idempotente y no
destructiva; revertirla volvería a varar solicitudes legítimas.

### D5. El vocabulario visible no expone el enum

Las etiquetas viven en `apps/portal/src/components/inventory/inventory-labels.ts` en español sentence
case —«Adjudicación parcial», «Órdenes parciales»— conforme a la regla de `AGENTS.md` de no mostrar
enums crudos. `getPurchaseNextAction` aprende el eje: con `PARTIALLY_ORDERED` el banner indica cuántos
productos quedan por adjudicar en vez de dar la solicitud por cerrada.

### D6. La cancelación de órdenes revierte el estado derivado (extensión de D3, 2026-09-12)

D3 corrige la conversión hacia adelante; la cancelación de una OC dejaba los derivados rancios: el
`lineStatus` quedaba en `ORDERED` sin orden viva y la solicitud permanecía en `CONVERTED_TO_PO` para
siempre — readjudicar resultaba inalcanzable desde la UI aunque el servidor lo permitía
(`revokeLineAward` solo mira órdenes vivas). `cancelPurchaseOrder` pasa a recalcular dentro de su
transacción, en espejo de `syncRequestConversionAfterOrders`:

1. Cada línea referenciada por la orden cancelada que esté en `ORDERED` vuelve a `AWARDED` cuando las
   órdenes vivas restantes ya no cubren lo adjudicado (misma aritmética en centavos que el tope de
   creación). Nunca se degradan `PARTIALLY_RECEIVED`/`RECEIVED`: la mercancía entró y no retrocede.
2. La solicitud sale de `CONVERTED_TO_PO` → `APPROVED` solo si `resolvePurchaseRequestConversion`
   deja de cumplirse; cualquier otro estado no se toca.

Con esto la ruta de readjudicación existente (revocar → readjudicar → nueva OC) se reactiva sola en
el portal, sin endpoints ni flujo nuevo. El backfill de D4 (migración 128) no cubre el subcaso
legado «CONVERTED_TO_PO con líneas ORDERED y todas las OC canceladas»; los datos que quedaran en él
se reparan con corrección puntual (no existe producción con este estado).

---

## Alternativas descartadas

### A. Añadir `PARTIALLY_CONVERTED_TO_PO` a `PurchaseRequestStatus`

Es la opción intuitiva: un solo eje, filtrable e indexable directamente en SQL sin subconsulta.

Descartada por el costo de auditoría y el riesgo asimétrico. `PurchaseRequestStatus` está respaldado
por un tipo enumerado de PostgreSQL creado en `047_create_inventory_scm_module.ts:110` y presente en
**todos** los esquemas tenant; ampliarlo obliga a un `ALTER TYPE ... ADD VALUE` por esquema. Peor: un
valor nuevo obliga a revisar **cada** guarda que hoy compara contra `APPROVED` —aprobación, registro
de cotizaciones, adjudicación (`createLineAwards:769`), creación de orden (`:1019`), cancelación,
cierre de ronda RFQ—, y cada omisión se manifiesta como un bloqueo silencioso idéntico al defecto que
este ADR corrige. El backfill sería además ambiguo para el histórico: no hay forma fiable de
distinguir retroactivamente una solicitud legítimamente cerrada de una varada.

Conceptualmente, mezcla dos ejes distintos: el estado administrativo de la solicitud y el grado de
avance del abastecimiento. Esa confusión ya se resolvió una vez en este mismo módulo con
`fulfillmentStatus`.

### B. Persistir un contador de cobertura en `purchase_requests`

Columnas tipo `awarded_line_count` / `ordered_line_count` mantenidas por el servicio. Descartada por
ser estado derivado duplicado: introduce una fuente de verdad secundaria que puede desincronizarse de
`purchase_request_lines` ante cualquier ruta que modifique líneas sin pasar por el servicio, y no
aporta nada que el cálculo no dé.

### C. No expresar la cobertura en absoluto

Corregir solo el defecto (D3) y dejar que la interfaz infiera el avance contando líneas en el
cliente. Descartada porque la bandeja de solicitudes (`listRequests`) no carga líneas: el badge de la
tabla no tendría dato, y cada consumidor reimplementaría la regla por su cuenta, que es exactamente
el origen de la divergencia que `fulfillmentStatus` vino a cerrar.

---

## Consecuencias

### Positivas

- El defecto de solicitud varada queda cerrado sin tocar el enum persistido ni ninguna guarda de estado.
- La decisión es reversible por borrado: eliminar un eje derivado no deja datos que migrar.
- Un solo lugar calcula la cobertura; listado y detalle leen el mismo helper.
- El backfill rescata las solicitudes ya varadas en producción.

### Costos y tradeoffs

- **Tres ejes conviviendo** en la interfaz: estado administrativo, `fulfillmentStatus` y
  `awardCoverage`. Es carga cognitiva real y obliga a cuidar el vocabulario visible (D5).
- **Filtrar por cobertura en SQL exige `EXISTS` correlacionado** sobre `purchase_request_lines`, no un
  `WHERE status = ...` indexado. Existe precedente en el preset `pendingReceipt` de
  `purchasing-query.service.ts`, así que el patrón no es nuevo, pero el costo por consulta es mayor
  que el de una columna indexada.
- El cálculo se repite en cada lectura del listado. Con el volumen actual de solicitudes por tenant es
  despreciable; si el listado creciera a decenas de miles por tenant habría que revisar la agregación.

### Riesgos aceptados

- **Riesgo de reintroducción del defecto.** Nada impide a una sesión futura volver a escribir
  `CONVERTED_TO_PO` incondicionalmente. Mitigación obligatoria: test de regresión explícito que cubra
  «2 de 4 líneas ordenadas ⇒ la solicitud sigue en `APPROVED`».
- **Riesgo de confusión de vocabulario** entre `fulfillmentStatus` y `awardCoverage`, que describen
  tramos contiguos del mismo recorrido. Mitigación: etiquetas revisadas por AI-PROD-UX en la spec de
  fase antes de implementar.

---

## Reglas de implementacion

1. El helper de cobertura es **puro**: recibe líneas, devuelve un valor del enum. Sin acceso a
   repositorio, sin contexto de tenant, testeable sin base de datos.
2. `resolvePurchaseRequestConversion` se invoca **dentro de la misma transacción** que crea las
   órdenes, nunca después de confirmar.
3. Líneas en `CANCELLED` o `REJECTED` se excluyen del cálculo: una línea cancelada no puede impedir
   que la solicitud se dé por convertida.
4. `validateLineAward` (`purchasing-policy.service.ts:79`) **no se modifica en esta decisión**. Se le
   añade un test-guarda que congele su comportamiento actual.
5. El backfill de D4 se ejecuta con conteo previo por tenant y queda registrado en el informe de fase.

## Impacto (tenant / seguridad / escala / regulacion)

- **Multi-tenant:** el helper opera sobre líneas ya filtradas por `tenantId` dentro de
  `runInTenantSchema`; no introduce ninguna consulta cross-tenant. El backfill de D4 corre por esquema
  tenant, como toda migración de `migrations/tenant/`.
- **Seguridad:** sin superficie nueva. La cobertura es un campo de lectura adjunto a respuestas que ya
  exigen `inventory.purchasing.read`. No transporta PII.
- **Escala:** el cálculo del listado debe resolverse con **una sola consulta agregada**, siguiendo el
  patrón que `fulfillmentStatus` ya usa en `listRequests`; nunca una consulta por solicitud.
- **Regulación:** sin impacto. La decisión no altera documentos fiscales ni registros con efecto DIAN;
  las órdenes de compra emitidas no cambian de forma ni de contenido.

## Requiere ADR: sí (este) · Requiere CTO: sí — **aprobado 2026-09-11 (G1 GO, opción 1)**

Motivo de la escalación: la alternativa A implicaría un cambio de enum respaldado en base de datos en
todos los esquemas tenant. Aunque la recomendación es no hacerlo, la decisión de **no** ampliar el
enum de estado es igual de estructural que ampliarlo, y fija el modelo de estado de compras para las
fases siguientes.

Decisión requerida antes de: inicio del track BE-2 de la Fase 30.

## Referencias

- `apps/api/src/modules/inventory/services/purchasing.service.ts:1004-1071` — el defecto
- `apps/api/src/modules/inventory/utils/purchase-request-fulfillment.ts:28` — precedente de eje derivado
- `apps/api/src/modules/inventory/services/purchasing-query.service.ts` — punto de adjunción
- `packages/database/src/migrations/tenant/047_create_inventory_scm_module.ts:110` — tipo enumerado en BD
- `docs/prds/PRD-MOD12-COMPRAS-CIERRE-FLUJO-v1.0.md:67` — RF-06-01, regla de parcialidad vigente
- `docs/specs/2026-09-11-mod12-compras-adjudicacion-matriz-design.md` — spec de la fase que consume esta decisión
