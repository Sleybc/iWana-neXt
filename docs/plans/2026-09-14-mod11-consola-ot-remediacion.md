# Plan de orquestación — MOD11: remediación y rediseño de la consola de OT

**Versión:** 1.2
**Estado:** **Aprobado y ejecutable.** La **Ola 1 está cerrada en GO** (C0-C5; `INFORME-MOD11-CONSOLA-OT-OLA1-SR-QA-v1.0.md`, con evidencia en navegador). La **Ola 2a (R0 + UX de E4, y R1) es despachable**: G4 emitido para ambas.
**Fecha:** 2026-10-05
**Cambio v1.1 → v1.2 (2026-10-05):**
1. R0 absorbe la **UX de E4** del plan de origen (`2026-09-14-mod11-origen-ot.md` v1.1), y R1 el estado visual «sin ventana».
2. R2-R4 incorporan la implementación de portal de E4 y **pasan a depender de E3 de origen en GO**, porque comparten superficie.
3. Se añaden la matriz de dispatch completa (§4) y la sección `## Lanzamiento`: el plan era anterior a la v2.5 del perfil.
4. R0 diseña sobre `INSTALACION_ESTANDAR` v2, con cinco requisitos (acta de instalación §4.2), y no sobre la v1 que vio la auditoría.

Alcance de la Ola 1, contratos y escalaciones sin cambio.
**Cambio v1.0 → v1.1:** el CTO retiró el punto 7 del alcance, por lo que **desaparece la Ola 3 completa**; se aprobó E2 (ampliación aditiva con bump a v1.1) y se retiró E3 por improcedente — ADR-080 §5 la disuelve. Las Olas 1 y 2 no cambian de alcance.
**Emitido por:** AI-EM-ARCH

**Spec que ejecuta:** `docs/specs/2026-09-14-mod11-consola-ot-requisito-como-eje-design.md` **v1.2** (Aprobado por el CTO, 2026-09-14; la v1.2 del 2026-10-05 corrige la fila *Bloqueada* de §4.2)
**Prompt de orquestación:** `docs/prompts/PROMPT-MOD11-CONSOLA-OT-ORQUESTACION-v1.0.md` — el despacho concreto de las dos olas sobre los cuatro agentes.
**Siguiente despacho (2026-10-05):** dictamen G3 → `PROMPT-MOD11-CONSOLA-OT-OLA2-G3-FE-PLATFORM-v1.0.md` · E3 de origen → `PROMPT-MOD11-ORIGEN-OT-E3-v1.0.md` · launcher `PROMPT-MOD11-CONSOLA-OT-G3-E3-LAUNCH-v1.0.md`
**Prompts de ejecución (Ola 2a, cerrada):** `PROMPT-MOD11-CONSOLA-OT-OLA2-R0-PROD-UX-v1.0.md` → `prod-ux` · `PROMPT-MOD11-CONSOLA-OT-OLA2-R1-DS-OWNER-v1.0.md` → `ds-owner`. Launcher: `PROMPT-MOD11-CONSOLA-OT-OLA2A-LAUNCH-v1.0.md`
**Prompts de ejecución (Ola 1, cerrada):** `PROMPT-MOD11-CONSOLA-OT-OLA1-SR-FULL-v1.0.md` → `sr-backend` · `PROMPT-MOD11-CONSOLA-OT-OLA1-FE-PLATFORM-v1.0.md` → `prod-ux` y `fe-platform` · `PROMPT-MOD11-CONSOLA-OT-OLA1-SR-QA-v1.0.md` → `sr-qa`

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
   R1  contrato comp. DS-OWNER ─┴→ [G2]+[G3] ─┐
   E3 de origen (SR-FULL, backend) ── GO ───────┴→ R2, R3, R4 + E4-portal  FE-PLATFORM → R5  SR-QA
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
| **R0** | UX spec de la consola por requisito y por momento (spec §4.1, §4.2), con los dos modos de rol de D1, sobre la plantilla v2. Decide el arrastre de archivos: implementarlo o retirar la promesa del copy. **Incluye la UX de E4** (origen §3.5, CA-12): OT sin ventana y orden por defecto de la bandeja. | AI-PROD-UX | G2 |
| **R1** | Contrato de componente `RequirementChecklist` y `RequirementActionSheet`: tokens, API y estados requeridos. Incluye el veredicto sobre el estado «sin ventana» de E4: o se cita del contrato de tablas operativas v1.1, o se versiona a v1.2. | AI-DS-OWNER | G2 |
| **R2** | Selector de `requirementKey` y `evidenceType` en el uploader; **captura de firma en navegador**. Respetar el registro automático de `close()` (`:1218-1227`): la captura produce el artefacto, no lo sustituye. | AI-FE-PLATFORM | CA-08, CA-09 |
| **R3** | Custodia bajo demanda; separación de histórico y captura en "Trabajo realizado", anclada al requisito. | AI-FE-PLATFORM | CA-10, CA-11 |
| **R4** | Refetch selectivo por mutación (`use-execution-order-console.ts:302-304`). | AI-FE-PLATFORM | CA-12 |
| **R5** | Tests, accesibilidad y regresión visual. | AI-SR-QA | CA-13 |

**G3 de la Ola 2** lo firma `fe-platform` con un dictamen de factibilidad sobre la UX spec y el contrato. Ese dictamen incluye las necesidades declaradas de R0 y R1; por ejemplo, la librería de lienzo para la firma, que como dependencia nueva requiere decisión. Ese dictamen es la entrada de la Ola 2b. **La Ola 2b, que cubre R2-R4 y el portal de E4, no se lanza sin G2, G3 y E3 en GO.**

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

**Matriz de dispatch de la Ola 2** (v1.2). Las skills están verificadas contra disco con `ls .agents/skills/<nombre>/SKILL.md` el 2026-10-05.

| Bloque | Subagente | Obligatorias | Apoyo (condición) | Descartadas y por qué | Gate ejecutable |
| --- | --- | --- | --- | --- | --- |
| R0 + E4-UX | `prod-ux` | `brainstorming`, `system-vocabulary-review`, `ui-ux-pro-max` | `iwana-identity-ui-review` (contraste con la Estrella Polar) · `wcag-audit-patterns` (alternativa accesible de la firma) | `core-components`, `senior-ui-systems-designer`: el contrato es de R1 · `frontend-dev-guidelines`, `tailwind-patterns`: no hay código · `playwright-skill`: no hay verificación en navegador | Stop/go §7 del encargo |
| R1 | `ds-owner` | `core-components`, `senior-ui-systems-designer`, `tailwind-patterns`, `iwana-identity-ui-review`, `wcag-audit-patterns` | `ui-ux-pro-max` (subordinada; densidad del checklist) | `frontend-dev-guidelines`: no hay código · `system-vocabulary-review`: el copy es de R0 · `playwright-skill`: no hay superficie implementada | Stop/go §6 del encargo |
| B0, R2, R3 | `fe-platform` | `frontend-dev-guidelines`, `nextjs-app-router-patterns`, `core-components`, `wcag-audit-patterns`, `testing-patterns`, `iwana-identity-ui-review` | `systematic-debugging`, `test-driven-development` (reproducción y fallos) | `database-migration`: sin DDL; `bullmq-specialist`: consumo del API, sin implementación de worker | Typecheck, operations/ con conteo y `Cached: 0`, audit-ui y navegador |
| R4 | `fe-platform` | `frontend-dev-guidelines`, `nextjs-app-router-patterns`, `testing-patterns` | `iwana-identity-ui-review` si cambia UI, que requiere devolver el cambio al dueño | `core-components`, `tailwind-patterns`: política de lecturas sin UI; `database-migration`: sin DDL | Typecheck, conteo exacto de llamadas y operations/ `Cached: 0` |
| E4-portal | `fe-platform` | `frontend-dev-guidelines`, `core-components`, `wcag-audit-patterns`, `testing-patterns`, `iwana-identity-ui-review` | `systematic-debugging` (fallos) | `database-migration`, `postgresql`: orden y datos pertenecen a E4-datos | Typecheck, operations/ `Cached: 0`, audit-ui y navegador |
| R5 | `sr-qa` | `testing-patterns`, `e2e-testing-patterns`, `playwright-skill`, `wcag-audit-patterns`, `iwana-identity-ui-review` | `frontend-dev-guidelines` (ubicar fallos) | `nestjs-expert`: backend tiene su gate separado; nuevas dependencias no previstas | Conteo real por suite, `Cached: 0`, teclado y regresión visual sin P1 |

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

## Registro de bloqueos — Ola 2

| Fecha | Origen | Bloqueo | Resolución (AI-EM-ARCH) | Registro |
| --- | --- | --- | --- | --- |
| 2026-10-05 | `prod-ux`, R0 | La spec §4.2 exige mostrar el motivo y la resolución de una OT bloqueada; `ExecutionOrderDetail` v1.4 no los publica | **Procede, y es un defecto de la spec.** No se versiona el contrato: el motivo no tiene catálogo y su lectura pertenece a T3 de línea de tiempo. La celda *Bloqueada* se diseña sin motivo. Deuda en spec v1.2 §10.12. Se relanza R0 con la adenda A1 | Spec v1.2 · encargo R0, adenda A1 · `INFORME-MOD11-CONSOLA-OT-OLA2-R0-PROD-UX-v1.0.md` |
| 2026-10-05 | AI-EM-ARCH, auditoría G2 de R0 | La UX spec v1.0 promete un borrador offline que no existe y propone un orden de bandeja que exige DDL. Además, la etiqueta del ítem opcional no es la del snapshot | **GO condicionado de R0.** Cuatro correcciones en la adenda A2, entre ellas el orden `DESC NULLS FIRST` sin DDL. G2 sigue **parcial** hasta que R1 entregue | Encargo R0, adenda A2 |
| 2026-10-05 | `prod-ux`, `[CONSULTA]` | ¿Qué alternativa a la firma, operable por teclado? | El trazo queda exceptuado por WCAG 2.1 SC 2.1.1; los controles sí deben operarse por teclado. **El nombre escrito no vale como `SIGNATURE`** (ADR-088 §D4). Que un cliente sin puntero no tenga alternativa queda como **deuda** | Encargo R0, adenda A2 punto 4 |
| 2026-10-05 | AI-EM-ARCH, auditoría | **Defecto vivo:** la bandeja y el resumen del detalle desreferencian `schedule.window`, que es nulable desde E2 (contrato v1.3). Una OT despachada sin cita hace caer la consola | Hotfix inmediato fuera de secuencia, ejecutado por `fe-platform`: pinta `'—'` y no añade copy | `PROMPT-MOD11-CONSOLA-OT-HOTFIX-VENTANA-NULA-v1.0.md` |
| 2026-10-05 | AI-EM-ARCH, **cierre de G2** | Entregados: UX spec v1.1 (R0), contrato de componente v1.0 (R1), tablas operativas v1.2 (R1) y hotfix GO (los 25 tests de las dos suites tocadas los volvió a ejecutar el orquestador). Las cuatro correcciones A2 están verificadas en la v1.1. Los nombres de acción del contrato R1 coinciden con `ExecutionOrderAllowedAction` | **G2 CERRADO.** Contratos congelados para la Ola 2b: UX spec v1.1, contrato de componente v1.0 y **tablas v1.2**. Este registro es el **re-sync** hacia `fe-platform` y `sr-qa` (protocolo §3bis regla 1). Observaciones no bloqueantes: (a) el hotfix pinta `'—'` y la tabla v1.2 ahora prescribe «Por programar»: la Ola 2b lo sustituye; (b) la baja de `PROVISIONING` (handoff P2 de E2) sigue sin decisión de producto y **no entra** en la Ola 2b | UX spec y contrato R1 con estado Aprobado |
| 2026-10-05 | AI-EM-ARCH, **cierre de G3** | Auditado el dictamen de `fe-platform`: las ocho respuestas tienen evidencia de código. Recomienda canvas nativo sin dependencia. Corte de la Ola 2b: **seam B0 de propietario único** y después R2, R3, R4 y E4-portal sin archivos compartidos | **G3 CERRADO.** Se adopta el corte con seam (dictamen §3) y canvas nativo. La firma reutiliza el `expiresAt` del recibo de su propia carga | `INFORME-MOD11-CONSOLA-OT-OLA2-G3-FE-PLATFORM-v1.0.md` |
| 2026-10-05 | AI-EM-ARCH, a partir del dictamen G3 §2.1 | **Defecto probable en producción:** el uploader registra la evidencia sin esperar `AVAILABLE`, y `registerEvidence` la rechaza (`EVIDENCE_ASSET_NOT_AVAILABLE`). Es la causa probable de la observación 6 | Hotfix con reproducción previa, ejecutado por `fe-platform`. Va **antes** del seam B0, porque comparten `use-execution-order-console.ts` | `PROMPT-MOD11-CONSOLA-OT-HOTFIX-EVIDENCIA-ANALISIS-v1.0.md` |
| 2026-10-05 | AI-EM-ARCH, auditoría del hotfix de evidencia y de la remediación E3 | **Hotfix de evidencia (`f1348c64`): GO.** El defecto se reprodujo y ahora se registra solo con `AVAILABLE`. **Observación:** la espera de 6 × 500 ms (unos 2,5 s) **no está calibrada** contra la latencia real del análisis (BullMQ, 3 intentos con backoff exponencial de 1 s). Si se agota, el usuario vuelve a subir y el asset anterior queda huérfano en cuarentena. **Remediación E3 (`c5675620`): GO.** La guarda ADR-090 §D4 está en ambos métodos, probada contra Postgres 5/5 | **Condición para R2:** medir el p95 del análisis en el entorno real, calibrar el tope con ese dato y **reanudar el registro del mismo `mediaAssetId`** en lugar de exigir una subida nueva | `INFORME-MOD11-CONSOLA-OT-HOTFIX-EVIDENCIA-ANALISIS-v1.0.md` · `INFORME-MOD11-ORIGEN-OT-E3-v1.1.md` |
| 2026-10-05 | AI-EM-ARCH, auditoría de **B0** y de **E4-datos** | **B0: GO.** Contenedor de 223 líneas; slots con archivo propio y contrato en `execution-order-slots.ts`; propiedad declarada en el informe B0 §5. El orquestador verificó en frío `operations/` 507/507 y el typecheck global 8/8 con `Cached: 0`. El E2E OLA1 conserva sus 2 tests (solo movió fixtures). **Se ratifican** tres cambios de B0: el copy de bloqueada según UX §5 y A1, «Desbloqueo no disponible» derivado solo de `allowedActions`, y el error de sincronización unificado. **E4-datos: GO.** `EXPLAIN` real sin `Sort` y con control negativo, paginación 5/5 contra Postgres, inventario CA-13 de 18 lectores. **Hallazgo de infraestructura de pruebas:** el spec de anulación revierte la 136 sin condición y borra `is_annulled` de `tenant_iwana`. El orquestador verificó que `tenant_iwana` está hoy coherente (135 y 136 aplicadas y registradas). **Anomalía de gobierno:** los prompts R2, R3, R4, R5 y E4-portal no los emitió el orquestador | Remediación del spec de la 136 (`sr-backend`). Prompts R2-R5 y E4-portal **revisados y adoptados como G4** por AI-EM-ARCH, con nota en cada uno. **T1 no se lanza**: su preparación abre 4 consultas (mecanismo durable frente a ADR-068, mapeo de título y descripción, comando de corrección del despacho y outbox de MOD09) que exigen sesión de definición propia y posiblemente un ADR | `INFORME-MOD11-CONSOLA-OT-OLA2B-B0-FE-PLATFORM-v1.0.md` · `INFORME-MOD11-ORIGEN-OT-E4-DATOS-v1.0.md` · `INFORME-MOD11-CORRECCION-OT-T1-PREPARACION-v1.0.md` |
| 2026-10-06 | AI-EM-ARCH, **consolidación del tramo 2 de la Ola 2b** | **R2: GO condicionado al p95.** **R3 v1.1: GO.** **R4: GO.** Su hallazgo medio, un éxito mostrado sobre la OT equivocada, ya está corregido en el adaptador con `isCurrentExecutionOrderMutation`. **E4-portal: GO.** **Guarda de la 136: GO.** El orquestador volvió a ejecutar las suites del gate de cierre: 48/48. **Ampliación de alcance sin coordinación:** R3 v1.1 (`f9662f05`) amplió el contrato congelado de OT a **v1.5** (`requirementKey` opcional en consumo), creó la **migración 137** (DDL de tenant, columna nula, `down` con guarda) y **endureció el evaluador**: un consumo con clave solo satisface su requisito exacto. Además, la UX pasó a v1.2/v1.3 y el contrato de componente a v1.1. Ninguno de estos cambios pasó por el orquestador ni por la consulta a `data-eng`. La forma de entrega no siguió los cuatro commits recomendados: B0, E4-datos y el tramo 2 llegaron juntos en `fd7f5a0c`, que está publicado y no se reescribe. **R5: NO-GO** por cuatro bloqueos de entorno | **Se aprueban a posteriori** como re-sync: contrato v1.5 (aditivo y retrocompatible), migración 137 (reversible y sin backfill inferido), UX v1.2/v1.3 §14-15 y componente v1.1. **El endurecimiento del gate se acepta** porque aplica ADR-088 §D4: la regla comprueba lo que la etiqueta promete. Queda como **corrección de la UX §14.1**, que afirmaba que el gate no cambiaba. La anomalía de proceso se registra: DDL y contrato congelado cambiados sin coordinación. Destino de los bloqueos de R5: P95 → **condición de G7**, porque no existe entorno compartido (ADR-078); SERVIDOR y CA-09 → `PROMPT-MOD11-CONSOLA-OT-OLA2B-R5-CIERRE-SR-QA-v1.0.md`, contra backend real local; LECTOR → **decisión del CTO**. Observación baja de E4-portal: una OT `CREATED` vista por un perfil sin acciones de supervisión muestra la alerta «No puedes iniciar esta orden»; se ajusta en la siguiente pasada de B0 | Informes R2 v1.1, R3 v1.1, R4, E4-portal, guarda de la 136 y R5 v1.1 |
| 2026-10-06 | CTO | `[BLOQUEO-R5-LECTOR]`: elegir entre verificación manual con lector de pantalla o excepción de accesibilidad | **Opción 1, verificación manual.** AI-EM-ARCH emite un guion de 18 pasos (11 críticos ★). La ejecuta una persona sobre los datos de prueba que prepara R5 v1.2 (encargo de cierre, punto 3). Las Fallas en pasos ★ se convierten en hallazgos asignados al dueño del archivo según el informe B0 §5 | `docs/quality/2026-10-06-mod11-ola2b-guion-lector-pantalla-nvda.md` |
| 2026-10-06 | AI-EM-ARCH, auditoría de **R5 v1.2** | Resultados: CA-09 cerrado contra el backend real local por API y SQL (`OTE-20261006-003`, `COMPLETED/EXECUTED`, `SIGNATURE/CUSTOMER_SIGNATURE/AVAILABLE`). Datos del guion NVDA listos (`OTE-20261006-001`, `-002`). E2E 0/16 en el puerto 3100 por `useAuth debe usarse dentro de AuthProvider` | **El 0/16 no cuenta como hallazgo de producto**: el código de autenticación no cambió desde `f9f42b33` y el arnés no siguió el mecanismo del repositorio. **El error lo indujo el encargo**, que pedía un puerto distinto de 3002. Repetición con `PW_FORCE_FRESH_SERVER=1` en 3002, después de que el usuario detenga su servidor (adenda A1 del encargo de cierre de R5). Queda en observación la convergencia del consumo `PENDING` | `INFORME-MOD11-CONSOLA-OT-OLA2B-R5-SR-QA-v1.2.md` |
| 2026-10-06 | AI-EM-ARCH, auditoría de **R5 v1.3** | E2E **16/16** con `PW_FORCE_FRESH_SERVER=1` en 3002 (45,2 s, código 0): la hipótesis del arnés queda confirmada y `AuthProvider` no falla. Límite declarado: Windows denegó el inventario WMI de procesos. El consumo de `OTE-20261006-003` sigue `PENDING` (`inventoryRequestId=42cb6c95-…`, `stock_movement_id` nulo). **Causa verificada por el orquestador:** ADR-068 (Aprobado), decisión 6 y tabla de eventos, prescribe que MOD12 consuma `InventoryConsumptionRequestedV1` y emita `InventoryMovementConfirmedV1` o `InventoryMovementRejectedV1`. **Ese consumidor no existe en el código.** El handler del worker deja el evento para MOD12 y nada en `apps/api/src/modules/inventory` lo procesa | **R5: GO técnico; el veredicto final depende del recorrido NVDA.** **El `PENDING` no es un defecto de la consola: es un hueco de integración MOD11→MOD12 que existía antes.** Ningún consumo de OT descuenta inventario ni custodia, de modo que un CPE instalado sigue apareciendo como disponible en el selector de R3. Se clasifica como **deuda crítica** de integridad de inventario, fuera del alcance de este plan. Requiere **definición propia** (consumidor MOD12 idempotente según ADR-068) y **decisión del CTO** sobre su prioridad frente al cierre de G6 | `INFORME-MOD11-CONSOLA-OT-OLA2B-R5-SR-QA-v1.3.md` |
| 2026-10-06 | CTO | ¿Prioridad del consumidor de inventario de MOD12? | **Opción 1.** La definición se abre en paralelo y el G6 de la consola **no se bloquea**. **G7 no ocurre sin el consumidor.** Plan propio: `docs/plans/2026-10-06-mod11-mod12-consumo-inventario-ot.md` | `docs/specs/2026-10-06-mod11-mod12-consumo-inventario-ot-design.md` (Propuesto) |
| 2026-10-09 | AI-EM-ARCH | El consumidor de inventario MOD11↔MOD12, condición de G7 de la consola, queda en **G6 GO** (`docs/plans/2026-10-06-mod11-mod12-consumo-inventario-ot.md` §5) | El G6 de la consola sigue pendiente solo del recorrido NVDA. Su G7 se mantiene condicionado: p95, ADR-074 (propuesto) y G6.5/G7 del inventario | Plan de inventario v1.1 §5 |

## Lanzamiento

**Siguiente lanzamiento (2026-10-06): cierre de R5 con `PROMPT-MOD11-CONSOLA-OT-OLA2B-R5-CIERRE-SR-QA-v1.0.md`, un solo bloque para `sr-qa`. El tramo 2 está cerrado.** Lanzamiento anterior: `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA2B-T2-LAUNCH-v1.0.md`, del 2026-10-05: tramo 2 de la Ola 2b, con R2, R3, R4, E4-portal y la guarda de la 136 en paralelo, sobre B0 y E4-datos ya commiteados.** El tramo 1 (`PROMPT-MOD11-CONSOLA-OT-OLA2B-B0-LAUNCH-v1.0.md`) está cerrado en GO. Corte de la Ola 2b: B0 → {R2, R3, R4, E4-portal} en paralelo, uno por slot → R5. B0 posee además la acción `ACTIVITY`, porque el corte de G3 no se la asignaba a ningún bloque. Lanzamientos anteriores, ya cerrados: `PROMPT-MOD11-CONSOLA-OT-E3R-EVIDENCIA-LAUNCH-v1.0.md` y `PROMPT-MOD11-CONSOLA-OT-G3-E3-LAUNCH-v1.0.md`. Si este espejo diverge, prevalece el archivo.** La Ola 2a está cerrada: hotfix GO, R0 y R1 GO, G2 cerrado. La Ola 2b se lanza con su propio archivo cuando G3 y E3 estén en GO. El texto de abajo corresponde al primer lanzamiento de la Ola 2a y se conserva como historial.

**Ola 2a — diseño.** `prod-ux` → R0 + UX de E4 · `ds-owner` → R1, ambos en paralelo. La Ola 1 está cerrada y no se re-despacha. Una vez la Ola 2a cierre en GO, se emiten la aprobación de G2, el dictamen G3 de `fe-platform` y el launcher de la Ola 2b (R2-R4 + portal de E4), que se lanza solo con E3 de origen en GO.

> Actúa como `prod-ux`. Lee `AGENTS.md`, este plan v1.2 y tu encargo `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA2-R0-PROD-UX-v1.0.md` completo. Lee antes los `SKILL.md` de `brainstorming`, `system-vocabulary-review` y `ui-ux-pro-max`. Cierras con el §7 del encargo en GO.

> Actúa como `ds-owner`. Lee `AGENTS.md`, este plan v1.2 y tu encargo `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA2-R1-DS-OWNER-v1.0.md` completo. Lee antes los `SKILL.md` de `core-components`, `senior-ui-systems-designer`, `tailwind-patterns`, `iwana-identity-ui-review` y `wcag-audit-patterns`. Cierras con el §6 del encargo en GO.
