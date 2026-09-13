# INFORME — MOD11 Operaciones · OLA 1 · Consolidación de congelación y factibilidad

**Versión:** 1.0
**Fecha:** 2026-09-13
**Emisor:** AI-EM-ARCH (modo Orquestador)
**Procedimiento:** `docs/prompts/PROMPT-OPERATIVO-DESPACHO-MULTIAGENTE-v1.0.md`
**Plan:** `docs/plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md` v2.1 (§3.4, ola 1)

---

## 1. Alcance de la ola

Cuatro encargos despachados en paralelo con sus órdenes acotadas (sin "lee el plan y ejecuta"): F0 + dictamen backend (`sr-backend`), F3 (`ds-owner`), F4 (`prod-ux`), dictamen frontend (`fe-platform`). Ningún agente recibió alcance de otro; ninguna colisión de archivos.

## 2. Gates — estado de entrada y salida

| Gate | Entrada | Salida |
| --- | --- | --- |
| G1 | ✅ Cerrado (spec aprobada por CTO 2026-09-13) | Sin cambio |
| G2 | ⬜ Abierto | ✅ **CERRADO** — ver §3 |
| G3 | ⬜ Abierto | ✅ **CERRADO** — ver §4 |
| G4 | ⚠️ Emitido, condicionado | ✅ Efectivo (desbloqueado por G2+G3) |
| G5 | ⬜ No iniciada | ⬜ Lista para arrancar (ola 2) |

## 3. Cierre de G2 — verificado contra condiciones de aceptación, no contra autodeclaración

| Handoff | Artefacto | Condición de aceptación | Verificación del orquestador |
| --- | --- | --- | --- |
| **H4** (F3 → F5) | `docs/specs/2026-09-13-mod11-operaciones-tablas-operativas-contrato-componente.md` v1.0 (aprobado por AI-DS-OWNER, carril rápido ADR-049) | Permite un solo pie y no decide el modo en el componente | ✅ Unión discriminada sobre `randomAccess` (miembros con `never` cruzados → dos pies a la vez es error de compilación); ley de un único punto de montaje (§5); modo leído de `meta.capabilities.randomAccess` en el cliente contenedor, sin default ni `useState` local |
| **H5** (F4 → F5) | `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-ux.md` v1.0 | Sin enums crudos; tono conforme a `system-vocabulary-review` | ✅ Veredicto CTA vs pestaña emitido (D2: CTA del header, ratifica con justificación propia); 7 estados vacíos/error con acción (§6); copy en español sentence case; ningún enum crudo en copy citado |

Gate mecánico de identidad re-ejecutado por el orquestador al consolidar: `audit-ui.mjs` → sin hallazgos, exit 0.

**Decisión G2 (AI-EM-ARCH, aprobador ≠ productor en ambos artefactos): APROBADO.** Convergencia no coordinada de DS-OWNER y PROD-UX en "Vence sustituye a Creada" — sin desempate que resolver.

## 4. Cierre de G3 — dictámenes recibidos y resolución de ajustes

| Handoff | Artefacto | Veredicto |
| --- | --- | --- |
| Dictamen backend (SR-FULL) | `docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-G3-FACTIBILIDAD-BACKEND-v1.0.md` | VIABLE CON AJUSTES |
| Dictamen frontend (FE-PLATFORM) | `docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-G3-FACTIBILIDAD-FRONTEND-v1.0.md` | VIABLE CON AJUSTES |

**Decisión G3 (AI-EM-ARCH como Accountable): GO para ola 2, con los ajustes absorbidos así:**

| Ajuste | Resolución |
| --- | --- |
| **B-A1** — "o su cuadrilla" (spec §4.7.2) no implementable hoy (`assertActorAccess:291-294`) | **Adoptada la recomendación:** scoping v1 = réplica de la semántica de lectura del detalle (asignada al técnico **o** pool sin asignar ≠ `CREATED`); ninguna fila de la bandeja da 404 al abrirse. Cuadrilla = refinamiento v2 cuando exista el port tipado de WFM. Entra como directriz del despacho de F1 |
| **B-A2** — `total` por alcance del actor (ADR-065 §15) | Absorbido por el stop/go existente de F1 (test de dos usuarios de alcance distinto, bloqueante) |
| **B-A3** — bucket de throttling del nuevo `GET` | Añadido a la verificación de F1 (`resolveBucket`) |
| **F-A1** — `ExecutionOrderMissingRequirement` importado desde `OperationsClient` (refuta "único importador") | Entra al alcance declarado de F2: la interface migra a `execution-order-requirements.ts` |
| **F-A2** — 11 casos de montaje de `OperationsClient.spec.tsx` mueren con el componente | Entra al alcance declarado de F2: re-apuntarlos allí (+6 `pushState`, 2 aserciones externas). El "26 casos" concilia (22 declaraciones + `it.each` de 5 filas) |
| **F-A3…F-A8** — redirect post-alta, class-tokens con `data-state`, landing restrictedShell, memo de módulo multi-tenant, params no reconocidos, `Suspense` | Precisiones de implementación; se adjuntan al despacho de F2 como directrices, no reabren alcance |
| **Picker NOC/SUPPORT** (plan §11.1) | Predisposición del orquestador: Salida 2 (degradación visible, costo S, sostenida por `responsibleLabel`); Salida 1 queda registrada como deuda con revisión SEC-ENG. La decisión formal se emite al llegar la `[CONSULTA]` de F5 |

## 5. Handoff H1 (F0 → F1/F2/F3) — aceptado

Verificación del orquestador: los dos contratos existen (`execution-orders-list.ts`, `operational-tasks.ts` v1), exportados desde `packages/shared/src/index.ts:54-55` (diff: exactamente 2 líneas); tabla de finalidad por campo escrita (informe backend §7, ADR-067 §2, con exclusiones justificadas en §8); `pnpm --filter @iwana/shared build` re-ejecutado con `--force` → verde, `Cached: 0`; tipos importables. El contrato congelado `execution-orders.ts` no aparece en el diff — intacto. `apps/portal/src/lib/api-client.ts` modificado en el árbol, pero el diff no contiene hunks de operaciones: preexistía de otro track (inventario).

## 6. Evidencia de verificación (regla §8.1)

- Build `@iwana/shared`: corrida forzada por el orquestador, `Cached: 0`, 1 successful.
- Typecheck monorepo reportado por SR-FULL: 8/8 successful, `Cached: 0`.
- `audit-ui.mjs`: re-ejecutado por el orquestador, exit 0.
- Tests: no aplican en esta ola (F0 produce tipos sin suite propia; suites son entregables de F1/F2/F6).

## 7. Marcadores, desempates y deuda

- **Marcadores:** cero `[BLOQUEO]` y cero `[CONSULTA]` en los cuatro tracks. Los tres puntos asíncronos de PROD-UX (§13.4 orden por defecto de tareas, §13.5 costo de M3.1, formato del filtro "Ticket") tienen dueño y conducto definidos; no bloquean.
- **Desempates:** ninguno.
- **Deuda nueva registrada:** B-A1 cuadrilla (v2, requiere port WFM tipado); Salida 1 del picker (backend + SEC-ENG, diferida); F-A6 memo de módulo de usuarios (invalidación por sesión, entra a F2/F5).
- **Latencia de gates:** G2 y G3 cerrados en la misma sesión de la ola; sin re-trabajos.

## 8. Siguiente paso

**OLA 2 — implementación (F1 backend ∧ F2 frontend), paralelo por superficie**, ahora legítima: G2 ✅, G3 ✅, H1 publicado. El despacho de F1 y F2 debe llevar como directrices las resoluciones de §4. AI-EM-ARCH aprueba el gate de salida de ola 2 (G5 parcial) cuando ambos tracks retornen con sus handoffs H2/H3 verificables.
