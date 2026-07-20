# Checklist — MOD12 Existencias — Gates G6 / G7 (evidencia de tests)

**Version:** 1.0  
**Fecha:** 2026-07-20  
**Estado:** Vigente — norma de cierre post-auditoría PRD (H3)  
**Emisor:** AI-EM-ARCH  
**Origen:** `INFORME-MOD12-INVENTARIO-EXISTENCIAS-AUDITORIA-EJECUCION-v1.0.md` §3 H3

---

## 1. Regla

Los informes G6 y G7 **no pueden declarar «suites en verde»** citando solo subconjuntos tocados por la fase (p. ej. «Jest costing + ledger 31/31», «12/12 remediaciones portal»). La evidencia mínima obligatoria es la **suite completa del módulo** en API y portal.

Corridas parciales siguen siendo útiles como evidencia **complementaria** de la fase, no como sustituto del gate.

---

## 2. Comandos obligatorios (stop/go)

Ejecutar desde la raíz del monorepo **antes** de firmar G6 o G7:

| Superficie | Comando | Criterio |
| --- | --- | --- |
| API inventario | `cd apps/api && npx jest src/modules/inventory --passWithNoTests` | **0 failed** |
| Portal inventario | `cd apps/portal && npx jest src/components/inventory --passWithNoTests` | **0 failed** |
| Lint / typecheck | `pnpm lint` · `pnpm typecheck` | Sin errores (según gate del repo) |
| Entity / migración tenant | Tras cambiar entidades en `@iwana/db`: `pnpm --filter @iwana/db build` antes de `pnpm typecheck` o arranque API | Typecheck API/worker limpio (G5-O1) |
| Cobertura core (RNF-06) | `cd apps/api && npx jest src/modules/inventory --coverage --collectCoverageFrom='src/modules/inventory/**/*.ts' --collectCoverageFrom='!**/*.spec.ts' --coverageReporters=text-summary` | **≥ 80%** statements/lines en el módulo |

Registrar en el informe: fecha, commit/HEAD, conteo `Tests: X passed, Y failed` y, si aplica, specs nuevos o remediados de la fase.

---

## 3. Checklist G6 (review experiencia / DS / QA)

- [ ] Suite API inventario completa en verde (§2)
- [ ] Suite portal inventario completa en verde (§2)
- [ ] Evidencia CA / Playwright de la fase (complementaria)
- [ ] Sin P0/P1 UX/DS/a11y abiertos
- [ ] Deuda P2/P3 declarada explícitamente

---

## 4. Checklist G7 (cierre EM-ARCH / CTO)

- [ ] Re-verificación independiente (aprobador ≠ productor)
- [ ] Suite API inventario completa re-ejecutada por el auditor (§2)
- [ ] Suite portal inventario completa re-ejecutada por el auditor (§2)
- [ ] Lint + typecheck limpios
- [ ] Rebuild `@iwana/db` documentado/ejecutado si la fase tocó entidades (G5-O1)
- [ ] Cobertura inventario API ≥ 80% re-ejecutada (RNF-06)
- [ ] Trazabilidad ADR/spec/PRD §7 de la fase
- [ ] Deuda residual no bloqueante documentada

---

## 5. Anti-patrones (prohibidos como única evidencia)

- «Jest `<specs-de-la-fase>` N/N PASS» sin suite del módulo
- «Portal remediaciones F4 12/12» sin `src/components/inventory` completo
- Declarar DoD CA-07 / PRD «suites inventario en verde» con subconjuntos

---

## 6. Referencias

- PRD DoD: `docs/prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md` (CA-07, §7)
- Informe auditoría: `docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-AUDITORIA-EJECUCION-v1.0.md`
- Informe vivo: `docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-DEFINICION-v1.0.md`
