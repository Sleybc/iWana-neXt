# PRD - MOD05 CRM Módulo Subscriber — Fase 09 (Ciclo de facturación y fecha de corte del servicio)

**Version:** 1.0
**Estado:** Sustituido por [v1.1](PRD-MOD05-CRM-SUBSCRIBERS-FASE-09-v1.1.md) el 2026-10-30 (enmienda E1); aprobado por el CTO el 2026-10-30
**Aprobación:** CTO, 2026-10-30 — G0: ADR-102 y D-F9-1 (a), D-F9-2 (a) y D-F9-3 (a), según las recomendaciones de §9.1
**Fecha:** 2026-10-30
**Modo activo:** Product Architect + Architect
**Autor:** AI-EM-ARCH
**Origen:** regla de negocio fijada por el CTO el 2026-10-30 (ciclos 1 y 15; corte el 15 y el 30). Decisiones C1–C3 registradas en [ADR-102](../adrs/ADR-102-Ciclo-Facturacion-y-Fecha-de-Corte-por-Servicio.md) §Contexto
**PRD vigente:** [Fase 08](PRD-MOD05-CRM-SUBSCRIBERS-FASE-08-v1.0.md); para ciclo de vida y suspensión, [Fase 05 v1.2](PRD-MOD05-CRM-SUBSCRIBERS-FASE-05-v1.2.md). Esta fase no cambia la suspensión manual
**ADR aplicable:** ADR-102 (Aprobado, 2026-10-30)
**ADR nuevo requerido:** ninguno adicional (ADR-102 emitido y aprobado con esta fase)
**Plan:** [2026-10-30-mod05-ciclo-facturacion](../plans/2026-10-30-mod05-ciclo-facturacion.md)

---

## 1. Contexto y motivación

iWana factura en dos ciclos: el día 1 y el día 15 de cada mes. Quien no paga se corta: ciclo 1 el día 15, ciclo 15 el día 30. Hoy el sistema no puede aplicar esa regla.

| # | Hecho verificado (2026-10-30, `main` en `1ce4f263`) | Fuente |
| --- | --- | --- |
| H1 | «Activar» un servicio es `POST /crm/contracts/:id/activate`, sin cuerpo; el portal lo llama directo desde la pestaña Servicios, sin diálogo | `contracts.controller.ts:618`; `ServiciosTab.tsx:171-218`; `api-client.ts:7138` |
| H2 | El ciclo del contrato es texto libre de hasta 20 caracteres, opcional, y nada lo usa | `apps/api/src/modules/crm/contracts/entities/contract.entity.ts:110`; `contract.schema.ts`; `CreateContractDialog.tsx`; `ContractDetailDrawer.tsx:1050, 1070` |
| H3 | No existen facturación, pagos ni cartera; el sistema no sabe quién pagó | PRD maestro §14.2; exploración de `apps/api/src/modules` |
| H4 | La suspensión es manual, con motivo `MORA`; el origen `BILLING` está reservado sin uso | `subscriber-lifecycle.service.ts`; `lifecycle.schema.ts` |
| H5 | El suscriptor deriva su estado de sus contratos; el corte es por servicio (D-E4-1) | `subscriber-lifecycle.util.ts:13`; PRD Fase 05 v1.2 |
| H6 | La zona horaria del tenant está en `tenants.settings.timezone` (por defecto `America/Bogota`) | `apps/api/src/modules/tenant/tenant.service.ts` |

## 2. Objetivo

Que todo servicio activo tenga un día de facturación válido, elegido al activarlo, y que la operación vea cada día qué servicios llegan a su fecha de corte.

## 3. Alcance

**Dentro:**
- catálogo de ciclos por tenant, sembrado con `1→15` y `15→30` (ADR-102 D2);
- ciclo obligatorio al activar el servicio (D3);
- selector de ciclo al crear y editar el contrato, y al convertir un expediente;
- «Próximo corte» visible en el servicio;
- agenda de corte por fecha, con el conteo de servicios sin ciclo (D7).

**Fuera:**
- corte automático (ADR-102 D6: comportamiento objetivo, bloqueado por P1–P3);
- registro de pagos, facturas, cartera, Wompi, reconexión automática;
- edición del catálogo desde Configuración (la sección Facturación sigue «Próximamente»);
- asignar ciclo a contratos existentes de forma masiva o automática (D4);
- corte en la red (MOD13);
- eliminar la columna `billing_cycle` deprecada.

## 4. Casos de uso

| CU | Caso de uso |
| --- | --- |
| CU-CF-01 | Al activar un servicio, el operador elige el ciclo (o confirma el que ya tenía) y ve la fecha del próximo corte |
| CU-CF-02 | Al crear o editar un contrato, el operador elige el ciclo de una lista cerrada |
| CU-CF-03 | El operador abre la agenda de corte del día y ve qué servicios llegan a su fecha de corte, por ciclo |
| CU-CF-04 | El operador ve cuántos servicios activos no tienen ciclo y los corrige editando el contrato |

## 5. Requerimientos funcionales

### 5.1 Catálogo de ciclos

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-CF-01 | Tabla `crm_billing_cycles` en el schema tenant, con `cycle_day` (1–28), `cutoff_day` (1–31, mayor que `cycle_day`), `active`, `updated_by`, `updated_at` | MVP |
| RF-CF-02 | La migración siembra `(1, 15)` y `(15, 30)` en todos los tenants | MVP |
| RF-CF-03 | `GET /crm/billing-cycles` devuelve los ciclos activos ordenados por `cycle_day`; permiso `CRM_SUBSCRIBERS_READ` | MVP |

### 5.2 Ciclo en el contrato

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-CF-04 | Columna `contracts.billing_cycle_day smallint NULL` con FK a `crm_billing_cycles(cycle_day)` e índice `(status, billing_cycle_day)` | MVP |
| RF-CF-05 | Crear, editar y convertir expediente aceptan `billingCycleDay` opcional; un valor inexistente o inactivo → 422 `BILLING_CYCLE_INVALID` | MVP |
| RF-CF-06 | `billingCycle` (texto) deja de aceptarse en crear y editar desde el portal; el API lo sigue aceptando como deprecado (OpenAPI `deprecated: true`) y lo devuelve en la respuesta | MVP |
| RF-CF-07 | Al convertir un expediente, si su `billingCycle` es exactamente el número de un ciclo activo, el formulario lo propone como valor inicial; el operador lo confirma | MVP |
| RF-CF-08 | El cambio de `billingCycleDay` se audita con valor anterior y nuevo, como el resto de campos editables del contrato | MVP |

### 5.3 Activación

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-CF-09 | `POST /crm/contracts/:id/activate` acepta cuerpo opcional `{ billingCycleDay?: number }` con la tabla de resultados de ADR-102 D3 | MVP |
| RF-CF-10 | Activar sin ciclo en el contrato ni en el cuerpo → 422 `BILLING_CYCLE_REQUIRED`; el contrato sigue en `DRAFT` | MVP |
| RF-CF-11 | Guardar el ciclo y activar ocurren en la misma transacción y bajo el mismo bloqueo de fila que ya usa `_transition` | MVP |
| RF-CF-12 | En el portal, «Activar» abre un diálogo con el selector de ciclo (preseleccionado si el contrato ya lo tiene) y el texto «Próximo corte: {fecha}» que se actualiza al elegir | MVP |

### 5.4 Fecha de corte y agenda

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-CF-13 | Función pura `computeCutoffDate({ cycleDay, cutoffDay, year, month })` en `@iwana/shared`: `min(cutoffDay, último día del mes)`, sin corrimiento por festivos | MVP |
| RF-CF-14 | Función `computeNextCutoffDate({ cycleDay, cutoffDay, today })`: el corte del mes de `today` si `today` ≤ ese corte; si no, el del mes siguiente. `today` es la fecha local del tenant, `YYYY-MM-DD` | MVP |
| RF-CF-15 | La tarjeta y el detalle del servicio muestran «Ciclo: día {n}» y «Próximo corte: {fecha}» para contratos `ACTIVE` con ciclo; «Sin ciclo de facturación» si no lo tiene | MVP |
| RF-CF-16 | `GET /crm/billing-cycles/cutoff-agenda?date=` devuelve los contratos `ACTIVE` con corte en `date`, con suscriptor (campos de la proyección de lista vigente para el rol), plan, ciclo y fecha; paginado; `date` por defecto = hoy local del tenant | MVP |
| RF-CF-17 | La respuesta de la agenda incluye `withoutCycleCount`: contratos `ACTIVE` sin ciclo | MVP |
| RF-CF-18 | La agenda se ve en el portal dentro de Suscriptores, con selector de fecha, agrupación por ciclo, enlace a la ficha y la leyenda «El sistema todavía no registra pagos: esta es la lista de servicios con corte programado» | MVP |
| RF-CF-19 | Desde la agenda, la acción disponible es la suspensión manual existente (motivo `MORA`); no hay acción masiva en esta fase | MVP |

## 6. Requerimientos no funcionales

| ID | Requerimiento |
| --- | --- |
| RNF-CF-01 | La fecha local se calcula con la zona del tenant; nunca con la del servidor ni en UTC |
| RNF-CF-02 | La agenda no expone PII que la lista operativa no exponga ya al mismo rol (ADR-067) |
| RNF-CF-03 | La agenda responde en p95 < 500 ms con 100 000 contratos en el tenant (índice de RF-CF-04; consulta por `billing_cycle_day IN (...)` derivada de la fecha) |
| RNF-CF-04 | La migración es reversible y no reescribe filas de `contracts` |
| RNF-CF-05 | Textos visibles revisados con `system-vocabulary-review`: «ciclo de facturación», «día de facturación», «fecha de corte», sin «cutoff» ni «billing» |

## 7. Contratos (borrador — se congelan en el prompt de ejecución)

```ts
// @iwana/shared — schemas/billing-cycle.schema.ts
export const BillingCycleSchema = z.object({
  cycleDay: z.number().int().min(1).max(28),
  cutoffDay: z.number().int().min(1).max(31),
  active: z.boolean(),
});
export type BillingCycle = z.infer<typeof BillingCycleSchema>;

export const ActivateContractSchema = z.object({
  billingCycleDay: z.number().int().min(1).max(28).optional(),
}).strict();

export const CutoffAgendaQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export interface CutoffAgendaItem {
  contractId: string;
  subscriberId: string;
  subscriberDisplayName: string;   // de la proyección de lista vigente
  planName: string | null;
  billingCycleDay: number;
  cutoffDate: string;              // YYYY-MM-DD
}
export interface CutoffAgendaResponse {
  date: string;
  items: CutoffAgendaItem[];
  meta: ListMeta;                  // el ListMeta compartido existente
  withoutCycleCount: number;
}

// @iwana/shared — calendar/billing-cutoff.ts
export function computeCutoffDate(i: { cycleDay: number; cutoffDay: number; year: number; month: number }): string;
export function computeNextCutoffDate(i: { cycleDay: number; cutoffDay: number; today: string }): string;

// Errores (lista de códigos de contrato existente)
'BILLING_CYCLE_REQUIRED' | 'BILLING_CYCLE_INVALID'
```

Contrato y respuesta de contrato: se añade `billingCycleDay: number | null`; `billingCycle` se mantiene, marcado deprecado.

### 7.1 Trazado regla → campo

| Regla | DTO / esquema | DDL | Lectura |
| --- | --- | --- | --- |
| Ciclo elegido al activar (D3) | `ActivateContractSchema.billingCycleDay` | `contracts.billing_cycle_day` | `ContractResponse.billingCycleDay` |
| Solo ciclos del catálogo (D1, D2) | validación contra `crm_billing_cycles.active` | FK `contracts.billing_cycle_day → crm_billing_cycles.cycle_day` | `GET /crm/billing-cycles` |
| Corte = `min(cutoff_day, último día)` (D5) | `computeCutoffDate` | `crm_billing_cycles.cutoff_day` | `CutoffAgendaItem.cutoffDate`; «Próximo corte» en portal |
| Agenda del día (D7) | `CutoffAgendaQuerySchema.date` | índice `(status, billing_cycle_day)` | `CutoffAgendaResponse.items` |
| Servicios sin ciclo (D4) | — | `billing_cycle_day IS NULL` | `CutoffAgendaResponse.withoutCycleCount` |
| Auditoría del cambio (RF-CF-08) | update/activate | tabla de auditoría existente | historial de auditoría del contrato |

## 8. Criterios de aceptación

| CA | Criterio |
| --- | --- |
| CA-CF-01 | Tras migrar, cada tenant de prueba tiene exactamente los ciclos `(1,15)` y `(15,30)`; el `down` deja el schema como estaba |
| CA-CF-02 | Activar un `DRAFT` sin ciclo y sin cuerpo → 422 `BILLING_CYCLE_REQUIRED` y el contrato sigue `DRAFT` (Postgres real) |
| CA-CF-03 | Activar con `{ billingCycleDay: 15 }` → `ACTIVE` con `billing_cycle_day = 15` y registro de auditoría (Postgres real) |
| CA-CF-04 | Activar con `{ billingCycleDay: 7 }` → 422 `BILLING_CYCLE_INVALID`; con un ciclo marcado inactivo → 422 (Postgres real) |
| CA-CF-05 | `computeCutoffDate` en tabla: ciclo 1 en cualquier mes → día 15; ciclo 15 en enero → 30, abril → 30, febrero 2027 → 28, febrero 2028 → 29, diciembre → 30 |
| CA-CF-06 | `computeNextCutoffDate`: con `today` = día de corte devuelve ese día; con `today` = día siguiente devuelve el del mes siguiente; cruce diciembre → enero |
| CA-CF-07 | Agenda con `date = 2026-11-15` devuelve solo contratos `ACTIVE` de ciclo 1; con `2026-11-30`, solo los de ciclo 15; con `2027-02-28`, los de ciclo 15; `withoutCycleCount` correcto; contratos `DRAFT` y `SUSPENDED` excluidos (Postgres real) |
| CA-CF-08 | Agenda sin `date` a las 21:00 de Bogotá usa la fecha de Bogotá, no la de UTC |
| CA-CF-09 | Un rol sin `CRM_SUBSCRIBERS_READ` recibe 403 en la agenda y en el catálogo |
| CA-CF-10 | Portal: «Activar» abre el diálogo; sin ciclo el botón de confirmar está deshabilitado; al elegir 15 muestra el próximo corte correcto (prueba de componente) |
| CA-CF-11 | Portal: crear y editar contrato muestran selector con «Día 1» y «Día 15», no un campo de texto (prueba de componente) |
| CA-CF-12 | E2E: activar un servicio eligiendo el ciclo y verlo en la agenda de su fecha de corte |

## 9. Dependencias, riesgos y decisiones

### 9.1 Decisiones del CTO (G0) — aprobadas el 2026-10-30

Ya decididas el 2026-10-30 (ADR-102 §Contexto): C1 alcance, C2 corte automático como objetivo, C3 calendario. **✅ D-F9-1 a D-F9-3 se aprobaron el 2026-10-30 con la recomendación de AI-EM-ARCH.** §5 y §7 quedan como contrato congelado.

| # | Decisión | Opciones | Recomendación de AI-EM-ARCH | Motivo |
| --- | --- | --- | --- | --- |
| D-F9-1 | Reconciliación C1 ↔ C2 | (a) corte automático diferido hasta P1–P3 de ADR-102 D6 · (b) construir el job ahora apagado | **(a)** | Sin señal de pago no hay forma correcta de probarlo (ADR-102 A5) |
| D-F9-2 | Contratos existentes sin ciclo | (a) se corrigen a mano con el contador de la agenda · (b) script que asigne el ciclo por texto libre | **(a)** | El texto libre no es confiable; un ciclo mal asignado produce un corte en fecha equivocada |
| D-F9-3 | Ubicación de la agenda | (a) vista dentro de Suscriptores · (b) entrada propia en el menú | **(a)**; la forma exacta la propone `prod-ux` | Es una cola de trabajo de los mismos operadores de la lista |

### 9.2 Dependencias

- Módulo de Facturación (no iniciado): precondición P1 de ADR-102 D6.
- Q1 de la Fase 05 (jurídica, régimen CRC): precondición P2 — **requiere verificación con fuente oficial**.
- MOD13: precondición P3 (ejecutor del corte en red).

### 9.3 Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La agenda se interpreta como lista de morosos | Leyenda RF-CF-18 y rótulo «corte programado» |
| Fechas desplazadas por zona horaria | RNF-CF-01 y CA-CF-08 |
| El portal deja de enviar `billingCycle` y otro cliente lo sigue usando | RF-CF-06: el API lo acepta deprecado; `contract-drift-reviewer` busca consumidores |

## 10. Definición de terminado (DoD)

- RF-CF-01 a RF-CF-19 implementados; CA-CF-01 a CA-CF-12 verificados con conteo real (integración Postgres > 0 tests ejecutados, sin caché de turbo).
- Suite completa de `@iwana/api` (cambia un `@Module`), `@iwana/shared` y `@iwana/portal` en verde; `audit-ui.mjs` en 0 en las pantallas tocadas.
- Commit y push; **CI de `main` en verde por SHA** (G6.5); informe de cierre de la fase.
