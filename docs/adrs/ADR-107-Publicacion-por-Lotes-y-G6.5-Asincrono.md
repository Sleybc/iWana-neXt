# ADR-107: Publicación por lotes — commit por ola, push por tren y G6.5 asíncrono

**Versión:** 1.0
**Estado:** Aprobado
**Aprobado por:** CTO, 2026-11-08 — §6 completo, sin cambios de contenido
**Fecha:** 2026-11-08
**Autor:** AI-EM-ARCH (sesión ejecutora, Claude Code)
**Módulos:** plataforma transversal — flujo de publicación en `main`, CI (`.github/workflows/ci.yml`), checkpoint de commits
**Relacionado:** [ADR-069](ADR-069-Gates-G6.5-Merge-Readiness.md) (taxonomía G6 / G6.5 / G7) · [PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0](../prompts/PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md) · skill `iwana-checkpoint-commit` · [plan de orquestación](../plans/2026-11-08-publicacion-por-lotes.md)

---

## 1. Contexto

Casi todos los prompts de ejecución terminan con «commit y push → CI verde → G6.5 → siguiente». Así, cada ola espera una corrida completa de CI antes de que arranque la siguiente, y lo que depende de ella queda bloqueado mientras tanto.

Medición del 2026-11-01 al 2026-11-08 (`git log`, `gh run list --branch main`, `ci.yml`):

| Hecho | Dato |
| --- | --- |
| Commits en `main` | 45, casi todos con su propio push |
| Commits que solo registran un G6.5 (`docs: record G6.5 closure…` y similares) | 8–10. Cada uno dispara otra corrida completa |
| Ruta crítica de una corrida | 20–24 min. El job `ci` tarda 19–23 min en serie sobre 2 cores, y su comentario en `ci.yml` aún dice 10–15. E2E R4.1 tarda 12–17 min |
| Filtro por tipo de cambio en CI | Ninguno: sin `paths`, sin `concurrency`, sin detección de cambios. Un commit que solo toca `docs/` corre los cinco jobs |
| Rojos el 2026-11-08 | 5 de 6 corridas. Las causas solo aparecen en CI: `PII_HASH_KEY` ausente en suites de integración y un *strict mode* de Playwright en `portal-billing-flow.spec.ts` |
| Árbol de trabajo | Unas 300 rutas sin commitear, mezcladas entre olas. Eso obliga al checkpoint caro: `stash --keep-index`, respaldo SHA-256 (regla 4-ter) y regla 7, que congela el árbol para las demás sesiones |

Causas:

1. **Commit, push y G6.5 van acoplados** por convención de los launchers, no por norma.
2. **G6.5 se verifica después del hecho.** ADR-069 lo definió como *merge readiness* en un modelo de ramas. Este repositorio trabaja siempre en `main`, sin ramas: el push **ya es** el merge. Esperar el CI no impide que el código entre; solo frena la ola siguiente. ADR-069 §Decisión ya admite el estado «G6 GO con G6.5 pendiente = calidad aceptada».
3. **El registro de G6.5 se commitea aparte** y provoca otra corrida, que a su vez habría que registrar.
4. **El árbol mezclado** hace caro y frágil cada checkpoint.

## 2. Decisión

### D1 — Commit local por ola

Cuando una ola alcanza **G6 GO**, se commitea de inmediato, solo con sus rutas y **sin push**. Así el árbol queda limpio para la ola siguiente y el checkpoint caro se vuelve excepción (D6).

### D2 — Push por tren

Los commits locales se publican en lote con un solo `git push`. GitHub verifica el lote con **una sola corrida** sobre el SHA de cabeza. Un tren sale en cualquiera de estos casos:

- al cerrar una fase;
- cuando una ola necesita su código en `origin`, porque su evidencia solo existe en CI o porque corrige un rojo de `main`;
- como máximo una vez por jornada de trabajo, para no acumular trabajo sin respaldo remoto.

Un tren lleva **como máximo 4 olas**, para que un rojo siga siendo atribuible. El push sigue exigiendo orden expresa del usuario o del CTO (skill `iwana-checkpoint-commit`, paso 7).

### D3 — G6.5 asíncrono

La ola siguiente puede arrancar con **G6**. G6.5 es obligatorio para **cerrar la fase** (informe de cierre) y sigue siendo requisito previo de G7. No es requisito para lanzar la ola siguiente.

Tres excepciones siguen siendo síncronas, es decir, la ola siguiente espera G6.5:

- olas que cambian CI, infraestructura o `docker-compose*`;
- olas con una migración que agrega NOT NULL, CHECK o FK (ya en el paso 7 de la skill de checkpoint);
- olas cuyo encargo es corregir un rojo de `main`.

### D4 — El registro de G6.5 no lleva commit propio

El veredicto (run id, jobs, duración y SHA) se escribe en el informe correspondiente y **viaja en el siguiente tren**. Quedan prohibidos los commits cuyo único contenido sea registrar un G6.5. ADR-069 §Rechazos sigue vigente: no se registra G6.5 de una corrida que aún no ocurrió.

### D5 — Un rojo congela el tren, no el trabajo

Con la última corrida de `main` en rojo no sale otro tren, salvo el que lleva la corrección. Las olas locales siguen avanzando y commiteando. La regla de no corregir ni revertir un rojo sin orden (prompt de checkpoint, F3.4) no cambia.

### D6 — Checkpoint ligero

Si `git status --porcelain` no muestra cambios fuera del índice, el árbol es exactamente el commit propuesto. En ese caso se omiten el respaldo (4-ter), el `stash --keep-index` y el `pop`, y el gate corre sobre el árbol. La regla 7 («nadie edita el árbol») solo aplica mientras haya un stash de verificación activo.

### D7 — CI distingue los cambios de solo documentación

Un commit que solo cambia documentación que ningún test lee corre únicamente el gate documental (`adr-citations`). Cualquier otra ruta, incluida la gobernanza ejecutable (`.agents/`, `.claude/`, `AGENTS.md`, `scripts/`), corre todos los jobs. La lista exacta de rutas de `docs/` que leen las pruebas la fija `plat-ops` al implementar. Algunos ejemplos medidos: `docs/specs/2026-10-26-mod13-interfaces-api.md`, `docs/specs/2026-07-26-estados-atenuados-contraste-ds-contrato.md` y las de `docs/plans/` que usa `scripts/claude-hooks.test.mjs`. Ante la duda, la ruta corre todo.

## 3. Alternativas consideradas

| Alternativa | Por qué no |
| --- | --- |
| Mantener push y G6.5 síncronos por prompt | Es la causa del bloqueo medido. No aporta protección, porque el push ya es el merge |
| Pasar a ramas y PR | Contradice la práctica vigente de trabajar siempre en `main`, y `guard-bash` niega ramas y worktrees. Sería un cambio de plataforma mayor que el problema |
| `cancel-in-progress: true` en `main` | Dejaría trenes sin verificar. El G6.5 de ADR-069 exige una corrida por SHA publicado |
| Caché remota de Turbo para acelerar CI | El gate de cobertura exige `0 cached` (`ci.yml`, paso «Verificar que el gate de cobertura se ejecutó de verdad»). Reabriría un falso verde ya cerrado |

## 4. Consecuencias

### Positivas

- Se pasa de 6–9 corridas al día con espera síncrona a 1–2 trenes al día.
- Desaparecen los commits que solo registran un G6.5 y las corridas que provocaban.
- El árbol se mantiene limpio, así que el checkpoint caro pasa a ser la excepción y la regla 7 casi nunca congela a otras sesiones.
- Un commit de solo documentación da señal en segundos y no en 22 min.

### Costos y tradeoffs

- Un rojo en un tren de varias olas cuesta más de atribuir. Se mitiga con el tope de 4 olas, la clasificación por job (`gh run view --log-failed`) y los commits separados por ola, que permiten un `git bisect` local.
- Una ola puede construirse sobre una predecesora cuyo G6.5 aún no se conoce. Si el tren sale rojo, la ola siguiente puede tener que ajustarse. Es el mismo riesgo que hoy, solo que se descubre algo más tarde.

### Riesgos aceptados

- Los commits locales sin push se pierden si falla el disco. El tren diario acota la pérdida a una jornada.

### Lo que no cambia

G6 local con conteos reales (`iwana-test-evidence`), la definición de G6.5 de ADR-069, G7, el trabajo en `main` sin ramas, la prohibición de `--no-verify` y `--force`, y la orden expresa para cada push.

## 5. Plan de adopción

| Ola | Contenido | Dueño |
| --- | --- | --- |
| 1 | Este ADR, el plan de orquestación y el launcher (archivos nuevos, sin mezcla con otras olas) | AI-EM-ARCH |
| 1b | Enmienda de la skill `iwana-checkpoint-commit` (D1, D2, D4 y D6), regla 8 del prompt de checkpoint y una línea de historial y de «Gates Before Merge» en `AGENTS.md`. Espera a que la consolidación de skills publique: los tres archivos tienen hoy cambios suyos sin commitear, y editarlos ahora mezclaría olas, que es justo lo que este ADR quiere evitar | AI-EM-ARCH |
| 2 | `ci.yml`: `concurrency` sin cancelación, job de detección de cambios (D7) y comentario de duración actualizado | `plat-ops` |
| 3 (opcional) | Separar el job `ci` en «lint, typecheck, build y unit» e «integración PostgreSQL» en paralelo. Solo si tras una semana la ruta crítica sigue por encima de 20 min | `plat-ops` |

Detalle en [`docs/plans/2026-11-08-publicacion-por-lotes.md`](../plans/2026-11-08-publicacion-por-lotes.md).

## 6. Decisión del CTO

Aprobado por el CTO el 2026-11-08, sin cambios de contenido:

1. D1–D6 tal como están.
2. Tope del tren: 4 olas y una salida por jornada como máximo.
3. D7 con el alcance descrito. La Ola 3 se decide tras la medición de una semana posterior a la Ola 2 (plan §5).

Vigencia: D1 a D5 rigen desde la aprobación. D6 se aplica en cuanto la Ola 1b enmiende la skill de checkpoint, y D7 cuando la Ola 2 publique `ci.yml`.
