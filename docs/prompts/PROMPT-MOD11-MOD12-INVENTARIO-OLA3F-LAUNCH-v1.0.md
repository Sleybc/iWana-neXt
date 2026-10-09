# LAUNCH — MOD11 ↔ MOD12 · Inventario de OT · Ola 3f (R-D11c → S2 v1.3)

**Plan:** `docs/plans/2026-10-06-mod11-mod12-consumo-inventario-ot.md` v1.1 §5 · **Encargo:** `PROMPT-MOD11-MOD12-INVENTARIO-IMPL-v1.0.md` §Ola 3f
**Estado:** I4 v1.2 en **GO**: CA-01 a CA-11 cerrados y el caso histórico convergió. R-D11b en GO. Queda una `[CONSULTA]` sobre el tope: con 24 horas de gracia y ciclo horario, el máximo real llega a casi 25 horas.
**Decisión:** gracia = 24 h − intervalo de limpieza, con las constantes compartidas en `@iwana/shared`.
**Ya pasó, no se repite:** todo I4 y los tres bloqueos de I1 en S2.

| # | Subagente | Encargo | Skills a leer |
| --- | --- | --- | --- |
| 1 | `sr-backend` | §R-D11c: gracia derivada de las constantes compartidas | `bullmq-specialist`, `testing-patterns` |
| 2 | `sec-eng` | §S2 v1.3: re-auditoría de D11-RET-01 y D11-RET-02 frente a la D11 enmendada | `security-auditor`, `backend-security-coder` |

**Secuencia:** **primero el 1, después el 2.** S2 audita el código que R-D11c deja.
**Cierre:** S2 v1.3 en GO. AI-EM-ARCH consolida entonces G6 del inventario y propone el commit del bloque completo.

---

### Bloque copiar-pegar — `sr-backend` (R-D11c)

> Actúa como `sr-backend`. Lee `docs/prompts/PROMPT-MOD11-MOD12-INVENTARIO-IMPL-v1.0.md` §Ola 3f y tu informe R-D11B. Lee los `SKILL.md` de `bullmq-specialist` y `testing-patterns`.
> Mueve `INVENTORY_SOURCE_MAX_AGE_MS` (24 h) e `INVENTORY_SOURCE_CLEANUP_INTERVAL_MS` (1 h) a `packages/shared/src/constants/` y haz que API y worker las importen. La gracia de `clean()` pasa a ser `MAX_AGE - INTERVAL`, es decir, 23 horas.
> Test: la gracia es 23 horas y un fallido de 23 h 30 min se borra en el siguiente ciclo. Jest de `inventory` y del worker con `Cached: 0`. Entrega R-D11C. Sin commit.

### Bloque copiar-pegar — `sec-eng` (S2 v1.3, después de R-D11c)

> Actúa como `sec-eng`. Lee tu S2 v1.2, la D11 enmendada de la spec (24 horas mientras API o worker estén activos, limpieza independiente del contenido) y los informes R-D11B y R-D11C. Lee los `SKILL.md` de `security-auditor` y `backend-security-coder`.
> Re-audita, sin ejecutar nada, D11-RET-01 y D11-RET-02 contra el código actual: limpieza en las dos colas desde ambos procesos, sin filtro de contenido, y gracia derivada que garantiza el máximo de 24 horas.
> Dictamen GO o NO GO por bloqueo, con referencia al código. Entrega S2 v1.3. Sin commit.
