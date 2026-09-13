# ENCARGO DE DESPACHO — MOD11 Operaciones · Ola 4 · AI-SR-QA

**Módulo:** MOD11 — Ejecución Operativa / Tareas
**Ola:** 4 — verificación
**Versión:** 1.0 · **Fecha:** 2026-09-13 · **Emitido por:** AI-EM-ARCH
**Agente destinatario:** `sr-qa` (AI-SR-QA)
**Fase:** **F6** — reparto fino de specs, tests nuevos, E2E, trazabilidad
**Cierra:** parte de **G6** (etapa 6 del protocolo) y el handoff **H7**

> Orden de despacho. Encargo formal: `PROMPT-MOD11-OPERACIONES-SUBRUTAS-F5-F6-v1.0.md`, **solo la fase F6**. F5 está cerrada.

---

## 1. Estado de entrada

**G5 COMPLETO** (`INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA3-CONSOLIDACION-v1.0.md`): F0–F5 cerradas, H1–H6 verificados por evidencia re-ejecutada. Suite portal en 257/257 suites, 2341 passed + 1 skipped; `audit-ui.mjs` limpio; lint y typecheck 8/8 con `Cached: 0`.

**Arranca.** Si encuentras la entrada incompleta, emite `[BLOQUEO]` antes de escribir tests.

## 2. Lectura obligatoria, en este orden

1. `AGENTS.md` — gobernanza y **Skills Dispatch**.
2. `docs/roles/Protocolo_Colaboracion_Multiagente_v1.md` v1.5 — §3 etapa 6, **§4 gates técnicos y su nota de caché**, §6.3 marcadores.
3. `docs/plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md` v2.1 — §4 skills, §8 verificación y §8.1 regla de evidencia.
4. `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` v1.0 — **§6: los once criterios de aceptación son tu matriz**.
5. `docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA3-CONSOLIDACION-v1.0.md` — **§3 dice qué CA quedaron observables y cuáles dependen de ti**; §7 es la deuda que absorbes.
6. `docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA2-CONSOLIDACION-v1.0.md` §7 — deuda heredada D-2 y SEC-D1.
7. `docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA2-SEC-ENG-v1.0.md` — SEC-D1 con su razón.
8. `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-F5-F6-v1.0.md` — encargo formal, **solo F6**.

## 3. Alcance: **solo F6**

1. **Reparto fino de specs** — la parte pura. Los 11 casos de montaje ya los re-apuntó F2 (D-A2) y corren en verde; **no los rehagas**. Tu trabajo es lo que quedó: specs de las funciones puras, tests nuevos de los componentes que F5 completó (`ExecutionOrdersTable`, `ExecutionOrdersToolbar`, `OperationsUserPicker`) y cobertura de los filtros ampliados.
2. **CA-03 — verificación ADR-065 §15 con dos alcances.** Es el paso que el plan declara pendiente desde la ola 1: con dos usuarios de alcance distinto, el `total` del pie **no revela el total del tenant** a un técnico. Es verificación de seguridad con forma de test de UI; no la omitas por parecer cosmética.
3. **E2E de navegador para CA-01 a CA-07.** La consolidación de la ola 3 declaró sin ambigüedad que la verificación plena de CA-01 y CA-02 depende de ti.
4. **D-2 heredada (OLA2) — E2E API bloque 9.** El listado + BOLA de `e2e/tests/api/execution-orders-operational.spec.ts` **nunca corrió en entorno canónico**: el intento real falló con 401 en login de plataforma. Consíguelo o declara con precisión por qué no es posible y qué haría falta; coordina con AI-PLAT-OPS si es de entorno. Prerrequisito del fichero: `npx tsx e2e/scripts/provision-execution-template.ts`.
5. **SEC-D1 heredada — caso CONTRACTOR.** Falta en los tests unitarios de scoping: hoy una regresión que retire ese rol no se detecta. Añádelo.
6. **`portal-pager-a11y.spec.ts`** gana las dos tablas nuevas.
7. **Matriz criterio ↔ test:** cada CA-01…CA-11 mapeado a al menos un test nombrado. Es el entregable central de H7.
8. **D-6, si lo relevas:** `page`/`limit` inválidos permanecen en la URL (los helpers `*-query.ts` de F2 no los corrigen; `useTableQueryState` sí). Repórtalo; la corrección es de FE-PLATFORM.

## 4. La regla que no se negocia en esta fase

**Las líneas 876 y 975 de `e2e/tests/portal-field-flow-ticket-ot-inventory.spec.ts` se verifican intactas, no se tocan.** Son la prueba de que el deep link legado sigue vivo. **Añade** un caso que entre por la URL canónica; no sustituyas el legado.

## 5. Skills — leer antes de escribir tests

**Obligatorias:** `testing-patterns`, `e2e-testing-patterns`, `playwright-skill`, `verification-before-completion`.
**De apoyo:** `test-driven-development`, `wcag-audit-patterns` (a11y del pager y de las tablas), `systematic-debugging` (cuando un test falle por causa no evidente).
**No uses:** `brainstorming`, `architecture-decision-records`, `bullmq-specialist`, `turborepo-caching`.

## 6. Superficie

Archivos de test (`*.spec.ts(x)`, `e2e/`). **Eres el único agente de esta ola que escribe código**; PROD-UX, DS-OWNER y SEC-ENG solo producen informes. Si encuentras un defecto de producto, **no lo arregles**: repórtalo. Corregirlo tú mezcla la verificación con la implementación y deja sin dueño el arreglo.

## 7. Restricciones no negociables

1. **No toques las líneas 876/975** del e2e de flujo de campo.
2. **No modifiques código de producción** para que un test pase. Si el test revela un defecto real, es hallazgo con dueño: `[CONSULTA]` a AI-FE-PLATFORM o AI-SR-FULL, o `[BLOQUEO]` si impide cerrar.
3. **No des por buena una suite verde de turbo con caché caliente.** Ver §8.
4. **No marques un CA como cubierto** sin un test nombrado que lo ejercite.
5. Sin PII real en fixtures. Solo `pnpm`.

## 8. Regla de evidencia — tu fase es donde más importa

Un `pnpm test` verde **no prueba que los tests corrieron**: Turborepo cachea y una suite restaurada reporta éxito sin ejecutar nada. Para que el gate 4 del protocolo cuente como evidencia, adjunta la línea de resumen con **`Cached: 0`** (o corre con `--force`). Una cifra de cobertura sin esa prueba se reporta **no verificada**, nunca cumplida.

Comandos: `pnpm lint`, `pnpm typecheck`, `pnpm --filter @iwana/api test`, `pnpm --filter @iwana/portal test`, `pnpm test:e2e:portal`.

## 9. Handoff H7 (F6 → AI-EM-ARCH) — condición de aceptación

**Matriz criterio ↔ test con los once CA de la spec §6, conteo real y deuda residual por severidad.** Se acepta con la matriz completa y las corridas reproducibles, no con tu declaración de que la suite está verde.

## 10. Stop/go — F6 no cierra si

- Falta la verificación ADR-065 §15 con dos alcances (CA-03).
- Se alteraron las líneas 876/975 del e2e de flujo de campo.
- Algún CA de la spec §6 queda sin test asociado.
- El informe reporta verde sin conteo real.
- D-2 (E2E API bloque 9) queda sin corrida **y sin explicación precisa** de qué lo impide.
- SEC-D1 (caso CONTRACTOR) sigue ausente.

## 11. Marcadores (§6.3 — exactos, sin variantes)

`[BLOQUEO]` a AI-EM-ARCH antes de cerrar sesión. `[CONSULTA]` a AI-EM-ARCH (criterio de aceptación ambiguo o faltante), a AI-SR-FULL o AI-FE-PLATFORM (entender el código bajo prueba), a AI-SEC-ENG (escenarios de abuso a cubrir — **bloqueante en flujos sensibles**), a AI-PLAT-OPS (fallo o flakiness de la infraestructura de CI).

## 12. Reporte final

Informe de calidad en `docs/informes/`. Declara: skills leídas, matriz criterio↔test completa, conteo real por suite con plataforma y duración, veredicto sobre D-2 y SEC-D1, hallazgos con dueño asignado, y deuda residual por severidad.
