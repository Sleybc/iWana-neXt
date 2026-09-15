# INFORME — MOD11 Corrección de OT · T2: anulación por error y huecos de cancelación

**Versión:** 1.0
**Fecha:** 2026-09-15
**Agente:** AI-SR-FULL (`sr-backend`) · **paralelo:** `prod-ux` (copy y motivos, superficie posterior) · **C:** `sec-eng`
**Encargo:** `docs/prompts/PROMPT-MOD11-CORRECCION-OT-T2-v1.0.md`
**Plan:** `docs/plans/2026-09-14-mod11-correccion-ot.md` (T2 adelantado a T1) · **Spec:** `docs/specs/2026-09-14-mod11-correccion-ot-design.md` §4.4/§4.5 · **ADRs:** ADR-090 §D3/D5 (Aprobado), ADR-091, ADR-076 §D1
**Estado:** **GO.** Sin `[BLOQUEO]` ni `[CONSULTA]`: el puerto existente alcanza y no hay llamadores legítimos de la puerta trasera.

---

## 1. Veredicto stop/go

| Criterio (§8) | Estado | Evidencia |
| --- | --- | --- |
| OT despachada se anula y su origen queda libre, contra base | ✅ | PG `annulment.postgres`: dispatch → annul (`CANCELLED` + `is_annulled`) → re-dispatch del mismo origen funciona; outbox con `ExecutionOrderAnnulledV1` |
| La anulada entra en la anonimización por retención | ✅ | Spec aislada 136 (db): purga de la 134 anonimiza el asiento de la anulada vencida (centinela + `reason` NULL) y respeta a la activa |
| Anulada ≠ cancelada en dato y consulta; excluida del cálculo | ✅ | Columna `is_annulled` + CHECK; bandeja excluye; `status=CANCELLED AND is_annulled=false` vs `=true` |
| Motivo y rol exigidos; terminal no anulable (CA-10, §5.13) | ✅ | Schema + cinturón (`ANNULMENT_REASON_REQUIRED`); `@Roles` solo supervisión; `assertMutable` rechaza terminal incluida ya-cancelada; HTTP 403/400 |
| `close` con `CANCELLED` ya no cancela (CA-11) | ✅ | 422 `CLOSE_RESULT_CANCELLED_REMOVED` antes de abrir transacción; sin llamadores legítimos (portal no lo ofrece, worker conserva handler histórico) |
| Terminal no reescribible (CA-12) | ✅ | `cancelFromSchedulingWithManager` valida `assertMutable` |
| Evento de dominio (CA-13) | ✅ | `ExecutionOrderCancelledV1` (inserto directo en la TX de agenda) + `ExecutionOrderAnnulledV1` (camino de comandos); ambos redriveables |
| `tasks` ≥ 682 + suite completa sola | ✅ | **tasks 701/701 (35 suites)**; exit-guard exit 0 (325 suites, 4099 tests) |
| Dictamen `sec-eng` | ✅ | GO, 0 hallazgos bloqueantes |

---

## 2. Mecanismo elegido y justificación

**`status = CANCELLED` + discriminador `is_annulled boolean NOT NULL DEFAULT false` (migración 136) + CHECK `(_annulled = false OR status = 'CANCELLED'_)`.** Motivo obligatorio, rol de supervisión, asiento de transición y hecho de dominio; `result` intacto (la anulación no es desenlace de ejecución).

Por qué no un estado terminal nuevo: todas las listas que enumeran terminalidad a mano —índice 135, purga 134 (`TERMINAL_STATUSES_SQL`), transiciones 132, backfills 118/131, literales TS del servicio y reconciliador— ya contienen `CANCELLED`. Un estado nuevo obligaba a tocarlas todas; olvidar una sola dejaba el origen bloqueado o la línea de tiempo sin anonimizar (las dos trampas del encargo §2). Con el discriminador, **la 134 y la 135 no se tocan y aun así alcanzan a la anulada por estado** — probado contra base real, no por inspección (§4).

Por qué no el motivo-tipificado-solo (A3 descartada): A3 era texto libre no consultable — el CTO la descartó porque funde ambas situaciones en cualquier métrica. La columna dedicada sí separa: la tasa de cancelación se calcula con `status='CANCELLED' AND is_annulled=false` (en código no existe ese cálculo hoy: nada que migrar, verificado por búsqueda; el discriminador lo hace posible).

## 3. Sitios de terminalidad: alcanzados y deliberadamente no

**Alcanzados sin tocarse** (verificados por prueba, no por lectura): 135-origen (libera), 134-purga (anonimiza), 132-transiciones (el asiento `→CANCELLED` usa el enum existente), 118/131 (predicados por estado), `assertMutable`/`isTerminal`/`TERMINAL_ORIGIN_STATUSES`/pool/computeAllowedActions (tratan a la anulada como terminal automáticamente).

**Tocados a propósito**: `persistOrderOptimistically` (opt-in `{annulment:true}`, doctrina T0), `createFollowUp` + rama terminal de `computeAllowedActions` (la anulada es inerte: ni seguimiento de supervisión), `list()` (excluye anuladas — sale de la bandeja, D3), proyecciones lista/detalle + contrato shared v1.4 (campo `annulled`), eventos `CancelledV1`/`AnnulledV1` + REDRIVE, worker (acuses sin proyección: los efectos ya los aplicó la TX emisora), OLA1 R11a 23→24 pares (ampliación aprobada), motivos WFM con causa de taxonomía (CA-14, dato `[código] etiqueta`).

**Deliberadamente no**: cálculo de cancelación (inexistente en código), reverso de inventario (deuda MOD12, spec §7), superficie de portal (spec §7; prod-ux en paralelo), `mapResultToStatus`/`mapCloseResultToTaskStatus` rama `CANCELLED` (muerta para `close`, viva para eventos históricos del worker), `ExecutionOrderResult.CANCELLED` del enum (datos históricos + matriz del worker + labels).

## 4. Evidencia con conteo real

- `tasks`: **35 suites, 701/701** (682 + 16 anulación + 3 HTTP).
- `wfm`: **19 suites, 239/239** (motivo honesto +1 caso).
- `shared`: 122/122 · `db` unit: 347/347 (incluye 136 + orden) · `worker`: 108/108.
- PG servicio (`annulment.postgres`, tenant `iwana`, ida y vuelta 135+136, 134 intacta): **2/2**.
- Aislada 136 (db, schema efímero, migraciones 135+136+134 reales): **4/4**.
- `tsc` (api, shared, db, worker) + `eslint` (12 archivos api) limpios.
- Portal: `tsc` mantiene **exactamente los 5 errores preexistentes de E2** (`schedule.window` nulable, alcance E4); las 4 factories tocadas por T2 (`annulled: false`) están limpias. Cero errores nuevos.

## 5. Cierre `sec-eng` y deuda

Dictamen: **GO, 0 bloqueantes**. Pipeline del `annul` verificado capa por capa; sin proyección nueva de PII; detalle de anulada legible por asignado/supervisor declarado correcto (D5); sin borrado físico; `down` 136 bloqueado con anuladas vivas declarado correcto.

Deuda por severidad:
- **P2 (dueño WFM):** `failureReason` del DTO `move-schedule-event-to-pending` no lleva filtro PII (`safeTextField` vive en tasks y el boundary impide importarlo). Preexistente, hallazgo Baja-1 de `sec-eng`: alinear con validador compartido cuando exista.
- **P3:** TOCTOU alcance-vs-inserción en `annul` (mismo patrón guard/servicio del resto de comandos).
- **P3 (E4):** presentación «anulada» y «sin ventana» en consola; copy de motivos (prod-ux).
- **Informativa:** técnico asignado conserva `GET :id` sobre su anulada (D5; ocultarlo exige regla + dictamen).

## 6. Handoff

T2 entrega la salida gobernada al error de captura, con origen liberado y rastro intacto. E3 (agendar despachada) y T1 (propagación) pueden proceder.
