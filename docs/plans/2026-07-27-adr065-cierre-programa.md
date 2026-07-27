# Plan de cierre del programa ADR-065 + DEF-2

**Emisor:** AI-EM-ARCH (modo Product Architect + Orchestrator)
**Fecha:** 2026-07-27
**Entrada:** [INFORME-ADR065-DISPOSICION-EJECUTADA-v1.0](../informes/INFORME-ADR065-DISPOSICION-EJECUTADA-v1.0.md) — su §«Lo que NO pude verificar», su §3 de decisiones y su §Deuda viva
**Regla que gobierna:** ADR-016 (regla de completitud) — no se inicia el módulo N+1 sin cerrar N. Este plan es lo que falta para poder decir «cerrado» sin asterisco.

---

## Qué queda abierto, exactamente

Tras la disposición ejecutada, el programa tiene **tres clases** de pendiente, y solo la primera bloquea el cierre:

| Clase | Qué es | ¿Bloquea el cierre? |
| --- | --- | --- |
| **A · Verificaciones no ejecutadas** | Dos afirmaciones sostenidas *por construcción* y no *por ejecución* | **Sí.** Es la deuda de evidencia que este programa arrastra desde el primer gate |
| **B · Hueco de diseño del gate de citas** | El validador solo comprueba los ADR que alguien cita | No, pero es la causa de que A-5 apareciera de golpe |
| **C · Deuda arrastrada sin dueño ni fecha** | N-4, N-5, N-9, N-10, G-1 parcial, fan-out de N-3, p95 | No — pero lleva **cuatro informes** declarada «sin dueño ni fecha», y eso ya no es deuda: es una lista que nadie lee |

**Postura:** las fases 1 y 2 se ejecutan ahora. La fase 3 recibe dueño y fecha en este plan —que es lo que la auditoría reclama— y se ejecuta bajo tu visto bueno, no de oficio.

---

## Fase 1 — Cerrar las dos verificaciones (condición de cierre)

Ninguna de las dos necesita escribir código. Ambas necesitan **levantar el entorno y mirar el resultado**, que es precisamente lo que este programa lleva sin hacer.

### V-1 · Ejecutar la suite de integración de `089` contra PostgreSQL real
**Responsible:** AI-PLAT-OPS · **Accountable:** AI-EM-ARCH

Existen 13 tests (`packages/database/src/migrations/tenant/089_pagination_ordering_indexes.integration.spec.ts`) que ejecutan `up()` real, verifican los 17 índices, prueban `down()`, idempotencia, whitelist y el aislamiento por schema con un índice señuelo. **Nunca se han ejecutado contra una base real** — en la sesión de la disposición Docker no estaba levantado y solo se verificó el camino de skip.

Cierra: el punto 2 de la Disposición, y con él la afirmación «BL-1 y D-1 ya no pueden volver», que hoy es una promesa de diseño.

**Stop/go:** `Tests: 13 passed` con la salida literal. Un skip **no** es un pase.

### V-2 · Ejecutar los E2E de a11y con dev server
**Responsible:** AI-SR-QA · **Accountable:** AI-EM-ARCH

`e2e/tests/portal-pager-a11y.spec.ts` incluye el test nuevo del estado `refreshing` que debería estar en verde tras la remediación de los 11 contenedores `aria-busy`, y el de modo oscuro endurecido de `<= 3` a `toEqual([])`. Ninguno se ha corrido desde que la remediación entró.

Cierra: el punto 1(b) de la Disposición. Y responde la pregunta que abrió A-1: si el flake desapareció por corrección o por suerte.

**Stop/go:** las tres specs del gate en verde, dos corridas consecutivas para descartar que el flake siga vivo.

---

## Fase 2 — Cerrar el hueco de diseño del gate de citas

### V-3 · Barrido de estados independiente de las citas
**Responsible:** AI-PLAT-OPS · **Accountable:** AI-EM-ARCH

`scripts/audit-adr-citations.mjs` valida el estado de un ADR **solo cuando alguien lo cita**. Un ADR con el estado fuera de vocabulario no dispara nada hasta que se le cita — que es exactamente cómo ADR-064 pasó de invisible a 60 defectos el día que el programa empezó a citarlo.

Hoy los 52 ADR son canónicos (barrido de la sesión anterior), así que el cambio entra en verde y su valor es **preventivo**: convierte un defecto que aparece de golpe y tarde en uno que aparece el día que se escribe.

**Restricción de severidad — importa:** el barrido reporta **AVISO**, no BLOQUEANTE, para los ADR no citados. Razón: un ADR sin estado válido puede necesitar una decisión del CTO para resolverse, y un job de CI no debe poder quedarse bloqueado esperando una firma humana. Los ADR **citados** conservan su severidad BLOQUEANTE actual.

**Stop/go:** `node scripts/audit-adr-citations.mjs` sigue en `BLOQUEANTE: 0` y el barrido nuevo demuestra que detecta el caso — con la prueba de mutación correspondiente (romper el estado de un ADR no citado y verlo aparecer).

---

## Fase 3 — Deuda arrastrada: dueño y fecha

No se ejecuta en esta ola. Se nombra, que es lo que faltaba.

| Ítem | Qué es | R | Condición de cierre |
| --- | --- | --- | --- |
| **N-4** | 39 dependencias de hooks en `warn`; con `--max-warnings 0` el lint vuelve a rojo | AI-FE-PLATFORM | Cada warning resuelto o suprimido con justificación por caso; lint con `--max-warnings 0` en verde |
| **N-5** | `it.skip` en `InventoryClient.spec.tsx:1862`, cuyo fallback E2E fallaba 41/41 | AI-SR-QA | El test corre, o se elimina con la razón registrada. Un `skip` sin fecha es un test que no existe |
| **N-10** | Código muerto: import sin usar en `AssetsWorkspace.tsx:22`, rama de copy con raya muerta en 5 workspaces, `applyCreatedAtFilter` sin test | AI-FE-PLATFORM + AI-SR-FULL | Eliminado o cubierto |
| **G-1 parcial** | Auditoría, timeline, notificaciones y cola de visitas no emiten `randomAccess: false` | AI-SR-FULL | Los cuatro recursos emiten la capability; contrato de API actualizado |
| **Fan-out de N-3** | `enrichVisitRequests` se corrigió a consulta batch; **el fan-out resultante nunca se midió** | AI-SR-FULL | Medición con el número, no «se ve bien» |
| **p95 de listados** | Sostiene `randomAccess` y la lista blanca de orden de todo ADR-065 | AI-SR-FULL (consulta AI-DATA-ENG) | p95 medido por recurso |
| **Deuda del contrato DS** | Hex crudo contra ADR-056 §3 (`auth-form-styles.ts:36`, `MultiSelect.tsx:219`, `SubscribersListClient.tsx:457`) + 3 casos «verificar» de su §5 | AI-DS-OWNER → AI-FE-PLATFORM | Tokenizado; los 3 casos resueltos por lectura o medición |

**Criterio de priorización recomendado:** N-4 primero. Es el único que bloquea endurecer el lint, y mientras el lint tolere 49 warnings ninguna regla nueva de calidad tiene dónde apoyarse.

---

## Riesgo de ejecución declarado

La ola anterior de agentes **murió a mitad por límite de gasto mensual** y dejó trabajo a medio escribir en el árbol, que hubo que auditar archivo por archivo para saber qué estaba entregado y qué no. Por eso esta ola despliega **dos agentes, no seis**, y la fase 3 espera: cada agente que muere en vuelo cuesta más en auditoría posterior que lo que ahorra en paralelismo.

**Ninguna fase de este plan hace `git commit` ni `git push`.** El árbol tiene ~480 archivos modificados de trabajo previo no comiteado; consolidarlo es una decisión aparte y es tuya.
