# INFORME — MOD11 Consola OT · Ola 1 · Backend (AI-SR-FULL, encargo A-bis)

**Versión:** 1.1
**Fecha:** 2026-09-14
**Agente:** AI-SR-FULL (sr-backend)
**Prompt ejecutado:** `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA1-SR-FULL-REMEDIACION-v1.0.md` (P1 pasos 1-5, P2 pasos 6-7, tests pasos 8-11)
**Prompt base:** `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA1-SR-FULL-v1.0.md` (C0, C1, C2, pasos 1-12)
**Spec:** `docs/specs/2026-09-14-mod11-consola-ot-requisito-como-eje-design.md` v1.1
**Estado:** GO (P1 y P2 cerrados; sin [BLOQUEO], sin [CONSULTA])
**Historial:** v1.0 (GO condicionado — C0/C1/C2 verificados, CA-06 con reserva) → v1.1 (remediación P1/P2, CA-06 en firme)

---

## 1. DoR (verificado antes de codificar)

| Requisito | Veredicto |
| --- | --- |
| §2 del encargo leído incluido el detalle del select | OK — `assetStatus` no estaba en el `select` (`:276-277`); el arreglo amplía select + predicado en el mismo cambio |
| Informe v1.0 disponible | OK — `docs/informes/INFORME-MOD11-CONSOLA-OT-OLA1-SR-FULL-v1.0.md` |
| Spec §2.1 A4-bis y CA-06 | OK — contexto incompleto como causa; COMPLIANCE cuenta con aceptación registrada |
| Contratos congelados intactos | OK — `execution-orders-completion.ts` v1 y `execution-orders.ts` v1.1 consumidos, no tocados; sin contrato nuevo |

Skills leídas antes de codificar: `nestjs-expert`, `testing-patterns`, `verification-before-completion`. `architect-review` no fue necesaria (la query toca solo `ExecutionOrderEvidence`, tabla del propio módulo — sin duda de boundary). Descartadas: `openapi-spec-generation` (contrato `@iwana/shared` cerrado), `database-migration` + `postgresql` (sin migración ni columna nueva), `frontend-dev-guidelines` / `nextjs-app-router-patterns` / `core-components` (cero portal).

## 2. Entregables (rutas)

| Hallazgo | Archivo | Cambio |
| --- | --- | --- |
| P1 | `apps/api/src/modules/tasks/services/execution-orders.service.ts` | `getCompletion`: `select` ampliado con `evidence.assetStatus`; predicado `hasCustomerAcceptance` con tercera condición `assetStatus === 'AVAILABLE'` (fail-closed, coincide con `assertCustomerAcceptanceArtifactLinked`); comentario corregido a tres condiciones. Mapeo de `context.evidences` intacto (la regla `EVIDENCE` no mira `assetStatus` y el cierre tampoco se lo exige) |
| P2 | `apps/api/src/modules/tasks/execution-orders.controller.ts` | `resolveTechnicianDisplayLabel`: rama de servicio ausente emite `warn` distinguible (directorio de usuarios no disponible); comportamiento intacto (assignee viaja con su id, sin excepción) |
| Tests | `apps/api/src/modules/tasks/tests/execution-orders.completion-requirements.spec.ts` | Tipo de fixture `evidences` con `assetStatus?` opcional; caso CA-06 existente declara `assetStatus: 'AVAILABLE'` explícito; 2 casos nuevos P1 (cuarentena + inverso) |

Herencia de v1.0 (sin cambios): contrato v1 nuevo, ampliación v1.1 autorizada, `buildAssigneeView()`, `requirements[]` desde `evaluation.allEvaluations`, DTOs OpenAPI. Ningún archivo de `packages/shared/`, `apps/portal/`, `crm/opportunities` ni MOD05 tocado; sin cambios en `@Roles`/`@Permissions`.

## 3. Stop/go por criterio

| Criterio | Veredicto | Evidencia |
| --- | --- | --- |
| CA-01 displayLabel técnico, detalle=listado | GO | Sin cambios (heredado v1.0) |
| CA-02 CREW con type=CREW | GO | Sin cambios (heredado v1.0) |
| CA-05 requirements[] con estado real | GO | Sin cambios (heredado v1.0) |
| CA-06 COMPLIANCE con aceptación | GO **en firme** (antes: con reserva) | Firma `PENDING_ANALYSIS` ⇒ requisito insatisfecho con razón; firma `AVAILABLE` ⇒ satisfecho. `getCompletion` alineado a `assertCustomerAcceptanceArtifactLinked` (tres condiciones) |
| Tests con conteo real | GO | jest directo (`--ci --runInBand`, sin turbo, sin `--passWithNoTests`): módulo tasks 25 suites/**550 tests** (548 heredados + 2 nuevos), cero regresión |
| BOLA del listado en verde sin tocarlo | GO | `tasks.boundary.spec.ts` + BOLA de `controller.http.spec.ts` en verde dentro de la suite; ningún archivo de esos tocado |

**NO-GO no activado:** no hubo que tocar el contrato de `@iwana/shared`, ni la regla `EVIDENCE` general, ni `assertCustomerAcceptanceArtifactLinked`. Quien se alineó fue `getCompletion`. No se emitió `[BLOQUEO]` ni `[CONSULTA]`.

## 4. Evidencia de gates (conteo real)

| Suite | Resultado |
| --- | --- |
| `tasks` completo (jest directo `--ci --runInBand`) | 25 suites, **550 tests passed** (11 en `completion-requirements.spec.ts`: 9 heredados + 2 P1) |
| `typecheck` api (`tsc --noEmit`) | verde |
| `eslint` sobre los 3 archivos tocados | limpio |

## 5. Deuda y hallazgos por severidad

| Sev | Hallazgo | Estado |
| --- | --- | --- |
| Alta (bloqueante) | **P1 — criterio de aceptación divergente del cierre.** `getCompletion` exigía 2 condiciones frente a las 3 de `assertCustomerAcceptanceArtifactLinked` (`assetStatus AVAILABLE`); en ventana de cuarentena el checklist publicaba "aceptación cumplida" y el cierre respondía 422 | **Cerrado en v1.1** (select + predicado + comentario + 2 tests) |
| Menor | **P2 — degradación silenciosa residual.** Rama de servicio ausente en `resolveTechnicianDisplayLabel` retornaba sin señal; un refactor futuro podía reintroducir A1 en silencio | **Cerrado en v1.1** (`warn` distinguible, comportamiento intacto) |
| — | Deuda preexistente (`FIELD`/`MEASUREMENT` sin vía de captura, spec §10.1-10.2) | Activa, sin cambios; se muestra como estado, no se amplía |

## 6. Marcadores

Ninguno: cero `[BLOQUEO]`, cero `[CONSULTA]`, cero `[DESEMPATE]`. Punto 7 de auditoría (CRM/MOD05) fuera de alcance por decisión CTO — no tocado ni propuesto.

## 7. Notas de handoff (Ola B)

- El checklist-índice y el cierre ya no pueden divergir en aceptación: ambos exigen firma `AVAILABLE`.
- `FIELD`/`MEASUREMENT` siguen llegando insatisfechos hasta que exista contrato de captura: la UI debe pintarlos *sin acción en v1* (spec §4.6), no como error.
