# Plan de orquestación — MOD12 Salidas: captura de línea, seriales múltiples y coherencia del maestro (Fase S2)

**Fecha:** 2026-09-05
**Autor:** AI-EM-ARCH (modo Orchestrator)
**Superficies:** `/dashboard/inventory?tab=issues` → crear salida · maestro de productos
**Spec:** [Fase S2 v1.0](../specs/2026-09-05-mod12-salidas-captura-linea-seriales-multiples-design.md)
**Prompts:** [Maestro](../prompts/PROMPT-MOD12-SALIDAS-S2-MAESTRO-v1.0.md) · [BE](../prompts/PROMPT-MOD12-SALIDAS-S2-BE-v1.0.md) · [FE](../prompts/PROMPT-MOD12-SALIDAS-S2-FE-v1.0.md)
**Sucede a:** [Fase S1](2026-09-05-mod12-salidas-picking-existencias-seriales.md) — entregada en `50afe28c` y `827d9407`
**Estado:** Consolidada (2026-09-05) — G6 **GO con pendientes** · G6.5 **pendiente** (2 bloqueantes de plataforma preexistentes, ajenos a S2; ver [informe de fase](../informes/INFORME-MOD12-SALIDAS-S2-v1.0.md) §2 y §7)

---

## 1. Qué se corrige

La Fase S1 dejó el picking funcionando. Al usarlo aparecieron tres cosas.

1. **El serial seguía sin aparecer** — y la pantalla de salidas no tenía la culpa. El producto se creó con *Tipo de producto* = "Con serial" pero *Control de material* = "Consumible", una contradicción que el maestro permite guardar en silencio y que decide todo el comportamiento aguas abajo.
2. **La captura de línea no correspondía al trabajo de bodega:** lote, seriales y cantidad se decidían con controles inline en la tabla, sin forma de modificar una línea ya agregada, y un solo serial por línea.
3. **Dos defectos colaterales:** el botón "Cargar más" nunca se activa (el endpoint pagina por página, el cliente espera cursor) y la columna de captura quedó estrangulada por un cambio de grilla sin commitear.

Diagnóstico con evidencia en el [spec §1](../specs/2026-09-05-mod12-salidas-captura-linea-seriales-multiples-design.md).

## 2. Decisiones (CTO, 2026-09-05)

| # | Decisión |
|---|---|
| D1 | El maestro impide la combinación contradictoria y el catálogo existente se corrige. |
| D2 | El backend acepta `serializedAssetIds[]`: una línea con N seriales y cantidad N. |
| D3 | La configuración de la línea vive en un panel lateral (`OperationalSidePeek`). |
| D4 | Condición deja de ser columna editable; se elige en el panel y se lee en la fila. |

## 3. Secuencia

| Fase | Responsable | Entregable | Depende de |
|---|---|---|---|
| **0** | AI-EM-ARCH | Spec S2, tres prompts, este plan | — |
| **1** | AI-SR-FULL + AI-PROD-UX | **Track A** — validación cruzada, guía proactiva, bloqueo con saldo, diagnóstico | Fase 0 |
| **2a** | AI-SR-FULL + AI-DATA-ENG | **Track B** — `serializedAssetIds[]`, tabla hija, migración tenant 126, despacho | Fase 0 |
| **2b** | AI-FE-PLATFORM | **Track C** — panel lateral, tabla del borrador, layout y paginación | Contrato publicado en 2a (**paralelo a 2a**) |
| **3** | AI-SR-QA | Specs y evidencia con conteo real | 1, 2a, 2b |
| **4** | AI-EM-ARCH | Consolidación, informe de fase, G6.5 | 3 |

**El Track A va primero y es independiente.** Es lo único que hace visible el serial para el producto del caso: sin él, los tracks B y C entregan capacidad que este producto no puede ejercer.

**Regla de re-sync:** el contrato extendido se publica en el primer commit del track B; a partir de ahí, cualquier cambio se versiona y se notifica vía AI-EM-ARCH. Nunca se parchea en silencio (protocolo §3bis regla 1).

**Colisión de archivos:** los tres tracks tocan zonas distintas. `InventoryCatalogDrawer.tsx` es del track A; `stock-issue.service.ts` y la migración, del B; `StockIssueComposer.tsx` y `StockIssueDraftLinesTable.tsx`, del C. `InventoryClient.tsx` queda fuera de alcance.

## 4. Gates

| Gate | Contenido | Aprobador |
|---|---|---|
| **G1** | Spec S2. AI-EM-ARCH es el productor: **no se autofirma**. Review cruzado de AI-SR-FULL (factibilidad, incluida la migración) y AI-PROD-UX (viabilidad del panel lateral y del copy del maestro). | SR-FULL + PROD-UX |
| **Revisión de datos** | La migración 126 la revisa **AI-DATA-ENG antes de escribirse**. No es opcional. | AI-DATA-ENG |
| **G6** | Suites verdes con **conteo real** de casos por suite, más `audit-ui.mjs` limpio sobre los archivos de UI tocados. Un verde cacheado de `turbo` o un `--passWithNoTests` no es evidencia. | AI-SR-QA |
| **G6.5** | Corrida Linux de CI **por SHA** + artefacto resumen sanitizado, antes del merge ([ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md)). | AI-EM-ARCH |

## 5. Verificación end-to-end

1. `pnpm --filter @iwana/api test -- inventory` y `pnpm --filter @iwana/portal test -- inventory`, reportando conteo de casos.
2. `pnpm lint` y `pnpm typecheck` en `api`, `portal`, `shared` y `database`.
3. `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/inventory`.
4. Navegador, **en este orden**:
   - **Maestro:** intentar guardar "Tipo = Con serial" + "Control de material = Consumible" → rechazado con mensaje que nombra ambos campos.
   - Corregir `CFO-SER-ROGPN-TPL-XC220` y dar entrada a sus unidades con seriales.
   - **Salida:** clic en el producto → el panel ofrece condición, lote, **seriales múltiples** y cantidad ligada al número de seriales.
   - El borrador muestra una fila con el detalle y **Modificar**, que reabre el panel con los valores.
   - La tabla no tiene columna Condición editable.
   - Con más de 25 ítems en bodega, la segunda página es alcanzable.
   - El escaneo de código de barras sigue agregando con una sola coincidencia.
5. `POST /api/v1/inventory/issues` con dos seriales → una línea, cantidad 2, reserva 2. Con un serial de otra bodega → 400 en español. Con `serializedAssetId` singular → sigue funcionando.
6. `pnpm audit:adr-citations` en `BLOQUEANTE: 0` para los artefactos nuevos.

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| La migración 126 toca reserva, despacho y kardex | Revisión de AI-DATA-ENG antes de escribirla; `serializedAssetId` singular se conserva como red de seguridad |
| La validación cruzada rechaza ítems existentes al editarlos | El diagnóstico del Track A los identifica antes de activar la regla; aquí es un solo producto |
| El panel lateral desplaza el escaneo de código de barras | La vía de checkbox se conserva explícitamente; romperla es motivo de `[BLOQUEO]` |
| Aparece un caso legítimo de "Con serial" con control consumible | Sería señal de que el modelo necesita el ADR de §7 antes que la regla; se escala |

## 7. Deuda declarada

| Severidad | Ítem |
|---|---|
| **Alta** | `itemKind` y `trackingMode` se solapan y ambos se editan por separado. Unificarlos o derivar uno del otro **requiere ADR propio**; esta fase solo impide la combinación inválida. |
| Media | `StockIssueLine.serializedAssetId` queda como campo de transición junto a la tabla hija; su retiro necesita una fase de limpieza. |
| Media | Recepciones (`GoodsReceiptPanel.tsx:520-531`) y traslados siguen capturando lote y serial como texto libre. |
| Baja | La etiqueta de `REFURBISHED` ("Reacondicionado") no coincide con el término de la operación ("retoma"); pendiente de `system-vocabulary-review`. |
| Baja | `useMinWidth` duplicado en `StockIssueComposer.tsx:188` y `PurchaseRequestComposer.tsx:83`. |

## 8. Trabajo relacionado, fuera de esta fase

- [Fase S1](2026-09-05-mod12-salidas-picking-existencias-seriales.md) — cerrada; esta fase construye sobre su contrato y sus validaciones de serial.
- [Plan de dedup de inventario](2026-09-01-inventario-dedup-refactors.md) — el `useMinWidth` duplicado le pertenece.
