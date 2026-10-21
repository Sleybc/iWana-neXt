# PRD - MOD05 CRM Módulo Subscriber — Fase 07 (Pestaña Soporte: tickets y visitas del suscriptor)

**Version:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-10-20
**Modo activo:** Product Architect + Architect
**Autor:** AI-EM-ARCH
**Aprobación:** CTO, 2026-10-20 — G0: D-E6-1 A (composición en el portal con el permiso de cada módulo), D-E6-2 tres vías de vínculo del ticket, D-E6-3 visitas por subscriber_id o expediente, D-E6-4 OT fuera, D-E6-5 solo informar y D-E6-6 incluir el buscador del formulario de MOD10, según las recomendaciones de §9.1
**Origen:** cambio estructural **E6** de la [spec UX de Suscriptores](../specs/2026-10-18-mod05-suscriptores-ux-rediseno-spec.md) §4
**PRD vigente:** [Fase 06](PRD-MOD05-CRM-SUBSCRIBERS-FASE-06-v1.0.md). Esta fase agrega una pestaña a la ficha y filtros de lectura en MOD10 (Assurance) y MOD09 (WFM); no reemplaza requerimientos
**ADRs aplicables:** ADR-038 (boundary Assurance), ADR-065 (paginación), ADR-067 (proyección PII), ADR-083 (RBAC granular), ADR-097 (puertos de lectura)
**ADR nuevo requerido:** ninguno con D-E6-1 A (composición en el portal sobre endpoints de cada módulo)

---

## 1. Contexto y motivación

La ficha del suscriptor no muestra si el cliente tiene un caso de soporte abierto o una visita técnica pendiente. El operador tiene que salir a Assurance y a Agendamiento y buscar a mano.

| # | Hecho verificado (2026-10-20, `main` en `b6c50fef`) | Fuente |
| --- | --- | --- |
| H1 | `support_tickets` vincula al suscriptor de dos formas polimórficas: `requester_type = SUBSCRIBER` con `requester_ref_id` = id del suscriptor, y `subject_type` (`SUBSCRIBER`, `CONTRACT`, …) con `subject_ref_id`. No tiene columna `subscriber_id` | `support-ticket.entity.ts:77-90`; `ticket-requester-type.enum.ts`; `ticket-subject-type.enum.ts` |
| H2 | `GET /assurance/tickets` filtra por `requesterRefId`, pero no por sujeto | `assurance/dto/index.ts:101-113`; `tickets.service.ts:359-362` |
| H3 | **El formulario de creación de tickets pide la referencia del solicitante como texto libre** («Ej. subscriber-001»): los tickets que existen pueden apuntar a un suscriptor con un valor que no es su id | `AssuranceCreateTicketForm.tsx:204-205` |
| H4 | `visit_requests.subscriber_id` y `schedule_events.subscriber_id` son `uuid` opcionales («vínculo opcional de contexto CRM»); `execution_orders.subscriber_id` es `varchar(160)` | `visit-request.entity.ts:103-105`; `schedule-event.entity.ts:113-115`; `execution-order.entity.ts:56-57` |
| H5 | Ningún endpoint de WFM (`/wfm/visit-requests`, `/wfm/events`, `/wfm/work-orders`) filtra por suscriptor | `wfm.controller.ts:139-395`; DTO de WFM |
| H6 | **Ninguna de esas columnas tiene índice** por suscriptor: `support_tickets` indexa estado, tipo y fecha; visitas y eventos, estado, inicio, expediente y ticket | índices de las entidades |
| H7 | La unicidad de una visita es por **origen** (expediente o ticket), nunca por suscriptor; el `subscriber_id` es solo contexto (memoria de proyecto MOD09) | `schedule-event.entity.ts:38-41` (índices por expediente y ticket) |
| H8 | Permisos de lectura por módulo: `ASSURANCE_TICKETS_READ` y `WFM_SCHEDULE_READ`. La ficha se abre con `CRM_SUBSCRIBERS_READ` | `access-permission-key.enum.ts` |
| H9 | El portal ya tiene `AssuranceTicketDrawer`, y la ficha usa tabs en la URL desde QW2 (`vista-general`, `datos`, `tributario`, `servicios`, `cumplimiento`) | `components/assurance/AssuranceTicketDrawer.tsx`; `SubscriberDetailClient.tsx:152-408` |

## 2. Objetivo

Que desde la ficha el operador vea los tickets y las visitas del suscriptor, abra el detalle sin salir de la ficha y cree un ticket ya vinculado, respetando lo que cada persona tiene permiso de ver.

## 3. Alcance

**Dentro:**
- pestaña «Soporte» en la ficha, con secciones Tickets y Visitas;
- filtros de lectura por suscriptor en Assurance y en WFM, con sus índices;
- «Crear ticket» desde la pestaña con el suscriptor ya vinculado, y selector de suscriptor en el formulario de tickets cuando el solicitante es un suscriptor (corrige H3 hacia adelante);
- un CLI que informa los tickets con `requester_type = SUBSCRIBER` cuya referencia no es el id de un suscriptor (simulación, sin corregir).

**Fuera:**
- corregir automáticamente los tickets históricos mal vinculados (D-E6-5);
- cambiar el tipo de `execution_orders.subscriber_id` (D-E6-4);
- el resumen de soporte en la vista lateral de la lista y en el encabezado (posible fase posterior);
- facturación (E7) y diagnóstico de red (E8).

## 4. Casos de uso

| CU | Caso de uso |
| --- | --- |
| CU-SO-01 | Ver los tickets abiertos y recientes del suscriptor, con estado, prioridad y SLA |
| CU-SO-02 | Ver las visitas pendientes y programadas del suscriptor, con su origen y fecha |
| CU-SO-03 | Abrir el detalle de un ticket o de una visita sin salir de la ficha |
| CU-SO-04 | Crear un ticket desde la ficha, ya vinculado al suscriptor |

## 5. Requerimientos funcionales

### 5.1 Tickets del suscriptor (sujeto a D-E6-2)

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-SO-01 | `GET /assurance/tickets` acepta `subscriberId` (uuid). Un ticket pertenece al suscriptor si `requester_type = SUBSCRIBER` y `requester_ref_id = subscriberId`, **o** `subject_type = SUBSCRIBER` y `subject_ref_id = subscriberId`, **o** `subject_type = CONTRACT` y `subject_ref_id` es un contrato de ese suscriptor | MVP |
| RF-SO-02 | Los contratos del suscriptor se obtienen mediante un puerto de lectura de CRM consumido por Assurance (`CrmSubscriberReadPort.listContractIds`), sin consultar tablas de CRM desde Assurance | MVP |
| RF-SO-03 | Sin cambios en los demás filtros, el orden y la paginación del listado (ADR-065) | MVP |

### 5.2 Visitas del suscriptor (sujeto a D-E6-3)

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-SO-04 | `GET /wfm/visit-requests` y `GET /wfm/events` aceptan `subscriberId`. Coinciden las filas con `subscriber_id = subscriberId` **o** cuyo origen es el expediente del suscriptor (`expediente_id = subscriber.expedienteId`) | MVP |
| RF-SO-05 | El expediente del suscriptor se obtiene con `CrmSubscriberReadPort`; WFM no consulta tablas de CRM | MVP |
| RF-SO-06 | Las visitas originadas en un ticket del suscriptor se ven desde ese ticket, no se duplican en la sección Visitas | MVP |

### 5.3 Índices

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-SO-07 | Migración tenant aditiva y reversible con índices parciales: `support_tickets (tenant_id, requester_ref_id) WHERE requester_type = 'SUBSCRIBER'`, `support_tickets (tenant_id, subject_type, subject_ref_id)`, `visit_requests (tenant_id, subscriber_id)` y `schedule_events (tenant_id, subscriber_id)` | MVP |

### 5.4 Pestaña Soporte

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-SO-08 | Nueva pestaña `soporte` en la ficha, entre «Servicios» y «Datos», con `?tab=soporte` y la misma semántica ARIA de QW2 | MVP |
| RF-SO-09 | Sección **Tickets**: primero los abiertos (por SLA más próximo), después los cerrados recientes; número, asunto, estado, prioridad y vencimiento de SLA. Clic abre `AssuranceTicketDrawer` | MVP |
| RF-SO-10 | Sección **Visitas**: primero las pendientes de agendar y las programadas futuras, después las pasadas; tipo de trabajo, origen (expediente o contrato), fecha y estado. Clic abre el detalle de la visita en un panel de solo lectura con enlace a Agendamiento | MVP |
| RF-SO-11 | Cada sección se muestra solo si la persona tiene el permiso del módulo (D-E6-1). Sin permiso: «No tienes acceso a los tickets» o «No tienes acceso a las visitas», sin consultar la API | MVP |
| RF-SO-12 | «Crear ticket» (con `ASSURANCE_TICKETS_MANAGE`) abre el formulario de Assurance con `requesterType = SUBSCRIBER` y el suscriptor fijado; al crear, la sección se actualiza | MVP |
| RF-SO-13 | Estados de carga (skeleton), vacío («Este suscriptor no tiene tickets», «… no tiene visitas») y error de cada sección, independientes entre sí | MVP |
| RF-SO-14 | Con `privacyRestricted` la pestaña no se muestra, igual que las demás pestañas de detalle | MVP |

### 5.5 Formulario de tickets (MOD10) y datos históricos

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-SO-15 | En `AssuranceCreateTicketForm`, cuando el solicitante es `SUBSCRIBER`, la referencia se elige con un buscador de suscriptores (búsqueda existente de MOD05) en lugar de texto libre. Los demás tipos de solicitante no cambian | MVP |
| RF-SO-16 | CLI `report-ticket-subscriber-links.ts` en simulación: por tenant, conteo de tickets `SUBSCRIBER` cuya referencia no es un id de suscriptor existente, con sus ids de ticket y sin PII | MVP |

## 6. Requerimientos no funcionales

| ID | Requerimiento |
| --- | --- |
| RNF-SO-01 | Las consultas por suscriptor usan los índices de RF-SO-07 (`EXPLAIN` sin barrido secuencial en el tenant de desarrollo) |
| RNF-SO-02 | Sin acceso cruzado a tablas: Assurance y WFM leen CRM solo por `CrmSubscriberReadPort` (ADR-097) |
| RNF-SO-03 | Sin PII nueva en logs ni en la URL: la pestaña usa solo el id del suscriptor |
| RNF-SO-04 | Las dos secciones cargan en paralelo y una falla no bloquea a la otra |
| RNF-SO-05 | OpenAPI actualizado; sin deriva de contratos entre `@iwana/shared`, API y portal |

## 7. Contratos (borrador)

```ts
// MOD05 — CrmSubscriberReadPort (aditivo)
abstract listContractIds(tenantId: string, schemaName: string, subscriberId: string): Promise<string[]>;
abstract findExpedienteId(tenantId: string, schemaName: string, subscriberId: string): Promise<string | null>;

// MOD10 — ListTicketsQuerySchema (aditivo)
subscriberId: z.string().uuid().optional(),

// MOD09 — consultas de visit-requests y events (aditivo)
subscriberId: z.string().uuid().optional(),
```

Una migración tenant de índices (RF-SO-07); ninguna columna nueva.

## 8. Criterios de aceptación

| CA | Criterio |
| --- | --- |
| CA-SO-01 | Un ticket con solicitante = suscriptor, otro con sujeto = suscriptor y otro con sujeto = uno de sus contratos aparecen; uno de otro suscriptor no |
| CA-SO-02 | Una visita con `subscriber_id` y otra originada en el expediente del suscriptor aparecen; la originada en un ticket no se duplica |
| CA-SO-03 | Sin `ASSURANCE_TICKETS_READ` la sección Tickets muestra el aviso y no hace la petición; ídem Visitas sin `WFM_SCHEDULE_READ` |
| CA-SO-04 | Crear un ticket desde la pestaña lo deja con `requester_type = SUBSCRIBER` y el id correcto, y aparece en la sección |
| CA-SO-05 | El formulario de tickets ya no acepta texto libre como referencia de un suscriptor |
| CA-SO-06 | `?tab=soporte` sobrevive a la recarga; la pestaña cumple la navegación por teclado de QW2 |
| CA-SO-07 | `EXPLAIN` de las tres consultas usa los índices nuevos |
| CA-SO-08 | El CLI informa los tickets mal vinculados sin escribir nada |
| CA-SO-09 | Tests de integración contra PostgreSQL para RF-SO-01 y RF-SO-04, corridos en CI (no omitidos) |

## 9. Dependencias, riesgos y decisiones

### 9.1 Decisiones del CTO (G0) — aprobadas el 2026-10-20

**✅ Las seis decisiones se aprobaron con la recomendación de AI-EM-ARCH.** §5 y §7 quedan como contrato congelado.

| # | Decisión | Opciones | Recomendación de AI-EM-ARCH | Motivo |
| --- | --- | --- | --- | --- |
| D-E6-1 | ¿Dónde se compone la pestaña? | **A:** en el portal, llamando a los endpoints de Assurance y WFM con su propio permiso. **B:** un endpoint agregador de CRM que lee tickets y visitas por puertos | **A** | B mostraría tickets y visitas a quien solo tiene `CRM_SUBSCRIBERS_READ`, saltándose el RBAC de cada módulo, y metería a CRM en la proyección de datos ajenos. A respeta permisos y dueños |
| D-E6-2 | ¿Qué tickets pertenecen al suscriptor? | Solicitante, sujeto suscriptor y sujeto contrato (RF-SO-01) vs. solo el solicitante | **Las tres vías** | Un ticket de falla de servicio suele tener como sujeto el contrato y como solicitante a otra persona del cliente; con solo el solicitante se perderían |
| D-E6-3 | ¿Qué visitas pertenecen al suscriptor? | `subscriber_id` o expediente de origen (RF-SO-04), y las de ticket por su ticket, vs. solo `subscriber_id` | **`subscriber_id` o expediente** | La unicidad de la visita es por origen (H7): la instalación nace del expediente y puede no tener `subscriber_id` |
| D-E6-4 | `execution_orders.subscriber_id` es `varchar(160)` | Dejarlo fuera de esta fase vs. migrarlo a `uuid` ahora | **Fuera** | La pestaña no lista OT; las OT se ven desde la visita o el ticket. Migrar el tipo toca MOD11 y merece su propio análisis de datos |
| D-E6-5 | Tickets históricos mal vinculados (H3) | Solo informar con el CLI vs. corregir automáticamente | **Solo informar** | Una referencia en texto libre no permite decidir con certeza a qué suscriptor corresponde; se corrige caso a caso |
| D-E6-6 | Cambio en el formulario de MOD10 | Incluirlo (RF-SO-15) vs. dejarlo para el dueño de Assurance | **Incluirlo** | Sin él, cada ticket nuevo puede seguir quedando mal vinculado y la pestaña seguiría incompleta; el cambio es acotado al tipo `SUBSCRIBER` |

### 9.2 Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La consulta OR de tickets degrada el listado general | Solo se aplica con `subscriberId`; índices parciales y `EXPLAIN` (RNF-SO-01) |
| Assurance o WFM terminan leyendo tablas de CRM | Solo por `CrmSubscriberReadPort` (RNF-SO-02); `boundary-reviewer` en la verificación |
| Pocos tickets históricos bien vinculados hacen ver la pestaña vacía | El CLI mide el tamaño del problema antes del cierre y el informe lo reporta |

## 10. Definición de terminado (DoD)

- RF-SO-01 a RF-SO-16 implementados; CA-SO-01 a CA-SO-09 verificados con conteo real.
- OpenAPI actualizado; migración reversible probada.
- Gates Before Merge en local; commit y push; **CI de `main` en verde** con el job «E2E portal» bloqueante; informe de cierre.
