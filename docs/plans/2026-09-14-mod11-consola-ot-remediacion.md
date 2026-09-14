# Plan de orquestación — MOD11: remediación y rediseño de la consola de OT

**Versión:** 1.1
**Estado:** **Aprobado y ejecutable (2026-09-14).** Las tres escalaciones de la v1.0 están cerradas (§7): **no queda ningún bloqueo de gobierno**. C0 puede despacharse de inmediato.
**Fecha:** 2026-09-14
**Cambio v1.0 → v1.1:** el CTO retiró el punto 7 del alcance, por lo que **desaparece la Ola 3 completa**; se aprobó E2 (ampliación aditiva con bump a v1.1) y se retiró E3 por improcedente — ADR-080 §5 la disuelve. Las Olas 1 y 2 no cambian de alcance.
**Emitido por:** AI-EM-ARCH

**Spec que ejecuta:** `docs/specs/2026-09-14-mod11-consola-ot-requisito-como-eje-design.md` v1.1 (**Aprobado por el CTO, 2026-09-14**)
**Prompt de orquestación:** `docs/prompts/PROMPT-MOD11-CONSOLA-OT-ORQUESTACION-v1.0.md` — el despacho concreto de las dos olas sobre los cuatro agentes.
**Prompts de ejecución (Ola 1):** `PROMPT-MOD11-CONSOLA-OT-OLA1-SR-FULL-v1.0.md` → `sr-backend` · `PROMPT-MOD11-CONSOLA-OT-OLA1-FE-PLATFORM-v1.0.md` → `prod-ux` y `fe-platform` · `PROMPT-MOD11-CONSOLA-OT-OLA1-SR-QA-v1.0.md` → `sr-qa`

**Plan hermano vigente:** `docs/plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md` v2.1 (Aprobado) — este plan **no lo supera**: aquel entregó las sub-rutas y la bandeja; este interviene la consola que aquel excluyó por diseño (spec v1.1 §4.5).

---

## 1. Qué se está resolviendo

La auditoría de la OT `OTE-20260828-001` produjo siete observaciones. La verificación en código las reduce a **tres causas**, y la más productiva es que **el backend ya calcula lo que la pantalla no muestra**: el evaluador del gate de cierre emite el estado de cada requisito y `getCompletion` lo descarta; el listado resuelve el nombre del responsable y el detalle no.

De ahí la forma del plan: **la Ola 1 no construye capacidades, deja de tirar datos.** Es corta, de bajo riesgo, y produce el contrato del que dependen las dos olas siguientes.

## 2. Contratos congelados

**Congelados desde la aprobación de la spec, el 2026-09-14.** Los tracks ya pueden correr contract-first sobre ellos.

| Contrato | Ruta y versión | Dueño | Consumidores |
| --- | --- | --- | --- |
| API — estado por requisito | `packages/shared/src/contracts/operations/execution-orders-completion.ts` v1 | AI-SR-FULL | C4, R0, R1, R2, R3 |
| Componente — checklist por requisito | Spec §4.1 y §4.2 (`RequirementChecklist`, `RequirementActionSheet`) | AI-DS-OWNER | R2, R3 |

**El contrato congelado sí se toca, y por el procedimiento que él mismo exige.** *(Corregido el 2026-09-14; la v1.0 de este plan afirmaba que bastaba un archivo hermano.)* El punto de anclaje —`ExecutionOrderCompletionView`— vive **dentro** de `execution-orders.ts` (`:115-124`), así que el campo nuevo lo toca por fuerza. El tipo del ítem nace en el archivo hermano; la vista recibe **un campo opcional aditivo** y el congelado sube a **v1.1** en su docstring. Detalle y alternativas descartadas en la spec §7.

Un cambio en cualquiera de los contratos es el **único** evento que fuerza re-sync, coordinado por AI-EM-ARCH, versionado y notificado — nunca parcheado en silencio (protocolo §3bis regla 1).

Mientras un track respete su contrato y no toque alcance, boundary, tokens de marca ni dependencias nuevas, **decide y ejecuta sin gate**.

## 3. Secuencia

### 3.1 Grafo de dependencias

```
OLA 1 — corrección (C0 primero, luego paralelo)
   C0  contrato estado por requisito     SR-FULL
        │
        ├── C1  displayLabel + rama CREW           SR-FULL    (independiente de C0)
        ├── C2  getCompletion emite requirements   SR-FULL
        ├── C3  copy y condición de la alerta      PROD-UX → FE-PLATFORM
        └── C4  checklist con estado real          FE-PLATFORM
                     │
                   C5  tests                        SR-QA
                     │
              [G6] + [G6.5]  ← AI-EM-ARCH consolida
                     │
OLA 2 — rediseño
   R0  UX spec        PROD-UX  ─┐
   R1  contrato comp. DS-OWNER ─┴→ [G2]+[G3] → R2, R3, R4  FE-PLATFORM → R5  SR-QA
                     │
                  cierre
```

*(La Ola 3 —puente a Oportunidades— se retiró el 2026-09-14 con el punto 7. No hay fases P0-P3.)*

**Camino crítico:** C0 → C2 → C4 → C5. C1 y C3 no dependen de C0 y pueden ir en paralelo desde el arranque.

El mapeo de olas a gates replica el del plan aprobado el 2026-09-13 §3.1: congelación de contratos y dictámenes de factibilidad **antes** de despachar implementación; G6.5 entre G6 y G7 por ADR-069.

### 3.2 Fases

#### OLA 1 — Corrección

| Fase | Alcance | Agente | Entregable | Stop/go |
| --- | --- | --- | --- | --- |
| **C0** | Archivo hermano `execution-orders-completion.ts`: tipo de estado por requisito derivado de `RequirementEvaluation` del evaluador. Export desde `packages/shared/src/index.ts`. | AI-SR-FULL | Contrato tipado + build de `@iwana/shared` en verde | Build en verde; sin campos requeridos nuevos |
| **C1** | `GET :id` resuelve `displayLabel` reusando `UsersService.findDisplayLabelsByIds` —ya usado por `resolveAssigneeLabels` (`execution-orders.service.ts:619-634`)— y **añade rama CREW** al ternario de `execution-orders.controller.ts:248-250`. | AI-SR-FULL | Detalle y listado coinciden sobre el mismo responsable | CA-01, CA-02 |
| **C2** | `getCompletion` emite `requirements[]` desde `allEvaluations` y **completa el contexto del evaluador** con `fieldData`, `measurements`, `hasCustomerAcceptance` y `complianceArtifacts` (`:288-295`). | AI-SR-FULL | `completion.requirements[]` con `satisfied` y `reason` reales | CA-05, CA-06 |
| **C3** | Condición de la alerta acotada a estados **pre-inicio**; copy diferenciado por rol (spec §4.4). Retirar la mención a la sincronización: `start()` no la valida. | AI-PROD-UX (copy) → AI-FE-PLATFORM | Copy aprobado + condición corregida | CA-03, CA-04 |
| **C4** | El checklist pinta estado y razón por requisito. **Sin cambiar aún la estructura de secciones** — eso es Ola 2. | AI-FE-PLATFORM | Checklist informativo | CA-05 |
| **C5** | Regresión: detalle con CREW, detalle en `IN_PROGRESS`, plantilla con requisito `COMPLIANCE`. **BOLA vigente sin tocar.** | AI-SR-QA | Suite en verde con **conteo real** | §8 |

**Stop/go de ola:** no se pasa a la Ola 2 sin C0, C1 y C2 en verde y **sin conteo real de tests ejecutados**. Un verde de caché de turbo, un `--passWithNoTests` o un dev server reusado no son evidencia.

#### OLA 2 — Rediseño

| Fase | Alcance | Agente | Stop/go |
| --- | --- | --- | --- |
| **R0** | UX spec de la consola por requisito y por momento (spec §4.1, §4.2), con los dos modos de rol de D1. Decide el arrastre de archivos: implementarlo o retirar la promesa del copy. | AI-PROD-UX | G3 |
| **R1** | Contrato de componente `RequirementChecklist` y `RequirementActionSheet`: tokens, API y estados requeridos. | AI-DS-OWNER | G2 |
| **R2** | Selector de `requirementKey` y `evidenceType` en el uploader; **captura de firma en navegador**. Respetar el registro automático de `close()` (`:1218-1227`): la captura produce el artefacto, no lo sustituye. | AI-FE-PLATFORM | CA-08, CA-09 |
| **R3** | Custodia bajo demanda; separación de histórico y captura en "Trabajo realizado", anclada al requisito. | AI-FE-PLATFORM | CA-10, CA-11 |
| **R4** | Refetch selectivo por mutación (`use-execution-order-console.ts:302-304`). | AI-FE-PLATFORM | CA-12 |
| **R5** | Tests, accesibilidad y regresión visual. | AI-SR-QA | CA-13 |

### 3.3 RACI

| Fase | R | A | C | I |
| --- | --- | --- | --- | --- |
| C0, C1, C2 | AI-SR-FULL | AI-EM-ARCH | AI-SEC-ENG (C1) | AI-FE-PLATFORM |
| C3 | AI-PROD-UX → AI-FE-PLATFORM | AI-EM-ARCH | AI-DS-OWNER | AI-SR-QA |
| C4 | AI-FE-PLATFORM | AI-EM-ARCH | AI-DS-OWNER | — |
| C5, R5 | AI-SR-QA | AI-EM-ARCH | — | todos |
| R0 | AI-PROD-UX | AI-EM-ARCH | AI-DS-OWNER, AI-FE-PLATFORM | — |
| R1 | AI-DS-OWNER | AI-EM-ARCH | AI-PROD-UX | AI-FE-PLATFORM |
| R2, R3, R4 | AI-FE-PLATFORM | AI-EM-ARCH | AI-DS-OWNER | AI-SR-QA |

El aprobador de un gate nunca es el productor del artefacto.

## 4. Dispatch de skills

| Fase | Skill de `.agents/skills/` |
| --- | --- |
| C0, C1, C2 | `architect-review` en la revisión de segunda capa |
| R0 | `brainstorming` ya ejecutada en la sesión de origen; R0 parte de su salida |
| Todas | `writing-plans` para el desglose interno de cada sesión |

## 5. Protocolo de arranque y cierre de sesión

**Al abrir sesión**, cada agente: lee `AGENTS.md`, la spec v1.0, este plan y su prompt de fase; verifica que los contratos que consume están congelados **citando ruta y versión**; y confirma que su fase no está bloqueada por una escalación abierta.

**Al cerrar sesión**, cada agente emite, antes de terminar: entregables con rutas, evidencia de gates con **conteo real de tests**, deuda nueva por severidad, y cualquier `[BLOQUEO]` o `[CONSULTA]` pendiente. Un bloqueo no emitido antes de cerrar la sesión es el anti-patrón que el protocolo llama bloqueo silencioso.

## 6. Contrato de handoff entre fases

| De | A | Qué entrega |
| --- | --- | --- |
| C0 | C2, C4 | Ruta y versión del contrato hermano, con el tipo del estado por requisito |
| C2 | C4 | Forma real de `completion.requirements[]` con un ejemplo de respuesta |
| C3 (PROD-UX) | C3 (FE-PLATFORM) | Copy final por rol y por estado, sin ambigüedad |
| Ola 1 | R0 | Contrato publicado y checklist ya informativo: la UX spec parte de lo que existe |
| R1 | R2, R3 | Contrato de componente con tokens, API y estados |

## 7. Escalaciones — cerradas el 2026-09-14

**No queda ningún bloqueo de gobierno.** Las tres escalaciones que la v1.0 declaraba abiertas están resueltas.

| # | Asunto | Resolución |
| --- | --- | --- |
| **E1** | Escritura de un rol de campo sobre el expediente de CRM | **Retirada por decisión del CTO:** el punto 7 sale del alcance y con él la Ola 3. El diagnóstico queda como deuda en la spec §5 y §10.9. |
| **E2** | Ampliación de `ExecutionOrderCompletionView`, dentro del contrato congelado | **Aprobada:** ampliación aditiva y opcional, tipo del ítem en archivo hermano, congelado de v1 a v1.1 (§2 y spec §7). |
| **E3** | Figura bajo la que se interviene MOD11 | **Retirada por improcedente.** ADR-080 §5 —que enmienda ADR-022 §3— separa cierre *en construcción* de cierre *en producción*. MOD11 tiene G6 GO y G6.5 GO, luego está legítimamente **cerrado en construcción**; G7 pertenece al otro cierre. La v1.0 proponía declararlo `En curso`, lo que además habría dejado **tres módulos abiertos** y violado la cota de dos de ADR-080 §4. **No se toca ningún registro de gobernanza.** |

**Figura de ejecución vigente:** spec propia sobre módulo **cerrado en construcción**, con el precedente inmediato de la spec del 2026-09-13 sobre este mismo módulo.

## 8. Verificación

Evidencia exigida por ola. El criterio transversal es que **un verde sin conteo no es evidencia**: caché de turbo, `--passWithNoTests` y dev server reusado producen verdes falsos.

**Ola 1**

- `GET /tasks/execution-orders/:id` sobre OT con técnico devuelve `assignee.displayLabel`; sobre OT de cuadrilla devuelve `assignee` con `type` igual a `CREW`.
- `completion.requirements[]` trae un ítem por requisito con `satisfied` real; un requisito `COMPLIANCE` con aceptación registrada aparece satisfecho.
- Con la OT en `IN_PROGRESS`, la alerta "No puedes iniciar esta orden" no se renderiza para ningún rol.
- En `OTE-20260828-001`: el checklist marca "Actividad de instalación" como cumplida y los otros dos requisitos como pendientes, con su razón.
- Suite de `tasks` con conteo real; BOLA del listado sin regresión.

**Ola 2**

- Una evidencia subida desde un requisito queda con **esa** `requirementKey` y **ese** `evidenceType`.
- Una firma capturada produce evidencia `SIGNATURE` que el gate de cierre acepta.
- Entrar a una OT pre-inicio no monta la superficie de captura ni consulta la custodia.
- Registrar una actividad no dispara las seis colecciones.
- `audit-ui.mjs` limpio; accesibilidad y regresión visual sin hallazgos P1.

**Cierre**: evidencia en navegador contra la OT de la auditoría, y consolidación de G6, G6.5 y G7 **registrados por separado** (ADR-069).

## 9. Riesgos

| # | Riesgo | Mitigación |
| --- | --- | --- |
| R1 | Poblar `requirements[]` sin completar el contexto del evaluador: el checklist mostraría pendientes permanentes en `FIELD`, `MEASUREMENT` y `COMPLIANCE` y parecería un defecto nuevo. | C2 es **una sola fase** que hace ambas cosas; no se divide. |
| R2 | Una plantilla productiva con `FIELD` o `MEASUREMENT` requeridos deja OT incerrables, y el checklist lo hará **visible** por primera vez. | Deuda activa declarada en spec §10.1. Verificar el catálogo de plantillas vivas **antes** de desplegar C4. |
| R3 | C1 se lee como ampliación de superficie de datos. | Es el mismo dato, mismo recurso, mismos roles y mismo permiso que el listado ya expone. Declarado en spec §6. |
| R4 | La Ola 2 arranca sobre un contrato que C0 aún no publicó. | R0 y R1 no dependen del contrato de API; R2-R4 sí, y no se despachan hasta que C0 esté en verde. |
| R6 | El rediseño y la corrección se mezclan en el mismo commit. | C4 cambia contenido, no estructura de secciones; la estructura es R3. |
