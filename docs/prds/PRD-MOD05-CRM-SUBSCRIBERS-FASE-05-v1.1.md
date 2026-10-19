# PRD - MOD05 CRM Módulo Subscriber — Fase 05 (Ciclo de vida suscriptor ↔ contrato y suspensión unificada)

**Version:** 1.1
**Estado:** Aprobado
**Fecha:** 2026-10-19
**Modo activo:** Product Architect + Architect
**Autor:** AI-EM-ARCH
**Aprobación:** CTO, 2026-10-19 — G0: D-E4-1 (A), D-E4-2 (lista cerrada provisional), D-E4-3 (tabla nueva), D-E4-4 (A), D-E4-5 (`CRM_SUBSCRIBERS_MANAGE`) y D-E4-6 (solo informar), según las recomendaciones de §9.1; aclaraciones de contrato y límites entre módulos en §9.3 aprobadas durante el lanzamiento
**Origen:** cambio estructural **E4** de la [spec UX de Suscriptores](../specs/2026-10-18-mod05-suscriptores-ux-rediseno-spec.md) §4 (hallazgos D3 y D9) y siguiente fase recomendada en el [cierre de los quick wins](../informes/INFORME-MOD05-SUSCRIPTORES-UX-QW-CIERRE-v1.0.md)
**PRD vigente:** [Fase 04](PRD-MOD05-CRM-SUBSCRIBERS-FASE-04-v1.0.md). Esta fase **reemplaza** RF-STA-03, RF-STA-04 y RF-STA-08 del [PRD padre](PRD-MOD05-CRM-SUBSCRIBERS-v1.0.md) §4.3 (ver §9.3) y no toca el resto
**Trazabilidad base:** [PRD maestro v2.4](PRD_Sistema_ISP_Colombia_v2_4.md) RF-BIL-06 y RF-BIL-07 (corte y reconexión por mora)
**ADRs aplicables:** ADR-058 (PII), ADR-083 (RBAC granular), ADR-088 (culminación de instalación como vínculo comercial de MOD05), ADR-097 (puertos de lectura MOD12/MOD11)
**ADR aplicable a la aclaración de integración:** [ADR-097](../adrs/ADR-097-Puertos-de-lectura-para-avisos-de-terminacion-MOD05.md), requerido al ampliar la vista previa con puertos de lectura de MOD12 y MOD11. La integración con Billing y con la red (RADIUS/OLT) sigue fuera de alcance y requerirá su propia decisión.

---

## 1. Contexto y motivación

Hoy el sistema tiene **dos máquinas de estado que no se conocen**. El operador ve dos botones para «suspender» y ninguno le dice qué efecto tiene.

| # | Hecho verificado (2026-10-19, base de ejecución `main` en `a3c5539e`) | Fuente |
| --- | --- | --- |
| H1 | El suscriptor tiene `LEAD → PROSPECT → ACTIVE ⇄ SUSPENDED → CANCELLED`. Cambiar su estado **no toca ningún contrato** | `subscriber-status-transition.service.ts:27-33, 186-189` |
| H2 | Cada contrato tiene `DRAFT → ACTIVE ⇄ SUSPENDED → TERMINATED → ARCHIVED`. Cambiar su estado **no toca el suscriptor** | `contracts.service.ts:58-68, 945-963, 1027-1060` |
| H3 | Crear o activar un contrato **no valida el estado del suscriptor**: hoy se puede activar un servicio a un suscriptor `SUSPENDED` o `CANCELLED` | `contracts.service.ts:117-160, 1035-1056` |
| H4 | Las acciones de contrato no llevan motivo; las del suscriptor llevan un texto libre que además **se escribe en el log de aplicación** | `contracts.service.ts:946-963`; `subscriber-status-transition.service.ts:205-207` |
| H5 | RF-STA-08 pide registrar cada transición en `StatusChange`, pero esa tabla es del expediente (`expediente_id` obligatorio) y el suscriptor solo deja una entrada de auditoría | `status-change.entity.ts:16-30`; `subscriber-status-transition.service.ts:192-203` |
| H6 | Permisos distintos para el mismo acto: el suscriptor usa `CRM_SUBSCRIBERS_MANAGE`; suspender, reactivar o terminar un contrato usa `CRM_EXPEDIENTES_MANAGE` | `subscribers.controller.ts:526-529`; `contracts.controller.ts:411-444` |
| H7 | **Deriva portal ↔ API:** el portal ofrece `PROSPECT → SUSPENDED`, la API lo rechaza con 400 | `apps/portal/.../subscriber-ui.ts:169-175` vs. `subscriber-status-transition.service.ts:29` |
| H8 | El PRD padre manda suspender «por mora (evento desde Billing)» (RF-STA-03) y el maestro corta el **servicio** por RADIUS (RF-BIL-06). Billing y aprovisionamiento hoy son stubs que solo exponen `activate` | `PRD-MOD05-CRM-SUBSCRIBERS-v1.0.md:194-195`; `PRD_Sistema_ISP_Colombia_v2_4.md:408-409`; `crm/ports/billing-activation.port.ts` |
| H9 | La activación del suscriptor ya es derivada de otro hecho: el evento `crm.expediente.activated` (RF-STA-02) | `subscriber-activation.listener.ts:17-44` |

**Consecuencia operativa:** un suscriptor puede aparecer «Suspendido» con todos sus servicios activos, o «Activo» con todos suspendidos, y la lista filtra por un estado que no describe el servicio.

## 2. Objetivo de la fase

Que haya **una sola verdad** sobre si el cliente tiene servicio: el operador suspende, reactiva o da de baja **servicios** con un motivo de catálogo, ve el efecto antes de confirmar y el estado del suscriptor se mantiene coherente sin intervención manual.

## 3. Alcance

**Dentro:**
- regla de derivación del estado del suscriptor a partir de sus contratos;
- comandos de suspensión, reactivación y terminación por lote sobre los servicios de un suscriptor;
- catálogo cerrado de motivos y nota opcional;
- historial de cambios de estado de suscriptor y contrato;
- guardas cruzadas (no activar servicios a un suscriptor cancelado, no cancelar con servicios vivos);
- permiso único para los actos de ciclo de vida;
- en el portal, el diálogo «Suspender servicios» con vista previa del efecto, las acciones de contrato con motivo y la corrección de H7;
- un CLI que **informa** las inconsistencias existentes (simulación, sin corregir).

**Fuera:**
- integración real con Billing (eventos de mora y pago): se deja el punto de entrada con `source = BILLING`, sin consumidor;
- corte en la red (RADIUS/OLT, ancho de banda reducido): requiere el ADR de dominio de red (E8);
- retiro de equipos en comodato y OT de desinstalación al terminar (MOD12/MOD11): se avisa en la vista previa, no se automatiza;
- cambio de plan (E5), vista lateral y chips (E2).

## 4. Personas y casos de uso

| Persona | Rol | Necesidad |
| --- | --- | --- |
| Agente de soporte | SUPPORT | Suspender a pedido del titular o reactivar tras el pago, con motivo, sin adivinar qué botón |
| Cobranza | ADMIN / SUPPORT | Suspender por mora todos los servicios de una cuenta en un solo acto |
| Supervisor | ADMIN | Saber por qué y cuándo cambió el estado, y quién lo hizo |
| Billing (futuro) | sistema | Suspender y reconectar por evento, con trazabilidad |

| CU | Caso de uso |
| --- | --- |
| CU-LC-01 | Suspender uno, varios o todos los servicios de un suscriptor con un motivo |
| CU-LC-02 | Reactivar servicios suspendidos |
| CU-LC-03 | Terminar servicios (baja) y, si no quedan servicios vivos, cancelar al suscriptor |
| CU-LC-04 | Consultar el historial de estado del suscriptor y de cada contrato |

## 5. Requerimientos funcionales

### 5.1 Derivación del estado (sujeto a D-E4-1)

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-LC-01 | Contratos **vivos** = `ACTIVE` o `SUSPENDED`. `DRAFT`, `TERMINATED` y `ARCHIVED` no cuentan | MVP |
| RF-LC-02 | Para un suscriptor ya activado (`activatedAt` no nulo) y no cancelado: si tiene ≥1 contrato `ACTIVE` su estado es `ACTIVE`; si sus contratos vivos son todos `SUSPENDED` su estado es `SUSPENDED` | MVP |
| RF-LC-03 | Sin contratos vivos, el estado **no cambia** solo; la ficha y la lista muestran el aviso «Sin servicios vigentes» | MVP |
| RF-LC-04 | El estado derivado se **recalcula en la misma transacción** que cambia un contrato y se persiste en `subscribers.status` (la lista y los filtros siguen funcionando sin consultas nuevas) | MVP |
| RF-LC-05 | `LEAD`, `PROSPECT` y la activación por expediente (RF-STA-02) no cambian | MVP |
| RF-LC-06 | `PATCH /crm/subscribers/:id/status` deja de aceptar `ACTIVE ⇄ SUSPENDED`: responde 409 `SUBSCRIBER_STATUS_DERIVED` y remite a los comandos de §5.2. Para `targetStatus=CANCELLED` exige `{ reasonCode, note? }`; el `reasonCode` debe pertenecer a RF-LC-13 y no puede ser `DESCARTE_EXPEDIENTE` (solo sistema) | MVP |

### 5.2 Comandos de ciclo de vida

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-LC-07 | `POST /crm/subscribers/:id/services/suspend` con `{ reasonCode, note?, contractIds? }`: sin `contractIds` suspende todos los contratos `ACTIVE`. Todo o nada, en una transacción | MVP |
| RF-LC-08 | `POST /crm/subscribers/:id/services/reactivate` con `{ reasonCode, note?, contractIds? }`: sin `contractIds` reactiva todos los `SUSPENDED`. Reactivar un contrato exige que el suscriptor no esté `CANCELLED` | MVP |
| RF-LC-09 | `POST /crm/subscribers/:id/services/terminate` con `{ reasonCode, note?, contractIds }`: `contractIds` **obligatorio** (la baja nunca es implícita) | MVP |
| RF-LC-10 | Los endpoints de contrato individual (`/crm/contracts/:id/suspend`, `reactivate`, `terminate`) exigen `{ reasonCode, note? }` y comparten la misma lógica y el mismo recálculo | MVP |
| RF-LC-11 | `POST /crm/subscribers/:id/services/preview` exige `action` (`SUSPEND`, `REACTIVATE` o `TERMINATE`) y los campos válidos para ese acto. Devuelve, sin escribir, los contratos afectados, el estado resultante del suscriptor y, al terminar, avisos de comodato y de OT de retiro abiertas consultados por los puertos de lectura dueños de MOD12 y MOD11 (ADR-097) | MVP |
| RF-LC-12 | Cada comando acepta `Idempotency-Key`, como ya lo envía el portal en `PATCH /crm/subscribers/:id`; un reintento con la misma clave no duplica filas de historial | MVP |

### 5.3 Motivos (sujeto a D-E4-2)

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-LC-13 | Catálogo cerrado en `@iwana/shared`, por acto. **Suspensión:** `MORA`, `SOLICITUD_TITULAR`, `USO_INDEBIDO`, `ORDEN_AUTORIDAD`, `FALLA_TECNICA_PROLONGADA`. **Reactivación:** `PAGO_REGISTRADO`, `FIN_SUSPENSION_SOLICITADA`, `CORRECCION_OPERATIVA`, `LEVANTAMIENTO_ORDEN`. **Terminación / cancelación:** `SOLICITUD_TITULAR`, `MORA_PROLONGADA`, `TRASLADO_SIN_COBERTURA`, `USO_INDEBIDO`, `DUPLICADO`, `DESCARTE_EXPEDIENTE` (solo sistema; no se acepta en comandos manuales de terminación o cancelación) | MVP |
| RF-LC-14 | `note` es opcional, máximo 500 caracteres, se guarda en el historial y **nunca** va al log de aplicación ni a métricas | MVP |
| RF-LC-15 | El catálogo se marca provisional hasta la validación jurídica y comercial (§9.2, Q1) | MVP |

### 5.4 Guardas cruzadas (sujeto a D-E4-4)

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-LC-16 | Crear o activar un contrato para un suscriptor `CANCELLED` → 409 `SUBSCRIBER_CANCELLED` | MVP |
| RF-LC-17 | Activar un contrato nuevo cuando el suscriptor está `SUSPENDED` con motivo vigente `MORA` → 409 `SUBSCRIBER_SUSPENDED_FOR_DELINQUENCY`. Crear el borrador sí se permite | MVP |
| RF-LC-18 | Cancelar un suscriptor con contratos vivos → 409 `SUBSCRIBER_HAS_LIVE_CONTRACTS` con la lista de ids. Los contratos `DRAFT` se descartan (soft delete) en la misma transacción, con auditoría | MVP |

### 5.5 Historial y trazabilidad (sujeto a D-E4-3)

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-LC-19 | Tabla tenant `crm_lifecycle_changes`: `entity_type` (`SUBSCRIBER` \| `CONTRACT`), `entity_id`, `subscriber_id`, `from_status`, `to_status`, `reason_code`, `note`, `source` (`MANUAL` \| `SYSTEM` \| `BILLING`), `batch_id`, `actor_id`, `changed_at`. Inmutable (sin UPDATE ni DELETE desde la app); las cancelaciones manuales persisten `reason_code` obligatorio y `note` opcional | MVP |
| RF-LC-20 | Un comando por lote comparte `batch_id` entre todas sus filas, incluida la del suscriptor | MVP |
| RF-LC-21 | `contracts` gana `status_reason_code` y `status_changed_at` (último cambio), para mostrarlos sin consultar el historial | MVP |
| RF-LC-22 | `GET /crm/subscribers/:id/lifecycle-changes` paginado (ADR-065), con proyección sin `note` para roles sin `CRM_SUBSCRIBERS_MANAGE` | MVP |
| RF-LC-23 | La auditoría GSEC-01 se mantiene; el log de aplicación registra solo ids, estados y `reason_code` (corrige H4) | MVP |

### 5.6 Permisos (sujeto a D-E4-5)

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-LC-24 | Todos los comandos de §5.2, incluidos los de contrato individual, exigen `CRM_SUBSCRIBERS_MANAGE` y los roles ADMIN o SUPPORT. `CRM_EXPEDIENTES_MANAGE` deja de habilitar transiciones de contrato | MVP |

### 5.7 Portal

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-LC-25 | En la ficha, la acción primaria según el estado: «Suspender servicios» (`ACTIVE`), «Reactivar servicios» (`SUSPENDED`). «Cambiar estado» queda solo para `LEAD → PROSPECT` y la cancelación | MVP |
| RF-LC-26 | Diálogo en dos pasos: (1) servicios a incluir (todos marcados por defecto), motivo y nota; (2) vista previa de RF-LC-11 y confirmación. Errores con el mensaje de la API | MVP |
| RF-LC-27 | Las acciones del menú de `ContractCard` piden motivo con el mismo componente | MVP |
| RF-LC-28 | Se corrige H7: el portal deja de ofrecer transiciones que la API no acepta (la tabla del portal se alinea con la de la API) | MVP |
| RF-LC-29 | La ficha muestra el último motivo y la fecha de suspensión en el contrato, y el aviso «Sin servicios vigentes» de RF-LC-03 | MVP |

## 6. Requerimientos no funcionales

| ID | Requerimiento |
| --- | --- |
| RNF-LC-01 | Aislamiento por schema de tenant en toda consulta y escritura (`runInTenantSchema`) |
| RNF-LC-02 | Los comandos por lote bloquean las filas de los contratos afectados (`SELECT … FOR UPDATE`) para evitar carreras con el contrato individual |
| RNF-LC-03 | Sin PII en logs, métricas ni mensajes de error (gate de `AGENTS.md`) |
| RNF-LC-04 | Migración reversible y aditiva; ningún enum persistido se amplía |
| RNF-LC-05 | Cobertura ≥80 % del servicio de ciclo de vida, con un test integrado contra Postgres por cada código 409 de §5.4 |
| RNF-LC-06 | OpenAPI actualizado para los endpoints nuevos y los cambios de carga útil |

## 7. Modelo de datos y contratos (borrador)

```sql
CREATE TABLE crm_lifecycle_changes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  entity_type   varchar(16) NOT NULL CHECK (entity_type IN ('SUBSCRIBER','CONTRACT')),
  entity_id     uuid NOT NULL,
  subscriber_id uuid NOT NULL REFERENCES subscribers(id),
  from_status   varchar(30) NOT NULL,
  to_status     varchar(30) NOT NULL,
  reason_code   varchar(40) NOT NULL,
  note          varchar(500),
  source        varchar(16) NOT NULL CHECK (source IN ('MANUAL','SYSTEM','BILLING')),
  batch_id      uuid NOT NULL,
  actor_id      uuid,
  changed_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lifecycle_subscriber ON crm_lifecycle_changes (tenant_id, subscriber_id, changed_at DESC);

ALTER TABLE contracts
  ADD COLUMN status_reason_code varchar(40),
  ADD COLUMN status_changed_at  timestamptz;
```

- `reason_code` con CHECK contra el catálogo de RF-LC-13 (se cambia una lista y su CHECK si jurídica ajusta el catálogo).
- `note` puede contener datos del titular: entra en el alcance de la supresión de la Fase 1b de privacidad (anonimizar `note` al suprimir al titular). **Verificar con `sec-eng`** si debe cifrarse (§9.2, Q3).
- Esquemas Zod en `@iwana/shared`: comandos discriminados por acto, `LifecyclePreviewRequestSchema` con `action` obligatorio, `TransitionSubscriberStatusSchema` con `reasonCode` en cancelaciones manuales y `LifecyclePreviewResponse`.

## 8. Criterios de aceptación

| CA | Criterio |
| --- | --- |
| CA-LC-01 | Suspender todos los servicios deja los contratos en `SUSPENDED`, el suscriptor en `SUSPENDED` y N+1 filas con el mismo `batch_id` |
| CA-LC-02 | Reactivar un solo contrato de un suscriptor suspendido lo deja `ACTIVE` |
| CA-LC-03 | Suspender un contrato individual cuando otro sigue activo deja al suscriptor `ACTIVE` |
| CA-LC-04 | `PATCH /status` a `SUSPENDED` responde 409 `SUBSCRIBER_STATUS_DERIVED` |
| CA-LC-05 | Cada 409 de §5.4 tiene su test integrado contra Postgres real |
| CA-LC-06 | La vista previa no escribe nada (conteo de filas igual antes y después) |
| CA-LC-07 | Un fallo a mitad del lote no deja ningún contrato cambiado (atomicidad) |
| CA-LC-08 | El log de aplicación no contiene `note` ni texto libre (test que captura el logger) |
| CA-LC-09 | Un usuario con solo `CRM_EXPEDIENTES_MANAGE` recibe 403 en las transiciones de contrato |
| CA-LC-10 | El portal ya no ofrece `PROSPECT → SUSPENDED`; el diálogo muestra la vista previa y exige motivo |
| CA-LC-11 | El CLI de inconsistencias, en simulación, lista los suscriptores cuyo estado no coincide con RF-LC-02, sin modificar datos |

## 9. Dependencias, riesgos y decisiones

### 9.1 Decisiones del CTO (G0) — aprobadas el 2026-10-19

**✅ Las seis decisiones se aprobaron con la recomendación de AI-EM-ARCH.** Las secciones §5.1 a §5.6 quedan como contrato congelado.

| # | Decisión | Opciones | Recomendación de AI-EM-ARCH | Motivo |
| --- | --- | --- | --- | --- |
| D-E4-1 | ¿Quién manda sobre la suspensión? | **A:** el contrato manda y el suscriptor **deriva** (§5.1). **B:** el suscriptor manda y propaga en cascada a sus contratos. **C:** siguen independientes y la UI solo advierte | **A** | El corte real es por servicio (RF-BIL-06, RADIUS por línea) y un cliente PyME puede tener varios puntos con situaciones distintas. B obliga a decidir qué hacer con contratos suspendidos por otro motivo al reactivar en cascada. C deja la inconsistencia de §1. A sigue el patrón ya usado en MOD12 (estado derivado en lugar de ampliar el enum) y la activación ya es derivada (H9) |
| D-E4-2 | Catálogo de motivos | Lista cerrada provisional (RF-LC-13) vs. catálogo configurable por tenant | **Lista cerrada provisional** en `@iwana/shared` | Permite analítica comparable entre tenants y se ajusta cambiando una lista y su CHECK. La configurabilidad por tenant puede venir después sin romper datos |
| D-E4-3 | ¿Dónde vive el historial? | Tabla nueva `crm_lifecycle_changes` vs. reutilizar `status_changes` del expediente | **Tabla nueva** | `status_changes` exige `expediente_id` (H5); generalizarla migraría una tabla del pipeline comercial que ya funciona. RF-STA-08 queda reemplazado por RF-LC-19 |
| D-E4-4 | ¿Cancelar al suscriptor termina sus servicios en cascada? | **A:** bloquear con 409 y guiar a terminar primero (RF-LC-18). **B:** cascada automática | **A** | Terminar tiene consecuencias fuera de MOD05: equipos en comodato (MOD12), OT de retiro (MOD11) y, cuando exista, facturación final. Una cascada silenciosa dejaría equipos sin rastrear |
| D-E4-5 | Permiso para los actos de ciclo de vida | `CRM_SUBSCRIBERS_MANAGE` para todo vs. permiso nuevo `CRM_SERVICES_SUSPEND` | **`CRM_SUBSCRIBERS_MANAGE`** | Corrige H6 sin ampliar el catálogo de ADR-083. Si el CTO quiere que cobranza suspenda sin poder editar la ficha, se elige el permiso nuevo y se agrega su seed |
| D-E4-6 | Datos existentes inconsistentes | Corregir automáticamente vs. solo informar | **Solo informar** (CLI en simulación, RF-LC-11 y CA-LC-11) y corregir caso a caso | Un suscriptor marcado suspendido a mano pudo serlo por un motivo real que no está en los contratos; recalcular sin mirar perdería esa decisión |

### 9.2 Preguntas abiertas (no bloquean G0)

| Q | Pregunta | A quién |
| --- | --- | --- |
| Q1 | ¿El catálogo cubre las causales que el régimen de protección al usuario de servicios de comunicaciones exige distinguir (suspensión a solicitud del usuario, plazos, preaviso)? | Asesoría jurídica |
| Q2 | Días de mora para suspender y para cortar (RF-BIL-06) | CTO / comercial, cuando exista Billing |
| Q3 | ¿`note` se cifra en reposo o basta con anonimizarla en la supresión? | `sec-eng` |

### 9.3 Requerimientos reemplazados

| Requerimiento anterior | Reemplazo |
| --- | --- |
| RF-STA-03 (ACTIVE → SUSPENDED por mora o manual) | RF-LC-02, RF-LC-07, RF-LC-13 |
| RF-STA-04 (SUSPENDED → ACTIVE por pago o manual) | RF-LC-02, RF-LC-08, RF-LC-13 |
| RF-STA-08 (registro en `StatusChange`) | RF-LC-19 a RF-LC-22 |

#### 9.3.1 Aclaraciones aprobadas durante el lanzamiento (2026-10-19)

La decisión aprobada amplía la solución para completar RF-LC-11 mediante puertos de lectura tipados propiedad de los módulos dueños, según ADR-097. MOD12 reporta los contratos seleccionados con comodato abierto; MOD11 reporta si el suscriptor tiene OT de tipo `RETIREMENT` en estado `CREATED`, `ASSIGNED`, `EN_ROUTE`, `IN_PROGRESS` o `BLOCKED`, no anulada. CRM consume ambas lecturas sin consultar tablas ajenas. No se ejecutan retiros ni cierres de órdenes.

La ruta única de vista previa recibe `action` obligatorio (`SUSPEND`, `REACTIVATE` o `TERMINATE`) y un comando válido para ese acto. La cancelación manual por `PATCH /crm/subscribers/:id/status` recibe `reasonCode` obligatorio y `note?`; aplica los motivos de RF-LC-13 para terminación/cancelación, excluyendo `DESCARTE_EXPEDIENTE`, que es de uso exclusivo del sistema. Ese código tampoco se acepta en comandos manuales de terminación.

### 9.4 Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Carrera entre comando por lote y acción individual | RNF-LC-02 y CA-LC-07 |
| Romper consumidores del `PATCH /status` | Único consumidor: el portal, que se migra en el mismo plan (B3) |
| Inconsistencias históricas visibles al activar la derivación | D-E4-6: el CLI informa antes del despliegue |

## 10. Definición de terminado (DoD)

- RF-LC-01 a RF-LC-29 implementados y CA-LC-01 a CA-LC-11 verificados con conteo real de tests.
- Migración reversible probada (up/down) por tenant.
- OpenAPI actualizado; sin deriva de contratos entre `@iwana/shared`, API y portal.
- Gates Before Merge de `AGENTS.md` y CI de `main` en verde.
- PRD padre y HLD-MOD05 actualizados con la referencia a esta fase; informe de cierre en `docs/informes/`.
