# LAUNCH — MOD11 · Registro compacto · Ola 2b (R-LOT → Q1)

**Plan:** `docs/plans/2026-10-11-mod11-consola-registro-material.md` · **Encargo:** `PROMPT-MOD11-CONSOLA-REGISTRO-MATERIAL-IMPL-v1.0.md`, adenda 3
**Origen:** Q1 v1.2 en NO GO. El consumo de OT no tiene en cuenta los lotes y todo termina en `CUSTODY_INSUFFICIENT`. **Spec de consumo v1.2, D13:** asignación FEFO→FIFO en MOD12, sin cambio de contrato.

| # | Subagente | Encargo (adenda 3) | Skills a leer antes de escribir |
| --- | --- | --- | --- |
| 1 | `sr-backend` | §R-LOT: disponible agregado, asignación por lote, líneas con lote y reverso | `nestjs-expert`, `postgresql`, `testing-patterns`, `iwana-matriz-motivos` |
| 2 | `sr-qa` | §Q1 v1.3, después de R-LOT: reanudar los pasos 1 a 5 y guardar las capturas como archivos | `playwright-skill`, `wcag-audit-patterns`, `verification-before-completion` |

**Paralelo:** no. Q1 necesita el build con R-LOT.
**Siguiente:** con Q1 en GO, AI-EM-ARCH cierra G6 y propone el commit.

---

### Bloque copiar-pegar — `sr-backend` (R-LOT)

> Actúa como `sr-backend`. Lee `AGENTS.md`, la **D13** de la spec `docs/specs/2026-10-06-mod11-mod12-consumo-inventario-ot-design.md` v1.2, la adenda 3 (§R-LOT) del encargo y el informe Q1 v1.2. Lee los `SKILL.md` de la tabla.
> En MOD12: el disponible del consumo de OT suma todos los lotes del ítem en la custodia, sin cambiar la semántica estricta de `getAvailabilityWithManager` para sus otros llamadores. La asignación va por FEFO y luego FIFO, con el saldo sin lote al final. Cada lote genera una línea negativa y una positiva de destino con el mismo lote. Los serializados usan el lote del activo o, si no tiene, se les asigna uno. Mantén el lock y la transacción, y verifica el reverso de un movimiento repartido.
> Tests integrados contra Postgres y Redis reales: reparto en 2 lotes, `CUSTODY_INSUFFICIENT` por suma insuficiente, serializado sin lote y reverso repartido. Gates: typecheck global y jest de `inventory` con `--no-cache`, con conteo real.
> Entrega `INFORME-MOD11-MOD12-INVENTARIO-R-LOT-v1.0.md`. Sin commit.

### Bloque copiar-pegar — `sr-qa` (Q1 v1.3, con R-LOT en GO)

> Actúa como `sr-qa`. Lee tu informe Q1 v1.2 y la adenda 3 (§Q1) del encargo. Reinicia el api y el worker con el build que incluye R-LOT y recarga la consola. Repite los pasos 1 a 5 de la adenda 2 solo en `tenant_iwana`: el XC220 y los consumibles deben llegar a `CONFIRMED`, con los saldos por lote correctos. Guarda las capturas autenticadas como archivos en `docs/informes/assets/`. Entrega Q1 v1.3. Sin commit.
