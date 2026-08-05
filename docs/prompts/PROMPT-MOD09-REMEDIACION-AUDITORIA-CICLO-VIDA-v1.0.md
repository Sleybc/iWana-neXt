# PROMPT-MOD09-REMEDIACION-AUDITORIA-CICLO-VIDA-v1.0

**Módulo:** MOD09 Programación / WFM (+ portal + worker)
**Fase:** Remediación post-auditoría (F6) — cierra bloqueantes B1–B4 y altos A1–A3
**Versión:** 1.0
**Fecha:** 2026-08-05
**Generado por:** AI-EM-ARCH (modo Orchestrator)
**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` *(en revisión)*
**Informe vivo:** [INFORME-MOD09-CICLO-VIDA-VISITA-CAMPO-v1.0.md](../informes/INFORME-MOD09-CICLO-VIDA-VISITA-CAMPO-v1.0.md)
**Plan:** [2026-08-05-mod09-remediacion-auditoria-ciclo-vida.md](../plans/2026-08-05-mod09-remediacion-auditoria-ciclo-vida.md)

---

## 0. Contexto y veredicto

La auditoría defect-first del 2026-08-05 demostró que el informe vivo declaraba cerrados vectores que el código no cierra. AI-EM-ARCH **acepta** los hallazgos B1–B4 y A1–A3 como bloqueantes/altos de remediación obligatoria **antes de G6.5**.

| Ref | Estado previo (informe) | Estado tras auditoría | Dueño track |
| --- | --- | --- | --- |
| H1 | Cerrado | **Reabierto con defecto B1** | AI-SR-FULL (+ FE tests) |
| V3 / H2 | Cerrado | **Reabiertos — B2 + B3** | AI-SR-FULL + AI-FE-PLATFORM |
| D4 / E5 | Implícito en F2 | **No cumplido — B4** | AI-SR-FULL + AI-FE-PLATFORM |
| A1–A3 | No listados | **Abiertos** | AI-SR-FULL (worker/API) |

**Contrato de API congelado (esta fase):** el status persistido y el status emitido en list/get de `VisitRequest` deben preservar `REQUIRES_RESCHEDULE` cuando ese sea el valor real. Agendabilidad ≠ degradación de status. Citado: ADR-077 *(propuesto)* D3 literal.

**Contrato de componente:** sin cambio de tokens; FE monta ruta y alinea chip/decisión al contrato API corregido. Spec UX: `docs/specs/2026-08-04-mod09-visita-no-realizada-ux-spec.md` *(propuesta)*.

---

## 1. Objetivo exacto

Dejar el ciclo de vida de visita no realizada **operable de punta a punta** (API → worker → portal) sin callejones sin salida, sin degradar `REQUIRES_RESCHEDULE`, con decisión humana al tercer intento, y con evidencia de tests que ejerciten el **contrato real** (no objetos inventados).

### Entra

- B1, B2, B3, B4 (bloqueantes)
- A1, A2, A3 (altos)
- Tests de contrato API→portal y worker→VisitRequest (Puerta remediación)
- Actualización del informe vivo (no crear informe paralelo)

### No entra

- Aprobación formal de ADR-076/077 (sigue CTO)
- V2 sync expediente (deuda baja diferida)
- Índice único `schedule_events` (ADR-076 D2.3)
- Dashboards de causa raíz
- G6.5 / G7

---

## 2. Artefactos de entrada

| Artefacto | Ruta | Estado |
| --- | --- | --- |
| ADR-077 | `docs/adrs/ADR-077-Ciclo-Vida-Visita-No-Realizada.md` | Propuesto — decisiones D3, D4, D7 son autoridad de esta remediación |
| UX spec | `docs/specs/2026-08-04-mod09-visita-no-realizada-ux-spec.md` | Propuesta — E2, E3, E5 |
| Informe vivo | `docs/informes/INFORME-MOD09-CICLO-VIDA-VISITA-CAMPO-v1.0.md` | Actualizar §3/§6/§8 |
| Prompt original | `docs/prompts/PROMPT-MOD09-CICLO-VIDA-VISITA-CAMPO-v1.0.md` | Superado para estos hallazgos; no reabrir F0–F5 |

---

## 3. Tracks y RACI (protocolo §3bis)

| Track | Agente | Alcance | No espera a |
| --- | --- | --- | --- |
| **QA-red** | AI-SR-QA | Tests fallidos que demuestran B1–B4/A1–A3 contra el contrato real | Nadie — arranca primero |
| **Backend** | AI-SR-FULL | B1, B2, B4, A1, A2, A3 + OpenAPI | FE real (QA escribe contra contrato) |
| **Frontend** | AI-FE-PLATFORM | B3 montaje ruta + B4 UI decisión + chip alineado a status real | Backend real (usa contrato congelado) |
| **QA-green** | AI-SR-QA | Re-correr suites; evidencia Cached: 0; cobertura WFM si es viable | Integración backend+FE |

---

## 4. Instrucciones por hallazgo

### B1 — Preservar `REQUIRES_RESCHEDULE` en la API (H1 con defecto)

**Causa raíz:** `getEffectiveVisitRequestStatus` convierte `REQUIRES_RESCHEDULE` → `READY_TO_SCHEDULE` y `enrichVisitRequest` lo aplica a toda respuesta. El filtro SQL hace lo mismo. El portal condiciona el chip a `status === REQUIRES_RESCHEDULE`.

**Decisión EM-ARCH `[DESEMPATE]`:**

- **Agendabilidad:** `REQUIRES_RESCHEDULE` **es** agendable (y corregible de contexto), igual que `READY_TO_SCHEDULE`.
- **Emisión:** el status en respuesta HTTP / listados **debe** ser el persistido. **Prohibido** degradar a `READY_TO_SCHEDULE` en enrich o en SQL efectivo de listado.
- Separar helpers si hace falta: `isSchedulableStatus(status)` vs proyección de lectura. No reutilizar un único “effective status” para ambas cosas.

**Tests obligatorios (QA):**

1. `GET` / list de una VR con `REQUIRES_RESCHEDULE` y `retryCount=2` → body.status === `REQUIRES_RESCHEDULE`.
2. Agendar esa VR → éxito (no 400 “no está lista”).
3. Filtro “Lista para agendar” **no** incluye `REQUIRES_RESCHEDULE`; filtro/bandeja de reintento sí lo distingue (o listado sin filtro de status ready no los mezcla como “nuevas”).
4. Portal: chip “Intento n de 3” con fixture cuyo status viene del **contrato tipado** / mock derivado del shape real de API, no de un objeto a mano inconsistente.

**Archivos:** `visit-requests.service.ts` (~994, ~1249, ~1278), specs relacionados, `pending-visits-ui.ts` (solo si el contrato tipado cambia; el chip ya es correcto).

### B2 — Barrido EXPIRED deja VisitRequest operable vía decisión (V3/H2)

**Causa raíz:** el job marca `schedule_events.status = EXPIRED` y no toca la VisitRequest (correcto bajo ADR-077 D7: *el barrido no decide*). El defecto es que **ningún camino de decisión humana** saca la VR de `SCHEDULED` → callejón: `scheduleVisitRequest` early-return, `cancelVisitRequest` rechaza, `reviewNonRealizationCause` no reprograma.

**Decisión EM-ARCH:**

1. El barrido **sigue** sin cancelar/cerrar/reagendar ni consumir intentos (D7).
2. Las acciones de la vista E2 (**Reprogramar** / **Cerrar el caso** / **Reclasificar**) deben operar sobre eventos `EXPIRED` (y `NO_SHOW` / no realizados reportados):
   - **Reprogramar:** tras causa confirmada (o asignada si “Sin reporte”), VisitRequest → `REQUIRES_RESCHEDULE`; el evento permanece terminal (`EXPIRED` o el estado que corresponda); la VR deja de apuntar como “agendada viva”.
   - **Cerrar el caso:** VR → estado terminal de cierre acordado en código existente (`CANCELLED`/`CLOSED` según patrón vigente); no recrear solicitud.
3. Prohibido el early-return silencioso de `scheduleVisitRequest` cuando el único evento vinculado está `EXPIRED`: o bien la VR ya no está `SCHEDULED`, o bien se responde error explícito pidiendo pasar por la vista de revisión.

**Tests obligatorios:**

1. Tras barrido: evento `EXPIRED`, VR aún `SCHEDULED` (comportamiento D7 del job).
2. Acción Reprogramar (API) → VR `REQUIRES_RESCHEDULE`, agendable.
3. Acción Cerrar → VR no reagendable.
4. Worker spec: no solo “marcó EXPIRED”, sino aserción del estado de la VisitRequest **antes y después** de la decisión humana (el job solo asegura el pre-estado).

**Archivos:** `expired-schedule-events.processor.ts`, `schedule-events.service.ts` (`reviewNonRealizationCause` y/o endpoint de destino E2), `visit-requests.service.ts` (early-return), specs worker + WFM.

### B3 — Montar `UnrealizedVisitsView` en ruta

**Decisión:** crear `apps/portal/src/app/dashboard/scheduling/unrealized-visits/page.tsx` (o path alineado a copy “Visitas sin realizar”) que renderice `UnrealizedVisitsView`. Enlace navegable desde Programación / pendientes (patrón existente de `pending-visits`). URL estable; estado en query si la vista ya lo soporta (spec E2 CA5).

**Tests:** smoke de página o test de integración de montaje; no basta con tests del componente aislado.

### B4 — Límite de 3 intentos = decisión, no muro

**Decisión EM-ARCH (ADR-077 D4 + spec §7 / E5):**

- Con `retryCount >= 3` (intentos imputables a cliente), **prohibido** `BadRequestException` que impida toda acción.
- API: exigir decisión explícita en el payload de agendamiento o endpoint dedicado, p. ej. `attemptDecision: 'FORCE_RESCHEDULE' | 'CLOSE_CASE'` (nombre final a criterio SR-FULL, documentado en OpenAPI). Sin ese campo → 400 **accionable** que indique que se requiere decisión (no “no se puede agendar”).
- Con `FORCE_RESCHEDULE` → agenda / deja agendable.
- Con `CLOSE_CASE` → cierra el caso (sin auto-cancelar en silencio).
- Portal: al chip “Requiere decisión”, sustituir CTA de agendar por diálogo E5: `Reprogramar de todas formas` · `Cerrar el caso` (ninguna preseleccionada).

**Eliminar** el `findOne(ScheduleEvent, { where: { tenantId } })` muerto (A2) en el mismo cambio.

### A1 — Timezone del barrido

Comparar `scheduled_end_at` (timestamptz) con `NOW()` **sin** reinterpretar zona. Margen de gracia: configurable explícito (setting WFM o constante documentada en código + test), no el offset accidental de `(NOW() AT TIME ZONE $tz)::timestamptz`.

### A2 — Código muerto / `as any`

Eliminar consulta descartada y el `as any` en el orden. Si se necesita el último evento fallido de **esa** solicitud, filtrar por `visitRequestId` (o FK vigente) con tipado correcto.

### A3 — Persistir `notes` del coordinador

`ReviewNonRealizationSchema` ya acepta `notes`. `reviewNonRealizationCause` debe persistirlas en el campo/columna de notas de revisión del evento (o columna existente equivalente; si no hay columna, migración tenant reversible + entity). No validar-y-tirar.

---

## 5. Restricciones no negociables

- Boundaries Modulith; sin lectura cruzada de tablas entre módulos.
- Multi-tenant: `SET LOCAL search_path`; tenant desde JWT/contexto aprobado.
- Sin PII en logs (el barrido ya loguea solo conteos — mantener).
- Sin `any` explícito.
- Texto UI en español, sentence case.
- Migraciones reversibles si A3 exige columna nueva.
- OpenAPI actualizada si cambian DTOs/endpoints.
- **Prohibido** “arreglar” tests del portal inventando status que la API no emite.

---

## 6. Criterios de aceptación (Puerta remediación)

| ID | Criterio |
| --- | --- |
| CA-R1 | List/get de VR en `REQUIRES_RESCHEDULE` emite ese status; chip de reintento visible con datos de API |
| CA-R2 | Barrido marca EXPIRED sin decidir; Reprogramar desde revisión deja VR en `REQUIRES_RESCHEDULE` y operable |
| CA-R3 | Ruta portal monta `UnrealizedVisitsView`; coordinador llega sin deep-link manual a componente |
| CA-R4 | Con 3 intentos, diálogo/API de decisión permite forzar reprogramación o cerrar; no hay muro 400 ciego |
| CA-R5 | Barrido: comparación timestamptz correcta + margen configurable con test |
| CA-R6 | Notes del coordinador persistidas; sin `as any` en el camino del límite |
| CA-R7 | Suites WFM + worker + portal en verde con `--force` / Cached: 0; al menos un test cruza pre/post barrido + decisión |

---

## 7. Stop/go

**Detenerse y emitir `[BLOQUEO]` a EM-ARCH si:**

- Se propone degradar de nuevo `REQUIRES_RESCHEDULE` “por compatibilidad” con filtros legacy.
- El barrido cancela/cierra automáticamente (viola D7).
- Se requiere cambiar boundary Modulith o ADR aprobado.
- La UI de decisión E5 exige contrato de componente nuevo no cubierto por `@iwana/ui` sin pasar por DS-OWNER.

**GO de fase:** CA-R1…CA-R7 con evidencia en el informe vivo actualizado; deuda solo media/baja declarada.

---

## 8. Entregables

- Código + tests (tracks Backend / Frontend / QA)
- OpenAPI si aplica
- Migración tenant solo si A3 lo exige
- Actualización de `INFORME-MOD09-CICLO-VIDA-VISITA-CAMPO-v1.0.md` (§3 vectores, §6 deuda, §8 notas orquestador)
- No crear `INFORME-*` duplicado

---

## 9. Skills a aplicar

| Agente | Skills |
| --- | --- |
| AI-SR-FULL | `nestjs-expert`, `bullmq-specialist`, `database-migration` (si A3), `openapi-spec-generation`, `test-driven-development` |
| AI-FE-PLATFORM | `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `iwana-identity-ui-review`, `system-vocabulary-review` |
| AI-SR-QA | `testing-patterns`, `test-driven-development`, `verification-before-completion` |
