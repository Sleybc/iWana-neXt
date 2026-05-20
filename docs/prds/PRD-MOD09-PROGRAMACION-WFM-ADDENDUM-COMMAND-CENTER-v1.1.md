# PRD - MOD09 Programacion / WFM Addendum Command Center

**Version:** 1.1  
**Estado:** Aprobado  
**Fecha:** 2026-05-09  
**Modo activo:** Mixto  
**Autor:** AI-EM-ARCH  
**PRD base:** docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md  
**HLD vigente:** docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md  
**ADR vigente:** docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md  
**Spec relacionada:** docs/specs/SPEC-MOD09-PROGRAMACION-WFM-COMMAND-CENTER-v1.0.md  
**Plan relacionado:** docs/plans/PLAN-MOD09-PROGRAMACION-WFM-FASE-02-v1.0.md  
**Prompt de ejecucion:** docs/prompts/PROMPT-MOD09-PROGRAMACION-WFM-FASE-02-v1.0.md  
**Informe relacionado:** docs/informes/INFORME-MOD09-FASE-02-v1.0.md

> Este addendum amplia el alcance funcional de MOD09 sin cambiar el bounded context aprobado ni reabrir ADR-037.

---

## 1. Contexto y motivacion

La Fase 01 de MOD09 dejo operativa la agenda tenant-aware de WFM en el portal bajo `/dashboard/scheduling`, con eventos, Work Orders ligeras, reagendamiento, cambio de estados, dashboard basico y panel de tecnicos.

La nueva necesidad de producto no es crear un segundo modulo ni introducir infraestructura de tiempo real. El objetivo es evolucionar la experiencia actual hacia un command center liviano que permita a coordinadores, NOC y supervisores entender el estado operativo en pocos segundos y tomar decisiones sobre la agenda ya existente.

Este corte prioriza visibilidad operacional, alertas derivadas de datos ya disponibles, timeline de supervision y carga por tecnico. Quedan explicitamente fuera de esta fase mapas, GPS continuo, dispatch asistido, IA, inventario, app movil tecnica y playback operacional.

---

## 2. Alcance en scope / fuera de scope

### En scope Fase 02

- Convertir `/dashboard/scheduling` en una entrada de supervision operativa para roles de coordinacion.
- Incorporar una vista `command-center` o equivalente dentro de la superficie actual de scheduling.
- Mostrar KPIs priorizados: trabajos activos, atrasados, proximos, en ruta y en riesgo.
- Exponer alertas operativas derivadas de reglas deterministicas sobre agenda y disponibilidad.
- Mostrar timeline diario por tecnico con foco en supervision, no en edicion drag-and-drop.
- Mostrar carga operativa y banda de saturacion por tecnico.
- Permitir abrir detalle de evento, reagendar y avanzar estados desde la misma superficie existente.
- Reutilizar endpoints actuales de eventos y disponibilidad, extendiendo el dashboard summary solo si es necesario.
- Mantener vistas calendario y lista actuales como vistas secundarias, no eliminarlas.
- Cubrir pruebas backend, frontend y E2E focalizadas de la nueva experiencia.

### Fuera de scope Fase 02

- Mapa operativo o georreferenciacion visual.
- GPS en tiempo real, WebSocket, SSE o telemetria continua.
- Motor de optimizacion de rutas o sugerencias IA.
- Kanban operacional.
- Capacity planning por zona.
- App movil tecnica, firma, evidencias, materiales o inventario.
- Nuevas tablas persistentes para alertas o timeline.
- Cambio de ruta principal fuera de `/dashboard/scheduling`.

---

## 3. Personas y casos de uso

| Persona                | Rol                 | Necesidad principal                                                                 |
| ---------------------- | ------------------- | ----------------------------------------------------------------------------------- |
| Coordinador operativo  | ADMIN, NOC, SUPPORT | Detectar rapidamente retrasos, carga y eventos en riesgo                            |
| Supervisor de tecnicos | ADMIN, NOC          | Ver saturacion por tecnico y reordenar trabajo desde la agenda existente            |
| Tecnico de campo       | TECHNICIAN          | Mantener acceso a su agenda asignada sin exponerle paneles de supervision completos |

| CU        | Actor       | Descripcion                                                                            |
| --------- | ----------- | -------------------------------------------------------------------------------------- |
| CU-WFM-10 | Coordinador | Abrir el command center y entender el estado operativo del dia en menos de 10 segundos |
| CU-WFM-11 | Coordinador | Identificar eventos atrasados o en riesgo y abrir su detalle directamente              |
| CU-WFM-12 | Supervisor  | Ver saturacion por tecnico y filtrar la agenda por responsable                         |
| CU-WFM-13 | Coordinador | Navegar entre command center, calendario y lista sin perder filtros                    |
| CU-WFM-14 | Tecnico     | Seguir viendo solo su agenda asignada, sin superficie de supervision innecesaria       |

---

## 4. Requerimientos funcionales

| ID        | Requerimiento                                                                                                            | Prioridad |
| --------- | ------------------------------------------------------------------------------------------------------------------------ | --------- |
| RF-WFM-16 | La UI debe ofrecer una vista operacional priorizada para supervision dentro de la ruta actual de scheduling.             | MVP       |
| RF-WFM-17 | El dashboard summary debe exponer contadores priorizados y carga por tecnico suficiente para supervision diaria.         | MVP       |
| RF-WFM-18 | El sistema debe derivar alertas operativas sin persistencia nueva, usando reglas sobre estado, horario y disponibilidad. | MVP       |
| RF-WFM-19 | La vista timeline debe mostrar eventos por tecnico para el dia seleccionado, con posicion temporal y severidad visual.   | MVP       |
| RF-WFM-20 | Un coordinador debe poder abrir el detalle de un evento desde KPI, alerta o timeline.                                    | MVP       |
| RF-WFM-21 | La vista debe resaltar tecnicos con banda de saturacion `LOW`, `MEDIUM` o `HIGH`.                                        | MVP       |
| RF-WFM-22 | La experiencia debe mantener filtros sincronizados entre vista operacional, calendario y lista.                          | MVP       |
| RF-WFM-23 | Los roles `TECHNICIAN` y `CONTRACTOR` no deben ver indicadores globales ni alertas fuera de su ownership aprobado.       | MVP       |
| RF-WFM-24 | El command center debe renderizar estados vacios y cobertura parcial sin romper la experiencia.                          | MVP       |
| RF-WFM-25 | La fase no debe introducir drag-and-drop, mapa ni algoritmos de dispatch automatico.                                     | MVP       |

---

## 5. Requerimientos no funcionales

| ID         | Requerimiento                     | Criterio                                                                                           |
| ---------- | --------------------------------- | -------------------------------------------------------------------------------------------------- |
| RNF-WFM-11 | Sin cambio de boundary            | Todo sigue dentro de `WfmModule` y `apps/portal`; no se abre ADR nuevo.                            |
| RNF-WFM-12 | Sin nueva infraestructura runtime | No introducir WebSocket, SSE, colas nuevas ni dependencias de mapa.                                |
| RNF-WFM-13 | Rendimiento de supervision        | La vista operacional debe cargar sobre la misma base de consultas ya aprobada para scheduling.     |
| RNF-WFM-14 | Accesibilidad                     | Mantener WCAG 2.2 AA, textos en espanol y feedback legible en alertas y timeline.                  |
| RNF-WFM-15 | Resiliencia                       | Si summary o availability fallan, la pantalla debe degradarse con estado parcial, sin caida total. |
| RNF-WFM-16 | Seguridad de ownership            | Roles restringidos solo consumen datos ya permitidos por ownership backend.                        |

---

## 6. Modelo de datos borrador

La Fase 02 no agrega tablas nuevas ni altera el modelo persistente de MOD09.

Se autorizan solo extensiones de contratos derivados:

- `WfmDashboardSummary` puede ampliarse con:
  - `activeCount`
  - `atRiskCount`
  - `enRouteCount`
  - `alerts[]`
  - campos adicionales en `technicianLoad[]` para banda de saturacion y conteo vencido
- La UI puede introducir tipos locales derivados para timeline, alertas y visualizacion de carga.

Las alertas de Fase 02 son derivadas y no persistentes.

---

## 7. Contratos de API borrador

Se preserva la base `/api/v1/wfm`.

| Metodo | Ruta                        | Uso en Fase 02                                                     |
| ------ | --------------------------- | ------------------------------------------------------------------ |
| GET    | `/events`                   | Fuente canonica para timeline diario, calendario y lista           |
| GET    | `/dashboard/summary`        | Puede ampliarse para devolver KPIs priorizados y alertas derivadas |
| GET    | `/technicians/availability` | Fuente para cruces simples de disponibilidad y carga               |
| GET    | `/work-orders/:id`          | Mantiene apertura de detalle desde evento si existe OT vinculada   |

Regla de contrato:

- No crear endpoint nuevo si la necesidad puede resolverse ampliando `GET /dashboard/summary` y reutilizando `GET /events`.
- Si se requiere agregar query params para la supervision diaria, deben ser aditivos y compatibles hacia atras.

---

## 8. Criterios de aceptacion

| CA        | Criterio                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| CA-WFM-13 | Un usuario ADMIN/NOC/SUPPORT puede abrir una vista operacional con KPIs y alertas sobre la agenda existente. |
| CA-WFM-14 | La vista timeline del dia agrupa eventos por tecnico y permite abrir el detalle de un evento.                |
| CA-WFM-15 | La UI resalta tecnicos con saturacion alta usando datos del summary sin requerir infraestructura nueva.      |
| CA-WFM-16 | Las alertas se calculan con reglas deterministicas y no requieren tabla nueva.                               |
| CA-WFM-17 | Un `TECHNICIAN` no visualiza KPIs globales ni alertas fuera de su ownership.                                 |
| CA-WFM-18 | Si falla una fuente secundaria, la pantalla informa cobertura parcial y mantiene operativa la vista.         |
| CA-WFM-19 | Calendario y lista actuales siguen disponibles y comparten filtros con la nueva vista.                       |
| CA-WFM-20 | Tests backend, frontend y E2E focalizados quedan en verde o el bloqueo queda documentado.                    |

---

## 9. Dependencias y riesgos

| Dependencia / riesgo                         | Estado | Mitigacion                                                        |
| -------------------------------------------- | ------ | ----------------------------------------------------------------- |
| Summary actual insuficiente para supervision | Medio  | Ampliar `WfmDashboardSummary` sin romper consumidores existentes. |
| `SchedulingClient` puede crecer demasiado    | Medio  | Separar vista operacional en componentes dedicados.               |
| Scope creep hacia mapa, Kanban o IA          | Alto   | Mantener exclusiones explicitas en plan y prompt de Fase 02.      |
| Alertas ambiguas                             | Medio  | Fijar reglas simples basadas en tiempo, estado y disponibilidad.  |
| Roles restringidos viendo mas de lo debido   | Alto   | Reusar ownership backend y gating UI explicito.                   |

---

## 10. Definition of Done

- Addendum Fase 02 aprobado y trazado a PRD base, HLD y ADR vigentes.
- Spec, plan, prompt e informe de Fase 02 creados y enlazados.
- La ejecucion no requiere ADR nuevo ni cambio de boundary.
- La fase queda acotada a command center liviano sobre la superficie existente.
- El fullstack cuenta con criterios de entrada, alcance, restricciones, entregables y stop/go explicitos.
