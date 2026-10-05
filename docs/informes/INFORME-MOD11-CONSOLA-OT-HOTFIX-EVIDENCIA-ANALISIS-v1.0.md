# Informe MOD11 — Hotfix: análisis asíncrono de evidencia

- **Versión:** 1.0
- **Fecha:** 2026-10-05
- **Agente:** AI-FE-PLATFORM (`fe-platform`)
- **Resultado:** **GO**

## Alcance y reproducción

El test de `useExecutionOrderConsole` se añadió primero con un recibo de subida `PENDING_ANALYSIS`. Antes del cambio falló porque el hook no consultaba el estado del asset (cero llamadas al GET) y continuaba directamente a `registerEvidence`. La reproducción confirma el defecto descrito en el encargo.

El contrato compartido `packages/shared/src/contracts/operations/execution-orders.ts` v1.4 permanece intacto. El backend ya expone `GET /tasks/execution-orders/:id/evidence-assets/:mediaAssetId`; el hotfix incorpora únicamente su wrapper tipado en portal.

## Cambios

- `apps/portal/src/lib/api-client.ts`: añade `getEvidenceAsset`, tipado con `EvidenceAssetReceipt`, para la ruta GET existente.
- `apps/portal/src/components/operations/use-execution-order-console.ts`: después de subir consulta el estado hasta recibir `AVAILABLE`. Usa un intervalo de **500 ms** y un máximo de **6 consultas** (cinco intervalos, hasta 2,5 s de espera entre respuestas). Cada llamada del cliente tiene el timeout de 12 s ya establecido por `request()`, así que el tope teórico de la secuencia de consultas es aproximadamente **74,5 s** si todas agotan ese timeout.
- `REJECTED`, `EXPIRED` y el límite agotado impiden registrar la evidencia y publican un mensaje visible distinto para cada caso. El registro conserva el `expiresAt` del recibo de subida.
- `apps/portal/src/components/operations/ExecutionOrderDrawer.tsx` y `ExecutionOrdersClient.tsx`: muestran «Analizando archivo» con `role="status"` mientras se consulta el estado; el uploader conserva su ubicación y su flujo de selección.
- Los errores dejan el valor del input intacto. El drawer solo limpia el input al completar la carga; la prueba verifica que una respuesta fallida mantiene el mismo archivo seleccionado.

No se añadió selector de requisito ni endpoint, y no se cambió el contrato de API.

## Handoff a B0

Este hotfix precede al seam B0. Para consolidarlo, B0 comparte `use-execution-order-console.ts`, `ExecutionOrdersClient.tsx` y `ExecutionOrderDrawer.tsx` con este cambio; debe integrar el estado `isAnalyzingEvidence` y mantener el sondeo del asset antes del registro. Las pruebas afectadas viven junto a esos archivos.

## §4 — Evidencia de gates

| Gate | Resultado |
| --- | --- |
| `pnpm --filter @iwana/portal typecheck` | **PASS**, salida 0. |
| `node_modules/.bin/turbo.cmd run test --filter=@iwana/portal --force -- --runInBand --testPathPattern=src/components/operations` | **PASS**, 27 suites y **372 tests** aprobados; `Cached: 0 cached, 2 total` (`@iwana/shared:build` y `@iwana/portal:test`). |
| `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre `use-execution-order-console.ts`, `use-execution-order-console.spec.ts`, `ExecutionOrdersClient.tsx`, `ExecutionOrderDrawer.tsx`, `ExecutionOrderDrawer.spec.tsx`, `api-client.ts` y `api-client.spec.ts` | **PASS**, `audit-ui: sin hallazgos en las rutas analizadas.` |
| `pnpm --filter @iwana/portal lint` | **PASS**, salida 0; 45 warnings de lint en archivos no tocados, sin errores. |

La suite de operaciones imprimió warnings React `act(...)` existentes en `ExecutionOrdersToolbar.spec.tsx:89`; no falló ninguna prueba.

**Stop/go: GO.** El fallo se reprodujo antes de implementar, la espera es acotada, la evidencia solo se registra en estado `AVAILABLE`, los estados terminales se muestran y el archivo seleccionado se conserva si falla el proceso.
