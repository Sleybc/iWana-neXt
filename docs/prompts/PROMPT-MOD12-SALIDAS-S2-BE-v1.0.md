# PROMPT DE EJECUCIÓN — MOD12 Salidas · Seriales múltiples por línea (Track B) — Fase S2

**Versión:** 1.0
**Fecha:** 2026-09-05
**Módulo:** MOD12 Inventario / SCM — Existencias
**Fase:** S2 (track B)
**Generado por:** AI-EM-ARCH (modo Orchestrator)
**Agente destinatario:** **AI-SR-FULL** · **Revisión de datos obligatoria:** **AI-DATA-ENG** (migración)
**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` *(en revisión)*

---

## 0. Contratos congelados

| Contrato | Ruta y versión | Estado |
|---|---|---|
| **Contrato de API tipado** | `packages/shared/src/contracts/inventory/stock-issue-picking.ts` (S1) **+ la extensión `serializedAssetIds[]`** definida en [SPEC S2 §5](../specs/2026-09-05-mod12-salidas-captura-linea-seriales-multiples-design.md) | **SE VERSIONA EN ESTA FASE** — lo publica este track en su primer commit; a partir de ahí queda congelado |
| Contrato de componente | No aplica a este track | — |

**Regla de paralelismo:** AI-FE-PLATFORM trabaja en simultáneo contra ese contrato. Publicarlo es el primer commit del track, no el último. Cualquier desviación posterior es evento de re-sync: `[BLOQUEO]` a AI-EM-ARCH antes de aplicarla.

## 1. Objetivo exacto de la fase

- **Resultado esperado:** una línea de salida puede llevar **N seriales** con cantidad N, validados uno a uno, y el despacho los consume correctamente.
- **Lo que sí entra:** extensión del DTO, tabla hija `stock_issue_line_serials` con migración tenant, reglas de validación y reserva por grupo, despacho, y lectura del detalle con el arreglo de seriales.
- **Lo que no entra:** frontend, el maestro de artículos (Track A), y el retiro de `StockIssueLine.serializedAssetId` (queda como campo de transición).

## 2. Artefactos de entrada obligatorios

- **Spec de la fase:** [SPEC S2 v1.0](../specs/2026-09-05-mod12-salidas-captura-linea-seriales-multiples-design.md) — §5 es normativo para este track.
- **Spec antecesor:** [SPEC S1 v1.0](../specs/2026-09-05-mod12-salidas-picking-existencias-seriales-design.md) — las validaciones de serial que este track extiende ya viven ahí (B3).
- **PRD:** [PRD-MOD12-INVENTARIO-EXISTENCIAS v1.0](../prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md) *(Aprobado)* — §Reservas y ciclo de salida.
- **ADR:** [ADR-048](../adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md) *(Aprobado)*.
- **Estado actual:** `apps/api/src/modules/inventory/services/stock-issue.service.ts`, `dto/index.ts:1280+`, `packages/database/src/entities/stock-issue-line.entity.ts`.

## 3. Instrucciones

### B1 · Contrato (primer commit, habilita el track FE)

`StockIssueLineSchema` (`dto/index.ts:1280+`) acepta `serializedAssetIds: string[]` de uuids. `serializedAssetId` singular **se sigue aceptando** y se normaliza a un arreglo de un elemento en el borde del schema: ningún cliente existente se rompe, y el flujo de despacho probado en S1 sigue vigente. Publicar el tipo en `packages/shared` y commitear antes de continuar.

### B2 · Persistencia — revisar con AI-DATA-ENG **antes** de escribir la migración

Tabla hija `stock_issue_line_serials`: `id` (uuid pk), `tenant_id` (uuid), `line_id` (uuid → `stock_issue_lines`), `issue_id` (uuid → `stock_issues`), `issue_status` (espejo del estado de la cabecera, sincronizado en despacho y cancelación dentro de la misma transacción), `serialized_asset_id` (uuid), `created_at`. Índice por `line_id`; índice único parcial por (`tenant_id`, `serialized_asset_id`) con predicado `WHERE issue_status NOT IN ('DISPATCHED', 'RECEIVED', 'CANCELLED')` — el predicado vive en la columna espejo de la propia tabla porque PostgreSQL no admite predicados que referencien otras tablas (ajuste G1 de AI-SR-FULL). Hoy solo hay 2 puntos de transición a estado terminal (`stock-issue.service.ts` ~`:835` DISPATCHED y `:1070` CANCELLED), ambos en el mismo módulo y transacción.

Migración **tenant 126** — la última existente es `125_add_supplier_quote_shipping_arrangement`. Debe traer `down()` y respetar el orden que verifica `migration-order.spec.ts`. La forma definitiva la aprueba AI-DATA-ENG antes de escribirse (§0 y restricciones).

`StockIssueLine.serializedAssetId` (`stock-issue-line.entity.ts:34-35`) **se conserva** y se alimenta con el primer serial del grupo, para no romper lecturas ni reportes existentes (p. ej. `serialized-asset.service.ts:695` lo lee). Su retiro es una fase de limpieza posterior, ya declarada como deuda. **El singular queda fuera de la aritmética de cantidades** (ajuste G1): las ramas de `reserveLineQuantity` (`:180`), `releaseLineQuantity` (`:219`), la integridad (`:275-279`) y el despacho (`:736-747`) que hoy deciden con `line.serializedAssetId ? 1 : requestedQty` pasan a decidir por el tamaño del grupo; de lo contrario una línea de N reservaría 1 y el despacho la rechazaría.

### B3 · Reglas de negocio

En `StockIssueService.create` y en el `update` que reemplaza líneas:

1. Para ítems con `trackingMode ∈ {SERIALIZED, FIXED_ASSET}`: `serializedAssetIds` no vacío, y `requestedQty` = `serializedAssetIds.length`. Si el cliente envía otra cantidad, error explícito en español.
2. Cada serial mantiene las validaciones de S1: existe en el tenant, `inventoryItemId === line.itemId`, `currentLocationId === sourceLocationId`, `currentStatus ∈ {AVAILABLE, AVAILABLE_REFURBISHED}`.
3. Sin repetidos dentro de la línea, entre líneas de la misma salida, ni comprometidos por otra salida no terminal.
4. Reserva y liberación siguen operando por tupla (ítem, lote, condición), sumando la cantidad del grupo. No introducir una segunda vía de reserva.
5. Cargar los activos de todas las líneas en **una** consulta (`In(ids)`), no una por serial.
6. El chequeo de compromiso de S1 (`:327-353`, aplicación pura) se mantiene como pre-chequeo amable; el `23505` del índice único parcial se traduce a 400 en español como respaldo de carrera. El `update()` de borrador reemplaza filas hijas (delete + reinsert con FK `ON DELETE CASCADE`): cubrir en tests el reemplazo que reusa seriales de la misma salida sin auto-colisión.

### B4 · Despacho

`dispatch` recorre los seriales del grupo. La verificación de "cantidad 1 por serial" que S1 dejó en la línea (`stock-issue.service.ts:269-279` integridad, `:736-740` despacho — citas corregidas en G1) se traslada al elemento. Cada serial genera su transición de activo, **su input de ledger (cantidad 1)** y **su evento de dominio con su `serializedAssetId`**, preservando la granularidad del kardex (`stock-ledger.service.ts:385,488,520` ya trata input serializado como qty 1) y de los eventos (`inventory-domain-event-publisher.service.ts:273`).

### B5 · Lectura

El detalle de la salida devuelve la línea con su arreglo de seriales (id + número de serie legible), para que el borrador de edición reconstruya el grupo sin heurística de reagrupación.

## 4. Restricciones no negociables

- Modulith: todo dentro de `modules/inventory`; sin acceso directo a tablas de otro módulo.
- Multi-tenant por schema; `tenant_id` en la tabla nueva y `runInTenantSchema` en toda consulta.
- La migración se revisa con AI-DATA-ENG **antes** de escribirse. No es opcional.
- Cantidades como `string` decimal en los contratos, coherente con S1.
- Mensajes de error en español.
- No retirar `serializedAssetId` singular en esta fase.
- Sin PII ni credenciales en fixtures.

## 5. Entregables

**Técnicos:** contrato extendido en `packages/shared`; entidad + migración tenant 126 con `down()`; reglas B3 en `create`/`update`; B4 en `dispatch`; B5 en la lectura del detalle; decoradores Swagger actualizados y `inventory.swagger.spec.ts` al día.

**Tests:** línea con N seriales acepta y reserva N; cantidad incoherente con el número de seriales rechazada; los cuatro rechazos de serial de S1 sobre el modelo nuevo; serial repetido dentro de la línea; serial comprometido por otra salida activa; despacho de un grupo de N; compatibilidad del payload singular; aislamiento multi-tenant de la tabla nueva; migración up/down.

**Documentales:** sección de Track B en el informe de fase con conteo real de tests; evidencia en `docs/quality/`; nota de revisión de AI-DATA-ENG sobre la migración.

## 6. Criterios de aceptación

- **CA-S2-05:** una línea con N seriales se envía como una línea de cantidad N; la API la acepta y reserva N.
- **CA-S2-06:** serial de otro ítem, de otra bodega, no disponible o repetido → 400 en español.
- Compatibilidad: un payload con `serializedAssetId` singular sigue funcionando igual que en S1.

## 7. Criterio de stop/go

**Detenerse y emitir `[BLOQUEO]` a AI-EM-ARCH si:**

- AI-DATA-ENG objeta la forma de la tabla hija o el índice único parcial.
- La reserva por grupo obliga a cambiar `StockBalanceService.applyDeltaWithManager` o su advisory lock — eso afecta a todos los flujos de inventario, no solo a salidas.
- El kardex o algún reporte depende de que exista exactamente una línea por serial.
- El contrato publicado en B1 resulta insuficiente para el frontend: se versiona y se notifica, nunca se altera en silencio.

**GO cuando:** los criterios de §6 están evidenciados, las suites de `apps/api` relativas a inventario pasan con **conteo real reportado** (un verde cacheado de `turbo` o un `--passWithNoTests` no es evidencia), la migración corre up y down limpia, y `pnpm lint` / `pnpm typecheck` están limpios en `api`, `shared` y `database`.
