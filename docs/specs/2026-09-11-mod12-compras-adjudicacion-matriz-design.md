# MOD12 Compras — Adjudicación por cotización: matriz productos × cotizaciones

**Version:** 1.0
**Estado:** Diseño aprobado — **contrato de componente congelado**
**Fecha:** 2026-09-11
**Modo activo:** Product Architect + Architect
**Autor:** AI-EM-ARCH · **Review UX:** AI-PROD-UX · **Contrato DS:** AI-DS-OWNER
**Modulo:** MOD12 Inventario / SCM — Compras · **Fase:** 30
**Superficie:** `apps/portal` — `/dashboard/inventory?tab=purchasing` → workbench de solicitud → tab `awards`
**PRD:** docs/prds/PRD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md (Aprobado) — RF-CMP-06
**ADR:** ADR-087 (propuesto) — docs/adrs/ADR-087-Cobertura-Adjudicacion-Derivada-Compras.md, G1 pendiente
**Contrato de API:** packages/shared/src/contracts/inventory/purchase-award-matrix.contract.ts (a congelar por AI-SR-FULL)
**Sustituye a:** la pantalla descrita en docs/specs/2026-07-17-mod12-compras-oc-multiproveedor-adjudicacion-fase20-design.md, que queda **superada** en su sección de interfaz (el modelo de datos de esa spec sigue vigente)

---

## 1. Problema

El CTO necesita, al revisar las cotizaciones de una solicitud, **marcar producto a producto dentro de
cada cotización** (uno, dos o todos) y que salga **una orden de compra por proveedor**.

> Caso canónico: productos P1..P4; cotizaciones Q1 (proveedor 1) y Q2 (proveedor 2). Se adjudican P1
> y P3 al proveedor 1, P2 y P4 al proveedor 2. Resultado: **dos órdenes de compra**, cada una con sus
> dos productos.

La pantalla actual (`AwardLinesPanel.tsx`) tiene el **eje invertido**: presenta una tarjeta colapsable
por *línea de solicitud* y, dentro de cada una, pide elegir la cotización mediante chips y un
`SupplierPicker`. No existe checkbox ni selección múltiple en todo el panel. Para adjudicar «dos
productos a este proveedor» hay que entrar línea por línea y pulsar el chip correcto en cada una,
dejando el resto en blanco. La agrupación por proveedor solo se ve **después** de persistir, ya en
`PurchaseOrderDrawer`.

## 2. Alcance

**Entra:** selección producto-a-producto por cotización; exclusividad de proveedor por producto;
resumen en vivo por proveedor antes de confirmar; revocación de una adjudicación antes de la orden;
estados de bloqueo para lo ya adjudicado y lo ya ordenado.

**No entra:** partir la cantidad de un producto entre dos proveedores en tipos distintos de `PROJECT`
(la regla de `validateLineAward` **no se toca**); edición de cotizaciones desde la matriz;
consolidación de productos de varias solicitudes en una misma orden; virtualización de filas;
primitivas `Table` o `Checkbox` nuevas en `@iwana/ui`.

## 3. Decisión de forma: matriz, con acordeón como rendering alterno

Se evaluaron dos formas.

**Paneles por cotización** (un acordeón por proveedor con checkboxes de sus productos dentro) es la
transcripción literal de la frase del CTO. Se descarta como forma primaria: la regla «un producto = un
proveedor» es una restricción **de fila**, y en paneles la fila queda repartida entre acordeones.
Marcar P1 en Q1 y después en Q2 obliga a replicar el estado «ya adjudicado» en cada panel, y comparar
el precio de P1 entre dos cotizaciones exige scroll y memoria. El conflicto se detecta siempre
*después* del clic.

**Matriz productos × cotizaciones** (filas = líneas de solicitud, columnas = cotizaciones, celda =
precio + control de selección) convierte la exclusividad en **estructura**: cada fila es un
`radiogroup` con un solo control marcable, y violar la regla deja de ser posible. La comparación de
precio por producto es una lectura horizontal. El pie de columna es el total en vivo de ese proveedor.

**Decisión: matriz primaria + acordeón como rendering alterno del mismo estado.** El gesto que pidió
el CTO se recupera en el **encabezado de columna**: un control que adjudica en bloque los productos
que esa cotización cubre y que aún están libres. Así se puede trabajar columna a columna —el modelo
mental del usuario— sin que la exclusividad dependa de una validación.

Sustento de dato: `supplier_quote_lines` tiene índice único `(supplierQuoteId, purchaseRequestLineId)`,
de modo que la relación cotización × producto **ya es 1:1 por construcción**. La matriz no es una
interpretación del dato: es su forma natural.

**Conmutación a acordeón:** automática con más de 3 cotizaciones o viewport `< 1024px`; manual con un
conmutador siempre visible. Ambos renderings consumen el mismo modelo de estado de `award-matrix.ts`.

---

## 4. Anatomía de la pantalla

### 4.1 Cabecera

`PortalSectionHeader` con `eyebrow="Adjudicación"`, título **«Adjudicar productos a proveedores»** y
descripción que indica cuántas cotizaciones se comparan y la fecha de validez más próxima.

A la derecha, `DropdownMenu` de acciones secundarias con **«Adjudicar a proveedor sin cotización»**
(ver §7).

### 4.2 Matriz

| Zona | Contenido |
| --- | --- |
| Columna fija izquierda | **Producto**: nombre + SKU + cantidad solicitada + unidad de medida |
| Columna por cotización | Encabezado: proveedor, número de cotización, moneda, total pagadero (`payableAmount`) y control de selección de columna |
| Celda | Costo unitario e importe de línea, o el estado que corresponda (§4.3) |
| Columna derecha | **Cantidad adjudicada** — solo lectura salvo `requestType === PROJECT` |
| Pie de columna | Subtotal en vivo del proveedor y número de productos marcados |

La columna de cantidad replica exactamente el `lockQuantity` actual de `AwardLinesPanel`: editable
solo en solicitudes de tipo Proyecto, con el texto de ayuda «En este tipo de compra la adjudicación
cubre la cantidad total.» Conservar esta paridad es la condición para poder eliminar el panel viejo
sin regresión funcional.

### 4.3 Estados de celda

| Estado | Render | Interacción | Token |
| --- | --- | --- | --- |
| `sin-cotizar` | «—», tono atenuado, `aria-label="Sin cotizar"` | no seleccionable | `text-iwana-secondary-700` sobre fondo base |
| `disponible` | costo unitario + importe; chip «Más barato» si aplica (§6) | seleccionable | fondo base, borde `border-gray-200 / dark:border-dark-border` |
| `seleccionado` | celda resaltada, control marcado | deseleccionable | fondo `bg-iwana-primary/5`, borde `border-iwana-primary` |
| `adjudicado` | chip «Adjudicado» | bloqueado; acción «Revocar» | `Badge variant="success"` |
| `ordenado` | chip «Ordenado» | bloqueado duro, sin revocar | `Badge variant="neutral"` |

Una fila en `adjudicado` u `ordenado` es inmutable ante cualquier acción de columna: «seleccionar
todo» nunca roba una fila ya tomada.

### 4.4 Resumen en vivo

Barra inferior fija, patrón `PortalActionToolbar` como en `PurchaseSelectionBar.tsx`, con
`role="status"` y `aria-live="polite"`:

- «3 de 4 productos adjudicados · 1 pendiente»
- Una píldora por proveedor: «Proveedor 1 · 2 productos · $ 1.234.000»
- **«Se generarán 2 órdenes de compra»** — texto que debe coincidir palabra por palabra con el que ya
  muestra `PurchaseOrderDrawer` en su previsualización batch, para que el usuario reconozca la
  continuidad entre ambas pantallas.
- CTA primaria **«Adjudicar y continuar»** (deshabilitada con cero selecciones) y secundaria
  **«Guardar adjudicación»** (persiste sin avanzar al drawer de órdenes).

Cuando la CTA está deshabilitada debe explicar por qué. Hoy el botón «Adjudicar líneas»
simplemente **desaparece** si no hay drafts válidos, sin decir nada: eso no se replica.

### 4.5 Estados de excepción

| Situación | Render |
| --- | --- |
| Sin cotizaciones | `PortalEmptyState` — «Sin cotizaciones para comparar» / «Registra al menos una cotización antes de adjudicar.» con CTA al tab Cotizar |
| Sin líneas de catálogo | `PortalEmptyState` — «Sin productos adjudicables» / «Solo los productos de catálogo se pueden adjudicar en esta etapa.» |
| Solicitud no aprobada | Texto informativo: «La adjudicación solo está disponible cuando la solicitud está aprobada.» |
| Monedas mixtas | `PortalAlert variant="info"` — «Las cotizaciones están en monedas distintas: la comparación de precios está desactivada.» |
| Carga | `PortalSkeletonBlock` con el número de filas conocido |
| Error de servidor | `PortalAlert variant="error"` con título «No se pudo adjudicar» |

---

## 5. Contrato de componente (CONGELADO)

Cualquier cambio a esta sección exige nueva versión de esta spec y notificación a los tracks
afectados (protocolo §3bis, regla 1).

### 5.1 Componentes y ubicación

Todos bajo `apps/portal/src/components/inventory/`:

| Componente | Responsabilidad |
| --- | --- |
| `AwardMatrixPanel.tsx` | Contenedor: estados de excepción, conmutación matriz↔acordeón, diálogo de revocación, escotilla sin cotización |
| `AwardMatrixTable.tsx` | La matriz. Fila memoizada, como `StockIssueDraftLinesTable` |
| `AwardQuoteAccordion.tsx` | Rendering alterno por cotización |
| `AwardSelectionBar.tsx` | Resumen en vivo y CTAs |
| `award-matrix.ts` | **Lógica pura, sin React.** Sede del grueso de la cobertura de tests |

### 5.2 Props

```
AwardMatrixPanel
  detail: PurchaseRequestDetailRecord      // ya incluye lines, quotes(+lines), awards, orders
  items: InventoryItemRecord[]
  supplierLabels?: Record<string, string>
  disabled?: boolean
  error?: string | null
  onDraftsChange?: (drafts: PurchaseRequestLineAwardInput[]) => void
  onRevokeAward?: (awardId: string) => Promise<void>

AwardMatrixTable
  rows: AwardMatrixRow[]
  columns: AwardMatrixQuoteColumn[]
  canEdit: boolean
  quantityEditable: boolean                // true solo si requestType === PROJECT
  onToggleCell: (lineId: string, quoteId: string) => void
  onToggleColumn: (quoteId: string) => void
  onQuantityChange?: (lineId: string, value: string) => void
  onRevokeRequest?: (awardId: string) => void

AwardSelectionBar
  summaries: AwardSupplierSummary[]
  pendingCount: number
  totalCount: number
  currencyMixed: boolean
  submitting: boolean
  onSubmit: () => void
  onSaveOnly: () => void
```

Los tipos vienen del contrato de API congelado
(`packages/shared/src/contracts/inventory/purchase-award-matrix.contract.ts`). El portal **no** define
tipos paralelos.

### 5.3 Funciones de `award-matrix.ts`

`buildAwardMatrix(detail, items)` · `toggleCell(state, lineId, quoteId)` ·
`assignQuoteColumn(state, quoteId)` · `moveAwardToQuote(state, lineId, quoteId)` ·
`summarizeBySupplier(state)` · `validateMatrixSelection(state)` · `toCreateAwardsDto(state)`

Invariante que estas funciones garantizan: **un `purchaseRequestLineId` aparece como máximo una vez
en el resultado de `toCreateAwardsDto`**. La exclusividad se resuelve en el modelo, no en el render.

### 5.4 Primitivas de UI

`@iwana/ui` **no exporta `Table` ni `Checkbox`**, y esta fase **no los añade**. Se usan las recetas ya
vigentes en el portal:

- Tabla: `portalDataTableShell` / `portalDataTableHead` / `portalDataTableCell` /
  `portalTableRowHoverClassName` de `@/components/shared/portal-ui`.
- Control de selección de celda: `<input type="radio">` dentro del `radiogroup` de la fila.
- Control de selección de columna: `<input type="checkbox" className="h-4 w-4 rounded border-gray-300 accent-iwana-primary {interactiveFocusClassName}">`, idéntico al de
  `PurchaseDraftLinesTable.tsx` y `StockIssueDraftLinesTable.tsx`.
- De `@iwana/ui`: `Badge`, `Button`, `Dialog`, `DropdownMenu`, `Input`, `SectionAccordion`, `cn`.

---

## 6. Reglas de negocio en la interfaz

1. **Un producto, un proveedor.** Marcar P1 en Q2 teniéndolo en Q1 lo **mueve**, no lo duplica. Sin
   diálogo de confirmación: el movimiento es reversible y el resumen en vivo refleja el cambio.
2. **Cantidad.** Bloqueada e igual a la solicitada salvo en `PROJECT`. La interfaz **no** ofrece
   repartir cantidad entre proveedores fuera de `PROJECT`; intentarlo sería contradecir
   `validateLineAward`, que rechazaría la operación en servidor.
3. **Monedas mixtas.** Se preserva íntegra la regla vigente de `quotesShareCurrency`: sin moneda común
   no se ordena por precio, no se marca «Más barato» y el resumen muestra un total **por moneda**.
   Perder esta regla sería un error de negocio, no de presentación — comparar USD contra COP por su
   valor numérico induce una recomendación falsa.
4. **Costo unitario visible al adjudicar.** La celda muestra el costo que efectivamente se usará. Si
   una cotización no cubre un producto, la celda es `sin-cotizar`, nunca un cero silencioso.
5. **Revocar** solo es posible mientras no exista línea de orden viva para ese producto y proveedor;
   el servidor es la autoridad y responde `AWARD_ALREADY_ORDERED`. La interfaz pide confirmación en
   `Dialog` porque la acción borra trabajo del usuario.

---

## 7. Escotilla: adjudicar a proveedor sin cotización

La matriz solo ofrece proveedores que cotizaron. `AwardLinesPanel` permite hoy adjudicar a cualquier
proveedor mediante `SupplierPicker` libre; eliminarlo sin reemplazo sería una regresión silenciosa
para compras directas.

Se conserva como **acción secundaria de baja prominencia**: `DropdownMenu` de la cabecera → «Adjudicar
a proveedor sin cotización» → `Dialog` con `SupplierPicker` (componente existente), selección de
producto, cantidad y costo unitario obligatorio. Este es el **único** camino en el que el costo
unitario lo aporta el cliente; en todos los demás lo deriva el servidor.

---

## 8. Accesibilidad (WCAG 2.2 AA)

- Cada fila de producto es un `radiogroup` con `aria-label` que nombra el producto. Cada celda
  seleccionable es un `radio` con `aria-label` que nombra **producto y proveedor** — «Adjudicar
  Router X a Proveedor 1» —, nunca solo «Seleccionar».
- Navegación: `Tab` entre filas, flechas entre celdas dentro de una fila (comportamiento nativo de
  `radiogroup`). El control de columna entra en el orden de tabulación del encabezado.
- El resumen usa `role="status"` con `aria-live="polite"`: cada cambio de selección se anuncia sin
  interrumpir.
- Foco visible mediante `interactiveFocusClassName` en todo control interactivo.
- Objetivo táctil mínimo **24 × 24 px CSS** (WCAG 2.2 AA, criterio 2.5.8); las celdas de la matriz
  amplían el área activa al conjunto de la celda, no solo al control.
- La tabla desplaza en horizontal dentro de su propio contenedor; el cuerpo de la página nunca lo hace.
- Contraste: texto sobre blanco usa `iwana-secondary-700`, nunca tonos más claros.
- El estado de una celda **nunca** se comunica solo por color: `adjudicado` y `ordenado` llevan texto
  en el `Badge`.

---

## 9. Vocabulario visible

Español, sentence case, sin enums crudos. Etiquetas de `awardCoverage` en `inventory-labels.ts`:

| Valor | Etiqueta |
| --- | --- |
| `NOT_AWARDED` | Sin adjudicar |
| `PARTIALLY_AWARDED` | Adjudicación parcial |
| `FULLY_AWARDED` | Adjudicada |
| `PARTIALLY_ORDERED` | Órdenes parciales |
| `FULLY_ORDERED` | Órdenes generadas |

Revisión obligatoria con la skill `system-vocabulary-review` antes de cerrar G6.

---

## 10. Cambios en superficies adyacentes

| Archivo | Cambio |
| --- | --- |
| `PurchaseRequestWorkbenchDrawer.tsx` | El tab `awards` renderiza `AwardMatrixPanel`. El identificador del tab en `purchase-workbench.ts` **no cambia** |
| `QuoteComparisonPanel.tsx` | Recibe `requestLines` e `items` (props opcionales, compatibles hacia atrás) para mostrar nombre y SKU — hoy lista precios sin decir de qué producto son. CTA «Adjudicar productos de esta cotización» que salta a la matriz con esa columna enfocada, patrón `line-focus.ts` |
| `purchase-workbench.ts` | `getPurchaseNextAction` aprende `awardCoverage`: con `PARTIALLY_ORDERED` indica cuántos productos quedan por adjudicar |
| `purchase-orders-from-awards.ts` | Guarda de moneda; se elimina el fallback silencioso a costo cero (`unitCostSource: 'missing'`) |
| `AwardLinesPanel.tsx` + `.spec.tsx` | **Se eliminan**, con la escotilla de §7 preservada |

---

## 11. Criterios de aceptación de UX

- **CA-UX-01** — Marcar P1 y P3 en Q1 y P2 y P4 en Q2 deja el resumen en «2 proveedores · 4 productos» y «Se generarán 2 órdenes de compra».
- **CA-UX-02** — Marcar P1 en Q2 teniéndolo en Q1 lo mueve; nunca queda marcado en dos columnas.
- **CA-UX-03** — El control de columna adjudica solo los productos libres que esa cotización cubre; no toca los ya adjudicados ni ordenados.
- **CA-UX-04** — Con dos monedas distintas no hay chip «Más barato» ni orden por precio, y el resumen separa totales por moneda.
- **CA-UX-05** — Adjudicar 2 de 4 productos y generar la orden deja la solicitud abierta, con los 2 restantes adjudicables al reabrir.
- **CA-UX-06** — Una celda de un producto ya ordenado no responde a ninguna acción de selección.
- **CA-UX-07** — Con cero selecciones la CTA está deshabilitada **y explica por qué**.
- **CA-UX-08** — Pasada axe sin violaciones sobre matriz y acordeón; recorrido completo con teclado.
- **CA-UX-09** — Con más de 3 cotizaciones la vista conmuta a acordeón conservando la selección.
- **CA-UX-10** — La escotilla de proveedor sin cotización sigue disponible y persiste correctamente.

---

## 12. Referencias

- `apps/portal/src/components/inventory/AwardLinesPanel.tsx` — pantalla que se sustituye
- `apps/portal/src/components/inventory/PurchaseDraftLinesTable.tsx` — patrón de selección por fila reutilizado
- `apps/portal/src/components/inventory/StockIssueDraftLinesTable.tsx` — patrón de fila memoizada
- `apps/portal/src/components/inventory/PurchaseSelectionBar.tsx` — patrón de barra de selección
- `docs/specs/2026-07-25-searchable-picker-ds-contrato.md` (v1.1) — contrato de `SupplierPicker`
- ADR-087 (propuesto) — `docs/adrs/ADR-087-Cobertura-Adjudicacion-Derivada-Compras.md` — eje de cobertura
