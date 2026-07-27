# INFORME — Disposición gate Ola 1: R-10 lint monorepo + menores R-8/9/11/12

**Versión:** 1.0
**Fecha:** 2026-07-25
**Modo:** Orchestrator + EM
**Autor:** AI-EM-ARCH
**Antecedente:** [INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.2](INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.2.md) · [REGATE-v1.3](INFORME-ADR065-OLA1-REGATE-v1.3.md)
**Clasificación:** Uso interno

---

## Veredicto

| Ítem | Estado |
| --- | --- |
| **R-10** lint monorepo | **Cerrada** — FE-PLATFORM; `pnpm lint` raíz exit 0 |
| **R-8** nota umbral 088 | **Cerrada** — SR-FULL |
| **R-9** vector cripto literal | **Cerrada** — SR-FULL (specs api + db) |
| **R-11** spec bajo `packages/database` | **Cerrada** — SR-FULL |
| **R-12** mensaje guardián R-7 | **Cerrada** — SR-FULL |
| **R-13** typecheck worker ↔ `*.spec.ts` db | **Cerrada** — exclude en `apps/worker/tsconfig.typecheck.json`; `pnpm typecheck` raíz exit 0 |

**Merge GO.** Stop/go raíz: lint ✓ · typecheck ✓ · `exhaustive-deps` = 0.

---

## Decisiones

### R-10
Borrar las tres directivas. **No** instalar `eslint-plugin-react-hooks`.

### R-9 (reformulado)
El vector es **dato**, no import: ciphertext literal (generado una vez con la utilidad de `apps/api`) embebido en specs de API y de `packages/database`; cada lado descifra al mismo plaintext. Cero acoplamiento de paquetes.

### R-8
Nota en `088_*`: umbral ~50.000 filas → considerar `transactional = false` + commit por lote (ADR-066). Mantener `true` hoy.

### R-11
Mover el spec del backfill a `packages/database`; import vía paquete/`@iwana/db` o path relativo corto del package — no siete `../` desde `apps/api`.

### R-12
Mensaje del guardián `processed > 0 && updated === 0` debe nombrar **dos** causas: (1) clave de cifrado incorrecta; (2) ciphertext(s) corrupto(s) / no descifrable(s). Mantener el throw (fallo ruidoso).

### Stop/go permanente (olas restantes)
Cierre de fase exige **`pnpm lint` y `pnpm typecheck` en la raíz** del monorepo (no solo el paquete tocado), además de la suite del paquete y la línea de resumen Jest. Turborepo cachea; segundos.

---

## Disposición / RACI

| # | Acción | R | Momento |
| --- | --- | --- | --- |
| 1 | R-10 borrar 3 directivas | AI-FE-PLATFORM | **Bloqueante** |
| 2 | R-8 + R-11 + R-12 | AI-SR-FULL | Mismo ciclo |
| 3 | R-9 vector literal cruzado | AI-SR-FULL (+ QA verifica) | Mismo ciclo |
| 4 | `pnpm lint` + `pnpm typecheck` raíz verdes | AI-SR-QA / ejecutor | Stop/go |

**Sin escalación al CTO.**
