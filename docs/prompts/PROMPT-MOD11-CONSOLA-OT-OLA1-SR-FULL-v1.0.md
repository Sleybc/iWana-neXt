# PROMPT DE EJECUCIÓN — MOD11 Consola de OT · Ola 1 · Backend

**Versión:** 1.0
**Fecha:** 2026-09-14
**Generado por:** AI-EM-ARCH
**Agente destinatario:** **AI-SR-FULL**
**Fases que cubre:** C0, C1, C2
**Estado:** **Ejecutable.** Las escalaciones de gobierno están cerradas (plan §7): E2 aprobada, E1 y E3 retiradas. C0 se despacha de inmediato.

## Vínculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` (v1.2, **En revisión**)
- Spec que ejecuta: `docs/specs/2026-09-14-mod11-consola-ot-requisito-como-eje-design.md` v1.1 (Aprobado 2026-09-14)
- Plan de orquestación: `docs/plans/2026-09-14-mod11-consola-ot-remediacion.md` v1.1
- ADRs aplicables: ADR-046, ADR-047, ADR-067, ADR-068, ADR-069

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** el detalle de la OT deja de negar información que el propio backend ya tiene. Al cerrar, `GET /tasks/execution-orders/:id` devuelve el nombre del responsable —también cuando es cuadrilla— y el estado real de cada requisito del checklist.

**Lo que sí entra:**

- **C0** — Contrato nuevo en archivo hermano `packages/shared/src/contracts/operations/execution-orders-completion.ts`, con el tipo del estado por requisito derivado de `RequirementEvaluation` (`apps/api/src/modules/tasks/services/closure-gate-evaluator.service.ts`). Export desde `packages/shared/src/index.ts`.
- **C1** — `GET :id` resuelve `displayLabel` del responsable y **añade la rama CREW** que hoy no existe.
- **C2** — `getCompletion` publica el estado por requisito y **completa el contexto que pasa al evaluador**.

**Lo que no entra:**

- Modificar `packages/shared/src/contracts/operations/execution-orders.ts` **más allá de la ampliación aditiva autorizada en E2**: un solo campo opcional en `ExecutionOrderCompletionView` más el bump de v1 a v1.1 en su docstring. Todo lo demás del archivo queda intacto.
- Tocar `ExecutionOrderAccessGuard`, `assertActorAccess` ni `computeAllowedActions`. La política de acceso **no cambia en esta ola**.
- Implementar captura de `FIELD` o `MEASUREMENT`. Es deuda declarada (spec §10.1); aquí solo se **muestra** su estado.
- Cualquier cambio en el portal. C3 y C4 son de AI-FE-PLATFORM.

## 2. Artefactos de entrada obligatorios

- PRD: `docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md` (v1.2, En revisión)
- HLD: `docs/hlds/HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md` (v1.1, En revisión)
- Spec: la de §Vínculos, **§2.1 y §4.1 son de lectura obligatoria antes de tocar código**
- Contrato congelado que se amplía bajo E2, y **solo** en lo autorizado: `packages/shared/src/contracts/operations/execution-orders.ts`, que pasa de v1 a v1.1

## 3. Pasos

### C0 — Contrato

1. Leer `RequirementEvaluation` y el retorno de `evaluate()` en `closure-gate-evaluator.service.ts:85-116`. El tipo público **deriva de ahí**; no inventes forma nueva.
2. Crear `packages/shared/src/contracts/operations/execution-orders-completion.ts` con el estado por requisito: identificador, etiqueta, `kind`, si está satisfecho y la razón cuando no lo está.
3. Exportar desde `packages/shared/src/index.ts`. Precedente exacto: `execution-orders-list.ts` (spec del 2026-09-13 §4.7.3).
4. La ampliación de `completion` es **aditiva y opcional**: ningún consumidor actual puede romperse.

### C1 — Responsable

5. En `execution-orders.controller.ts:248-250`, resolver la etiqueta del técnico **reusando** `UsersService.findDisplayLabelsByIds`, ya empleado por `resolveAssigneeLabels` (`execution-orders.service.ts:619-634`). No escribas un lookup nuevo.
6. Añadir la rama `CREW` que hoy falta: una OT con `assignedCrewId` debe emitir `assignee` con `type` igual a `CREW`, nunca omitirlo.
7. Es **una** resolución por petición de detalle, no N+1: el detalle devuelve un solo responsable.
8. Si la etiqueta no se puede resolver, emite el `assignee` igualmente con su `id`. **Degradar a "sin responsable" es el defecto que esta fase corrige.**

### C2 — Estado por requisito

9. En `getCompletion` (`execution-orders.service.ts:256-302`), publicar los requisitos desde `evaluation.allEvaluations`, que hoy se descarta en `:296-300`.
10. **En la misma fase**, completar el contexto que se pasa a `evaluate()` en `:288-295`: hoy omite `fieldData`, `measurements`, `hasCustomerAcceptance` y `complianceArtifacts`, y por eso los requisitos `FIELD`, `MEASUREMENT` y `COMPLIANCE` **nunca pueden satisfacerse**. Ver spec §2.1 A4-bis.
11. Para `hasCustomerAcceptance`, usar la misma fuente que el cierre considera aceptación válida (`execution-orders.service.ts:1195-1227`). No inventes un criterio paralelo.
12. Mantener el agregado `progress`, `completed` y `total` tal como está: hay consumidores vivos.

## 4. Restricciones no negociables

- **Boundaries del Modulith intactos.** Sin acceso directo a tablas de otro módulo ni imports cruzados.
- **El contrato congelado se toca una sola vez y de forma declarada** (spec §7, autorizado por E2): un campo **opcional** en `ExecutionOrderCompletionView` que importa el tipo del archivo hermano, más el bump a v1.1 en el docstring. Ningún otro tipo del archivo se altera, y ningún campo existente pasa a requerido.
- **Sin PII real ni credenciales** en código, tests o fixtures.
- **Tenant isolation sin cambios**: todo sigue dentro de `runInTenantSchema` y del `search_path` por transacción.
- **No ampliar `@Roles` ni `@Permissions`** de ningún endpoint. Si crees que hace falta, es `[BLOQUEO]`, no una decisión de fase.
- Si un paso exige cambiar el contrato congelado, **detente y emite `[BLOQUEO]`**: es re-sync coordinado por AI-EM-ARCH, nunca un parche en silencio.

## 5. Entregables técnicos

- Contrato tipado en `@iwana/shared` con build en verde.
- `GET :id` devolviendo responsable resuelto —técnico y cuadrilla— y `completion` con estado por requisito.
- OpenAPI actualizada si la respuesta cambia de forma.
- Tests unitarios del mapper del detalle y de `getCompletion`, incluyendo el caso `COMPLIANCE` satisfecho.

## 6. Entregables documentales

- Informe de fase en `docs/informes/`.
- Evidencia de calidad con **conteo real de tests ejecutados**.
- Deuda nueva registrada por severidad.
- Cualquier `[BLOQUEO]` o `[CONSULTA]` emitido **antes** de cerrar la sesión.

## 7. Stop/go

**GO si y solo si:**

- Una OT con técnico asignado devuelve `assignee.displayLabel`, y detalle y listado **coinciden** sobre el mismo responsable (CA-01).
- Una OT de cuadrilla devuelve `assignee` con `type` igual a `CREW` (CA-02).
- `completion.requirements[]` trae un ítem por requisito con estado real (CA-05).
- Un requisito `COMPLIANCE` con aceptación registrada aparece **satisfecho** (CA-06).
- Los tests corren con conteo real: caché de turbo, `--passWithNoTests` o dev server reusado **no son evidencia**.
- El test BOLA del listado sigue en verde, sin tocarlo.

**NO-GO y escalación si:** el contexto del evaluador no puede completarse sin ampliar `RegisterFieldWorkSchema`. Eso es la deuda de spec §10.1 y **no se resuelve en esta ola**: emite `[CONSULTA]` y entrega C0, C1 y el resto de C2.
