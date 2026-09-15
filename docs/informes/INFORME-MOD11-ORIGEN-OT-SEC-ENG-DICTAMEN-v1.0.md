# Dictamen sec-eng — MOD11 Origen de la OT: visibilidad de `CREATED`

**Versión:** 1.0
**Fecha:** 2026-09-14
**Agente:** AI-SEC-ENG (`sec-eng`) — auditor de solo lectura, no se tocó código ni migraciones
**Modo:** Mixto (Architect + backend-security-coder)
**Skills leídas (como documentación):** `security-auditor`, `backend-security-coder`, `nestjs-expert`, `postgresql`
**Encargo:** `docs/prompts/PROMPT-MOD11-ORIGEN-OT-SEC-ENG-DICTAMEN-v1.0.md`
**Objeto:** spec `docs/specs/2026-09-14-mod11-origen-ot-design.md` §3.6 · ADR-091 (propuesto) §D3 y fila de Seguridad
**Estado:** ADR-091 (propuesto) sigue propuesto. Nada de este dictamen habilita implementación.

---

## 1. Veredicto

**Mantener la exclusión: `CREATED` fuera del pool reclamable por técnicos/contratistas.**

Fundamento verificado en código (no en la descripción del encargo):

1. La rama del pool **no impone ningún alcance por sede**. Tanto en `assertActorAccess` como en el `WHERE` de `list()` el predicado es únicamente `(sin técnico ∧ sin cuadrilla ∧ status ≠ CREATED)` más `tenant_id` y, en lista, `assigned_technician_id = :actorSub`. No hay `organization_site_id` en esa rama.
2. `organization_site_id` existe (entidad + índice + migración tenant 098, ver §3) pero en el camino de técnico **es solo filtro opcional de consulta** (`if (validated.organizationSiteId)`), nunca alcance impuesto. Convertirlo en alcance es **trabajo nuevo, no configuración** (§4, control C2).
3. Incluir `CREATED` en el pool expondría **todo el trabajo despachado del tenant** a **cualquier `TECHNICIAN` y cualquier `CONTRACTOR`**, sin distinción por sede. El contratista es tercero: el riesgo no es el mismo que para el empleado (§5).
4. La superficie expuesta no es solo "ver la fila": las rutas de detalle y sub-recursos (`:id`, `:id/evidences`, `:id/activities`, `:id/item-usage`, `:id/evidence-assets/*`) delegan en el mismo `assertActorAccess` vía guard, y la proyección de lista y detalle incluye `customerDisplayLabel` + `municipality` (dato personal, Ley 1581 — ver H4). Incluir `CREATED` abre lectura de PII de todo el despacho a todo campo + terceros.
5. Mantener la exclusión es la salida **fail-closed y coherente con el estado actual del repo**: los tres sitios de producción dicen lo mismo hoy (§2), y la supervisión conserva acceso completo vía `assertSupervisionScope` (con alcance por sede impuesto, fail-closed).

**Condición CTO (no la decide este dictamen):** si la bolsa debe ser reclamable por técnicos, la salida correcta deja de ser "incluir sin más" y pasa a ser **"incluir solo con pool acotado por sede"**, que es trabajo nuevo (C2). Sin ese trabajo, incluir es NO-GO. Si la bolsa es solo de supervisión (coordinación empuja la asignación vía `assign()`), la exclusión actual ya es el control suficiente y no se necesita código nuevo — solo los controles de endurecimiento C4–C6.

---

## 2. Verificación propia (lo que el encargo pedía no dar por bueno)

### 2.1 Ambos sitios dicen lo mismo — SÍ, verificado

| Sitio | Predicado real |
| --- | --- |
| `assertActorAccess` (lectura técnico/contratista) | `isUnassigned = !assignedTechnicianId && !assignedCrewId`; `isTechnician = [TECHNICIAN, CONTRACTOR]`; `isUnassignedPool = isUnassigned && isTechnician && status !== CREATED`; lectura: `if (!assigned && !supervisor && !isUnassignedPool) throw 404` |
| `list()` `WHERE` para `LIST_RESTRICTED_ROLES` | `(assigned_technician_id = :actorSub OR (assigned_technician_id IS NULL AND assigned_crew_id IS NULL AND status <> :poolExcludedStatus))` con `poolExcludedStatus = CREATED`, parámetros ligados |

Vía de escritura (`requiresTechnicalExecution`): `(assigned && !supervisor) || isUnassignedPool` — la misma `isUnassignedPool`, luego la exclusión aplica también a `start`/registros. **Lista y detalle coinciden hoy: ninguna fila listada da 404 al abrirse por esta regla, ni hay fila oculta accesible por id por esta regla.** La descripción del encargo queda confirmada, no repetida.

### 2.2 Hay un tercer sitio — SÍ

`computeAllowedActions` replica el mismo predicado (línea 2164-2165) y la misma exclusión. No es enforcement (es política pura de UI: qué botones se muestran), pero es el **tercer sitio replicado** y debe entrar en cualquier cambio futuro. Detalle: su rama `case CREATED: actions.push('START')` bajo `if ((isAssigned && !isSupervisor) || isUnassignedPool)` es hoy **código muerto para el pool** (con `CREATED`, `isUnassignedPool` es `false` y `isAssigned` es `false`), lo que confirma la intención de exclusión pero deja una trampa de lectura (H5).

Además el guard (`execution-order-access.guard.ts`) es el **punto de enforcement real** para detalle y sub-recursos (delega en `assertActorAccess`; con `@ExecutionOrderTenantScoped()` y sin `:id` retorna sin ABAC — el scoping vive entonces en el servicio). Y el oracle del test de boundary (`tasks.boundary.spec.ts`) replica el predicado por cuarta vez (solo test, riesgo de deriva, no enforcement).

### 2.3 `organization_site_id`: filtro opcional, NO alcance impuesto (para técnicos) — confirmado

- Entidad: `organizationSiteId` nullable; índice `(tenant_id, organization_site_id)`; migración tenant `098_execution_order_server_scope.ts` (backfill desde `schedule_events.organization_site_id`; `down` destructivo declarado). Una OT despachada sin evento nacería con `organizationSiteId = NULL` salvo que el despacho lo exija.
- Lista: `if (validated.organizationSiteId) andWhere(...)` — el actor elige si filtrar; **un técnico puede omitirlo y ver todo el tenant** (dentro de su predicado). No hay intersección obligatoria actor↔sede.
- Único alcance por sede impuesto: `assertSupervisionScope` (solo rama `requiresSupervisionScope`, i.e. rutas con permiso `SUPERVISE`): exige `order.organizationSiteId` presente + port `canSuperviseExecutionOrder`, fail-closed (404 si falta cualquiera). Los técnicos nunca pasan por ahí.
- Conclusión: "acotar por sede" = trabajo nuevo (fuente de membresía actor↔sede + enforcement en lista y detalle), no configuración.

### 2.4 `CONTRACTOR` frente a `TECHNICIAN` — comparten rama, riesgos distintos

- Pool: idénticos. `isTechnician = [TECHNICIAN, CONTRACTOR]` y `LIST_RESTRICTED_ROLES = [TECHNICIAN, CONTRACTOR]`. Misma visibilidad, mismos permisos base (`READ` + `EXECUTE`, sin `SUPERVISE` en matriz V1 ni V2).
- Divergencia puntual: `POST :id/unblock` admite `TECHNICIAN` pero **excluye a `CONTRACTOR`** en `@Roles`. Inconsistencia a declarar (H6), no bloqueante de ADR-091 (propuesto).
- Riesgo: el contratista es tercero. Incluir `CREATED` le daría visibilidad tenant-wide del despacho completo + `customerDisplayLabel`/`municipality` de cada OT. Para el empleado es fuga horizontal interna; para el contratista es exposición a tercero. El dictamen los trata por separado en H1.

### 2.5 Qué ve el actor sin rol de supervisión — PII confirmada en la respuesta

- Lista (`toListItem` / `ExecutionOrderListItemDto`): `customerDisplayLabel` + `municipality` por fila; **sin** `serviceAddress`, `workInstructions`, contacto ni `template*` (proyección mínima ADR-067, verificado en DTO líneas 765-769 y `toListItem`).
- Detalle (`GET :id`, controller `getById`): `site: { id, label: municipality ?? customerDisplayLabel }`, `completion`, `syncState`, `allowedActions`; **sin** `serviceAddress` en la respuesta HTTP aunque la columna exista en base. `serviceAddress` persiste pero hoy no se expone en lista ni detalle — no ampliar la proyección al abrir el pool.
- `customerDisplayLabel` (etiqueta de cliente) y `municipality` son dato personal en contexto operativo (Ley 1581 / Habeas Data): la minimización exige no exponerlos tenant-wide a campo y terceros sin necesidad operativa declarada por el CTO.

### 2.6 Dato no persistido — barrido pedido por el encargo

Recorrida toda decisión de acceso sobre `assignedTechnicianId` / `assignedCrewId` / `organizationSiteId`: `assertActorAccess`, `WHERE` de `list()`, `computeAllowedActions`, `assertSupervisionScope`, `assign()`, `start`/`register*`/`close`/`block`/`unblock` (vía guard), sub-recursos de lectura (vía guard). **Todas leen la OT persistida vía `requireOrder`/`findOne` en el schema del JWT.** No se encontró un nuevo caso de "acceso decidido sobre datos no persistidos" más allá del defecto conocido de `assign()` tramo T0 de la spec hermana, que **no se repite** como hallazgo (orden explícita del encargo).

---

## 3. Inventario de sitios replicados (ruta y línea)

Rutas absolutas desde la raíz del repo. Líneas verificadas contra el código vigente.

| # | Sitio | Ruta | Línea(s) | Qué dice | Enforcement |
| --- | --- | --- | --- | --- | --- |
| S1 | `assertActorAccess` — definición del pool | `apps/api/src/modules/tasks/services/execution-orders.service.ts` | 368-374 (uso lectura 395-399; uso escritura 384-390) | `isUnassignedPool = isUnassigned && isTechnician && order.status !== ExecutionOrderStatus.CREATED`, con `isTechnician = [TECHNICIAN, CONTRACTOR]` | **Sí** (vía guard S4) |
| S2 | `list()` — `WHERE` scoping D1 | `apps/api/src/modules/tasks/services/execution-orders.service.ts` | 572-579 (roles 96; filtro opcional sede 596-600) | `(assigned_technician_id = :actorSub OR (NULL ∧ NULL ∧ status <> :poolExcludedStatus))`, `poolExcludedStatus = CREATED`, parámetros ligados | **Sí** (único control del listado: el guard retorna sin ABAC con el decorador) |
| S3 | `computeAllowedActions` — política de UI | `apps/api/src/modules/tasks/services/execution-orders.service.ts` | 2159-2165 (uso 2187; rama supervisión `CREATED→ASSIGN` 2213-2215) | Mismo `isUnassignedPool` con exclusión `CREATED`; rama `CREATED→START` inalcanzable por pool (código muerto, H5) | No (no reemplaza guardas; comentario del propio método) |
| S4 | `ExecutionOrderAccessGuard` — punto de enforcement | `apps/api/src/modules/tasks/guards/execution-order-access.guard.ts` | 41-51 (bypass tenant-scoped), 52-66 (delegación a `assertActorAccess`) | Sin `:id` + sin decorador = 403; con decorador = `true` sin ABAC; con `:id` = `assertActorAccess(id, actor, write, requiresTechnicalExecution, requiresSupervisionScope)` | **Sí** (es el que ejecuta S1) |
| S5 | `ExecutionOrdersController.list` — declaración de superficie | `apps/api/src/modules/tasks/execution-orders.controller.ts` | 155-194 (`@ExecutionOrderTenantScoped`, `@Roles(ADMIN, NOC, SUPPORT, TECHNICIAN, CONTRACTOR)`, `@Permissions(READ)`) | La bandeja es accesible a técnico y contratista; el control vive en S2, no en el guard | Superficie (sin S2 filtraría entre técnicos) |
| S6 | Oracle del test de boundary (no producción) | `apps/api/src/modules/tasks/tests/tasks.boundary.spec.ts` | 148-152, 203-206 (+ caso CONTRACTOR 295-317) | Replica `assignedTechnicianId === actorSub` o `(NULL ∧ NULL ∧ status !== CREATED)` | No (riesgo de deriva si cambia S1/S2 y no el test) |
| S7 | Gating de frontend (no boundary) | `apps/portal/src/components/operations/ExecutionOrderDrawer.tsx` | 399 (`status !== CREATED && …`) | Oculta acciones en UI para `CREATED` | No (nunca fue control) |

Cobertura de sub-recursos verificada: `listEvidences` (servicio 491-535), `listActivities` (403-443), `listItemUsage` (445-489), `getById` (252-262) **no reciben actor ni revalidan ABAC en el servicio**: dependen íntegramente de S4. Cualquier cambio a S1 se propaga automáticamente a evidencias/actividades/consumos/detalle — y cualquier inclusión de `CREATED` también.

Soporte: entidad `packages/database/src/entities/execution-order.entity.ts:31-36` (`schedule_event_id` hoy NOT NULL a nivel entidad; `organization_site_id` nullable + índice línea 15); migración tenant `packages/database/src/migrations/tenant/098_execution_order_server_scope.ts:17-30`; query schema `apps/api/src/modules/tasks/dto/execution-orders.dto.ts:649, 683`; matriz de permisos `apps/api/src/modules/access-control/access-control.constants.ts:338-347, 358-366` (V1) y `797-809, 824-833` (V2): técnico y contratista con `READ+EXECUTE`, sin `SUPERVISE`.

---

## 4. Controles exigidos

Cada control dice si es **configuración** o **trabajo nuevo**. Ninguno se implementó (auditoría de solo lectura).

### Para la salida dictaminada (mantener la exclusión) — condición de aceptabilidad

| # | Control | Tipo | Detalle |
| --- | --- | --- | --- |
| C1 | Mantener S1+S2+S3 alineados con la exclusión y con test de paridad lista↔detalle | **Configuración** (disciplina, sin código nuevo salvo el test si no existe para `CREATED`) | CA-08 de la spec: quien no debe ver `CREATED`, no la ve en lista ni por id. El test de boundary (S6) debe incluir caso `CREATED` sin asignar para ambos roles (existe en `execution-orders.task3.spec.ts:276` para detalle; exigir el equivalente en lista si falta). |
| C2-cond | Si el CTO quiere bolsa reclamable: pool acotado por sede antes de incluir `CREATED` | **Trabajo nuevo** (no configuración) | Fuente server-owned de pertenencia actor↔sede (hoy no existe para técnicos; la de supervisión es `OrganizationOperationalAccessPort.canSuperviseExecutionOrder`, solo rama supervisión), enforcement en S1 (detalle) y S2 (lista) con intersección obligatoria, índice ya existente `(tenant_id, organization_site_id)`, migración de backfill para OT despachadas sin evento. Sin C2, incluir es NO-GO. |
| C3 | `organizationSiteId` obligatorio al despachar (si nace el acto "Despachar") | **Trabajo nuevo** (validación + migración de nulidad a futuro) | Hoy nullable y backfillado desde el evento. Una OT `CREATED` con `organizationSiteId = NULL` es invisible para técnicos (por C1) **e inasignable por supervisión** (`assertSupervisionScope` fail-closed 404, servicio 2772-2774). Sin sitio obligatorio, el despacho crea OT muertas. CA-05 de la spec debe incluir el sitio. |
| C4 | No ampliar la proyección al abrir nada: lista sin `serviceAddress`/contacto/suscriptor; detalle sin `serviceAddress` | **Configuración** (mantener) | Verificado: la columna `service_address` existe pero no se expone. Declararlo invariante en ADR-091 (propuesto). |
| C5 | Rate limiting y throttling de la bandeja ya existentes se conservan; sin endpoint público nuevo | **Configuración** | La bandeja es `eo-lightweight-read` (120 req/min) vía `TenantAwareThrottlerGuard`; no se crea superficie pública. |
| C6 | Audit trail de `assign()` (quién asigna qué a quién, cuándo) ya existente se conserva para el futuro flujo despacho→asignación | **Configuración** | `assign()` registra transición + `finishCommand` con `resourceType/resourceId`. No se necesita evento nuevo para el dictamen. |

### Explícitamente NO exigidos (para no inflar el dictamen)

- Cambio de stack, cifrado adicional, ni controles cloud/enterprise: fuera del baseline.
- `synchronize: true`, secretos o JWT: sin hallazgo en este tramo.

---

## 5. Hallazgos por severidad

### Bloqueantes de ADR-091 (propuesto) (impiden aprobar "incluir `CREATED`" sin más)

| # | Severidad | Hallazgo | Evidencia |
| --- | --- | --- | --- |
| H1 | **Alta — bloqueante** | Incluir `CREATED` en el pool sin alcance por sede = **BOLA horizontal intra-tenant**: cualquier técnico ve todo el despacho del tenant; cualquier **contratista (tercero)** ve lo mismo + PII (`customerDisplayLabel`, `municipality`). Viola least privilege y minimización (Ley 1581). | S1/S2 sin `organization_site_id` en la rama; S5 expone la bandeja a ambos roles; matriz sin `SUPERVISE` para campo; proyección §2.5 |
| H2 | **Media — bloqueante condicional** | La regla vive en **tres sitios de producción + guard + oracle de test**: cualquier cambio futuro (incluir, acotar por sede) debe tocar S1+S2+S3+S6 a la vez o produce divergencia lista↔detalle (filas que listan y dan 404, o filas ocultas accesibles por id). | S1:373-374, S2:572-578, S3:2164-2165, S6:148-152 |
| H3 | **Media — bloqueante funcional** | `CREATED` sin `organizationSiteId` es **inasignable**: `assertSupervisionScope` fail-closed (404) si falta el sitio o el port. El despacho sin sitio obligatorio crea OT que nadie puede reclamar (por C1) ni asignar (por H3). | Servicio 2766-2787; entidad nullable; migración 098 backfill solo desde evento |

### Deuda / no bloqueante de ADR-091 (propuesto)

| # | Severidad | Hallazgo | Evidencia |
| --- | --- | --- | --- |
| H4 | Media (deuda de minimización) | `customerDisplayLabel` + `municipality` en cada fila de la bandeja de campo: con el pool actual (sin `CREATED`) ya es visible a técnico/contratista para todo lo no-`CREATED` sin asignar. Aceptable hoy por necesidad de reclamar; **no extender** a `CREATED` sin C2. | `toListItem` 2617-2657; DTO 771-813 |
| H5 | Baja (trampa de lectura) | Rama `CREATED→START` en `computeAllowedActions` inalcanzable por pool: sugiere que reclamar `CREATED` funciona cuando no. | Servicio 2186-2194 vs 2164-2165 |
| H6 | Baja (inconsistencia a declarar) | `CONTRACTOR` comparte todo el pool con `TECHNICIAN` pero está excluido de `POST :id/unblock` (`@Roles` sin `CONTRACTOR`). O es endurecimiento intencional (tercero no desbloquea) o es olvido: declararlo en ADR-091 (propuesto) para que la paridad del pool sea una decisión, no un accidente. | Controller 556-574 |
| H7 | Baja (defense in depth) | Sub-recursos de lectura y `getById`/`start`/`register*` no revalidan ABAC en el servicio: dependen 100 % del guard. Correcto hoy (guard a nivel de clase cubre todas las rutas), frágil ante reutilización interna o nueva ruta sin `:id`. Recomendación futura: `actor` explícito en firmas internas o assert interno; **no exigido** para ADR-091 (propuesto). | Servicio 252-262, 403-535; controller 196-305 |

Sin PII real en este informe. Sin secretos. Sin datos de tenant reales.

---

## 6. Condiciones que dependen del CTO (enunciadas como tales, no decididas)

1. **[CONDICIÓN-CTO-1 — la bandeja operativa.]** Si la bolsa de `CREATED` es **solo supervisión** (coordinación empuja vía `assign()`), el veredicto se sostiene sin código nuevo (C1+C4+C5+C6). Si debe ser **reclamable por técnicos**, el veredicto cambia a "incluir solo con C2+C3" (trabajo nuevo). Este dictamen no elige por el CTO.
2. **[CONDICIÓN-CTO-2 — contratistas.]** Si el contratista no debe ver ni siquiera el pool actual (tercero), hay que partir S1/S2 por rol — trabajo nuevo y cambio de comportamiento mayoritario, fuera del alcance de ADR-091 (propuesto). Si debe ver lo mismo que el técnico salvo `unblock` (H6), basta declararlo.
3. **[CONDICIÓN-CTO-3 — sede obligatoria.]** Si el despacho puede existir sin sede (trabajo nacional sin base), C3 es inaplicable y entonces `assertSupervisionScope` necesita una rama explícita para OT sin sede — decisión de producto con impacto de seguridad, no atajo de implementación.

---

## 7. Trazabilidad y stop/go del encargo

- Veredicto fundado en lectura de código: S1, S2, S3, S4, S5, entidad, migración 098, DTOs, matriz de permisos, controlador completo (21 rutas: ninguna crea OT hoy — F1 de la spec confirmado por inspección del controlador).
- Inventario completo con ruta y línea: §3 (S1–S7).
- Cada control dice si es configuración o trabajo nuevo: §4.
- **GO** según §5 del encargo. La aprobación de ADR-091 (propuesto) queda condicionada a aceptar el veredicto (mantener exclusión) o, si el CTO exige bolsa reclamable, a planificar C2+C3 como trabajo nuevo previo a E2.

---

## 8. Referencias

- Spec: `docs/specs/2026-09-14-mod11-origen-ot-design.md` §3.6 (objeto), F3 (inalcanzabilidad), CA-08 (paridad lista↔detalle), CA-05 (despacho con sitio)
- ADR-091 (propuesto): `docs/adrs/ADR-091-Origen-de-la-OT-Despacho-y-Agenda-Actos-Separados.md` §D3, fila de Seguridad, alternativa A3
- ADRs: ADR-047 (Aprobado, regla 3 — la alternativa A3 choca con ella), ADR-076 (Aprobado, eje de unicidad), ADR-068 (Aprobado, propagación), ADR-089 (Aprobado, retención y asientos)
- Informes previos (no repetidos, solo trazabilidad): `INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA2-SEC-ENG-v1.0.md` (scoping D1 como control BOLA suficiente **para el pool actual sin `CREATED`**), `INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA2-SR-FULL-v1.0.md` (réplica exacta), `INFORME-MOD11-OPERACIONES-SUBRUTAS-G3-FACTIBILIDAD-BACKEND-v1.0.md` (R1 del decorador)
- AGENTS.md: gotchas 1 (`@Roles` con `UserRole.*` — cumplido), 2 (pgBouncer/`SET LOCAL` — `runInTenantSchema` en todas las rutas tocadas), 11 (`TenantContext.getOrThrow` → 500 si falta contexto; las rutas son protegidas, no hay 401 esperado aquí); gates pre-merge aplicables a C2/C3 futuro (tests ≥80 %, OpenAPI si cambia el contrato, migraciones reversibles, cero PII en logs).
