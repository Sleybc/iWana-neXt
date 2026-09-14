# Informe — MOD11 Consola de OT · Ola 1 · Implementación C3 + C4 (Ola B, fe-platform)

**Versión:** 1.0
**Fecha:** 2026-09-14
**Autor:** AI-FE-PLATFORM (subagente fe-platform)
**Encargo:** `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA1-FE-PLATFORM-v1.0.md` — §3 pasos 5 a 9. Los pasos 1 a 4 (copy) están entregados por AI-PROD-UX y no se rehacen.
**Modo iwana-identity:** diseño (construcción alineada a identidad; recetas drawer/side-peek y `PortalAlert`/`Badge` existentes, sin primitives nuevas).
**Punto 7 CRM/MOD05:** fuera de alcance por decisión del CTO (spec v1.1 §5). Cero toques a `crm/opportunities`, MOD05, `@Roles`/`@Permissions`.

## Trazabilidad

- Spec: `docs/specs/2026-09-14-mod11-consola-ot-requisito-como-eje-design.md` v1.1 (Aprobado) — §2.1 A3, §4.1, §4.4.
- Plan: `docs/plans/2026-09-14-mod11-consola-ot-remediacion.md` v1.1 — fases C3, C4.
- Copy: `docs/informes/INFORME-MOD11-CONSOLA-OT-OLA1-PROD-UX-v1.0.md` (tabla 12 celdas, handoff A.2) — implementada, no reescrita.
- Contrato consumido (congelado, no tocado): `packages/shared/src/contracts/operations/execution-orders-completion.ts` v1 (`ExecutionOrderRequirementStatus`), anclado como campo opcional `requirements` en `ExecutionOrderCompletionView` de `packages/shared/src/contracts/operations/execution-orders.ts` v1.1 (E2 aprobada).
- Backend real disponible: `completion.requirements[]` con `satisfied` + `reason` (`docs/informes/INFORME-MOD11-CONSOLA-OT-OLA1-SR-FULL-v1.1.md` vigente, GO en firme).
- Skills obligatorias leídas antes de codificar: `frontend-dev-guidelines`, `nextjs-app-router-patterns`, `core-components`, `tailwind-patterns`, `iwana-identity-ui-review`.
- Apoyo: `wcag-audit-patterns` solo para que el estado por requisito sea legible por lector de pantalla, no solo color (restricción del prompt).
- Descartadas con motivo: `nestjs-expert`, `openapi-spec-generation`, `database-migration`, `postgresql` (cero backend/contratos en este encargo); `system-vocabulary-review` (el copy viene cerrado por prod-ux, no se re-redacta).

## DoR — verificación antes de empezar (superada, sin [BLOQUEO])

| Requisito | Veredicto |
| --- | --- |
| C0 entregado y verificable | OK — contrato v1 en disco, exportado en `packages/shared/src/index.ts:54`; `requirementId = req.key` confirmado en el evaluador (`closure-gate-evaluator.service.ts:93`) |
| C2 entregado y verificable | OK — SR-FULL v1.1: `getCompletion` mapea `evaluation.allEvaluations` a `requirements[]` (`execution-orders.service.ts:321-331`), con `hasCustomerAcceptance` fail-closed a tres condiciones |
| Tabla de copy A.2 recibida | OK — informe prod-ux v1.0, 12/12 celdas cerradas |
| `requirements[]` llega en el entorno | OK a nivel de contrato + backend verificado por SR-FULL; el portal lo consume tipado vía `ExecutionOrderDetail.completion.requirements` (sin mock local divergente) |

## Entregables técnicos (rutas)

| Paso | Archivo | Cambio |
| --- | --- | --- |
| 5 | `apps/portal/src/components/operations/execution-order-commitment-copy.ts` (nuevo) | Lente de rol derivada solo de `allowedActions` (`executor` con `START`; `supervision` con `ASSIGN`/`REASSIGN`/`CREATE_FOLLOW_UP`; `observer` resto); `shouldRenderStartAlert` acota la alerta a pre-inicio (`CREATED`/`ASSIGNED`/`EN_ROUTE`) para el observador sin supervisión; copy verbatim de la tabla (12 celdas) en selectores puros. Cero lectura de identidad en el cliente para permisos |
| 5 | `apps/portal/src/components/operations/ExecutionOrderDrawer.tsx` | Condición anterior (`canInteract && !terminal && !canStart && status !== BLOCKED`, que pintaba la alerta en `IN_PROGRESS`) sustituida por `showStartAlert`; descripción sin sincronización y sin permiso de técnico a supervisores; ayuda pre-inicio junto al botón/acciones; aviso informativo `Orden bloqueada` por rol; ayuda terminal en el cierre de solo lectura. Sin reordenar ni fusionar secciones; uploader/selector, custodia y refetch intactos |
| 6-7 | `apps/portal/src/components/operations/execution-order-requirement-status.ts` (nuevo) | `getRequirementChecklistItems` cruza plantilla con `completion.requirements[]` por `requirementId === key`: etiqueta, estado cumplido/pendiente y razón real; badge `Requerido` conservado como información adicional; `FIELD`/`MEASUREMENT` se muestran como estado sin acción en v1 (spec §4.6), no como error |
| 6-8 | `apps/portal/src/components/operations/ExecutionOrderDrawer.tsx` (checklist) | Ítem con icono + texto de estado (`Cumplido` en `text-iwana-secondary-700`, AA 6.2:1; `Pendiente: razón` en texto) y `aria-label` por ítem para lector de pantalla; degradación visible (`Estado de requisitos no disponible` + lista básica) cuando `requirements[]` no viene; nunca bloque vacío silencioso |
| 5-8 | Tests (nuevos) | `execution-order-commitment-copy.spec.ts`, `execution-order-requirement-status.spec.ts`, `ExecutionOrderDrawerCommitment.spec.tsx` |

## Tabla de copy aplicada (celda → render, sin reescritura)

| Rol | Estado | Render implementado |
| --- | --- | --- |
| Técnico asignado | Pre-inicio | Sin alerta; botón `Iniciar ejecución` + ayuda verbatim (`asignada a ti…`). `assignee` solo como dato descriptivo de la orden, nunca como permiso |
| Técnico asignado | En progreso | Sin alerta; ayuda verbatim bajo el checklist (`Registra avances, evidencias y consumos…`) |
| Técnico asignado | Bloqueada | Aviso informativo `Orden bloqueada` + descripción verbatim (`retoma la ejecución desde esta pantalla`) |
| Técnico asignado | Terminal | Sin alerta; solo lectura + ayuda verbatim en Cierre (`resumen, los requisitos y el historial`) |
| Pool sin asignación | Pre-inicio | Sin alerta; botón + ayuda verbatim (`no tiene responsable…`) cuando tiene `START`; alerta `No puedes iniciar esta orden` con descripción de pool solo si no tiene `START` ni supervisión (caso fuera de matriz, vocabulario de la tabla, supuesto S2) |
| Pool sin asignación | En progreso | Sin alerta; ayuda verbatim (`Puedes registrar avances…`) cuando tiene acciones de registro |
| Pool sin asignación | Bloqueada | Aviso `Orden bloqueada` + descripción verbatim de pool |
| Pool sin asignación | Terminal | Sin alerta; solo lectura + ayuda verbatim de pool |
| Supervisión | Pre-inicio | Sin alerta; ayuda verbatim (`asigna o reasigna… El inicio lo registra el técnico en campo`) |
| Supervisión | En progreso | Sin alerta; ayuda verbatim (`seguir el avance…`) |
| Supervisión | Bloqueada | Aviso `Orden bloqueada` + descripción verbatim (`equipo en campo…`) |
| Supervisión | Terminal | Sin alerta; solo lectura + ayuda verbatim (`resultado… seguimiento`) |

Supuestos registrados (no cambian decisiones): S1 — `assigneePresent` es dato descriptivo de la orden, los permisos salen solo de `allowedActions`. S2 — observador puro en pre-inicio (sin `START` ni supervisión) conserva el título `No puedes iniciar esta orden` con descripción de vocabulario tabla, sin sincronización. S3 — observador puro en progreso/terminal sin acciones: solo `Sin alerta` (progreso) o ayuda de pool (terminal, lectura real). S4 — el motivo del bloqueo no tiene sección propia en el drawer: el aviso se pinta sin motivo inventado (deuda menor, ver tabla de deuda).

## Stop/go §7 — veredicto GO

| Criterio | Veredicto | Evidencia |
| --- | --- | --- |
| (a) OT en `IN_PROGRESS` ⇒ alerta no renderizada para ningún rol (CA-03) | GO | `ExecutionOrderDrawerCommitment.spec.tsx`: 3 lentes en `IN_PROGRESS` + bloqueada/terminal, cero renders; condición `shouldRenderStartAlert` falsa fuera de pre-inicio (spec de helpers, 9 casos) |
| (b) Supervisor no ve copy de técnico, ve sus acciones reales (CA-04) | GO | Render con `['ASSIGN','CREATE_FOLLOW_UP']`: ayuda de supervisión presente; `Iniciar ejecución`, alerta y `Solo el técnico asignado` ausentes; palabra `sincroniz` ausente de la alerta |
| (c) Checklist muestra por requisito si está cumplido y por qué no (CA-05) | GO | Ítems con `aria-label` (`Etiqueta: Cumplido` / `Etiqueta: Pendiente: razón`) + texto visible no-solo-color; `Requerido` conservado como adicional |
| (d) En `OTE-20260828-001`: `Actividad de instalación` cumplida, otros dos pendientes con razón | GO (vía datos equivalentes) | Test con la plantilla semilla 118 (`installation-activity` ACTIVITY, `work-photo` EVIDENCE PHOTO, `CUSTOMER_SIGNATURE` EVIDENCE SIGNATURE) + `requirements[]` realista: cumplido + 2 pendientes con razón. Evidencia en navegador: limitación L1 (abajo), pendiente para C5 |
| (e) `audit-ui.mjs` limpio + tests con conteo real | GO | `audit-ui` sin hallazgos en los 3 archivos fuente; jest directo (`--ci --runInBand`, sin turbo, sin `--passWithNoTests`): 3 suites nuevas/**55 tests** + regresión 5 suites/**159 tests** (drawer existente incluido), cero fallos |

**NO-GO no activado:** no hubo que reordenar ni fusionar secciones (R3/R6 intactos: seis bloques en su orden, sin colapsables nuevos); uploader/selector (R2), custodia y refetch (R3/R4) intactos.

## Evidencia de calidad (conteo real, jest directo sin turbo)

| Suite | Resultado |
| --- | --- |
| Nuevas C3/C4 (`commitment-copy` + `requirement-status` + `DrawerCommitment`) | 3 suites, **55 tests passed** |
| Regresión (`Drawer` existente + `Experience` + `view` + `requirements` + `collections`) | 5 suites, **159 tests passed** |
| `tsc --noEmit` portal | verde |
| `eslint` sobre los 6 archivos tocados/creados | limpio |
| `audit-ui.mjs` sobre los 3 archivos fuente | sin hallazgos (baseline previo también limpio) |

## Paso 9 — hallazgo del catálogo de plantillas vivas (riesgo R2)

Verificación a nivel de código (sin acceso de lectura a BD tenant dentro de la superficie fe-platform; query propuesta para C5 en entorno con datos):

- La única siembra versionada, `118_seed_default_execution_order_templates.ts`, publica `INSTALACION_ESTANDAR` v1 con `ACTIVITY` (`installation-activity`), `EVIDENCE` PHOTO (`work-photo`) y `EVIDENCE` SIGNATURE (`CUSTOMER_SIGNATURE`): **sin `FIELD` ni `MEASUREMENT`**. Las OT bajo esta plantilla no manifiestan R2.
- El contrato y el servicio de plantillas **permiten** publicar versiones vivas con `FIELD` (config `TEXT`/`NUMBER`/`BOOLEAN`/`SELECT`) y `MEASUREMENT` (`mapTemplateRequirements`, `execution-orders.service.ts:2332-2359`; CHECK `chk_execution_order_template_requirements_kind` con los 6 kinds, migración 094).
- `getCompletion` publica `fieldData: {}` y `measurements: []` porque no hay fuente persistida (SR-FULL v1.1 §5; spec §10.1-10.2): **toda plantilla viva que declare `FIELD`/`MEASUREMENT` requeridos produce OT incerrables y, tras C4, pendientes permanentes visibles**. Es el defecto preexistente que esta fase hace visible (R2): se registra, no se oculta — el checklist los pinta como estado pendiente con razón, sin acción en v1 y sin presentarlos como error.
- Query propuesta para C5/SR-QA (no ejecutada aquí): versiones `PUBLISHED` con requirements `kind IN ('FIELD','MEASUREMENT')` y `required = true`, para dimensionar las OT afectadas antes del despliegue.

## Deuda por severidad

| Sev | Hallazgo | Estado |
| --- | --- | --- |
| Limitación L1 | Evidencia en navegador sobre `OTE-20260828-001` no producible en esta sesión: el stack dev está activo (API 401 sin sesión = ruta viva; portal 200), pero no hay sesión tenant disponible dentro de la superficie fe-platform y crear datos de prueba sería operar backend/BD (fuera de límites). Evidencia sustituta: render con datos equivalentes al seed 118 + `requirements[]` realista. Pendiente para C5 (SR-QA, con entorno E2E y credenciales) | Abierta, no bloqueante de GO (criterios literales cumplidos) |
| Menor | S4 — el motivo del bloqueo no tiene sección propia: el aviso `Orden bloqueada` se pinta sin motivo. La UX spec de R0 (Ola 2) debe decidir su sección | Abierta para R0 |
| — | Deuda preexistente `FIELD`/`MEASUREMENT` sin vía de captura (spec §10.1-10.2) | Activa, hecha visible por C4 (R2); sin cambios |
| — | Duplicación de mapas de copy `requirementKindLabel()` vs `REQUIREMENT_KIND_LABELS` (spec §10.5) | Intacta, no agravada: el checklist nuevo usa etiqueta del contrato con fallback a `requirementLabel` existente |

## Marcadores del protocolo §6.3

- `[BLOQUEO]`: ninguno (DoR superado; contrato suficiente).
- `[CONSULTA]`: ninguna emitida. Constatado: el checklist no necesitó ningún primitive del DS inexistente (`PortalAlert`, `Badge`, `ProgressMeter`, iconos lucide y tokens `iwana-secondary-700`/`-400` ya existen y están verificados en `globals.css` y `portal-ui.tsx`).
- `[DESEMPATE]`: ninguno.

## Handoff

Código en `apps/portal/src/components/operations/` (2 archivos nuevos + `ExecutionOrderDrawer.tsx`); copy aplicado celda por celda sin reescritura; checklist con estado real y degradación visible; 55 tests nuevos + 159 de regresión en verde con conteo real; `audit-ui` limpio. **Veredicto: GO.** Pendientes fuera de esta fase: evidencia navegador C5 (L1), sección del motivo de bloqueo en R0, dimensionado R2 con query en entorno con datos. Punto 7 CRM: no tocado.
