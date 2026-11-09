# INFORME — Transversal · Tiempos de entrega: CI, commit, push y ceremonia documental

**Versión:** 1.0
**Estado:** Cerrado. Las decisiones están en [ADR-107](../adrs/ADR-107-Publicacion-por-Lotes-y-G6.5-Asincrono.md) v1.1 (D8)
**Fecha:** 2026-11-09
**Emitido por:** AI-EM-ARCH (sesión ejecutora, Claude Code)
**Origen:** el usuario pide investigar qué sigue frenando la terminación del proyecto y cuándo hacen falta commit y push.
**Relacionado:** [plan ADR-107](../plans/2026-11-08-publicacion-por-lotes.md) · [spec Ola 3](../specs/2026-11-09-plat-ops-ci-jobs-paralelos.md) · [spec de integración API](../specs/2026-11-09-plat-ops-ci-integracion-api-tiempo.md)

---

## 1. Resumen

| Freno | Peso | Respuesta |
| --- | --- | --- |
| Ceremonia documental | **El mayor.** Desde el 2026-10-30, el 44 % de los commits son `docs` y hay más líneas nuevas en `docs/` que en código | Topes de ADR-107 D8 (§5) |
| Ruta crítica del CI | 20–27 min por tren con código. Un solo job hace en serie las pruebas unitarias (12:26) y las de integración (8:10) | Ola 3: jobs paralelos, ~26 → ~15 min ([spec](../specs/2026-11-09-plat-ops-ci-jobs-paralelos.md)) |
| Commits y pushes de registro | 4 de 18 commits del 2026-11-09 solo registran un G6.5 | D4 obligatorio en la skill de checkpoint y en la plantilla de launcher |
| Espera manual del CI | El usuario avisa «CI terminó, revisa» | La sesión que hace push vigila la corrida en segundo plano e informa sola (skill, paso 7) |

## 2. Qué cambió desde ADR-107 (2026-11-08)

| Medida | Antes | Después (2026-11-09) |
| --- | --- | --- |
| Corridas de CI de solo documentación | ~22 min cada una | **~1 min** (8 de 13 corridas) |
| Rojos en `main` | 5 de 6 el 2026-11-08 | 0 de 11 completadas desde `7926ba9b`. La 12.ª (`d09397ee`, de otra sesión) falla en las pruebas unitarias mientras se emite este informe |
| Launchers que terminan en «push → G6.5» por ola | Casi todos | Los nuevos dicen «sin push, G6.5 llega con el tren» |
| Commits que solo registran un G6.5 | 8–10 de 45 | **4 de 18**: `18c557ff`, `b9553bbc`, `54bf4b62`, `9223df3e`. D4 no se cumplía porque la skill no lo decía |

## 3. Dónde se van los minutos del CI

Job «Lint + Typecheck + Build + Unit tests» de la corrida 42678231774 (`965bf5e5`), 26:06 en total:

| Paso | Duración |
| --- | --- |
| Setup, install, tooling y sync | ~1:00 |
| Lint / typecheck / build | 0:45 / 0:50 / 1:16 |
| **Unit tests + cobertura, en serie (`--concurrency=1`)** | **12:26**: `@iwana/api` 5:35 (489 suites), `@iwana/portal` 5:02 (347), y el resto 1:50 entre `web`, `worker`, `db`, `shared` y `ui` |
| Migraciones e integración 089 | ~1:10 |
| **Integración API (PostgreSQL real)** | **8:10**. `d09397ee` la reparte en 4 workers, pero aún no está medido en CI |
| Integración worker y SEC-04 | ~0:15 |

Los demás jobs ya corren en paralelo: E2E R4.1 14:30, E2E portal 8–10 min e imágenes 4 min.

La serialización de las pruebas unitarias fue una decisión correcta para **un** runner de 2 cores (R-14 en `ci.yml`). Con jobs separados, cada paquete tiene su propio runner. El repo es público, así que los runners estándar en paralelo no consumen minutos facturables.

## 4. Política de commit y push

| Acción | Sí, cuando… | No, cuando… |
| --- | --- | --- |
| **Commit local** | La ola llega a G6 GO (D1). Otra sesión o agente va a tocar los mismos archivos. Antes de una operación local arriesgada: regenerar el lockfile, revertir una migración o correr scripts que reescriben archivos | Solo para registrar un G6.5 (D4). Por cada sección de un documento: **un commit por ola**. Sin G6, porque el trabajo en curso se queda en el árbol |
| **Push (tren)** | (1) Otra sesión, otra máquina o el CI necesita el código: evidencia que solo existe en CI (E2E R4.1, integración con Postgres de CI) o la corrección de un rojo. (2) Cierre de fase, porque G6.5 es obligatorio para cerrarla. (3) Hay una jornada de commits locales sin respaldo remoto. (4) Cambios de CI o infraestructura, y migraciones con NOT NULL, CHECK o FK, que son síncronos (D3) | Por ola, solo para ver el verde. Para un commit de documentación suelto: espera al siguiente tren. Con `main` en rojo, salvo la corrección (D5). Con una corrida en curso y otra en espera |
| **Esperar G6.5** | Antes de cerrar la fase, en olas de CI o infraestructura y en correcciones de un rojo | Para lanzar la ola siguiente |

Regla práctica:
- El **commit** protege el trabajo y mantiene limpio el árbol de las demás sesiones. Es barato, y por eso se hace siempre al llegar a G6.
- El **push** comparte el trabajo y dispara la verificación en Linux. Se hace cuando alguien o algo lo necesita, no por costumbre.

## 5. Ceremonia documental

Datos del 2026-10-30 al 2026-11-09:
- 73 commits: 32 `docs`, 15 `fix`, 12 `feat`, 6 `test`, 5 `ci`, 2 `chore` y 1 `refactor`.
- Líneas insertadas: **96.761 en `docs/`** frente a **74.729 en `apps/`, `packages/` y `e2e/`**.
- Solo el 2026-11-09, la auditoría de cruces de roles generó 9 commits de documentación, con un launcher de cierre propio para cada ola.

Cada ola documental arrastra informe, plan, launcher, revisión de `docs-governance`, commit y registro de G6.5. Ese costo es tiempo de sesión y de lectura del usuario, no de CI.

Topes aprobados por el usuario el 2026-11-09 (ADR-107 D8):
1. **Un informe por fase**, no por ola. Cada ola actualiza su sección.
2. **Launcher solo para olas multiagente o de otra sesión.** Una ola de una sola sesión se ejecuta desde el plan.
3. **Revisión `docs-governance` una vez por fase**, al cierre.
4. **El registro de G6.5 va en el siguiente commit funcional**, nunca en un commit ni en un launcher de cierre propio.

## 6. Cambios aplicados con este informe

| Archivo | Cambio |
| --- | --- |
| `docs/adrs/ADR-107-…` | v1.1: D8, topes de ceremonia |
| `.agents/skills/iwana-checkpoint-commit/SKILL.md` | Ola 1b: checkpoint ligero exportando el índice, push solo por tren o por SHA concreto, vigilancia de la corrida en segundo plano y G6.5 sin commit propio |
| `AGENTS.md` | Historial; D8 en «Documentation Rules»; ADR-107 en «Gates Before Merge» |
| `docs/prompts/TEMPLATE-PROMPT-LANZAMIENTO.md` | v1.2: reglas 6 y 7 (cuándo hay launcher y cómo se cierra una ola) |
| `docs/plans/2026-11-08-publicacion-por-lotes.md` | v1.1: Ola 1b hecha y Ola 3 definida |
| `docs/specs/2026-11-09-plat-ops-ci-jobs-paralelos.md` y su launcher | Ola 3, para `plat-ops` |

El prompt de checkpoint del 2026-10-31 (`PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md`) **no se toca**. Tiene una sección §F3 ajena sin commitear desde el 2026-10-31 y es un encargo histórico. La norma operativa vive en la skill.

## 7. Pendientes

| # | Pendiente | Responsable |
| --- | --- | --- |
| P1 | Clasificar el rojo de las pruebas unitarias en la corrida 42704957642 (`d09397ee`) y cerrar §10.3 de la spec de integración | Sesión de `plat-ops` dueña de `d09397ee` |
| P2 | Ejecutar la Ola 3 (jobs paralelos) cuando P1 esté cerrado y `main` en verde | `plat-ops` |
| P3 | Medición a una semana: corridas por día, commits de solo registro (meta 0), proporción de commits `docs` y ruta crítica | AI-EM-ARCH |
| P4 | Arreglo de la prueba inestable `AssuranceClient.spec.tsx`, sin commitear en otra sesión | Dueño de esa sesión |
