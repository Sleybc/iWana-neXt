# PROMPT DE EJECUCIÓN — MOD12 Catálogo · F2 · Sanear el alta de producto y el copy engañoso

**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` v1.2 *(en revisión — la regla de destino la respalda `AGENTS.md` → Documentation Rules)*
**Generado por:** AI-EM-ARCH (modo Orchestrator)
**Fecha:** 2026-09-02
**Versión:** 1.0

## Módulo

- **Nombre:** Inventario / SCM — alta de producto y veracidad de copy
- **Código:** MOD12 (`/dashboard/inventory?tab=catalog`, drawer «Nuevo producto»)
- **Fase:** F2 — corrección de defecto con daño permanente + saneamiento de textos falsos
- **Destinatarios:** **AI-PROD-UX** (copy y orden) → **AI-FE-PLATFORM** (implementación)
- **Puede correr en paralelo con F1.** Barata y de alto retorno: **cada producto creado mientras esto no se corrija recibe un SKU degradado irreversible.**

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** que quien crea un producto vea marca y modelo **antes** de que se le proponga
un código, entienda que esos datos forman parte del código de forma permanente, y que la aplicación
deje de afirmar cosas que no hace.

### Defecto 1 — Marca y modelo escondidos tras un copy falso (daño permanente)

`apps/portal/src/components/inventory/InventoryCreateProductDialog.tsx:401-433`: marca, modelo y
descripción viven en un `<details>` **colapsado por defecto**, rotulado *«Agregar descripción, marca
y modelo»* con el subtítulo *«Estos datos son opcionales y puedes completarlos más adelante»*.

Ese subtítulo es **falso en la parte que importa**:

1. Marca y modelo son los segmentos 4 y 5 del SKU compuesto; si vienen vacíos, `.filter()` los
   elimina (`packages/shared/src/inventory/inventory-item-sku.ts:137-147`).
2. El SKU **solo se genera en `create`** — `UpdateInventoryItemSchema` no lo acepta y el input está
   `disabled` en el drawer de edición, con el mensaje «El código no se puede modificar después de
   crear el producto».
3. Por tanto **no se pueden «completar más adelante» y recuperar el código**: el producto queda
   permanentemente con `CAT-TIPO-NOMBRE`, tres segmentos en vez de cinco.

Agravantes: la vista previa «Código sugerido» se renderiza en L389-399, **antes** del acordeón — el
usuario ve un código y un mensaje tranquilizador sin motivo para expandir nada. Y al perder dos
segmentos discriminantes, dos productos de la misma categoría, tipo y nombre parecido colisionan y
caen en el sufijo `-001`, `-002`, degradando aún más el maestro.

### Defecto 2 — La aplicación promete contabilidad que no existe

`StockIssueComposer.tsx:590` y `StockIssueFormDrawer.tsx:234` muestran *«El movimiento contable se
genera al despachar»*. **No existe contabilidad en el sistema**: `grep` de
`accountingAccount|cuenta contable|PUC|ledgerAccount|chartOfAccount` sobre todo el repositorio
devuelve **cero ocurrencias**, y la normativa la difiere explícitamente
(`ADR-048` la asigna a Billing/ERP futuro; `ADR-059` acota la valoración a «operativa, sin pretender
contabilidad fiscal»; `PRD-MOD12` §2 excluye NIIF e integración ERP).

Es un defecto de veracidad: crea en el usuario la expectativa de un dominio que el producto no tiene.

### Defecto 3 — Swagger describe un formato de SKU que ya no existe

`apps/api/src/modules/inventory/dto/index.ts:506-507` documenta `sku` como
`{prefijo-categoria}-NNNNNN`, el formato **v1** superado por el SKU compuesto de
[ADR-INV-SKU-COMPUESTO](../adrs/ADR-INV-SKU-COMPUESTO-v1.md) (**Aprobado**, 2026-07-02).

**Lo que no entra:** añadir campos nuevos al alta más allá de reubicar los existentes (los atributos
de compras/inventario/activos son F1); tocar el modelo de datos; regenerar SKU ya emitidos (eso
depende del diagnóstico de F3).

---

## 2. Artefactos de entrada obligatorios

- **ADR:** `ADR-INV-SKU-COMPUESTO-v1.md` (**Aprobado**) — formato `{CAT}-{TIPO}-{NOMBRE}-{MARCA}-{MODELO}`; «MARCA y MODELO se omiten si no están disponibles»; «`sku` sigue siendo inmutable tras la creación».
- **Spec:** `docs/specs/2026-07-01-inventory-item-sku-compuesto-design.md` — presupuesto de segmentos.
- **PRD:** `docs/prds/PRD-MOD12-CATALOGO-MAESTRO-ARTICULOS-v1.0.md` (**Aprobado**) — RF-CAT-05 exige persistir marca y modelo; RF-CAT-02 permite buscar por ellos.
- **Informes de SKU:** `INFORME-INVENTORY-SKU-AUTOGENERADO-v1.md` y `-v2.md`.
- **Informe de la Fase A del drawer:** `INFORME-INVENTORY-CATALOGO-DRAWER-NUEVO-PRODUCTO-v1.0.md` — la Fase A migró el modal a drawer **con contrato congelado**, sin añadir campos; H4/H5 siguen abiertos en Fase B **Propuesta** (no tocar).
- **Normativa contable (para el defecto 2):** `ADR-048`, `ADR-059`, `PRD-MOD12-INVENTARIO-SCM-v1.0.md` §2, `docs/roles/Anexo_Regulatorio_Integraciones_ISP.md`.

---

## 3. Definición funcional de entrada (AI-EM-ARCH) — el qué, no el cómo

**D1 · Marca y modelo deben verse antes de la vista previa del código.** Sacarlos del acordeón, o
abrirlo por defecto, o reordenar: la solución concreta es de PROD-UX. La restricción funcional es
única y no negociable: **el usuario debe poder rellenarlos antes de que se le proponga un SKU.**

**D2 · El copy debe decir la verdad.** El texto tiene que transmitir dos hechos: marca y modelo
**forman parte del código del producto**, y **el código no podrá cambiarse después**. La descripción
sí es completable más adelante, así que no debe agruparse con ellos bajo la misma promesa.

Prohibido: cualquier redacción que insinúe que marca y modelo pueden completarse después sin
consecuencia. Esa es exactamente la afirmación falsa que se corrige.

**D3 · La vista previa del código va después de los campos que la alimentan** (categoría, tipo,
nombre, marca, modelo).

**D4 · Retirar la promesa de contabilidad.** Sustituir «El movimiento contable se genera al
despachar» por una descripción veraz de lo que sí ocurre: el movimiento de inventario y la
valoración operativa al despachar. Vocabulario disponible en `inventory-labels.ts:815-816`, que ya lo
dice correctamente: *«Se actualiza al recibir compras. Es la referencia para valorar existencias y
registrar el costo en salidas.»* — y en `inventory-labels.ts:820`: *«Estimación operativa, no contable
ni fiscal.»*

**D5 · Corregir la descripción Swagger de `sku`** al formato compuesto vigente.

---

## 4. Restricciones no negociables

1. **No cambiar el algoritmo del SKU** ni su inmutabilidad (`ADR-INV-SKU-COMPUESTO`, Aprobado).
2. **No hacer marca y modelo obligatorios** sin decisión de producto: el ADR los declara opcionales
   («se omiten si no están disponibles»). Hacerlos requeridos **contradice el ADR** y exigiría
   enmienda. Lo que esta fase corrige es que estén **escondidos y mal explicados**, no su opcionalidad.
3. **No tocar el modelo de datos, DTO, entidad ni migraciones** — salvo la cadena de descripción
   Swagger de D5, que es documentación, no contrato.
4. **No agravar H4/H5** (capas Z / consolidación side-peek, ADR-075, Fase B pendiente de CTO).
5. Preservar lo que la Fase A entregó: `useDiscardChangesGuard`, `usePortalSideDrawerA11y`,
   `PortalDiscardChangesDialog`, el reset al abrir y la autoselección de la primera categoría activa.
6. Preservar la creación inline de categoría y su autosugerencia de prefijo (debounce 300 ms).
7. El copy nuevo pasa por el vocabulario del portal: sin términos técnicos internos, en español con
   acentuación correcta.

---

## 5. Entregables

**Técnicos**
- `apps/portal/src/components/inventory/InventoryCreateProductDialog.tsx` — orden, acordeón y copy.
- `apps/portal/src/components/inventory/StockIssueComposer.tsx:590` y `StockIssueFormDrawer.tsx:234` — copy contable.
- `apps/api/src/modules/inventory/dto/index.ts:506-507` — descripción Swagger de `sku`.
- Tests: `InventoryCreateProductDialog.spec.tsx`; specs de los composers de salidas si asertan ese texto.

**Documentales**
- `docs/informes/INFORME-MOD12-CATALOGO-ALTA-COPY-F2-v1.0.md` — antes/después de cada texto, evidencia de gates.
- Actualizar `INFORME-INVENTORY-CATALOGO-DRAWER-NUEVO-PRODUCTO-v1.0.md` (**es corrección de un informe vigente: actualizarlo, no crear otro** — regla de la plantilla §6).

---

## 6. Criterios de aceptación

- **CA-F2-01:** al abrir «Nuevo producto», marca y modelo son visibles sin interacción adicional, **antes** de la vista previa del código.
- **CA-F2-02:** ningún texto del diálogo afirma que marca o modelo puedan completarse más adelante sin consecuencia.
- **CA-F2-03:** el copy explicita que forman parte del código y que el código no podrá cambiarse después.
- **CA-F2-04:** la vista previa «Código sugerido» aparece después de los campos que la alimentan y refleja marca y modelo en vivo.
- **CA-F2-05:** crear un producto con marca y modelo produce un SKU de **cinco** segmentos.
- **CA-F2-06:** el texto «El movimiento contable se genera al despachar» no existe en el portal (`grep` = 0).
- **CA-F2-07:** el texto sustituto describe el movimiento de inventario y la valoración operativa, sin afirmar contabilidad ni efecto fiscal.
- **CA-F2-08:** la descripción Swagger de `sku` refleja el formato compuesto vigente.
- **CA-F2-09:** marca y modelo **siguen siendo opcionales** — se puede crear un producto sin ellos (ADR).
- **CA-F2-10:** `audit-ui.mjs` sobre los archivos tocados → P0 0, P1 0.

## 7. Criterio de stop/go

**Detenerse inmediatamente si:**
- La solución exigiera hacer marca y modelo obligatorios (contradice el ADR — escalar como propuesta de enmienda, no aplicarla).
- Hiciera falta cambiar el algoritmo del SKU o levantar su inmutabilidad.
- Fuera necesario tocar H4/H5 (ADR-075, Fase B pendiente de CTO).
- Al corregir el copy de salidas se descubriera que **sí** existe algún efecto contable en backend — en ese caso el hallazgo invierte el diagnóstico y debe escalarse antes de tocar nada.

**Documentar causa en:** `INFORME-MOD12-CATALOGO-ALTA-COPY-F2-v1.0.md` §Bloqueos.
**Escalar a:** AI-EM-ARCH con etiqueta `[BLOQUEO]` antes de cerrar la sesión.

## 8. Criterio de salida

- **Frontend validado:** `pnpm --filter @iwana/portal test src/components/inventory/InventoryCreateProductDialog.spec.tsx` en verde, **con `Cached: 0`**.
- **SKU sin regresión:** `pnpm --filter @iwana/shared test inventory-item-sku.spec.ts` en verde (no debe cambiar; es control).
- **Copy retirado:** `grep -r "movimiento contable" apps/portal/src` → 0 resultados.
- **E2E:** `pnpm exec playwright test e2e/tests/portal-inventory-scm.spec.ts`. **Aviso:** el caso «crea producto comprable en catalogo» ya está **roto de forma preexistente** — verificar A/B con `git stash` antes de atribuir nada a esta fase. Si esta fase lo **arregla**, decirlo explícitamente en el informe.
- **Calidad:** `pnpm --filter @iwana/portal typecheck && pnpm lint` en verde; `audit-ui.mjs` P0/P1 = 0.
- **Documentación archivada:** informe F2 + actualización del informe del drawer.

---

## Impacto declarado (AI-EM-ARCH)

- **Multi-tenant:** sin impacto.
- **Seguridad:** sin impacto — no toca permisos ni superficies de autorización.
- **Escala:** sin impacto.
- **Regulación:** **mejora de veracidad.** Retirar la afirmación de «movimiento contable» alinea la UI con la normativa vigente, que difiere lo contable y fiscal a Billing/ERP futuro y exige marcar como «requiere verificación con fuente oficial» todo requisito DIAN no confirmado.
- **Calidad del dato maestro:** es el punto central. Cada producto creado antes de esta corrección recibe un SKU degradado **irreversible**; la fase detiene la acumulación de ese daño. El inventario ya acumulado se mide en F3.
