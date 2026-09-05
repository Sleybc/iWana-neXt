# PROMPT DE EJECUCIÓN — MOD12 Catálogo · F4 · Código de barras del artículo

**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` v1.2 *(en revisión — la regla de destino la respalda `AGENTS.md` → Documentation Rules)*
**Generado por:** AI-EM-ARCH (modo Orchestrator)
**Fecha:** 2026-09-02
**Versión:** 1.0

## Módulo

- **Nombre:** Inventario / SCM — catálogo maestro de artículos
- **Código:** MOD12
- **Fase:** F4 — identificación por código de barras
- **Destinatarios:** **AI-SR-FULL** (entidad, migración, DTO, endpoints) → **AI-FE-PLATFORM** (captura y búsqueda)
- **Autorización:** delta **v1.1 del PRD, Aprobado por el CTO el 2026-09-02** (RF-CAT-13 a RF-CAT-16). Es alcance nuevo sobre un módulo cerrado con G7 GO; sin ese delta no habría autorización.

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** que un artículo pueda identificarse por su código de barras, y que ese código
sirva para localizarlo en el catálogo y para capturarlo en los tres flujos que se ejecutan con el
producto en la mano — recepción, conteo físico y salidas.

**Motivación (PRD §11.1):** MOD12 no tiene ningún identificador legible por máquina. El único
identificador es el `sku`, que **lo genera el sistema** y no viene impreso en el producto. El costo lo
paga sobre todo el **conteo físico**, donde el error de identificación es más probable y más caro:
un conteo mal imputado corrige el saldo del artículo equivocado.

**Lo que sí entra:** columna y formato en `inventory_items`; validación; captura en alta y edición;
búsqueda por código en el catálogo; captura en recepción, conteo y salidas.

**Lo que no entra** (PRD §11.3): generación e impresión de etiquetas; integración con hardware lector
—un lector USB emula teclado y no requiere código específico—; múltiples códigos por artículo;
códigos por lote o por unidad serializada, que ya cubre el número de serie.

---

## 2. Artefactos de entrada obligatorios

- **PRD:** `docs/prds/PRD-MOD12-CATALOGO-MAESTRO-ARTICULOS-v1.0.md` (interna 1.1, **Aprobado**) — **§11 completa es la especificación de esta fase**; RF-CAT-13 a RF-CAT-16.
- **HLD:** `docs/hlds/HLD-MOD12-CATALOGO-MAESTRO-ARTICULOS-v1.0.md` (**Aprobado**).
- **ADRs aplicables:**
  - `ADR-048` (**Aprobado**) — bounded context de inventario
  - `ADR-054` (**Aprobado**) — conteo físico cíclico, principal beneficiario
  - `ADR-INV-SKU-COMPUESTO-v1` (**Aprobado**) — el SKU sigue siendo el identificador canónico
  - `ADR-085` (**Aprobado**) — unidades de medida; sin relación directa, pero comparte los mismos archivos
- **Migración de referencia:** `packages/database/src/migrations/tenant/051_expand_inventory_item_master_catalog.ts` — patrón de migración aditiva reversible sobre esta tabla.
- **Entidad:** `packages/database/src/entities/inventory-item.entity.ts`.

---

## 3. Especificación funcional (PRD §11.2 y §11.4)

Seis reglas, todas normativas:

| # | Regla | Por qué |
| --- | --- | --- |
| 1 | **Opcional.** Un artículo sin código de barras es válido | Rollos de fibra cortados a medida, herramienta y material a granel no lo tienen |
| 2 | **Único por tenant cuando existe** — índice único **parcial** `WHERE barcode IS NOT NULL` | Un código que identifica dos artículos no identifica ninguno. El índice parcial permite que muchos lo dejen vacío |
| 3 | **Formato declarado** junto al valor: `EAN13`, `UPCA`, `CODE128`, `OTHER` | Sin formato no se puede validar el dígito de control |
| 4 | **Dígito de control** validado en `EAN13` y `UPCA`; `CODE128` y `OTHER` solo longitud y caracteres | Única forma de detectar un tecleo erróneo en el alta |
| 5 | **No sustituye al SKU** | El código es del fabricante, puede cambiar o reutilizarse; el SKU es nuestro |
| 6 | **Editable después de crear**, a diferencia del SKU | No participa en la identidad generada; corregir un tecleo debe ser posible |

**Modelo de datos** (§11.4), migración **aditiva**:
- `barcode` varchar(64) nullable
- `barcode_type` enum nullable (`EAN13` | `UPCA` | `CODE128` | `OTHER`)
- Índice único parcial `(tenant_id, barcode) WHERE barcode IS NOT NULL`
- Regla de consistencia: **`barcode` y `barcode_type` van juntos** — uno sin el otro se rechaza

---

## 4. Restricciones no negociables

1. **Migración aditiva y reversible**, con `down()` verificado, sobre schema tenant. No invalida ningún artículo existente.
2. **La unicidad es por tenant, nunca global.** Dos tenants pueden tener el mismo código.
3. **El índice es parcial.** Un índice único total sobre una columna nullable con muchos nulos es un error de diseño distinto según el motor: aquí se exige `WHERE barcode IS NOT NULL` explícito.
4. **El SKU no cambia de rol, formato ni inmutabilidad** (regla 5 + ADR-INV-SKU-COMPUESTO). El código de barras **no** entra en la generación del SKU.
5. **La validación del dígito de control es autoritativa en backend**, en el schema Zod junto a `refineInventoryItemMaster`. El cliente puede validar para dar respuesta inmediata, pero no es la barrera.
6. **Mensaje de error útil en colisión:** al rechazar un código duplicado, el mensaje debe identificar el artículo que ya lo usa (CA del PRD §11.5.2). Un «código duplicado» a secas obliga al operador a buscarlo a mano.
7. Sin permisos nuevos: se gobierna con `INVENTORY_STOCK_READ` / `INVENTORY_STOCK_MANAGE`.
8. **Coordinación con F1 y F5.** Esta fase toca `inventory-item.service.ts`, `dto/index.ts` y los formularios del catálogo — los mismos archivos que F1 y F5. Si alguna de ellas está en curso, **sincronizar antes de empezar**; no resolver conflictos por sobrescritura.

**Contratos congelados:** PRD §11 · `packages/shared/src/enums/inventory/*` (se añade el enum de formato, no se altera ninguno existente) · patrón de migración de la 051.

---

## 5. Entregables

**Técnicos**
- `packages/database/src/entities/inventory-item.entity.ts` — dos columnas + índice parcial.
- `packages/database/src/migrations/tenant/` — migración aditiva reversible.
- `packages/shared/src/enums/inventory/` — enum de formato de código de barras.
- `apps/api/src/modules/inventory/dto/index.ts` — campos, validación de dígito de control, regla de consistencia.
- `apps/api/src/modules/inventory/services/inventory-item.service.ts` — búsqueda por código; manejo de colisión con mensaje útil.
- Portal: captura en `InventoryCreateProductDialog` y `InventoryCatalogDrawer`; búsqueda en el catálogo; captura en recepción, conteo y salidas.
- Tests unitarios (incluido el dígito de control con casos válidos e inválidos reales), HTTP y de portal. E2E del flujo de captura.

**Documentales**
- `docs/informes/INFORME-MOD12-CATALOGO-CODIGO-BARRAS-F4-v1.0.md` con G6, G6.5 y G7 **registrados por separado** (ADR-069).
- Delta en sitio del HLD del catálogo si cambia algo aprobado (versión interna, no archivo nuevo).

---

## 6. Criterios de aceptación

Los siete del PRD §11.5, más tres de ejecución:

- **CA-F4-01:** un artículo puede crearse y editarse con o sin código de barras.
- **CA-F4-02:** dos artículos del mismo tenant no pueden compartir código; **el mensaje de error identifica el artículo que ya lo usa**.
- **CA-F4-03:** un `EAN13` o `UPCA` con dígito de control inválido se rechaza con un mensaje que explica el motivo.
- **CA-F4-04:** buscar por código de barras en el catálogo devuelve el artículo.
- **CA-F4-05:** en recepción, conteo y salidas, introducir el código selecciona el artículo sin búsqueda manual.
- **CA-F4-06:** los artículos existentes siguen operando sin código; la migración no los invalida.
- **CA-F4-07:** el SKU no cambia de rol ni de formato.
- **CA-F4-08:** `barcode` sin `barcode_type` (o al revés) se rechaza.
- **CA-F4-09:** dos tenants distintos pueden tener el mismo código sin conflicto.
- **CA-F4-10:** `down()` de la migración verificado: revierte sin pérdida de otros datos.

## 7. Criterio de stop/go

**Detenerse inmediatamente si:**
- Apareciera la necesidad de más de un código por artículo, o de códigos por lote o serie — es alcance excluido en §11.3 y cambia el modelo.
- El código de barras tuviera que participar en la generación del SKU o sustituirlo.
- La unicidad por tenant resultara insuficiente para un caso real de negocio.
- El trabajo colisionara con F1 o F5 en los mismos archivos sin posibilidad de sincronizar.

**Documentar causa en:** `INFORME-MOD12-CATALOGO-CODIGO-BARRAS-F4-v1.0.md` §Bloqueos.
**Escalar a:** AI-EM-ARCH con etiqueta `[BLOQUEO]` antes de cerrar la sesión (protocolo §3).

## 8. Criterio de salida

- **Backend:** `pnpm --filter @iwana/api exec jest src/modules/inventory/tests/inventory-item.service.spec.ts src/modules/inventory/tests/inventory.controller.http.spec.ts` en verde, **con `Cached: 0`**.
- **Base de datos:** migración aplicada y **`down()` probado**; `pnpm --filter @iwana/db typecheck` en verde.
- **Frontend:** specs de `InventoryCreateProductDialog`, `InventoryCatalogDrawer` y de los flujos de captura en verde.
- **E2E:** `pnpm exec playwright test e2e/tests/portal-inventory-scm.spec.ts`. **Aviso:** el caso «crea producto comprable en catalogo» está **roto de forma preexistente** — verificar A/B con `git stash`.
- **Calidad:** `pnpm --filter @iwana/portal typecheck && pnpm lint`; `audit-ui.mjs` P0/P1 = 0.
- **Gates:** G6, G6.5 (corrida Linux de CI por SHA) y G7 registrados por separado (ADR-069).

---

## Impacto declarado (AI-EM-ARCH)

- **Multi-tenant:** columna en schema tenant; unicidad **por tenant**, nunca global.
- **Seguridad:** sin cambio de superficie; permisos vigentes del catálogo. **Un código de barras no es PII.**
- **Escala:** un índice parcial más sobre una tabla pequeña frente a las de movimientos. Sin impacto en consultas existentes.
- **Regulación:** ninguna. El código del fabricante **no** es dato fiscal, **no** es la partida arancelaria y no sustituye identificación tributaria. Si en el futuro se exigiera identificación de producto ante la DIAN, se marca «requiere verificación con fuente oficial» y escala al CTO.
- **Boundaries:** ninguno cruzado. El dato es de MOD12 y ningún otro bounded context lo consume.
