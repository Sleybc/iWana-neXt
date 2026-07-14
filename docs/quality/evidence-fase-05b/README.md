# Evidencia — Remediación MOD12 Proveedores Fase 05-B

Salidas **reales** capturadas el 2026-07-11. No son afirmaciones: son la salida de los comandos.

| Archivo | Comando | Resultado |
| --- | --- | --- |
| `typecheck.txt` | `pnpm --filter @iwana/api typecheck` + `@iwana/portal typecheck` | PASS ambos |
| `lint.txt` | `pnpm --filter @iwana/api lint` + `@iwana/portal lint` | PASS (0 errores, 0 warnings) |
| `api-test.txt` | `pnpm --filter @iwana/api test` (Jest, suite completa) | 149 suites / 1477 tests PASS |
| `api-coverage-core.txt` | `jest --coverage` sobre archivos core tocados | subconjunto 81.85% (≥80%); `party-write.adapter` 100%; `supplier-profile.service` 84.7% líneas |
| `e2e-portal-inventory-scm-summary.txt` | `pnpm test:e2e:portal -- portal-inventory-scm.spec.ts` | **22/22 PASS** (~57 s); incluye RF-PROV-08 BLOCKED en RFQ y OC |
| `e2e-portal-inventory-scm.txt` | mismo comando (log completo) | PASS; ruido ECONNREFUSED :3000 esperado (mocks `page.route`) |
| `e2e-portal-inventory-scm-rf-prov-08.txt` | grep focalizado RF-PROV-08 + alta/bloqueo | **3/3 PASS** |

## Verificado en sesión QA (AI-SR-QA, 2026-07-11)

- **E2E Playwright** (`e2e/tests/portal-inventory-scm.spec.ts`): **ejecutado y verde**.
  - Añadido caso UI `rechaza emitir OC a un proveedor BLOCKED (RF-PROV-08)` (el mock ya existía; faltaba el test de punta a punta).
  - Corregida aserción ambigua de badge `Bloqueado` (strict mode: drawer + lista).
- **`pnpm test` monorepo completo** y builds/migraciones: solo se verificó el paquete `@iwana/api` (el afectado en backend) + typecheck/lint de portal + E2E SCM. El resto queda para CI de monorepo.

## Alcance de la cobertura

La cobertura reportada corresponde a los archivos **modificados** en la remediación, ejercitados por `supplier-profile.*`, `party-write.adapter` e `inventory-parties-boundary.arch`. `party-read.adapter` y las ramas de `list`/`search` de `supplier-party.port` tienen cobertura adicional en la suite completa (`party-read.adapter.spec.ts`, otros specs de inventory) no reflejada en este subconjunto acotado.
