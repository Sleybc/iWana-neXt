# PROMPT DE EJECUCIÓN — MOD12 · Coherencia del maestro de artículos (Track A) — Fase S2

**Versión:** 1.0
**Fecha:** 2026-09-05
**Módulo:** MOD12 Inventario / SCM — Catálogo maestro
**Fase:** S2 (track A) — **primero en la secuencia**
**Generado por:** AI-EM-ARCH (modo Orchestrator)
**Agente destinatario:** **AI-SR-FULL**, con consulta a **AI-PROD-UX** sobre el copy
**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` *(en revisión)*

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** un producto marcado como "Con serial" **es** serializado de punta a punta. La combinación contradictoria deja de ser creable, editable y de existir en el catálogo.
- **Lo que sí entra:** validación cruzada `itemKind` ↔ `trackingMode` en la API, guía proactiva en el formulario del maestro, bloqueo del cambio de control de material con saldo existente, y el diagnóstico de ítems ya inconsistentes.
- **Lo que no entra:** unificar los dos campos en el modelo (requiere ADR, §9 del spec), la pantalla de salidas, seriales múltiples, y cualquier cambio de esquema.

## 2. Por qué existe este track

El producto `CFO-SER-ROGPN-TPL-XC220` se creó eligiendo **Tipo de producto = "Con serial"** y quedó con **Control de material = "Consumible"**. Nada lo impidió: `refineInventoryItemMaster` (`apps/api/src/modules/inventory/dto/index.ts:432-444`) solo valida `trackingMode → assetControlled`, y en el formulario el campo *Tipo de producto* se escribe con un `updateForm('itemKind', …)` plano (`InventoryCatalogDrawer.tsx:757-764`) mientras *Control de material* sí tiene guía proactiva (`handleTrackingModeChange`, `:575-582`).

El operador eligió bien y el sistema guardó una contradicción en silencio. **Este track cierra esa puerta.** Diagnóstico completo en [SPEC Fase S2 §1.1](../specs/2026-09-05-mod12-salidas-captura-linea-seriales-multiples-design.md).

## 3. Artefactos de entrada obligatorios

- **Spec de la fase:** [`2026-09-05-mod12-salidas-captura-linea-seriales-multiples-design.md`](../specs/2026-09-05-mod12-salidas-captura-linea-seriales-multiples-design.md) v1.0 — §4 es normativo para este track.
- **PRD:** [PRD-MOD12-CATALOGO-MAESTRO-ARTICULOS v1.0](../prds/PRD-MOD12-CATALOGO-MAESTRO-ARTICULOS-v1.0.md).
- **ADR:** [ADR-048](../adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md) *(Aprobado)*.
- **Gobernanza:** `AGENTS.md`, `.github/instructions/system-vocabulary.instructions.md` (copy de los mensajes), `.agents/skills/iwana-identity-ui-review/SKILL.md` para el cambio de formulario.

## 4. Instrucciones

### A1 · Validación cruzada en la API

En `refineInventoryItemMaster` (`dto/index.ts:432-444`), aplicada tanto a `CreateInventoryItemSchema` como a `UpdateInventoryItemSchema`:

- `itemKind === SERIALIZED` exige `trackingMode ∈ {SERIALIZED, FIXED_ASSET}`.
- `trackingMode ∈ {SERIALIZED, FIXED_ASSET}` exige `itemKind === SERIALIZED`.
- Mensaje en español que nombre los campos **como los ve el operador** — "Tipo de producto" y "Control de material" —, nunca los enums crudos. Copy aprobado en G1 (ver §A5).
- Mantener intacta la regla vigente `trackingMode → assetControlled`.
- **Ajuste G1 de AI-SR-FULL:** el `safeParse` merged de validación en `update()` (`inventory-item.service.ts:952-963`) hoy **no incluye `itemKind`**: añádelo al objeto merged o la regla cruzada nunca disparará en edición.

### A2 · Guía proactiva en el formulario

En `InventoryCatalogDrawer.tsx`: añadir `handleItemKindChange` simétrico al `handleTrackingModeChange` existente (`:573-580`), de modo que elegir "Con serial" ajuste *Control de material* en el mismo cambio y lo explique en el `helperText` del campo. Reemplazar el `updateForm('itemKind', …)` plano de `:756-764` por ese handler.

**Ajuste G1 de AI-PROD-UX — guía en ambas direcciones:** extender también `handleTrackingModeChange` para que elegir *Control de material* = "Con serial" o "Activo fijo" ajuste *Tipo de producto* a "Con serial" en el mismo cambio (hoy solo fuerza `assetControlled`). Sin ello, quien empieza por Control de material no recibe guía y solo ve el rechazo de A1 al guardar. El copy del helperText correspondiente se consulta con AI-PROD-UX en el informe si difiere del de §A5.

Restricción de identidad: sin componentes ni tokens nuevos. El patrón de guía proactiva ya existe en este mismo archivo — replicarlo, no inventar uno.

### A3 · Bloqueo del cambio con saldo

En `InventoryItemService.update` (`services/inventory-item.service.ts:899-981`): rechazar el cambio de `trackingMode` cuando el ítem tiene saldo en `stock_balances` o activos en `serialized_assets`. Mensaje accionable que dirija a regularizar **con salidas o ajustes** (la recepción no vacía saldo — corrección G1). Es la otra vía por la que se llega al mismo estado inconsistente.

### A4 · Diagnóstico y corrección de datos

Consulta que liste los ítems con la contradicción (`item_kind = 'SERIALIZED'` con `tracking_mode = 'CONSUMABLE'`, y el caso inverso), pensada para correrse **antes** de activar A1 en un tenant con datos. En esta instancia el catálogo reporta un solo producto; documentar el resultado en el informe de fase.

**No ejecutar corrección de datos de forma automática ni masiva.** Reclasificar un producto cambia cómo se despacha: la decisión es del operador (pasar a control serializado y dar entrada con seriales, o asumirlo consumible).

### A5 · Copy aprobado (G1 — AI-PROD-UX, verificado contra `inventory-labels.ts:44-70`)

1. **Error A1** (formulario y API): «Tipo de producto y Control de material no coinciden: un producto "Con serial" debe tener Control de material "Con serial" o "Activo fijo". Ajusta Control de material para guardar.»
2. **helperText A2** (Select "Tipo de producto"): «Al elegir "Con serial", Control de material se ajusta a "Con serial"; luego puedes cambiarlo a "Activo fijo".»
3. **Mensaje A3**: «Este producto tiene saldo en bodega o activos registrados, así que no permite cambiar su Control de material. Regulariza con salidas o ajustes y vuelve a intentarlo.»

## 5. Restricciones no negociables

- Sin cambios de esquema ni migraciones en este track.
- Multi-tenant por schema; el diagnóstico corre bajo `runInTenantSchema`.
- Mensajes de cara al usuario en español, sin enums crudos (regla dura de la disciplina de identidad, P1).
- No unificar `itemKind` y `trackingMode` — eso requiere ADR y está fuera de alcance.
- Sin PII ni credenciales en fixtures.

## 6. Entregables

**Técnicos:** A1 en el schema compartido de creación y edición; A2 en el drawer; A3 en el servicio; A4 como consulta documentada. Tests: unitarios del refinamiento (ambas direcciones), HTTP spec del rechazo en crear y editar, spec de componente de la guía proactiva, spec del bloqueo con saldo.

**Documentales:** sección de Track A en el informe de fase `docs/informes/`, con el resultado del diagnóstico A4 y conteo real de tests; evidencia en `docs/quality/`.

## 7. Criterios de aceptación

- **CA-S2-01:** guardar "Con serial" + "Consumible" se rechaza en formulario y API, con mensaje que nombra ambos campos.
- **CA-S2-02:** elegir "Con serial" ajusta *Control de material* en el mismo cambio y lo explica.
- **CA-S2-03:** cambiar el control de material de un ítem con saldo o activos se rechaza con mensaje accionable.

## 8. Criterio de stop/go

**Detenerse y emitir `[BLOQUEO]` a AI-EM-ARCH si:**

- El diagnóstico A4 revela un volumen de ítems inconsistentes que haga inviable activar A1 sin una fase de remediación propia.
- Cerrar la combinación obliga a tocar el generador de SKU (`buildCompositeSku`) o a regenerar SKUs existentes — eso cambia identificadores ya impresos y es decisión del CTO.
- Aparece un flujo legítimo que necesite `itemKind = SERIALIZED` con control consumible; sería señal de que el modelo necesita el ADR antes que la regla.

**GO cuando:** los tres criterios de §7 están evidenciados, las suites de `apps/api` y `apps/portal` relativas a catálogo pasan con **conteo real reportado** (un verde cacheado de `turbo` no es evidencia), y `audit-ui.mjs` corre limpio sobre el drawer.
