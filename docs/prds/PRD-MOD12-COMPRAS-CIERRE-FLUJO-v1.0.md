# PRD - MOD12 Compras: Cierre y completitud del flujo "Trabajar solicitud"

**Version:** 1.0
**Estado:** Aprobado por CTO (GO Fase 06 confirmado 2026-07-14)
**Fecha:** 2026-07-14
**Modo activo:** Product Architect + Architect (combinado)
**Generado por:** AI-EM-ARCH
**Modulo:** MOD12 Inventario / SCM — sub-dominio Compras (purchasing)
**Precedencia:** `AGENTS.md` > CTO/ADRs > PRD sistema > HLD MOD12 > Protocolo Multiagente > este PRD.

**Documentos antecesores (vigentes, no se reemplazan):**
- `docs/prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md` (RF-INV-03..06, RF-INV-23/24 Fase 2)
- `docs/prds/PRD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md`
- `docs/prds/PRD-MOD12-PROVEEDORES-v1.0.md`
- `docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md`
- `docs/adrs/ADR-051-RFQ-Solicitud-Cotizacion-Invitaciones.md`
- `docs/adrs/ADR-052-Alta-Proveedores-SupplierProfile-Puerto-Comando-Parties.md`

---

## 1. Contexto

El ciclo de compras de MOD12 (`solicitud → RFQ/cotizaciones → adjudicacion → aprobacion → orden de compra → recepcion → stock`) esta implementado en backend hasta la Fase 05 (alta de proveedores) y auditado. Sin embargo, una revision funcional de la pantalla `/dashboard/inventory?tab=purchasing` ("Trabajar solicitud", `PurchaseRequestWorkbenchDrawer`) detecto que el flujo **no es cerrable de punta a punta desde el portal** y que varios estados del dominio son inalcanzables:

- **Adjudicacion (awards) sin superficie de UI.** El backend esta completo (`POST /purchasing/requests/:id/awards`, `PurchasingService.createLineAwards`, estado de linea `AWARDED`, agregado `detail.awards`), pero ningun componente del portal lo invoca ni lo renderiza. Como `createPurchaseOrderFromRequest` **exige** que cada linea de la solicitud tenga adjudicacion para el proveedor de la OC (`purchasing.service.ts`), el operador no puede generar la OC por linea/multiproveedor desde el portal.
- **`REJECTED` y `CANCELLED` inalcanzables.** Existen en los enums `PurchaseRequestStatus` y `PurchaseRequestLineStatus`, con etiquetas y badges en el portal, pero **ni backend ni frontend** los asignan: no hay endpoint ni accion. Una solicitud solo avanza; nunca puede rechazarse ni cancelarse.
- **Estados de RFQ/OC/recepcion definidos pero sin usar** (`PurchaseRfqStatus.CANCELLED`, invitacion `CANCELLED`; `PurchaseOrderStatus.DRAFT/PENDING_APPROVAL/CANCELLED/CLOSED`).
- **Deuda documentada:** sin edicion de solicitud; `reorderPoint`/`targetStock`/`minimumOrderQty`/`orderMultiple` almacenados en el item pero no consumidos (RF-INV — reabastecimiento); sin evaluacion de proveedores (RF-INV-24, ya marcado Fase 2).
- **Pulido pendiente:** moneda fija `'COP'` en cotizacion y RFQ; motivo de declinacion de RFQ fijo; invitaciones muestran "Proveedor invitado" en vez del nombre real; `getPurchaseNextAction` no afirma estados terminales; consulta de awards con patron N+1 en `getRequestDetail`.

**Valor de negocio:** dejar operable el ciclo de compras completo para un ISP (adjudicar por linea al mejor proveedor, cerrar solicitudes que no procederan, disparar reabastecimiento por punto de reorden y visibilizar el desempeno del proveedor) reduce compras fuera de proceso y mejora la trazabilidad exigible para conciliacion contable/DIAN (esta ultima **fuera de alcance** aqui; ver §9).

## 2. Alcance

Se estructura en **cuatro fases** con dependencia descendente estricta (06 → 07 → 08 → 09), respetando la Regla de Completitud (ADR-016): no se inicia una fase sin cerrar la anterior.

### En alcance

- **Fase 06 — Cierre del flujo nucleo:** superficie de UI para adjudicacion (backend ya listo); rechazo/cancelacion de solicitud (backend + UI) con cascada que cancela la RFQ activa; afirmacion de estados terminales; pulido (moneda seleccionable, motivo de declinacion editable, nombre real del proveedor en invitaciones, fix N+1).
- **Fase 07 — Edicion y ciclo de vida de la OC:** edicion de solicitud/lineas en estado editable; endpoints de aprobacion/cancelacion/cierre de OC usando los estados hoy inertes.
- **Fase 08 — Reabastecimiento bajo demanda:** endpoint + accion de UI que escanea items bajo punto de reorden y propone lineas de solicitud (`sourceKind = REPLENISHMENT_SUGGESTION`), sin persistir hasta que el operador confirma. **Sincrono, sin BullMQ/worker** (decision de producto confirmada).
- **Fase 09 — Metricas agregadas de proveedor (RF-INV-24, version ligera):** endpoint que agrega precio promedio adjudicado, % de entregas a tiempo y % de recepciones con daños/faltantes, mostradas en la ficha del proveedor. **Sin score compuesto ni pesos configurables** (decision de producto confirmada).

### Fuera de alcance

- Valorizacion contable/DIAN de compras y recepciones.
- Score compuesto ponderado de proveedores, contratos marco, portal de proveedor/autogestion, deduplicacion automatica de terceros (se mantienen fuera, per PRD-MOD12-PROVEEDORES y ADR-052).
- Datos bancarios / PII financiera del proveedor (escalado previo al CTO; difierido a tesoreria).
- Rol RBAC dedicado `PURCHASER`/`ADMIN_SCM`: se mantiene el mapeo v1 a `ADMIN/NOC/SUPPORT`.
- Reabastecimiento **automatico** por job programado (se elige explicitamente la variante bajo demanda; un job BullMQ seria un ADR posterior).
- Conteo fisico y conciliacion (RF-INV-23, Fase 2).

## 3. Personas y casos de uso

- **Comprador / Analista de compras (ADMIN/NOC/SUPPORT):**
  - CU-01: Compara cotizaciones y **adjudica** cada linea al proveedor elegido; luego genera la OC.
  - CU-02: **Rechaza** una solicitud que no cumple politica (con motivo), cerrando la RFQ activa.
  - CU-03: **Cancela** una solicitud que ya no se necesita (con motivo), en cualquier estado previo a la OC.
  - CU-04: Corrige una solicitud en borrador antes de cotizar (Fase 07).
  - CU-05: Genera **sugerencias de reabastecimiento** desde items bajo punto de reorden y crea la solicitud con un clic (Fase 08).
  - CU-06: Consulta el **desempeno** de un proveedor (precio, cumplimiento, calidad) antes de invitarlo/adjudicarle (Fase 09).
- **Aprobador (mismo rol v1):** autoriza o rechaza segun politica de tipo+monto (`PurchasingPolicyService`).

## 4. Requerimientos funcionales

**Fase 06**
- RF-06-01: El portal debe permitir registrar adjudicaciones por linea contra `POST /purchasing/requests/:id/awards`, respetando la regla de adjudicacion parcial (solo `PROJECT` permite parcial; el resto adjudica la cantidad total en una sola operacion — `PurchasingPolicyService.validateLineAward`).
- RF-06-02: El portal debe mostrar las adjudicaciones existentes (`detail.awards`) y el estado de linea `AWARDED`.
- RF-06-03: El sistema debe exponer `POST /purchasing/requests/:id/reject` que transiciona la solicitud a `REJECTED` desde `PENDING_QUOTES`/`PENDING_APPROVAL`, exige motivo, marca sus lineas no-comprometidas como `REJECTED` y cancela la RFQ activa.
- RF-06-04: El sistema debe exponer `POST /purchasing/requests/:id/cancel` que transiciona a `CANCELLED` desde `DRAFT`/`PENDING_QUOTES`/`PENDING_APPROVAL`/`APPROVED`, exige motivo, marca lineas no-comprometidas como `CANCELLED` y cancela la RFQ activa.
- RF-06-05: Cancelar/rechazar debe pasar la RFQ activa a `PurchaseRfqStatus.CANCELLED` y sus invitaciones `INVITED` a `PurchaseRfqInvitationStatus.CANCELLED`.
- RF-06-06: `getPurchaseNextAction` debe afirmar los estados terminales (`REJECTED`, `CANCELLED`, y `CONVERTED_TO_PO` con todo recibido) en vez de no sugerir nada.
- RF-06-07: La moneda de cotizacion y de RFQ debe ser seleccionable (lista controlada `COP` por defecto, `USD`, `EUR`), no fija.
- RF-06-08: El motivo de declinacion de una invitacion RFQ debe ser capturable por el operador (no texto fijo).
- RF-06-09: Las invitaciones RFQ deben mostrar el nombre real del proveedor.

**Fase 07**
- RF-07-01: `PATCH /purchasing/requests/:id` edita cabecera y lineas solo si la solicitud esta en estado editable (`DRAFT`/`PENDING_QUOTES`) y sin cotizaciones/adjudicaciones.
- RF-07-02: Endpoints de ciclo de vida de OC: `approve` (`PENDING_APPROVAL→APPROVED`), `cancel` (`→CANCELLED`), `close` (`FULLY_RECEIVED→CLOSED`). El default de creacion permanece `APPROVED` para no romper la recepcion vigente.

**Fase 08**
- RF-08-01: `POST /purchasing/replenishment-suggestions/preview` devuelve, para items con `reorderPoint`/`targetStock` y stock disponible por debajo del punto de reorden, las lineas sugeridas (`inventoryItemId`, cantidad ajustada a `orderMultiple` con piso `minimumOrderQty`, `preferredSupplierRefId`), sin persistir.
- RF-08-02: El operador confirma y crea una solicitud normal con `sourceKind = REPLENISHMENT_SUGGESTION` (ya soportado por `CreatePurchaseRequestSchema`).

**Fase 09**
- RF-09-01: `GET /purchasing/suppliers/:partyRefId/metrics` devuelve `{ avgAwardedAmount, onTimeRate, defectRate, totalOrders }` agregando `PurchaseRequestLineAward` + `PurchaseOrder` + `GoodsReceipt`, con scoping estricto por tenant + proveedor.
- RF-09-02: La ficha del proveedor muestra dichas metricas.

## 5. Requerimientos no funcionales

- Multi-tenant estricto: `TenantContext.getOrThrow()` + `runInTenantSchema` en todo servicio; tenant desde JWT, nunca desde input; `SET LOCAL search_path` por transaccion (via helper existente).
- Boundaries Modulith: Compras no accede a tablas de otros modulos; identidad de proveedor solo via `SupplierPartyPort`/`IPartyReadPort`.
- Auditoria: toda operacion CUD auditada por `AuditInterceptor`; rechazo/cancelacion registran actor y motivo (`resolved_by_user_id`, `resolution_reason`).
- Reversibilidad: la unica migracion de estas fases (`067`, aditiva) es reversible `up()/down()`.
- Rendimiento/escala: eliminar el N+1 de awards en `getRequestDetail`; el escaneo de reabastecimiento (Fase 08) debe acotar la consulta por tenant e items con parametros de reorden definidos.
- Accesibilidad WCAG 2.2 AA en las pantallas afectadas; texto visible en espanol sentence case; sin enums crudos ni `partyRefId` en UI.

## 6. Modelo de datos (borrador)

- **Cambio de schema (Fase 06):** `purchase_requests` agrega `resolution_reason TEXT NULL` y `resolved_by_user_id UUID NULL` (migracion tenant `067`, aditiva y reversible). Numeracion `067` verificada como libre (ultima aplicada: `066`).
- **Sin cambios de schema** en Fases 06 (fuera de lo anterior), 08 y 09: reutilizan entidades existentes (`PurchaseRequestLineAward`, `PurchaseOrder`, `GoodsReceipt`, `InventoryItem` con sus campos de reabastecimiento).
- **Fase 07 (decidido):** `purchase_orders` agrega `cancellation_reason TEXT NULL`, `cancelled_by_user_id UUID NULL`, `closed_by_user_id UUID NULL` (migracion tenant `068`, aditiva y reversible; `approved_by_user_id` ya existe y se reutiliza para el paso `approve`). La edicion de solicitud (RF-07-01) **no** requiere columnas nuevas: reutiliza `purchase_requests`/`purchase_request_lines` existentes.
- Estados reutilizados hoy inertes: `PurchaseRfqStatus.CANCELLED`, `PurchaseRfqInvitationStatus.CANCELLED`, `PurchaseOrderStatus.{DRAFT,PENDING_APPROVAL,CANCELLED,CLOSED}`, `PurchaseRequestLineStatus.{CANCELLED,REJECTED}`.

## 7. Contratos API (borrador)

Prefijo `/api/v1/purchasing`. Guard `JwtAuthGuard + RolesGuard`, `@Roles(ADMIN, NOC, SUPPORT)`. Validacion Zod + `ZodValidationPipe`. OpenAPI actualizada por endpoint.

| Fase | Metodo/Ruta | Body | Efecto |
| --- | --- | --- | --- |
| 06 | `POST /requests/:id/reject` | `{ reason: string ≥10 }` | `→REJECTED`, lineas `REJECTED`, cancela RFQ activa |
| 06 | `POST /requests/:id/cancel` | `{ reason: string ≥5 }` | `→CANCELLED`, lineas `CANCELLED`, cancela RFQ activa |
| 06 | `POST /requests/:id/awards` (ya existe) | `CreatePurchaseRequestAwardsDto` | Adjudica lineas (solo se cablea UI) |
| 07 | `PATCH /requests/:id` | `UpdatePurchaseRequestDto` | Edita cabecera/lineas en estado editable |
| 07 | `POST /orders/:id/approve` \| `/cancel` \| `/close` | — | Ciclo de vida de OC |
| 08 | `POST /replenishment-suggestions/preview` | filtros opcionales | Sugerencias sin persistir |
| 09 | `GET /suppliers/:partyRefId/metrics` | — | Metricas agregadas del proveedor |

## 8. Criterios de aceptacion

- CA-01: Desde el portal, un operador adjudica cada linea y genera la OC sin error de "linea sin adjudicacion".
- CA-02: Rechazar una solicitud en `PENDING_APPROVAL` la deja `REJECTED`, sus lineas `REJECTED`, y la RFQ activa `CANCELLED` con invitaciones `INVITED→CANCELLED`; el motivo queda persistido y auditado.
- CA-03: Cancelar es posible desde `DRAFT/PENDING_QUOTES/PENDING_APPROVAL/APPROVED` y bloqueado (400 en espanol) desde `CONVERTED_TO_PO` o estados terminales.
- CA-04: Los estados terminales muestran una afirmacion clara en el workbench; no queda un "siguiente paso" fantasma.
- CA-05: Moneda seleccionable persiste el valor elegido en cotizacion y RFQ; motivo de declinacion capturado se persiste; invitaciones muestran el nombre del proveedor.
- CA-06 (Fase 07): una solicitud con cotizaciones no puede editarse (400); una en borrador si.
- CA-07 (Fase 08): el preview propone cantidades correctas (respeta `orderMultiple`/`minimumOrderQty`) y crear la solicitud genera lineas `REPLENISHMENT_SUGGESTION`.
- CA-08 (Fase 09): las metricas del proveedor cuadran con los awards/recepciones de prueba y respetan el aislamiento por tenant.
- CA-transversal: cobertura core ≥80%; migracion `067` aplica y revierte; boundaries y multi-tenancy verificados; sin PII en logs.

## 9. Dependencias y riesgos

- **Dependencia Fase 08 → lectura de stock disponible:** el escaneo necesita el saldo disponible por item; depende del servicio/puerto de niveles de stock existente en inventory. Riesgo bajo; si el contrato de lectura no expone "disponible" limpio, se consulta a AI-SR-FULL (factibilidad) antes de fijar el calculo.
- **Riesgo de alcance:** el usuario opto por la vision completa en un unico plan; se mitiga con la fase-a-fase y la Regla de Completitud (solo Fase 06 recibe GO ahora).
- **Cambio de schema (`067`)** exige **revision reforzada AI-SEC-ENG** antes del merge (governance §3.3).
- **Regulatorio:** valorizacion contable/DIAN de compras **no** se aborda aqui; cualquier requerimiento fiscal se marca "requiere verificacion con fuente oficial" y se escala.
- **Estado del arbol de trabajo:** existe una implementacion parcial de Fase 06.2 introducida antes de este PRD; el prompt de ejecucion define como tratarla (ver PROMPT Fase 06 §6).

## 10. Definicion de hecho (DoD del PRD/fase)

- Lint + typecheck + tests verdes; cobertura core ≥80%.
- Migracion `067` aplica y revierte; sin otras migraciones en Fase 06/08/09.
- Flujo verificado extremo a extremo en el portal: cotizar → aprobar → **adjudicar** → generar OC → recibir; y por separado **rechazar** y **cancelar** con cierre de RFQ.
- OpenAPI actualizada; cliente del portal alineado; vocabulario espanol; sin enums crudos ni `partyRefId` en UI.
- Boundaries y multi-tenancy verificados; auditoria activa; sin PII/secretos en logs.
- Informe vivo de fase creado/actualizado en `docs/informes/`.

---

## Roadmap de ejecucion

| Fase | Prompt de ejecucion | Estado gate |
| --- | --- | --- |
| 06 — Cierre del flujo nucleo | `docs/prompts/PROMPT-MOD12-COMPRAS-CIERRE-FASE-06-v1.0.md` | **CERRADA (G7 aprobado CTO, 2026-07-14)** — ver `docs/informes/INFORME-MOD12-COMPRAS-CIERRE-FASE-06-AUDITORIA-ARCH-v1.0.md` |
| 07 — Edicion + ciclo de vida OC | `docs/prompts/PROMPT-MOD12-COMPRAS-CIERRE-FASE-07-v1.0.md` | **Emitido — pendiente GO CTO** (habilitado por cierre de 06, ADR-016) |
| 08 — Reabastecimiento bajo demanda | (se emite al cerrar 07) | Bloqueada por 07 |
| 09 — Metricas de proveedor | (se emite al cerrar 08) | Bloqueada por 08 |

**Requiere ADR:** No (cambios aditivos dentro del boundary MOD12 y del stack aprobado; sin nuevo bounded context ni patron avanzado).
**Requiere CTO:** Si — GO de Fase 07 y de cada fase subsecuente (releases/impacto de schema).
