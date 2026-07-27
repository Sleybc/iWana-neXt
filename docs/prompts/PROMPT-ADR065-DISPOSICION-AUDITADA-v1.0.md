# PROMPT — Disposición de la auditoría independiente del cierre (ADR-065 + DEF-2)

**Versión:** 1.0
**Estado:** Aprobado
**Generado por:** AI-EM-ARCH (modo Orchestrator + Architect)
**Archivo destino:** `docs/prompts/PROMPT-ADR065-DISPOSICION-AUDITADA-v1.0.md`

**Emisor:** AI-EM-ARCH
**Destinatarios:** AI-SR-FULL (E-1, E-2) · AI-PLAT-OPS (E-3) · AI-SR-QA (E-4) · AI-DS-OWNER (E-5) · AI-FE-PLATFORM (E-6, ola 2)
**Fecha:** 2026-07-26
**Entrada obligatoria:** [INFORME-ADR065-GATE-CIERRE-AUDITADO-v1.0](../informes/INFORME-ADR065-GATE-CIERRE-AUDITADO-v1.0.md) — es el contrato de esta disposición
**Entradas de contexto:** [INFORME-ADR065-REGATE-RONDA3-v1.0](../informes/INFORME-ADR065-REGATE-RONDA3-v1.0.md) · [INFORME-ADR065-REGATE-REMEDIACION-v1.0](../informes/INFORME-ADR065-REGATE-REMEDIACION-v1.0.md) · [INFORME-ADR065-R13-R14-CIERRE-v1.0](../informes/INFORME-ADR065-R13-R14-CIERRE-v1.0.md)
**Skills:** `database-migration`, `postgresql`, `testing-patterns`, `nestjs-expert`, `turborepo-caching`, `monorepo-architect`, `wcag-audit-patterns`, `e2e-testing-patterns`, `playwright-skill`, `iwana-identity-ui-review`, `core-components`, `tailwind-patterns`

---

## Regla que gobierna todo este prompt

**Ningún test se acepta como regresión sin demostrar que falla al reintroducir el defecto.**

Es la regla que el informe auditado añade a la ya vigente («ningún gate se firma sin la salida literal»), y es la razón de ser de esta disposición. El hallazgo A-2 no dice que el producto esté mal: dice que **tres tests escritos para impedir la recurrencia de tres defectos no pueden detectar ninguno de los tres**. Un test que no puede fallar por su motivo no es cobertura, es decoración.

Corolario operativo: cada entregable de este prompt adjunta la prueba de mutación —el defecto reintroducido, el test en rojo, el defecto revertido, el test en verde— o no se acepta.

---

## Origen: qué pide el informe auditado

El auditor cierra el gate **sobre su contenido** (los cinco bloqueantes, N-3 y D-1 están cerrados y verificados por ejecución) y condiciona la capacidad de seguir gateando a cinco puntos. Esta es la asignación RACI de esos cinco puntos:

| # Disposición | Hallazgo | Entregable | R | A |
| --- | --- | --- | --- | --- |
| 1 (a) `pnpm test` no determinista | A-1 ALTA | **E-3** | AI-PLAT-OPS | AI-EM-ARCH |
| 1 (b) flake de axe = posible violación AA real | A-1 ALTA | **E-4** → **E-6** | AI-SR-QA (mide) → AI-FE-PLATFORM (corrige) | AI-EM-ARCH |
| 2 test de integración de `089` contra schema real | A-2 ALTA | **E-1** | AI-SR-FULL | AI-EM-ARCH |
| 3 test de endpoint que muera sin `clampPage` | A-2 ALTA | **E-2** | AI-SR-FULL | AI-EM-ARCH |
| 4 corregir la atribución de autoría de la ronda 3 | A-4 BAJA | **E-7** | AI-EM-ARCH | AI-EM-ARCH |
| 5 registrar D-3 con DS-OWNER | A-3 BAJA | **E-5** | AI-DS-OWNER | AI-EM-ARCH |

---

## Modelo de ejecución (protocolo §3bis)

Dos olas. La primera es paralela y no tiene dependencias cruzadas salvo un punto de contrato declarado; la segunda depende de la medición de la primera.

**Ola 1 — paralela**

| Track | Agente | Trabaja contra | Punto de contrato |
| --- | --- | --- | --- |
| Backend/datos | AI-SR-FULL | `089_*.ts`, `clamp-page.ts`, servicios que lo invocan | Expone el script npm que CI debe invocar (`test:integration` en `@iwana/db`) → lo consume PLAT-OPS |
| Plataforma | AI-PLAT-OPS | `turbo.json`, `jest.config.js` de cada app, `ci.yml` | Consume el script de SR-FULL; si aún no existe, deja el paso marcado como pendiente |
| Calidad | AI-SR-QA | `e2e/tests/portal-pager-a11y.spec.ts` y el temporal `portal-tmp-r14-loading-contrast.spec.ts` | Entrega ratios medidos → los consume DS-OWNER y FE-PLATFORM |
| Design system | AI-DS-OWNER | Contrato de estados atenuados, registro de D-3 | Emite la regla que FE-PLATFORM implementa en la ola 2 |

**Ola 2 — secuencial, depende de E-4 y E-5**

| Track | Agente | Entrada |
| --- | --- | --- |
| Frontend | AI-FE-PLATFORM | Ratios medidos por SR-QA + regla de contrato de DS-OWNER |

Regla de frontera para evitar colisión de superficie: **SR-QA mide y escribe el test, no toca componentes; DS-OWNER define contrato, no escribe código; FE-PLATFORM implementa, no inventa tokens.** Es la separación del protocolo §1 aplicada a un defecto de contraste.

---

## E-1 · AI-SR-FULL · Test de integración de la migración `089` contra schema real

**Por qué.** BL-1 fue un error de *runtime* de PostgreSQL (`DO $$` con `$1` → `bind message supplies 1 parameters, but prepared statement requires 0`). Los 14 tests de `089_pagination_ordering_indexes.spec.ts` corren contra un `QueryRunner` mockeado: registran la cadena SQL, no la ejecutan. **Si alguien reintroduce el `DO $$`, los 14 pasan y la migración vuelve a romper el aprovisionamiento.** D-1 es peor: la consulta era sintácticamente impecable y semánticamente falsa; los tests solo asertan `sql.toContain('pg_namespace')`.

**Alcance.** Spec de integración nuevo que conecte a PostgreSQL real, se salte de forma **ruidosa** si no hay DB (para no romper el paso de unit tests), cree schemas efímeros, ejecute `up()` real y verifique 17/17 índices válidos vía `verifyPaginationIndexes`; que compruebe `down()` e idempotencia de `up()`; y que incluya la prueba que de verdad cierra D-1: **un índice `idx_pag_*` creado en un segundo schema no debe ser visible desde el primero** — falla por resultado, no por inspección de cadena.

**Restricción técnica.** La migración es `transactional = false` y usa `CREATE INDEX CONCURRENTLY`: no envolver en transacción. `DataSource`/`QueryRunner` de TypeORM real, no `pg` crudo — el objetivo es ejercitar el camino de producción.

**Stop/go.** Si no hay PostgreSQL alcanzable en el entorno, se entrega el spec con su skip **verificado** y se declara así; no se declara verde lo que no se ejecutó.

## E-2 · AI-SR-FULL · Test de endpoint que muere si un servicio deja de llamar a `clampPage`

**Por qué.** `MAX_PAGE_OFFSET = 9_999` (`apps/api/src/common/pagination/clamp-page.ts:13`) solo protege el pool si **cada servicio invoca el helper**. Los tres tests BL-2 prueban `clampPage` en aislamiento; el propio comentario del test admite el hueco. G-6 pidió este test y sigue pendiente.

**Alcance.** Spec HTTP (patrón `*.controller.http.spec.ts`) sobre al menos 4 endpoints de listado paginado de módulos distintos entre los que hoy llaman a `clampPage`: `page × limit > MAX_PAGE_OFFSET` debe responder **400** con el mensaje en español del helper.

**Criterio de aceptación duro.** Quitar la llamada a `clampPage` de uno de esos servicios pone el test en rojo. Con salida literal. Si pasa igual, el test no sirve.

## E-3 · AI-PLAT-OPS · Determinismo de `pnpm test` (R-14 → bloqueante de CI)

**Por qué.** `.github/workflows/ci.yml:123` ejecuta `pnpm test` sin `continue-on-error`. El auditor lo vio rojo en la 1ª corrida (`@iwana/api`: 1 suite / 2 tests) y verde en la 2ª, con la suite pasando limpia en aislamiento (208 suites / 2348 tests). **La CI irá a rojo de forma intermitente sin que nada esté mal en el código**, y el equipo aprenderá a reintentar en vez de a mirar.

**Causa raíz identificada por AI-EM-ARCH y a verificar por PLAT-OPS:** `turbo.json` no acota la concurrencia de la tarea `test`; `apps/api/jest.config.js:41` y `apps/portal/jest.config.js` declaran ambos `maxWorkers: '50%'`. Con 9 tareas `test` en paralelo bajo turbo, cada paquete reclama la mitad de los cores simultáneamente. El `testTimeout: 15000` del cierre anterior fue un parche al síntoma: el reloj de pared sigue siendo el juez.

**Criterio:** suma de workers concurrentes ≤ cores disponibles, tanto en local como en el runner de GitHub (`ubuntu-latest` = 2 cores, donde la sobresuscripción es mucho peor).

**Prohibido:** subir `testTimeout` como remedio; `skip`, desactivar o `continue-on-error` sobre cualquier suite para conseguir verde.

**Stop/go:** tres corridas consecutivas de `pnpm test` completamente verdes, con la salida literal de las tres. Es el mismo stop/go que este programa declaró cumplido dos veces sin estarlo.

**Adicional:** cablear en `ci.yml` el spec de integración de E-1, **después** del paso «Run tenant migrations (migrator)» (allí ya hay Postgres, roles least-privilege y schema `tenant_test`), como gate rojo.

## E-4 · AI-SR-QA · Medición del flake de axe: ¿violación AA real en estado atenuado?

**Por qué.** El fallo de `v2-34` no fue un timeout: fue una violación de contraste reportada por axe-core con etiqueta de la regla de color, que desaparece al reintentar. v2-34 exige explícitamente que el contenido atenuado durante la carga cumpla AA.

**Evidencia previa que existe y de la que se parte:** `e2e/tests/portal-tmp-r14-loading-contrast.spec.ts` (sin trackear, marcado «BORRAR al cierre») reproduce el defecto de forma determinista auditando durante `refreshing=true` / `aria-busy`. Señal estructural verificada por AI-EM-ARCH: `apps/portal/src/components/shared/portal-ui.tsx:190` y `:693` aplican `disabled:opacity-50`; `:826` emite `aria-busy={loading || undefined}`; `:55` expone además `portalDataTableInactiveRowClassName = 'opacity-70'`. Un texto que cumple AA justo, al 50% de opacidad deja de cumplirlo.

**Alcance.** Medir (regla, nodos, `fgColor`/`bgColor`/`contrastRatio`/`expectedContrastRatio`), convertir el temporal en regresión permanente y estable, y **dejarlo en el rojo esperado y documentado** si el defecto sigue vivo, para que FE-PLATFORM lo ponga en verde en la ola 2.

**Hallazgo adicional asignado en el mismo entregable:** `portal-pager-a11y.spec.ts:610-641` asserta `expect(darkResult.violations.length).toBeLessThanOrEqual(3)` con un comentario que admite tolerar violaciones. **Es el patrón A-2 dentro del propio spec del gate a11y.** No se deja el `<= 3`: o se endurece a `toEqual([])`, o las violaciones son reales y se reparten como hallazgos con su ratio medido.

**Frontera:** SR-QA no toca componentes.

## E-5 · AI-DS-OWNER · Registro de D-3 y contrato de estados atenuados

**Por qué (A-3).** `packages/ui/src/components/Select.tsx:479` pasó de `text-gray-400` (~2,6:1) a `text-gray-500` (~5,3:1) dentro de un arreglo de E2E. La corrección es acertada y necesaria por AA y no toca tokens de marca, pero **altera la apariencia de un primitive compartido con ~90 consumidores** sin pasar por el contrato del design system. Es deuda de proceso, no de producto.

**Alcance.** (1) Verificar el cambio abriendo el archivo y el diff —incluido si la variante oscura ya era `text-gray-500` y el número real de consumidores— antes de registrar nada (protocolo §7.4: una cita que no resiste apertura es defecto bloqueante). (2) Emitir el veredicto del carril rápido (§3bis regla 3). (3) **Lo de fondo:** definir en el contrato qué exige AA de los estados atenuados —`disabled`, `loading`/`aria-busy`, fila inactiva—, con valores concretos y decidibles por un implementador. WCAG 2.2 exime del criterio 1.4.3 a los controles genuinamente deshabilitados, pero no al texto atenuado durante una carga ni a un control que es la señal de estado del sistema. (4) Registrar el artefacto en la convención vigente del repo, sin inventar estructura nueva.

**Frontera:** DS-OWNER no escribe código de componente; si la corrección exigiera tocar tokens de marca, para y escala al CTO (perfil EM-ARCH §5).

## E-6 · AI-FE-PLATFORM · (Ola 2) Corrección del contraste en estados atenuados

**Entradas:** ratios medidos de E-4 + regla de contrato de E-5. **Salida:** el test de regresión de E-4 en verde por corrección del producto, nunca por relajación de la aserción. **Se emite tras el cierre de la ola 1**, con su propio alcance, cuando exista la medición que hoy no existe.

## E-7 · AI-EM-ARCH · Corrección de la trazabilidad de autoría (A-4)

`INFORME-ADR065-REGATE-RONDA3-v1.0.md` atribuye D-2, D-3 y D-4 a «AI-EM-ARCH ejecutor» y su cabecera declara el modo «Orchestrator + ejecutor». El perfil AI-EM-ARCH §4 excluye expresamente implementar código productivo: un informe que asigna código al rol que tiene prohibido escribirlo rompe la trazabilidad del RACI. Se corrige atribuyendo cada cambio al **dueño RACI de la superficie tocada**, que es el criterio verificable, y se deja constancia de la doctrina del protocolo §1 sobre gobernanza vs modo de sesión. Ejecutado por AI-EM-ARCH sobre su propio artefacto documental — no es código.

---

## Gates de esta disposición

Se aplican los gates técnicos comunes del protocolo §4. Añadidos específicos, todos con salida literal:

1. `pnpm test` **tres corridas consecutivas verdes** (E-3).
2. Prueba de mutación de E-1 y E-2: defecto reintroducido → rojo; revertido → verde.
3. Ratios de contraste medidos, no estimados (E-4, E-5).
4. `pnpm lint` y `pnpm typecheck` verdes al cierre.

**Lo que no cierra esta disposición** y sigue siendo deuda declarada sin dueño ni fecha: N-4 (39 dependencias de hooks en `warn`), N-5 (`it.skip` en `InventoryClient.spec.tsx:1862`), N-9, N-10, G-1 parcial, medición del fan-out de N-3, medición de p95 que sostiene `randomAccess` y la lista blanca de orden. No se arrastran en silencio: se registran en el informe de cierre.
