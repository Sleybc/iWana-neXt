# INFORME - MOD09 Auditoria bandeja de visitas pendientes

**Version:** 1.0  
**Estado:** En revisión  
**Fecha:** 2026-05-15  
**Modo activo:** Mixto  
**Autor:** AI-EM-ARCH  
**Modulo:** MOD09 Programacion / WFM  
**Alcance:** Auditoria planificado vs ejecutado de bandeja de visitas pendientes  
**Prompt auditado:** docs/prompts/PROMPT-MOD09-BANDEJA-VISITAS-PENDIENTES-v1.0.md  
**Plan auditado:** docs/plans/PLAN-MOD09-BANDEJA-VISITAS-PENDIENTES-v1.0.md  
**Spec auditada:** docs/specs/SPEC-MOD09-BANDEJA-VISITAS-PENDIENTES-v1.0.md  
**ADR base:** docs/adrs/ADR-039-Bandeja-Visitas-Pendientes-WFM.md  
**Informe vivo relacionado:** docs/informes/INFORME-MOD09-FASE-02-v1.0.md

---

## 1. Veredicto EM-ARCH

La ejecucion de la bandeja de visitas pendientes tiene un **avance funcional parcial y valioso**, pero **no cumple todavia el cierre completo del prompt aprobado**.

El backend y portal ya tienen la columna vertebral del flujo: entidad `VisitRequest`, endpoints WFM, cliente portal, ruta `pending-visits`, inbox, matriz semanal, panel de recomendaciones y flujo CRM hacia bandeja. La validacion tecnica focalizada esta en verde.

Sin embargo, el cierre production-ready queda condicionado por brechas que afectan criterios de aceptacion centrales: materializacion Assurance, idempotencia robusta en base de datos, autorizacion fina de `SALES`, cobertura E2E, pruebas unitarias del servicio core y consistencia documental de evidencia.

**Decision de auditoria:** ajustar antes de declarar la fase como cerrada.

## 2. Evidencia verificada

### Comandos ejecutados durante auditoria

| Comando                                                                                                                                                                                                                                | Resultado       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `runTests` sobre `apps/api/src/modules/wfm/tests/visit-requests.controller.http.spec.ts`, `apps/portal/src/components/scheduling/PendingVisitRequestsView.spec.tsx`, `apps/portal/src/components/scheduling/pending-visits-ui.spec.ts` | Verde: 39 tests |
| `pnpm --filter @iwana/api typecheck`                                                                                                                                                                                                   | Verde           |
| `pnpm --filter @iwana/portal typecheck`                                                                                                                                                                                                | Verde           |
| `pnpm --filter @iwana/db typecheck`                                                                                                                                                                                                    | Verde           |

### Evidencia documental previa encontrada

- El informe vivo registra ejecucion inicial, correcciones CRM, correcciones de payload, labels territoriales y datepicker en `pending-visits`.
- La evidencia de calidad existente declaraba que no hubo migraciones, aunque la implementacion actual incluye `visit_requests`; se actualizo durante esta auditoria con la salvedad de brechas pendientes.
- No se encontro E2E `pending-visits` en `e2e/tests`.

## 3. Matriz planificado vs ejecutado

| Area               | Planificado                                                                                           | Ejecutado observado                                                                                                                                               | Estado             |
| ------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| ADR y autorizacion | ADR-039 aprobado por CTO antes de codigo productivo.                                                  | ADR-039, spec, plan y prompt figuran aprobados.                                                                                                                   | Cumple             |
| Enum compartido    | Crear `VisitRequestStatus` en `@iwana/shared`.                                                        | Existe `packages/shared/src/enums/wfm/visit-request-status.enum.ts`.                                                                                              | Cumple             |
| Entidad WFM        | Crear `VisitRequest` tenant-aware en `@iwana/db`.                                                     | Existe `packages/database/src/entities/visit-request.entity.ts` sin schema fijo.                                                                                  | Cumple             |
| Migracion          | Crear migracion reversible para `visit_requests` e indices.                                           | Existe `034_create_visit_requests.ts`, pero solo crea `idx_visit_requests_tenant_status_created`; faltan indices recomendados y restriccion/idempotencia parcial. | Parcial            |
| DTOs               | Create/list/update/recommend/schedule/cancel/reject con Zod.                                          | Existen DTOs dedicados y el controller los expone.                                                                                                                | Cumple parcial     |
| Servicio WFM       | Crear `VisitRequestsService` con estados, duplicidad, idempotencia y agenda transaccional.            | Servicio existe y agenda evento + Work Order; la idempotencia depende de consulta previa sin constraint DB y no hay spec unitario del servicio.                   | Parcial            |
| Recomendaciones    | Reutilizar `ScheduleRecommendationsService`.                                                          | `POST /visit-requests/:id/schedule-recommendations` prepara payload y reutiliza el servicio.                                                                      | Cumple             |
| CRM                | Expediente listo -> VisitRequest -> agenda -> refs operativas.                                        | El portal redirige a `pending-visits`, crea/recupera solicitud y sincroniza CRM/Assurance al confirmar.                                                           | Cumple parcial     |
| Assurance          | `requestFieldService` -> solicitud WFM, con fallback `NEEDS_CONTEXT`.                                 | Assurance sigue publicando job en `ASSURANCE_FIELD_SERVICE_QUEUE`; no hay consumer worker ni materializacion WFM observada.                                       | No cumple          |
| Manual/red         | Crear solicitud manual desde Programacion.                                                            | Dialogo manual crea solicitud WFM.                                                                                                                                | Cumple parcial     |
| UI bandeja         | Inbox + matriz semanal + panel recomendacion + confirmacion compacta.                                 | Componentes existen y estan orquestados. La matriz no ofrece click directo de franja; la confirmacion no captura notas ni toggle de Work Order.                   | Parcial            |
| Roles              | `ADMIN`, `NOC`, `SUPPORT`; `SALES` solo CRM autorizado; `TECHNICIAN`/`CONTRACTOR` sin bandeja global. | Portal bloquea `TECHNICIAN`; backend permite `SALES` en get/update/recommend/schedule/cancel/reject sin validar origen CRM.                                       | Parcial con riesgo |
| Tests backend      | Unitarios y HTTP para estados, recomendaciones, agenda e idempotencia.                                | Hay HTTP contract test; no se encontro unit test del servicio core ni pruebas reales de idempotencia concurrente.                                                 | Parcial            |
| Tests portal       | Bandeja, matriz, confirmacion y estados vacios.                                                       | Hay `PendingVisitRequestsView.spec.tsx` y `pending-visits-ui.spec.ts`; no se encontro spec dedicada de matriz ni confirm dialog.                                  | Parcial            |
| E2E                | CRM -> solicitud -> agenda; Assurance -> solicitud; manual -> agenda; rol restringido.                | No se encontraron tests E2E `pending-visits`/`VisitRequest`.                                                                                                      | No cumple          |
| OpenAPI            | Endpoints nuevos documentados.                                                                        | Decoradores Swagger existen en controller/DTOs, pero no hay evidencia de swagger spec focalizada para `visit-requests`.                                           | Parcial            |
| Calidad documental | Informe vivo y evidencia actualizados.                                                                | Informe vivo y quality actualizados con esta auditoria; queda pendiente evidencia E2E/final de cierre.                                                            | Parcial            |

## 4. Hallazgos por severidad

### Bloqueantes

#### BVP-AUD-01 — Assurance no materializa solicitudes WFM

El plan exige que `requestFieldService` origine una solicitud WFM y que, si falta ubicacion, quede en `NEEDS_CONTEXT`. La implementacion actual mantiene el puerto BullMQ (`ASSURANCE_FIELD_SERVICE_QUEUE`) pero no se encontro consumer en `apps/worker` ni ruta alternativa API que cree `VisitRequest` desde el job.

**Impacto:** CA-BVP-03 y CA-BVP-09 no pueden darse por cumplidos. Los tickets de mesa de ayuda pueden quedar en `FIELD_SERVICE_REQUESTED` sin aparecer en la bandeja WFM.

**Accion requerida:** implementar consumidor o adaptador aprobado que materialice `VisitRequest originContext=ASSURANCE`, con idempotencia por `ticketId` y fallback `NEEDS_CONTEXT`.

#### BVP-AUD-02 — Idempotencia no esta garantizada a nivel DB

La creacion de solicitudes evita duplicados con una consulta previa, pero la migracion no crea constraint unico parcial para solicitudes no terminales por `(tenant_id, origin_context, origin_ref, work_type)`. En concurrencia, doble submit o retry simultaneo puede crear duplicados.

**Impacto:** incumple el criterio del prompt sobre idempotencia y el CA-BVP-05 en escenarios reales de carrera.

**Accion requerida:** agregar migracion reversible con indice unico parcial para `origin_ref IS NOT NULL` y estados no terminales, y ajustar servicio/tests para capturar conflicto o devolver existente.

#### BVP-AUD-03 — Autorizacion de `SALES` queda demasiado amplia en backend

El prompt permite `SALES` solo para solicitudes CRM autorizadas. El controller permite `SALES` en get/update/recommend/schedule/cancel/reject, y el servicio solo bloquea `TECHNICIAN` y `CONTRACTOR`. No se observo validacion de `originContext=CRM`, ownership ni origen autorizado.

**Impacto:** riesgo de acceso o mutacion operativa fuera del alcance comercial aprobado dentro del tenant.

**Accion requerida:** restringir `SALES` por origen CRM y contexto autorizado, o retirar `SALES` de operaciones globales salvo create/flujo CRM controlado.

### Altos

#### BVP-AUD-04 — Falta cobertura unitaria del servicio core

No se encontro `visit-requests.service.spec.ts`. La cobertura actual del backend es principalmente de contrato HTTP con servicios mockeados, por lo que no prueba maquina de estados, idempotencia, transaccion evento/Work Order, conflictos reales ni derivacion `NEEDS_CONTEXT`/`READY_TO_SCHEDULE`.

**Accion requerida:** agregar suite de `VisitRequestsService` con mocks de manager/transaccion y casos de estados, duplicidad, agenda, cancel/reject y recomendaciones.

#### BVP-AUD-05 — No hay E2E para el flujo aprobado de bandeja

No se encontraron tests Playwright con `pending-visits` o `VisitRequest`. El prompt exige E2E para CRM, Assurance, manual y rol restringido.

**Accion requerida:** agregar E2E mockeado o integrado para `CRM -> VisitRequest -> agenda`, `Assurance -> VisitRequest`, `manual -> agenda` y `TECHNICIAN/CONTRACTOR` sin acceso.

#### BVP-AUD-06 — Migracion incompleta contra indices de la spec

La spec recomienda indices por origen, ticket, expediente, subscriber, ubicacion y SLA. La migracion solo crea `(tenant_id, status, created_at)`.

**Accion requerida:** completar indices operativos en migracion incremental reversible.

### Medios

#### BVP-AUD-07 — Confirmacion compacta no captura notas ni opcion Work Order

La spec indica que la confirmacion debe pedir notas de Work Order y permitir `crear Work Order` activo por defecto salvo flujo manual diagnostico. El DTO de agenda solo acepta `assignedUserId`, `scheduledStartAt` y `scheduledEndAt`; el servicio siempre crea Work Order.

**Accion requerida:** decidir si se simplifica formalmente la spec o se implementan `createWorkOrder`, `workOrderSummary` y `workOrderNotes`.

#### BVP-AUD-08 — Parametros `:id` de visit-requests no usan `ParseUUIDPipe`

Las rutas de `visit-requests/:id` reciben `id` como string, a diferencia de rutas `events/:id`. Un UUID invalido puede llegar al servicio y depender del comportamiento de TypeORM/PostgreSQL.

**Accion requerida:** usar `@Param('id', ParseUUIDPipe)` en rutas `visit-requests/:id` y agregar test HTTP de UUID invalido.

#### BVP-AUD-09 — UI manual renderiza enums como labels pobres

El dialogo manual construye opciones con `value.replace(/_/g, ' ')`, lo que puede exponer enums crudos en ingles y no respeta la regla UI de labels de negocio en espanol.

**Accion requerida:** reutilizar `getWfmWorkTypeLabel()` y `getWorkOrderPriorityLabel()`.

#### BVP-AUD-10 — Evidencia de calidad queda con deuda de cierre

`docs/quality/QUALITY-MOD09-FASE-02-v1.0.md` fue actualizado durante esta auditoria para reflejar migraciones WFM, typecheck DB y hallazgos pendientes. Sigue faltando evidencia E2E `pending-visits` y comandos finales del corte correctivo.

**Accion requerida:** completar quality cuando se ejecuten E2E y correcciones bloqueantes.

## 5. Riesgos arquitectonicos

- **Boundary:** el diseño sigue respetando ownership WFM; no se observo acceso directo de WFM a tablas CRM/Assurance en los puntos revisados.
- **Tenancy:** la entidad no fija schema y el servicio usa `TenantContext` + `runInTenantSchema`; esto esta alineado al modelo multi-tenant.
- **Seguridad:** la autorizacion fina de `SALES` debe corregirse antes de cierre.
- **Operabilidad:** sin consumer Assurance, la bandeja no es aun el inbox multi-origen prometido.
- **Datos:** la falta de indices/constraint incrementa riesgo de duplicados y degradacion de consultas.

## 6. Decision stop/go

### Go controlado

Puede continuar el desarrollo del slice, porque el baseline compila y las pruebas focalizadas pasan.

### Stop para declarar cierre

No declarar la bandeja como cerrada ni production-ready hasta resolver:

1. materializacion Assurance,
2. idempotencia DB,
3. restriccion de `SALES`,
4. E2E minimo,
5. pruebas unitarias de `VisitRequestsService`,
6. quality final con evidencia del bloque correctivo.

## 7. Recomendacion EM-ARCH

Ejecutar un bloque correctivo antes de ampliar nuevas capacidades:

1. **Backend primero:** migracion de indices/unique parcial, `ParseUUIDPipe`, roles `SALES`, tests del servicio.
2. **Integracion Assurance:** consumer o adaptador de materializacion `ASSURANCE -> VisitRequest` con idempotencia.
3. **Portal y E2E:** cerrar labels, confirmacion segun spec o ajustar spec, y Playwright focalizado.
4. **Documentacion:** actualizar quality e informe vivo con comandos definitivos.

**Estado final de auditoria:** avance aprobado para continuar; cierre de fase condicionado a correcciones.
