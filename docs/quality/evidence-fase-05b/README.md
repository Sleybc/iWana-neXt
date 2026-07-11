# Evidencia — Remediación MOD12 Proveedores Fase 05-B

Salidas **reales** capturadas el 2026-07-11 durante la remediación (AI-SR-FULL). No son afirmaciones: son la salida de los comandos.

| Archivo | Comando | Resultado |
| --- | --- | --- |
| `typecheck.txt` | `pnpm --filter @iwana/api typecheck` + `@iwana/portal typecheck` | PASS ambos |
| `lint.txt` | `pnpm --filter @iwana/api lint` + `@iwana/portal lint` | PASS (0 errores, 0 warnings) |
| `api-test.txt` | `pnpm --filter @iwana/api test` (Jest, suite completa) | 149 suites / 1477 tests PASS |
| `api-coverage-core.txt` | `jest --coverage` sobre archivos core tocados | subconjunto 81.85% (≥80%); `party-write.adapter` 100%; `supplier-profile.service` 84.7% líneas |

## No verificado en esta sesión (declarado, no afirmado verde)

- **E2E Playwright** (`e2e/tests/portal-inventory-scm.spec.ts`): el código de las pruebas fue añadido/extendido (incluye proveedor BLOCKED rechazado en RFQ/OC), pero **no se ejecutó** por falta de navegador/dev-server en el entorno. Debe correrse en CI (`pnpm test:e2e:portal`).
- **`pnpm test` monorepo completo** y builds/migraciones: solo se verificó el paquete `@iwana/api` (el afectado en backend) + typecheck/lint de portal. El resto queda para CI.

## Alcance de la cobertura

La cobertura reportada corresponde a los archivos **modificados** en la remediación, ejercitados por `supplier-profile.*`, `party-write.adapter` e `inventory-parties-boundary.arch`. `party-read.adapter` y las ramas de `list`/`search` de `supplier-party.port` tienen cobertura adicional en la suite completa (`party-read.adapter.spec.ts`, otros specs de inventory) no reflejada en este subconjunto acotado.
