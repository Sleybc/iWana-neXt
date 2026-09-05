# PROMPT DE EJECUCIÓN — MOD12 Catálogo · F1 · Restaurar Compras, Inventario y Activos en el drawer

**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` v1.2 *(en revisión — la regla de destino la respalda `AGENTS.md` → Documentation Rules)*
**Generado por:** AI-EM-ARCH (modo Orchestrator)
**Fecha:** 2026-09-02
**Versión:** 1.0

## Módulo

- **Nombre:** Inventario / SCM — catálogo maestro de artículos
- **Código:** MOD12 (`/dashboard/inventory?tab=catalog`)
- **Fase:** F1 — restaurar las tres secciones que el HLD aprobado especifica y hoy no existen
- **Destinatarios:** **AI-PROD-UX** + **AI-DS-OWNER** (spec) → **AI-FE-PLATFORM** (implementación)
- **Naturaleza:** **cierre de brecha contra norma aprobada**, no alcance nuevo. No requiere delta de PRD ni ADR.

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** que los atributos de compras, inventario y lifecycle que el PRD exige
persistir tengan por fin **superficie de edición**, restaurando el drawer de catálogo a las cinco
secciones que el HLD aprobado especifica.

**El defecto, verificado el 2026-09-02:**

[HLD-MOD12-CATALOGO-MAESTRO-ARTICULOS-v1.0](../hlds/HLD-MOD12-CATALOGO-MAESTRO-ARTICULOS-v1.0.md) §7
(**Aprobado por el CTO**, 2026-06-25) especifica el drawer con cinco secciones: *general, compras,
inventario, activos, relación comercial*. El drawer real (`InventoryCatalogDrawer.tsx`) tiene tres:
Costos (solo lectura, no especificada), Datos del producto, Relación comercial.

Su `buildPayload` (L83-96) emite **exactamente 10 claves**. Los 17 campos restantes que la API acepta
**no son establecibles desde ninguna pantalla del portal** — verificado por búsqueda de escrituras en
todo `apps/portal`, resultado **cero**.

**Daño real que esto causa hoy:**

| Requisito | Campos sin superficie | Efecto |
| --- | --- | --- |
| RF-CAT-07 | `minimumStock`, `reorderPoint`, `targetStock` | Quedan en **0** siempre → **RF-INV-22 StockLow nunca dispara**; «Productos bajo mínimo» de Vista general siempre vacío; `StockReplenishmentPanel` sin base de cálculo |
| RF-CAT-06 | `preferredSupplierRefId`, `supplierSku`, `purchaseUnitOfMeasure`, `purchaseToBaseUomFactor`, `minimumOrderQty`, `orderMultiple`, `leadTimeDays`, `baseCost`, `standardCost` | Compras y RFQ sin datos de abastecimiento; el prellenado de UoM y proveedor que la Fase 01 declaró entregado no tiene de dónde leer |
| RF-CAT-08 | `usefulLifeMonths`, `assetControlled` | **RF-INV-18** (alertas de vida útil) sin datos |
| — | `purchasable`, `inventoryControlled` | Forzados `true` al crear y nunca enviados al editar: **imposibles de cambiar desde la UI** |

**Lo que sí entra:**
- Spec de las tres secciones (PROD-UX + DS-OWNER).
- Ampliación de `CatalogFormState` y `buildPayload` en `InventoryCatalogDrawer.tsx`.
- Retirar el copy que promete secciones inexistentes.
- Corrección del informe de Fase 01 (§6).

**Lo que no entra:**
- Backend, DTO, entidad, migración. **La API ya acepta los 17 campos** — este trabajo es puramente de superficie.
- Campos que no existen en el modelo (código de barras, peso, dimensiones, imagen, cuenta contable, impuesto). Se gobiernan en F4/F5 del plan.
- El diálogo de alta — se trata en F2.
- Rediseñar la tabla de catálogo, los filtros ni las subtabs Productos/Categorías.

---

## 2. Artefactos de entrada obligatorios

- **PRD:** `docs/prds/PRD-MOD12-CATALOGO-MAESTRO-ARTICULOS-v1.0.md` (**Aprobado**) — RF-CAT-05/06/07/08 son la fuente de qué campos van en cada sección.
- **HLD:** `docs/hlds/HLD-MOD12-CATALOGO-MAESTRO-ARTICULOS-v1.0.md` (**Aprobado**) §7 — las cinco secciones.
- **Spec de diseño origen:** `docs/specs/2026-06-25-mod12-catalogo-maestro-articulos-design.md` (**Aprobado**) §4.2 (grupos de atributos) y §5 (reglas).
- **ADRs aplicables:**
  - `ADR-048` (**Aprobado**) — boundaries del BC de inventario
  - `ADR-059` (**Aprobado**) — costeo promedio móvil: `averageCost` es derivado, **no** de captura
  - `ADR-052` (**Aprobado**) — proveedor = Party + rol; `preferredSupplierRefId` es referencia lógica a MOD08, sin FK cross-module
  - `ADR-084` v1.1 (**Aprobado**) — gate por grupo; relevante por el selector de proveedor (§4.4)
  - `ADR-075` (**Aprobado**) — contrato de capas Z del portal
- **Informe con hallazgo abierto:** `docs/informes/INFORME-INVENTORY-CATALOGO-DRAWER-NUEVO-PRODUCTO-v1.0.md` — H4/H5 (consolidación side-peek + `Dialog` contra ADR-075) siguen en Fase B **Propuesta**. No los resuelvas aquí; **no los agraves**.
- **Backend de referencia (leer, no tocar):** `apps/api/src/modules/inventory/dto/index.ts` L197-334 — `inventoryItemMasterFields` y `refineInventoryItemMaster` definen validaciones y reglas cruzadas que ya existen.

---

## 3. Definición funcional de entrada (AI-EM-ARCH) — el qué, no el cómo

Agrupación derivada del HLD §7 y de los RF-CAT que exigen cada atributo:

**Sección «Compras»** (RF-CAT-06)
`purchasable` · `preferredSupplierRefId` · `supplierSku` · `purchaseUnitOfMeasure` ·
`purchaseToBaseUomFactor` · `baseCost` · `standardCost` · `minimumOrderQty` · `orderMultiple` ·
`leadTimeDays`

**Sección «Inventario»** (RF-CAT-07)
`inventoryControlled` · `minimumStock` · `reorderPoint` · `targetStock`

**Sección «Activos»** (RF-CAT-08)
`assetControlled` · `usefulLifeMonths`

Los tres costos derivados (`averageCost`, `lastPurchaseCost`, `standardCost` mostrado) permanecen en
la sección **Costos existente, en solo lectura**: se actualizan al recibir compras (ADR-059). Ojo con
la ambigüedad: `standardCost` es **de captura** (costo de referencia, RF-CAT-06) y a la vez se
muestra en Costos; PROD-UX decide cómo evitar que el usuario lo lea como dos cosas distintas.

El **diseño detallado** —orden dentro de cada sección, controles, etiquetas, ayuda contextual,
colapsado o no, comportamiento responsive— es de PROD-UX y DS-OWNER. Esta definición no lo prescribe.

---

## 4. Restricciones no negociables

1. **No tocar backend, DTO, entidad ni migraciones.** La API ya acepta todos estos campos; añadir algo
   allí es señal de que te saliste del alcance.
2. **No duplicar las reglas cruzadas en el cliente.** `refineInventoryItemMaster` (dto/index.ts:230-274)
   ya valida: factor de conversión > 0 si hay unidad de compra; `reorderPoint >= 0`; serializado o
   activo fijo ⇒ `assetControlled` no puede ser `false`. El cliente puede **guiar** (deshabilitar,
   avisar), pero la validación autoritativa sigue en backend.
3. **`averageCost` y `lastPurchaseCost` nunca son de captura** (ADR-059).
4. **Selector de proveedor preferido — cuidado con el permiso.** La lista de proveedores se sirve
   desde `GET /purchasing/suppliers`, que exige **`INVENTORY_PURCHASING_READ`**, mientras el drawer de
   catálogo opera bajo `INVENTORY_STOCK_MANAGE`. Un usuario con permisos de stock pero no de compras
   recibiría **403** al abrir el selector. Resolver **degradando con elegancia** (campo deshabilitado
   con explicación, o sección Compras oculta sin ese permiso) — **nunca** dejando que el 403 llegue al
   usuario. Es el mismo defecto que el plan de federación registra como D-3.
5. **`update` re-valida el registro fusionado** contra `CreateInventoryItemSchema`
   (`inventory-item.service.ts:829-859`): enviar un subconjunto incoherente puede fallar aunque cada
   campo sea válido por separado. Probar combinaciones, no solo campos sueltos.
6. **Los numéricos llegan como `string`** en `InventoryItemRecord` (`api-client.ts:7003-7041`) salvo
   `leadTimeDays` y `usefulLifeMonths`. Cuidado al hidratar el formulario.
7. **No agravar H4/H5** (capas Z / consolidación side-peek, ADR-075): si la solución exigiera tocar
   esa consolidación, **detenerse y escalar** — está en Fase B pendiente de CTO.
8. Sin permisos nuevos. Sin cambios de ruta ni de `?tab`.

**Contratos congelados:** `InventorySideDrawerShell` · API de `PortalPanel` / `PortalSectionHeader` ·
`packages/shared/src/enums/inventory/*` · schema Zod de `dto/index.ts` (leer, no modificar).

---

## 5. Entregables

**Técnicos**
- `apps/portal/src/components/inventory/InventoryCatalogDrawer.tsx` — tres secciones, `CatalogFormState` y `buildPayload` ampliados.
- `apps/portal/src/components/inventory/InventoryClient.tsx` — solo si el selector de proveedor exige cargar opciones.
- Tests: `InventoryCatalogDrawer.spec.tsx` (y `InventoryClient.spec.tsx` si cambia el montaje).
- Sin migraciones, sin cambios de OpenAPI, sin cambios de backend.

**Documentales**
- `docs/specs/` — spec de las tres secciones (PROD-UX + DS-OWNER).
- `docs/informes/INFORME-MOD12-CATALOGO-SECCIONES-DRAWER-F1-v1.0.md` — entregables, evidencia de gates, antes/después.
- **Informe de Fase 01 ya corregido por AI-EM-ARCH el 2026-09-02** (`INFORME-MOD12-CATALOGO-MAESTRO-ARTICULOS-FASE-01-v1.0.md` §8): **CA-CAT-01** pasó a «Cubierto solo en persistencia y API» y **CA-CAT-04** a «Cubierto en código, sin fuente de datos»; la deuda del KPI «bajo mínimo» quedó reclasificada. *(Nota: los `CA-CAT-*` de ese informe son criterios de aceptación de la fase, distintos de los `RF-CAT-*` del PRD — no confundirlos.)* Al cerrar F1, **actualizar §8 de ese informe** dejando constancia de que la brecha quedó cerrada.

---

## 6. Criterios de aceptación

- **CA-F1-01:** el drawer presenta las cinco secciones del HLD §7: general (Datos del producto), compras, inventario, activos, relación comercial. Costos permanece como bloque de solo lectura.
- **CA-F1-02:** los 17 campos listados en §3 son establecibles y se persisten — verificado con recarga del drawer tras guardar.
- **CA-F1-03:** `purchasable` e `inventoryControlled` pueden cambiarse a `false` y el cambio persiste.
- **CA-F1-04:** **StockLow revive** — un producto con `minimumStock > 0` cuyas existencias caen por debajo aparece en «Productos bajo mínimo» de Vista general y en Reposición. *Es la prueba de que la brecha causaba daño real.*
- **CA-F1-05:** las reglas cruzadas se respetan: con `trackingMode` serializado o activo fijo, no es posible guardar `assetControlled=false`; con unidad de compra, el factor debe ser > 0.
- **CA-F1-06:** sin `inventory.purchasing.read`, la sección Compras degrada con explicación y **no** produce un 403 visible.
- **CA-F1-07:** el copy «Compras, inventario y activos se administran desde sus secciones correspondientes» ya no aparece.
- **CA-F1-08:** `averageCost` y `lastPurchaseCost` siguen siendo de solo lectura.
- **CA-F1-09:** `git diff --stat apps/api packages/database` vacío.
- **CA-F1-10:** `audit-ui.mjs` sobre los archivos tocados → P0 0, P1 0.

## 7. Criterio de stop/go

**Detenerse inmediatamente si:**
- Hiciera falta cambiar backend, DTO o migración para persistir algún campo (señal de alcance mal entendido).
- La solución del selector de proveedor exigiera crear permisos o ampliar los del drawer.
- Fuera necesario tocar la consolidación side-peek / `Dialog` de H4/H5 (ADR-075) — está en Fase B pendiente de CTO.
- El volumen de campos hiciera el drawer inusable y DS-OWNER propusiera otra arquitectura de navegación (pestañas internas, pasos): **eso cambia la spec congelada y se decide arriba**.

**Documentar causa en:** `INFORME-MOD12-CATALOGO-SECCIONES-DRAWER-F1-v1.0.md` §Bloqueos.
**Escalar a:** AI-EM-ARCH con etiqueta `[BLOQUEO]` antes de cerrar la sesión (protocolo §3).

## 8. Criterio de salida

- **Frontend validado:** `pnpm --filter @iwana/portal test src/components/inventory/InventoryCatalogDrawer.spec.tsx src/components/inventory/InventoryClient.spec.tsx` en verde, **con `Cached: 0`**.
- **Reglas cruzadas:** `pnpm --filter @iwana/api exec jest src/modules/inventory/tests/inventory-item.service.spec.ts` en verde (no debe cambiar nada; es control de no-regresión).
- **E2E:** `pnpm exec playwright test e2e/tests/portal-inventory-scm.spec.ts`. **Aviso:** el caso «crea producto comprable en catalogo» ya está **roto de forma preexistente** — verificar A/B con `git stash` para no atribuirle la regresión a esta fase.
- **Calidad:** `pnpm --filter @iwana/portal typecheck && pnpm lint` en verde; `audit-ui.mjs` P0/P1 = 0.
- **Backend intacto:** `git diff --stat apps/api packages/database` vacío.
- **Documentación archivada:** spec + informe F1 + corrección del informe Fase 01.

---

## Impacto declarado (AI-EM-ARCH)

- **Multi-tenant:** sin impacto — superficie de cliente; la tenancy la resuelve el backend por `search_path`.
- **Seguridad:** sin cambio de superficie. El drawer ya opera bajo `INVENTORY_STOCK_MANAGE` y `refineInventoryItemMaster` sigue siendo la barrera. La degradación del selector de proveedor (§4.4) **mejora** la coherencia de permisos.
- **Escala:** sin impacto — sin endpoints ni consultas nuevas, salvo la carga de opciones de proveedor, que ya existe y está paginada.
- **Regulación:** sin impacto. Ninguna obligación DIAN recae sobre el catálogo (`Anexo_Regulatorio_Integraciones_ISP.md` las asigna a Billing).
