# Plan de orquestación — MOD12 Salidas: picking con existencias reales y seriales (Fase S1)

**Fecha:** 2026-09-05
**Autor:** AI-EM-ARCH (modo Orchestrator)
**Superficie:** `/dashboard/inventory?tab=issues` → Crear salida
**Spec:** [Fase S1 v1.0](../specs/2026-09-05-mod12-salidas-picking-existencias-seriales-design.md)
**Prompts:** [BE v1.0](../prompts/PROMPT-MOD12-SALIDAS-PICKING-BE-v1.0.md) · [FE v1.0](../prompts/PROMPT-MOD12-SALIDAS-PICKING-FE-v1.0.md)
**Estado:** Listo para ejecución — G1 pendiente de review cruzado

---

## 1. Qué se corrige

Tres defectos de la misma pantalla, con una sola causa arquitectónica de fondo: **el picking de salidas se resuelve en el cliente sobre datos truncados**.

1. "Con material" muestra `(0)` con existencias reales en bodega.
2. El catálogo no da cantidad, categoría ni unidad, y exige escribir 2 caracteres.
3. Un equipo serializado puede salir **sin serial** — defecto de integridad, no de UX.

Diagnóstico completo con evidencia de código en el [spec §2](../specs/2026-09-05-mod12-salidas-picking-existencias-seriales-design.md).

## 2. Decisiones tomadas (CTO, 2026-09-05)

| # | Decisión |
|---|---|
| D1 | "Con material" precarga **solo** lo que tiene existencias, paginado desde el servidor. |
| D2 | La exigencia de serial es **bloqueante en backend y UI**. |
| D3 | `REFURBISHED` y `DAMAGED` son despachables, con la condición visible por línea. |

## 3. Secuencia

| Fase | Responsable | Entregable | Depende de |
|---|---|---|---|
| **0** | AI-EM-ARCH | Spec + prompts + este plan; contrato `stock-issue-picking.ts` especificado | — |
| **0b** | AI-SR-FULL | **Publicar** `packages/shared/src/contracts/inventory/stock-issue-picking.ts` y commitear | Fase 0 |
| **1a** | AI-SR-FULL | B1 endpoint `pickable-items` · B2 status múltiple en `/inventory/assets` · B3 integridad de serial | Fase 0b |
| **1b** | AI-FE-PLATFORM | F1 carga sustituida · F2 lote/serial/condición · F3 limpieza — contra mocks derivados del contrato | Fase 0b (**paralelo a 1a**) |
| **2** | AI-SR-QA | Specs BE + FE y evidencia con conteo real | 1a y 1b |
| **3** | AI-EM-ARCH | Consolidación, informe de fase, G6.5 | 2 |

**Regla de re-sync:** un cambio del contrato de la fase 0b es el **único** evento que fuerza re-sync de ambos tracks. Se versiona y se notifica vía AI-EM-ARCH; nunca se parchea en silencio (protocolo §3bis regla 1).

**Colisión de archivos:** los dos tracks no comparten archivos salvo `packages/shared/src/contracts/inventory/`. `InventoryClient.tsx` — punto de colisión conocido del módulo — queda fuera de alcance salvo la retirada de props muertos.

## 4. Gates

| Gate | Contenido | Aprobador |
|---|---|---|
| **G1** | Spec de la fase. AI-EM-ARCH es el productor, así que **no se autofirma**: exige review cruzado de AI-SR-FULL (factibilidad backend) y AI-PROD-UX (viabilidad UX del nuevo flujo de picking). | SR-FULL + PROD-UX |
| **G6** | Suites verdes con **conteo real** de casos ejecutados por suite. Un verde cacheado de `turbo` o un `--passWithNoTests` no es evidencia. | AI-SR-QA |
| **G6.5** | Corrida Linux de CI **por SHA** + artefacto resumen sanitizado, antes del merge ([ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md)). | AI-EM-ARCH |

## 5. Verificación end-to-end

1. `pnpm --filter @iwana/api test -- inventory` y `pnpm --filter @iwana/portal test -- inventory` — registrar conteo de casos.
2. `pnpm lint` y `pnpm typecheck` en `api`, `portal` y `shared`.
3. Navegador sobre `/dashboard/inventory?tab=issues` → Crear salida:
   - Elegir la bodega principal → **"Con material" muestra ítems con cantidad sin escribir nada**.
   - Buscar `ro` → el resultado trae categoría, unidad y disponible reales.
   - Agregar `CFO-SER-ROGPN-TPL-XC220` (Router Onu Gpon, serializado) → la columna Lote/serial ofrece **selector de serial**, y "Crear salida" se bloquea mientras no se elija uno.
   - Agregar un consumible con dos lotes → el selector muestra `lotNumber` legible y el disponible de la línea cambia al elegir lote o condición.
4. `POST /api/v1/inventory/issues` con línea serializada **sin** `serializedAssetId` → 400 en español. Prueba de que el cierre no es solo de UI.
5. `pnpm audit:adr-citations` en `BLOQUEANTE: 0`.

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| B3 rompe specs/seeds que crean salidas serializadas sin serial | Inventariarlos y corregirlos **en la misma fase**. Relajar la validación para que un test pase es motivo de stop. |
| El agregado por ítem × condición × lote no rinde con los índices actuales | Verificar plan de ejecución antes de G6; si exige índice o migración, es `[BLOQUEO]` — esta fase no toca esquema. |
| Colisión con otros tracks abiertos de MOD12 sobre `InventoryClient.tsx` | Alcance FE limitado al composer y sus tablas; `InventoryClient` solo pierde props muertos. |

## 7. Deuda declarada al cierre

| Severidad | Ítem |
|---|---|
| Baja | Se pierde el boost por frecuencia de uso al mover el orden al servidor. |
| Baja | `GET /inventory/balances` sigue sin `available` calculado; salidas deja de depender de él. |
| Media | Recepciones y traslados siguen capturando lote y serial como texto libre — asimetría abierta para una fase posterior. |

## 8. Trabajo relacionado, fuera de esta fase

- [Plan de dedup de inventario](2026-09-01-inventario-dedup-refactors.md) — la eliminación de `StockIssueFormDrawer.tsx` (F3) le pertenece conceptualmente; se ejecuta aquí por proximidad, sin ampliar su alcance.
- [Secuencia de ejecución MOD12](2026-09-02-mod12-secuencia-ejecucion-catalogo-y-navegacion.md) — cerrada el 2026-09-03; esta fase no depende de ella.
