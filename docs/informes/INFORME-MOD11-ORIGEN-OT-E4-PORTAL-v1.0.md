# INFORME — MOD11 Origen de OT · E4, parte de portal

- **Versión:** 1.0
- **Fecha:** 2026-10-05
- **Agente:** AI-FE-PLATFORM (`fe-platform`)
- **Encargo:** `docs/prompts/PROMPT-MOD11-ORIGEN-OT-E4-PORTAL-v1.0.md`
- **Trazabilidad:** UX consola v1.1 §7; tablas operativas v1.2 §7.2 col. 5; informe B0 §5 (propiedad de archivos) y §6; E4-datos `INFORME-MOD11-ORIGEN-OT-E4-DATOS-v1.0.md` (GO)
- **Sin commit, sin ramas.** No se tocó `apps/api`, `apps/worker`, shell, hooks ni slots.

**Dictamen: GO del alcance de portal (CA-12, presentación).** Sin P1 ni bloqueos. Un hallazgo fuera de mi propiedad queda como `[CONSULTA]` (§5).

## 1. Qué cambió

| Archivo | Cambio |
| --- | --- |
| `apps/portal/src/components/operations/execution-order-window-copy.ts` (nuevo) | Fuente única del texto de ventana nula: `getExecutionOrderWindowAbsence(status)` devuelve `{ label, help }`. Abierto (CREATED, ASSIGNED, EN_ROUTE, IN_PROGRESS, BLOCKED): «Por programar» + ayuda aprobada. Terminal (COMPLETED, COMPLETED_WITH_OBSERVATIONS, NOT_EXECUTED, CANCELLED): «Sin ventana planificada», sin ayuda. La terminalidad sale de `isTerminalStatus` (B0), no de un set duplicado |
| `ExecutionOrdersTable.tsx` | Columna 5 por `WindowCell`: con ventana conserva formato, intervalo y `font-mono text-xs` solo para fechas; sin ventana pinta el texto del estado sin mono. Sin columna nueva, sin encabezados ordenables, sin orden local |
| `ExecutionOrderSummary.tsx` | Parte del estado de B0 (`syncCopy` / `toSummarySyncState`, intacto). Solo el bloque de ventana: sin ventana pinta la misma etiqueta y, si es abierta, la ayuda aprobada (`text-xs text-gray-600`). Con ventana, intervalo sin cambios. La variante `agenda-compact` no muestra ventana y sigue igual. El encabezado del bloque pasa de «Ventana» a «Ventana planificada» (UX §7.3 y encabezado de la tabla) |
| `ExecutionOrdersTable.spec.tsx`, `ExecutionOrderSummary.spec.tsx` | La aserción de raya se sustituyó por las nuevas (la raya ya no es el contrato, v1.2); el resto intacto |
| `execution-order-window-copy.spec.ts` (nuevo) | Unidad del mapeo, cobertura de los 9 estados del enum y fuente única (ninguna pantalla repite el texto en JSX; tabla y resumen importan el módulo) |
| `e2e/tests/portal-operations-origen-ot-e4.spec.ts` (nuevo) | 3 E2E con API simulada para la evidencia de navegador (§3) |

No se escribió la ayuda para el técnico ni acción alguna sobre CREATED: la ayuda remite a programación y no hay botón nuevo (prueba: sin botones en el resumen de una CREATED sin ventana y sin texto de reclamo).

## 2. Gates

| Gate | Resultado |
| --- | --- |
| `pnpm --filter portal typecheck` | Verde |
| `eslint` y `prettier --check` de los 7 archivos tocados | Sin hallazgos |
| `jest src/components/operations --no-cache` (directo, sin turbo) | **36 suites, 545 tests, 0 fallidos, 0 omitidos** |
| `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/operations apps/portal/src/app/dashboard/operations` | «sin hallazgos» |
| Playwright `portal-operations-origen-ot-e4.spec.ts` | 3 de 3 |

**Conteo.** Baseline B0: 35 suites, 507 tests. Ahora 36 suites y 545: +38 exactos, todos míos (tabla: 1 prueba reemplazada por 12; resumen: 1 reemplazada por 13; suite nueva de 15). No se borró ninguna prueba ajena y la única que retiré (raya de ventana nula, en tabla y resumen) está reemplazada por su sucesora en el mismo archivo. Las demás suites del baseline siguen en verde. Jest no imprime `Cached: 0` (es de turbo): se corrió con `--no-cache` sin turbo, conteo real.

Los fallos de typecheck o jest por archivos de otros bloques en edición (R2, R3, R4) no aparecieron en ninguna corrida: todo lo ajeno estaba en verde cuando corrí.

## 3. Evidencia en navegador

Playwright (chromium) contra el dev server real del portal en `127.0.0.1:3002`, API simulada con `page.route` sobre `setupMocks` de las fixtures de consola (mis rutas se registran después y delegan el resto con `fallback()`).

- **Bandeja:** 10 filas en el orden del servidor. Las cinco abiertas sin ventana dicen «Por programar»; las cuatro terminales, «Sin ventana planificada»; la que tiene ventana, su intervalo. 8 encabezados (ninguna columna nueva), 0 `aria-sort`, 0 botones en `thead`, orden de filas idéntico al publicado, sin enums crudos.
- **Resumen abierto (CREATED sin ventana):** «Ventana planificada: Por programar» con la ayuda aprobada; ningún botón de reclamo.
- **Resumen terminal (CANCELLED):** «Sin ventana planificada» sin ayuda. Con ventana: intervalo, sin texto de estado.
- **Capturas** (`docs/quality/mod11-e4/`): `e4-bandeja-ventana-nula.png`, `e4-resumen-abierto-sin-ventana.png`, `e4-resumen-terminal-sin-ventana.png`. Revisé las dos primeras visualmente.

## 4. CA-12 contra lo entregado

| Criterio | Estado |
| --- | --- |
| Abierta sin ventana → «Por programar», terminal → «Sin ventana planificada», en tabla y resumen | Cumple (misma fuente, probado para los 9 estados) |
| Fechas existentes conservan formato e intervalo | Cumple (pruebas de tabla, resumen y E2E) |
| Mono técnico solo para fechas | Cumple (prueba de clases) |
| Ayuda solo en resumen abierto sin ventana | Cumple (ausente en terminal, con ventana y en `agenda-compact`) |
| Sin invitar al técnico a reclamar CREATED | Cumple |
| Sin columna, orden local ni encabezados ordenables; orden del servidor | Cumple |
| Sin enum crudo | Cumple |

## 5. `[CONSULTA]` y deuda

1. **Resuelta en §7 (2026-10-06).** El encabezado `ExecutionOrdersClient.tsx` ahora dice: «Las órdenes por programar aparecen primero; luego, la ventana planificada más reciente», consistente con `planned_window_start_at DESC NULLS FIRST, id DESC`.
2. **Observación, B0:** el drawer de una CREATED sin responsable muestra «No puedes iniciar esta orden / Esta orden aún no tiene responsable asignado…» (copy de B0). No contradice mi ayuda y no invita a reclamar, pero conviene que UX confirme que ambos mensajes juntos son los deseados para la lente de supervisión.
3. **Resuelta en §7 (2026-10-06).** `ExecutionOrderRecord` y `ExecutionOrderSummary` ya toleran nulos en id de evento e inicio/fin de ventana.
4. El E2E nuevo es un archivo adicional en `e2e/tests/`; si el orquestador prefiere que E4-portal no lo posea, puede moverse o retirarse sin afectar el resto.

## 6. Verificado y no verificado

**Verificado:** typecheck, eslint, prettier, audit-ui, jest `operations/` en frío (751 tras las correcciones de §7), E2E con HTTP simulado en el dev server real, capturas revisadas.

**No verificado:**
- Navegador contra el **backend real con sesión**: no hay credenciales en las semillas y no las busqué ni las introduje (misma limitación que B0 §10).
- **Modo oscuro** de la celda y la ayuda en navegador: se usan los mismos tokens que ya traen esas superficies (`dark:text-gray-400`, `dark:text-gray-200`), pero no hay captura dark.
- Lector de pantalla real: solo pruebas de texto y rol en jsdom y Playwright.
- Verificación global actualizada en §7: typecheck, lint y Jest del monorepo terminaron en verde.

## 7. Correcciones posteriores (2026-10-06)

Se corrigieron las dos observaciones de propiedad de portal de §5. El encabezado informa el orden server-owned con `NULLS FIRST`, y `ExecutionOrderRecord` permite id de evento y ventana nulos. `ExecutionOrderSummary` presenta la ventana ausente con el estado vigente sin intentar formatear `Invalid Date`; el DTO de vínculo de agenda mantiene su id obligatorio.

Regresiones en `ExecutionOrdersClient.spec.tsx` y `ExecutionOrderSummary.spec.tsx`. La suite fría de `operations/` quedó en 44 suites y 751 tests. Después, el Jest del monorepo pasó con 10 tareas y Cached: 0; typecheck global pasó 8 tareas con Cached: 0 y lint global terminó sin errores.

La sesión autenticada no quedó visible para CUA: el navegador expuesto no listó pestañas. Por eso el backend real y la sesión no se revalidaron en esta remediación.
