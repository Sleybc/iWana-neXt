# INFORME-MOD11-OT-PLANTILLA-APLICADA-FIX-v1.0.md

> **Módulo:** MOD11 — OT de Ejecución / Portal Operaciones
> **Tipo:** Corrección de defecto bloqueante + hardening del drawer de OT
> **Fecha:** 2026-08-31
> **Estado:** Implementado y verificado
> **Gobernanza:** Sesión ejecutor subordinada a `AGENTS.md`; protocolo multiagente (sr-backend, fe-platform, sr-qa) + debugging sistemático

---

## 1. Síntesis del defecto

Al abrir una OT en el portal (`/dashboard/operations?executionOrderId=…`), el drawer mostraba:

- «No fue posible cargar la plantilla aplicada. La orden se conserva abierta y el cierre permanece bloqueado.»
- «Requisitos no disponibles» en el checklist.
- «Plantilla no disponible» en evidencia y cierre.
- «No hay ítems disponibles» y «No hay custodia elegible» en materiales.

### Causa raíz (verificada con evidencia)

| # | Evidencia | Conclusión |
| --- | --- | --- |
| 1 | `apps/portal/src/components/operations/OperationsClient.tsx` llamaba `tasksApi.executionOrders.listTemplateVersions(detail.template.id)` al abrir la OT | El portal dependía del catálogo vivo de plantillas para operar la OT |
| 2 | `apps/api/src/modules/tasks/execution-order-templates.controller.ts` (`GET /tasks/execution-order-templates/:templateId/versions`) exige `@Roles(ADMIN, NOC, SUPPORT)` + `@Permissions(OPERATIONS_EXECUTION_ORDER_TEMPLATES_READ)` | Endpoint de gestión, no de operación |
| 3 | `apps/api/src/modules/access-control/access-control.constants.ts` (matriz V2): TECHNICIAN y CONTRACTOR no tienen `OPERATIONS_EXECUTION_ORDER_TEMPLATES_READ`; NOC/SUPPORT tampoco lo incluyen en su matriz | Casi ningún rol operativo puede cargar la plantilla → 403 → checklist/evidencia/cierre bloqueados |
| 4 | La entidad `ExecutionOrder` ya congela `templateRequirementsSnapshot` (DATA-P1-3) y `getCompletion` lo lee (por eso el encabezado mostraba «0 de 3») | El dato necesario ya vive en la OT; consultar el catálogo era innecesario y semánticamente incorrecto (snapshot vs. plantilla editable) |

**Defecto de diseño:** el detalle `GET /tasks/execution-orders/:id` no exponía los requisitos congelados, forzando al frontend a una llamada que la mayoría de roles no puede hacer.

---

## 2. Correcciones implementadas

### 2.1 Backend (P0)

| Archivo | Cambio |
| --- | --- |
| `apps/api/src/modules/tasks/services/execution-orders.service.ts` | Se exporta `readTemplateRequirementsSnapshot` (pura, fail-closed) |
| `apps/api/src/modules/tasks/execution-orders.controller.ts` | `getById` expone `template.requirements` desde el snapshot congelado (spread condicional; se omite si el snapshot es null o está corrupto) |
| `apps/api/src/modules/tasks/dto/execution-orders.dto.ts` | `ExecutionOrderTemplateReferenceResponseDto.requirements?` opcional con `@ApiPropertyOptional` |
| `apps/api/openapi/tasks-execution-orders.v1.json` | Schema `ExecutionOrderTemplateReference` suma `requirements` (array de `ExecutionOrderTemplateRequirement`), **fuera** de `required`; `additionalProperties:false` respetado |

**No se debilita el control de acceso:** el catálogo de plantillas sigue reservado a gestión; el técnico recibe el recorte frozen de *su* OT (mínimo dato, DATA-P1-3). Alternativas descartadas por sr-backend: ampliar roles del endpoint (peor privilegio + semántica incorrecta) y endpoint nuevo (superficie innecesaria).

### 2.2 Contrato compartido (aditivo, backward-compatible)

| Archivo | Cambio |
| --- | --- |
| `packages/shared/src/contracts/operations/execution-orders.ts` | `ExecutionOrderTemplateReference.requirements?: ExecutionOrderTemplateRequirement[]` (opcional, omitible) + se repone `ExecutionOrderTemplateSummary` (shape del `mapTemplate` backend), importado por el portal pero ausente en shared (breakage preexistente que cascadaaba la suite completa) |

### 2.3 Frontend (P0)

`apps/portal/src/components/operations/OperationsClient.tsx`:

1. **Se elimina la dependencia de `listTemplateVersions`.** La plantilla se deriva del snapshot del detalle con la nueva función exportada `deriveTemplateFromDetail` (proyección al shape `ExecutionOrderTemplateVersion` que consume el drawer). `resolveAssignedTemplateVersion` queda eliminada (dead code).
2. **Carga en paralelo con `Promise.allSettled`:** detalle, actividades, consumos, evidencias e inventario son concerns independientes; el fallo de uno no degrada ni retrasa a los demás.
3. **Errores por concern (fin de la sobrescritura):** antes, inventario → evidencias → plantilla se pisaban en un solo string; ahora evidencias maneja `evidenceState` y el inventario un nuevo `itemsState` (`loading | available | unavailable`), sin colapsar mensajes.
4. **Guard de carrera:** `executionOrderRequestSeqRef` (contador secuencial) descarta respuestas tardías; `onClose` incrementa el contador. Antes, cerrar y reabrir rápido podía reabrir el drawer con estado stale de otra OT.
5. **Custodia con ID correcto:** las opciones ahora usan `location.responsibleRefId` (ID del técnico/cuadrilla). El backend valida `custodyId === assignedTechnicianId` (`assertCustodyAssignment`, `execution-orders.service.ts`) y el ledger mueve saldo con ese valor; enviar `location.id` producía `CUSTODY_MISMATCH` latente. El fallback del drawer al `assignee` deja de ser código muerto (`??` → chequeo de longitud).

`apps/portal/src/components/operations/ExecutionOrderDrawer.tsx`:

6. Nueva prop `itemsState` con textos accionables diferenciados (cargando / inventario no disponible con reintento / sin ítems activos), eliminando la contradicción placeholder-helperText.
7. Fallback de custodia activable cuando el boundary no aporta opciones.

### 2.4 Tests

| Archivo | Cambio |
| --- | --- |
| `apps/api/src/modules/tasks/tests/execution-orders.controller.contract.spec.ts` | +3 casos: snapshot válido expuesto, snapshot null conserva referencia sin `requirements`, snapshot corrupto fail-closed |
| `apps/api/src/modules/tasks/tasks.swagger.spec.ts` | Aserción del contrato publicado: `requirements` declarado y fuera de `required` |
| `apps/portal/src/components/operations/OperationsClient.spec.tsx` | Reescritos los 2 tests de plantilla: snapshot del detalle pinta checklist + habilita cierre **sin** llamar a `listTemplateVersions`; sin snapshot bloquea el cierre en modo degradado sin error de red. +Unit de `deriveTemplateFromDetail` |
| `e2e/tests/portal-field-flow-ticket-ot-inventory.spec.ts` | Mock del detalle con `requirements`; filtro `custody=mobile` realista; contador `templateVersionRequests` aserta 0 llamadas al catálogo durante el flujo completo |
| `apps/portal/src/components/profile/PersonalInfoForm.tsx` | Fix colateral (breakage preexistente que rompía typecheck): `userApi.updateMe(dto)` sin argumento `userId` |

---

## 3. Verificación

| Suite | Resultado |
| --- | --- |
| `pnpm typecheck` (turbo, 8 paquetes) | ✅ 8/8 |
| `pnpm --filter @iwana/api exec jest src/modules/tasks` | ✅ 484/484 |
| `pnpm --filter @iwana/portal test` | ✅ 1697 passed / 4 failed (preexistentes, ver §4) |
| Lint (archivos modificados, api + portal) | ✅ 0 errores (1 warning preexistente `exhaustive-deps` en efecto de filtro, fuera de alcance) |
| E2E `portal-field-flow-ticket-ot-inventory.spec.ts` — flujo OT completo | ✅ passed (abrir OT → iniciar → material con custodia → firma → cierre; `templateVersionRequests === 0`) |

---

## 4. Hallazgos preexistentes fuera de alcance (documentados, no introducidos por este cambio)

1. **E2E agenda** `agenda abre el resumen de la OT…` falla también con los cambios stashados (verificado por stash/pop) — fallo de navegación de agenda ajeno a Operations.
2. **Suite portal: 4 tests** en `dashboard/layout.spec.tsx` y `SchedulingClient.spec.tsx` (textos «Portal de Gestion», «Vistas operativas», «Abrir OT», «Crear solicitud manual») — trabajo en curso de otras sesiones sobre la rama dirty.
3. **Flakiness en `ExecutionOrderDrawer.spec.tsx`**: ~1/3 de corridas falla un test combobox distinto («Registrar actividad» / «No ejecutada») bajo carga; pasa en corrida aislada. Recomendado normalizar timers o aislar userEvent.
4. **Deuda del drawer (P1/P2) para siguiente iteración:**
   - `nonRealizationNote` y la evidencia de intento fallido se capturan pero no viajan en `CloseExecutionOrderCommand` (requiere acuerdo de contrato).
   - Medidor de progreso duplicado (resumen vs. checklist) con mismo accessible name; sección «Compromiso» duplica resumen.
   - Copy divergente `syncStateCopy` / `requirementKindLabel` entre drawer, summary y OperationsClient (consolidar en `execution-order-view.ts`).
   - `template: null` legítimo vs. snapshot ausente comparten copy «Plantilla no disponible»; distinguir con la nueva semántica del snapshot.
   - `aria-live` inconsistente en alerts de error; spans decorativos `m`/`#` sin `aria-hidden`; `itemDisposition` no se resetea tras éxito; reexport default innecesario.

---

## 5. Gates Before Merge

- [x] Sin vulnerabilidades nuevas (no se amplían roles ni permisos)
- [x] Sin violaciones de boundary (todo dentro de MOD11 + contrato shared aditivo)
- [x] Tests: tasks 484/484; portal sin regresiones nuevas
- [x] OpenAPI actualizado (`tasks-execution-orders.v1.json`) con spec de contrato en tándem
- [x] Migraciones: no aplica (campo opcional en respuesta, no en schema)
- [x] Sin PII en logs (no se añadieron logs)
- [x] Lint y typecheck pasando
