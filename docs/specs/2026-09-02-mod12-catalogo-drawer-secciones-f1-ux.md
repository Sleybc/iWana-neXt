# Spec UX — MOD12 Catálogo · F1 · Secciones Compras, Inventario y Activos del drawer

**Fecha:** 2026-09-02
**Autor:** AI-PROD-UX (Product Designer / UX)
**Validación:** AI-DS-OWNER 2026-09-02 (ajustes A1-A4, §13) · implementación AI-FE-PLATFORM (F1 cerrada 2026-09-03)
**Estado:** Congelada con la aprobación de DS-OWNER
**Prompt maestro:** `docs/prompts/PROMPT-MOD12-CATALOGO-FASE-F1-SECCIONES-DRAWER-v1.0.md`

**Fuentes normativas (prevalecen sobre esta spec):**

- `docs/hlds/HLD-MOD12-CATALOGO-MAESTRO-ARTICULOS-v1.0.md` §7 — cinco secciones del drawer (Aprobado por CTO).
- `docs/specs/2026-06-25-mod12-catalogo-maestro-articulos-design.md` §4.2/§5 — grupos de atributos y reglas (Aprobado).
- `docs/adrs/ADR-085-Unidades-Medida-Catalogo-Canonico-Conversion.md` — restricción de secuencia que recorta esta fase.
- `docs/adrs/ADR-059` — `averageCost`/`lastPurchaseCost` jamás de captura.
- `docs/adrs/ADR-052` — `preferredSupplierRefId` es referencia lógica a MOD08, sin FK cross-module.
- `docs/adrs/ADR-075` — contrato de capas Z (no se toca la consolidación side-peek de H4/H5).
- Backend de referencia (leer, no tocar): `apps/api/src/modules/inventory/dto/index.ts` L197-334.

---

## 1. Resumen de la decisión

El drawer de edición de catálogo (`InventoryCatalogDrawer.tsx`) pasa de 3 secciones a las **cinco
secciones del HLD §7**, conservando intacto el bloque **Costos** de solo lectura. Se exponen **14
campos** nuevos, todos con primitivas existentes de `@iwana/ui` y `portal-ui.tsx`, sin componentes
nuevos, sin tokens nuevos, sin cambios de shell ni de capas Z.

**Recorte ADR-085 (no negociable):** `purchaseUnitOfMeasure` y `purchaseToBaseUomFactor` **no
aparecen** en esta fase — ni visibles, ni deshabilitados, ni como placeholder. Se detallan en §9.

---

## 2. Estructura del drawer (decisión AI-PROD-UX)

### 2.1 Orden de bloques (de arriba abajo)

| # | Bloque | Naturaleza | Cambio |
| --- | --- | --- | --- |
| 0 | Resumen meta (`dl` con Tipo · Categoría · Control de material · Estado) | solo lectura | Intacto |
| 1 | **Costos** (Costo promedio · Último costo de compra · Costo estándar) | solo lectura | Valores intactos; solo cambia la descripción del header (§6) |
| 2 | **Datos del producto** (= sección «general» del HLD §7) | edición | Existente; se retira el párrafo final (§8) |
| 3 | **Compras** (RF-CAT-06) | edición | **Nueva** — 8 campos |
| 4 | **Inventario** (RF-CAT-07) | edición | **Nueva** — 4 campos |
| 5 | **Activos** (RF-CAT-08) | edición | **Nueva** — 2 campos |
| 6 | **Relación comercial** | edición | Existente; se mueve al final |

Fundamento del orden: es el orden del HLD §7 (general → compras → inventario → activos → relación
comercial). Relación comercial queda al final por ser la menos operativa (hoy ya está después de
Datos del producto; el desplazamiento solo la pone tras las tres secciones nuevas). El bloque
Costos no pertenece a las cinco secciones del HLD: permanece como bloque de contexto de solo
lectura inmediatamente después del resumen, donde está hoy, para que el operador vea el costo
derivado antes de editar los costos de referencia.

La equivalencia «general» (HLD) = «Datos del producto» (código vigente) se mantiene con el título
actual: el alta (F2) ya usa ese título y el mismo concepto debe llamarse igual en ambos flujos.

### 2.2 Secciones siempre visibles — sin acordeón (decisión AI-PROD-UX)

Las tres secciones nuevas se renderizan **siempre visibles** con `PortalSectionHeader` + grids,
mismo patrón de las secciones existentes. **No** se usa `SectionAccordion`.

Razones:

1. **El daño que F1 corrige es invisibilidad.** Estos campos no eran establecibles desde ninguna
   pantalla; ocultarlos tras un acordeón reproduciría el problema en forma nueva (descubribilidad).
2. **Costo de plegado.** 5 acordeones con ~26 campos de edición obligan a un pase de abrir/cerrar
   por producto; en edición, el usuario suele venir por un solo grupo de campos (p. ej. stock
   mínimo) y el scroll con headers escaneables resuelve eso con menos pasos que el acordeón.
3. **Patrón vigente del drawer.** Las secciones existentes usan `PortalSectionHeader` + grid
   siempre visible; introducir acordeón solo en las secciones nuevas rompería la coherencia
   interna del mismo componente.

Evaluación de densidad (criterio de stop del prompt maestro §7): el cuerpo scrolleable queda en
~15-16 filas de campos ≈ 2,5 pantallas en desktop. Es un drawer de edición profunda con guard de
descarte y footer sticky: **usable**; el criterio de stop («drawer inusable → cambiar arquitectura
de navegación») **no se activa**. Si DS-OWNER discrepa, la alternativa es `SectionAccordion`
(existente en el portal, 3 consumidores) sobre las tres secciones nuevas con `keepMounted` —
decisión que corresponde a la validación de DS-OWNER, no a esta spec.

### 2.3 Header del drawer — ajuste de veracidad

El párrafo del header dice hoy «Edita los datos base del producto dentro del catálogo.» Ya no es
veraz: el drawer edita compras, inventario y activos. **Copy nuevo (decisión AI-PROD-UX):**

> Edita los datos del producto: identificación, compras, inventario, activos y relación comercial.

### 2.4 Grids por sección

Mismo patrón responsive del drawer: `grid gap-4 md:grid-cols-2` (2 columnas en tablet+) y hasta
3 columnas en xl para filas de tres campos cortos, igual que el bloque Costos
(`xl:grid-cols-3`).

---

## 3. Campos — control, label, ayuda y validación (14)

Convenio: los helperText son **copy exacto** para FE. Todos los labels en español, sentence case.
«Control de material» en el resumen meta y en Datos del producto no cambia.

### 3.1 Sección Compras

**Header:** título `Compras` — descripción: «Define si el producto se puede comprar y sus condiciones de abastecimiento.»

| Campo | Control | Label exacto | helperText exacto | Validación cliente |
| --- | --- | --- | --- | --- |
| `purchasable` | `CheckboxCard` (`label` + `description`) | «Comprable» | «Si lo activas, el producto aparece en el selector de compras.» | Ninguna. Default al crear: activado |
| `preferredSupplierRefId` | `Select` (ver §7: degradación sin permiso) | «Proveedor preferido» | Con permiso: «Proveedor que el sistema sugiere en solicitudes de compra.» | Ninguna. Opcional; primera opción «Sin proveedor preferido» |
| `supplierSku` | `Input` texto | «Código del proveedor» | «Referencia con la que el proveedor identifica este producto.» | Máx 80 caracteres (backend `optionalTrimmedString(80)`); trim al enviar |
| `baseCost` | `Input` texto con `inputMode="decimal"` | «Costo base» | «Costo de compra de referencia para este producto.» | ≥ 0 en blur; error: «El costo no puede ser negativo.» Vacío → 0 al enviar |
| `standardCost` | `Input` texto con `inputMode="decimal"` | «Costo estándar» (mismo string que el bloque Costos) | «Costo de referencia para valoración y compras. Se muestra también en la sección Costos.» | ≥ 0 en blur; error: «El costo no puede ser negativo.» Vacío → 0 al enviar |
| `minimumOrderQty` | `Input` texto con `inputMode="decimal"` | «Cantidad mínima de compra» | «Cantidad mínima que el proveedor acepta por pedido.» Opcional. | > 0 en blur si viene dato; error: «Debe ser mayor que cero.» Vacío → null |
| `orderMultiple` | `Input` texto con `inputMode="decimal"` | «Múltiplo de compra» | «El pedido se ajusta a múltiplos de esta cantidad.» Opcional. | > 0 en blur si viene dato; error: «Debe ser mayor que cero.» Vacío → null |
| `leadTimeDays` | `Input` texto con `inputMode="numeric"` | «Tiempo de entrega (días)» | «Días entre que se hace el pedido y se recibe el producto.» Opcional. | Entero ≥ 0 en blur; error: «Debe ser un número entero mayor o igual a cero.» Vacío → null |

Nota de vocabulario: «Punto de reorden» va sin tilde, alineado con `REPLENISHMENT_CRITICALITY_LABELS`
(«Bajo reorden») y el mensaje del backend.

### 3.2 Sección Inventario

**Header:** título `Inventario` — descripción: «Define si el producto se controla en bodega y sus niveles de referencia.»

| Campo | Control | Label exacto | helperText exacto | Validación cliente |
| --- | --- | --- | --- | --- |
| `inventoryControlled` | `CheckboxCard` | «Control de inventario» | «Actívalo si el producto se recibe, almacena y descuenta en bodegas.» | Ninguna. Default al crear: activado |
| `minimumStock` | `Input` texto con `inputMode="decimal"` | «Stock mínimo» | «Si las existencias bajan de este valor, el producto aparece en Productos bajo mínimo.» | ≥ 0 en blur; error: «No puede ser negativo.» Vacío → 0 al enviar |
| `reorderPoint` | `Input` texto con `inputMode="decimal"` | «Punto de reorden» | «Nivel de referencia para sugerir reposición.» | ≥ 0 en blur; error: «El punto de reorden no puede ser negativo.» (espejo del backend). Vacío → 0 |
| `targetStock` | `Input` texto con `inputMode="decimal"` | «Stock objetivo» | «Cantidad deseada en bodega cuando el producto está bien abastecido.» | ≥ 0 en blur; error: «No puede ser negativo.» Vacío → 0 |

«Stock mínimo» es el campo que revive StockLow (RF-INV-22) y con ello «Productos bajo mínimo» y el
panel de reposición: es el valor principal de F1. Su helperText enlaza con el nombre exacto del
widget de Vista general para cerrar el círculo causa→efecto.

### 3.3 Sección Activos

**Header:** título `Activos` — descripción: «Define si el producto se gestiona como activo y su vida útil.»

| Campo | Control | Label exacto | helperText exacto | Validación cliente |
| --- | --- | --- | --- | --- |
| `assetControlled` | `CheckboxCard` (regla cruzada: §8) | «Control de activo» | Normal: «Actívalo si el producto se gestiona como activo con ciclo de vida: asignación, instalación y baja.» Bloqueado: «Los productos con serial o activo fijo requieren control de activo.» | Ver §8 |
| `usefulLifeMonths` | `Input` texto con `inputMode="numeric"` | «Vida útil (meses)» | «Meses de vida útil esperada del activo. Alimenta las alertas de vencimiento.» Opcional. | Entero > 0 en blur si viene dato; error: «Debe ser un número entero mayor que cero.» Vacío → null |

### 3.4 Booleanos con `CheckboxCard` (decisión AI-PROD-UX + confirmar DS-OWNER)

Los tres booleanos usan `CheckboxCard` de `@iwana/ui` (prop `label` + `description`), la única
primitiva de selección booleana existente en el catálogo. La descripción de la card lleva el
helperText de la tabla; el estado deshabilitado de la primitiva ya pinta `opacity-60` y
`cursor-not-allowed`. No existe `Switch` en `@iwana/ui`: si DS-OWNER prefiriera switch, es una
primitiva nueva y debe solicitarla por el canal formal (no se inventa aquí).

### 3.5 Ningún campo nuevo es obligatorio

Los 14 campos tienen default u opcionabilidad en el schema backend (`nonNegativeNumber.default(0)`,
`.optional().nullable()`, etc.). El `canSubmit` del footer **no cambia** (sigue: nombre + unidad +
categoría). Guardar con las tres secciones en blanco es una operación válida y no debe bloquearse.

---

## 4. Resolución de la ambigüedad `standardCost` (decisión AI-PROD-UX)

`standardCost` es de **captura** en Compras (RF-CAT-06) y a la vez se **muestra** en el bloque
Costos. Decisión: **una sola cosa con una sola cara**, comunicada en los dos lugares:

1. **Mismo label exacto en ambos**: «Costo estándar» (se reutiliza `INVENTORY_STANDARD_COST_LABEL`
   de `inventory-labels.ts` en el input de captura). Mismo nombre para la misma cosa.
2. **helperText del input de captura** declara la relación: «Costo de referencia para valoración y
   compras. Se muestra también en la sección Costos.»
3. **Descripción del header de Costos** se amplía para explicar el origen de cada valor. Copy
   exacto que reemplaza al actual `INVENTORY_AVERAGE_COST_HELP_TEXT` en este drawer:

   > El costo promedio y el último costo de compra se actualizan al recibir compras. El costo estándar se captura en la sección Compras.

   (La constante `INVENTORY_AVERAGE_COST_HELP_TEXT` se usa en otras superficies: no cambiarla;
   definir el texto nuevo local al drawer o como constante nueva de `inventory-labels.ts`.)

4. **No** se elimina el valor del bloque Costos (el prompt maestro lo congela) y **no** se duplica
   el input dentro de Costos: una sola fuente de edición.

Con esto el usuario no puede leerlos como dos cosas distintas: el bloque de arriba explica de dónde
viene lo que muestra, y el campo de abajo dice dónde vive su edición.

---

## 5. Hidratación y envío — notas para AI-FE-PLATFORM

### 5.1 Tipos de `InventoryItemRecord` (api-client L7003-7041)

| Campos | Llegan como | Estado del form | Envío |
| --- | --- | --- | --- |
| `baseCost`, `standardCost`, `minimumStock`, `reorderPoint`, `targetStock` | `string` | `string` (valor crudo en el input) | `Number()` tras validación; vacío/invalido → `0` |
| `minimumOrderQty`, `orderMultiple` | `string \| null` | `string` (`''` si `null`) | `Number()` si hay dato; `''` → `null` |
| `leadTimeDays`, `usefulLifeMonths` | `number \| null` | `string` (`String(n)` o `''` si `null`) | `Number()` si hay dato; `''` → `null` |
| `purchasable`, `inventoryControlled`, `assetControlled` | `boolean` | `boolean` | `boolean` |
| `preferredSupplierRefId` | `string \| null` | `string` (`''` si `null`) | `''` → `null`; uuid válido |
| `supplierSku` | `string \| null` | `string` | trim; `''` → `null` |

### 5.2 `buildPayload` siempre completo (regla del update fusionado)

El `update` revalida el registro **fusionado** contra `CreateInventoryItemSchema`
(`inventory-item.service.ts:829-859`): un subconjunto incoherente puede fallar aunque cada campo
sea válido suelto. Por decisión de esta spec, `buildPayload` envía **siempre** los campos nuevos,
completos y coherentes desde el estado del form, sin importar cuáles tocó el usuario: los 10
actuales + los 14 nuevos. El dirty check (`catalogFormSignature`) sigue comparando el estado
completo del form contra el baseline, ahora con los 25 campos.

Casos límite definidos:

- **Sin permiso de compras:** `preferredSupplierRefId` viaja con el valor original del item, intacto
  (nunca se limpia por degradación visual; ver §7).
- **`assetControlled` bloqueado por regla cruzada:** viaja `true` (el form ya lo fuerza; §8).
- **Campos de compra con `purchasable=false`:** se envían igual; el backend no obliga a vaciarlos y
  la UI no los borra silenciosamente.

---

## 6. Copys que cambian (resumen)

| Dónde | Hoy | Nuevo copy exacto |
| --- | --- | --- |
| Header del drawer (L226-228) | «Edita los datos base del producto dentro del catálogo.» | «Edita los datos del producto: identificación, compras, inventario, activos y relación comercial.» |
| Fin de «Datos del producto» (L355-357) | «Compras, inventario y activos se administran desde sus secciones correspondientes.» | **Se elimina. Sin texto sustituto.** |
| Descripción del header de Costos | `INVENTORY_AVERAGE_COST_HELP_TEXT` | «El costo promedio y el último costo de compra se actualizan al recibir compras. El costo estándar se captura en la sección Compras.» |

El párrafo retirado (L355-357) queda obsoleto porque promete secciones que desde esta fase sí
existen: los propios `PortalSectionHeader` de Compras/Inventario/Activos son su reemplazo natural.
Poner otro párrafo puente duplicaría la señal.

---

## 7. Selector de proveedor — degradación sin permiso (decisión AI-PROD-UX)

La lista viene de `GET /purchasing/suppliers`, que exige `INVENTORY_PURCHASING_READ`; el drawer
opera bajo `INVENTORY_STOCK_MANAGE`. El permiso efectivo ya se calcula en `InventoryClient.tsx`
(L1247-1253, `usePermissions` + `canReadPurchasing` con degradación optimista mientras el estado
de permisos no está resuelto). **Regla dura: el fetch de proveedores solo se dispara si
`canReadPurchasing` es verdadero. Nunca se llama al endpoint en caso contrario: el 403 no puede
existir.**

El drawer recibe por props las opciones cargadas y el flag de permiso (montaje en
`InventoryClient.tsx`; reutilizar el patrón de precarga existente; sin endpoint nuevo, sin permiso
nuevo).

Cuatro estados del campo «Proveedor preferido»:

| Estado | Control | Valor visible | helperText exacto |
| --- | --- | --- | --- |
| Con permiso · cargando | `Select` deshabilitado | Opción única: «Cargando proveedores…» | «Cargando la lista de proveedores.» |
| Con permiso · listo | `Select` activo; primera opción «Sin proveedor preferido»; luego nombre de cada proveedor | Selección del usuario | «Proveedor que el sistema sugiere en solicitudes de compra.» |
| Con permiso · error de carga | `Select` deshabilitado | Si hay valor guardado y nombre resoluble: el nombre; si no: «Proveedor guardado» | «No pudimos cargar la lista de proveedores. Reintenta abriendo de nuevo el producto.» |
| **Sin permiso** | `Select` deshabilitado (no oculto) | «Sin proveedor preferido» si no hay refId; «Proveedor guardado» si hay refId | «Para cambiar el proveedor necesitas acceso al módulo de Compras.» |

Decisiones de degradación:

- **Campo deshabilitado con explicación, no oculto:** el usuario con permisos de stock ve que el
  dato existe y entiende por qué no lo puede editar; ocultar la sección Compras le quitaría stock
  mínimo y punto de reorden, que sí puede y debe gestionar.
- **«Proveedor guardado»** es veraz sin exponer el uuid del `partyRefId` en la UI (el uuid no es
  vocabulario de producto).
- **El valor persiste:** `buildPayload` reenvía el `preferredSupplierRefId` original; la
  degradación es solo visual y nunca destruye datos.
- Tenant sin proveedores registrados (con permiso): `Select` activo con opción única deshabilitada
  «Sin proveedores registrados» + helper «Puedes crearlos en Compras > Proveedores.» (estado
  «primera vez», no error).

---

## 8. Reglas cruzadas guiadas en cliente (backend sigue autoritativo)

### 8.1 `assetControlled` vs Control de material (trackingMode)

Regla backend (`refineInventoryItemMaster`): producto con serial o activo fijo ⇒ `assetControlled`
no puede ser `false`. Guía en cliente:

- Si `trackingMode` es «Con serial» o «Activo fijo»: el `CheckboxCard` de Control de activo se
  renderiza **marcado y deshabilitado**, con la descripción de bloqueo («Los productos con serial o
  activo fijo requieren control de activo.»).
- Si el usuario cambia Control de material hacia «Con serial» o «Activo fijo» con el checkbox en
  falso: el form lo marca automáticamente como verdadero en el mismo cambio (guía proactiva, no
  modal ni bloqueo). El cambio aparece inmediatamente reflejado y bloqueado en la sección Activos.
- Si cambia hacia «Consumible»: el checkbox vuelve a estar habilitado conservando su último valor
  (el backend no fuerza `false`).

### 8.2 `reorderPoint` y demás numéricos

Validación en blur junto al campo (receta §8 de formularios), con los mensajes exactos de §3. El
backend revalida; ningún mensaje de cliente promete una regla que el backend no tenga. No se
inventan coherencias que el backend no valida (p. ej. mínimo ≤ reorden ≤ objetivo **no** se
valida ni se sugiere como error).

### 8.3 Lo que no se replica

El refine del factor de conversión de compra queda fuera por el recorte ADR-085 (§9): no hay
unidad de compra en pantalla, luego no hay nada que guiar.

---

## 9. Exclusión ADR-085 — registro normativo del recorte

**`purchaseUnitOfMeasure` y `purchaseToBaseUomFactor` no se exponen en F1.** No aparecen en
ninguna de las tres secciones, ni deshabilitados, ni como «próximamente», ni en el payload de
`buildPayload`.

Motivo documentado (ADR-085, restricción de secuencia, sección «Requiere ADR»): el factor de
conversión de compra **hoy no se aplica** en la recepción de mercancía; exponer los campos antes de
ejecutar al menos D1, D2 y D4 del ADR convertiría el defecto de latente en activo (saldos
incorrectos, costo promedio contaminado, conteo físico contra saldo teórico erróneo).

Disposición: al completarse la ejecución de ADR-085 (F5a + F5b), los dos campos se incorporan a la
sección **Compras** — la sección de esta spec ya está diseñada para recibirlos sin reestructura,
junto a los campos de costo y condiciones de compra — y su spec de incorporación se versionará en
su momento, no aquí.

**Actualización 2026-09-03 (AI-FE-PLATFORM) — recorte completado.** Con F5a (catálogo canónico) y
F5b (validación dimensional D2 autoritativa en backend, fuente compartida
`areInventoryUnitsDimensionallyCompatible` en `@iwana/shared`) ejecutadas, la disposición anterior
se cumplió con los patrones ya aprobados de esta spec, sin reestructura: `purchaseUnitOfMeasure`
como `Select` del catálogo canónico (opcional, placeholder «Sin unidad de compra», hidratación
`string | null → ''`) y `purchaseToBaseUomFactor` como `Input` decimal opcional con espejo del
factor > 0 cuando hay unidad de compra; la guía dimensional D2 marca el error en el campo de
unidad de compra usando la fuente shared (el backend sigue siendo autoritativo). `buildPayload`
emite 26 claves. Evidencia y gates: informe F1, sección «F1 completado — campos de UoM
(2026-09-03)».

---

## 10. Notas para AI-DS-OWNER (tokens y contrato)

1. **Ningún token nuevo.** Superficies usadas: `PortalSectionHeader`, `Input`, `Select`,
   `CheckboxCard` (todos existentes), grids y gaps del propio drawer, `border-t` entre secciones
   como hoy separa Relación comercial.
2. **Confirmar primitiva booleana:** `CheckboxCard` es la única opción actual para los tres
   booleanos. Si prefieres switch u otra variante, la petición formal sale de tu validación (no
   creamos primitivas desde UX).
3. **Confirmar estructura:** secciones siempre visibles (§2.2) vs `SectionAccordion` con
   `keepMounted` para las tres nuevas. Mi recomendación es siempre visibles por descubribilidad.
4. **Constante de ayuda de Costos:** el texto nuevo del header de Costos (§6) no debe pisar
   `INVENTORY_AVERAGE_COST_HELP_TEXT` (se consume en otras superficies); propongo constante nueva
   en `inventory-labels.ts` — colocar el nombre queda a tu contrato de labels.
5. **Contratos congelados, intactos:** `InventorySideDrawerShell`, API de `PortalPanel` /
   `PortalSectionHeader`, enums de `@iwana/shared`, schema Zod de `dto/index.ts`. Sin capas Z
   nuevas ni movidas (H4/H5 no se agravan: todo ocurre dentro del body scrolleable existente).
6. Gate de identidad: `audit-ui.mjs` sobre los archivos tocados debe dar P0 = 0 y P1 = 0 (CA-F1-10).

## 11. Notas para AI-FE-PLATFORM (implementación)

1. Hidratación string→form y parse form→payload según la tabla de §5.1; los dos enteros
   (`leadTimeDays`, `usefulLifeMonths`) llegan como `number | null`, el resto de numéricos como
   `string`.
2. `buildPayload` emite los 25 campos completos y coherentes siempre (§5.2).
3. El fetch de proveedores vive en `InventoryClient.tsx` (el drawer consume por props), se dispara
   solo con `canReadPurchasing`, y reutiliza el patrón de precarga existente. Sin 403 alcanzable
   (CA-F1-06).
4. La regla de trackingMode→activo se implementa en el handler del `Select` de Control de material
   (§8.1): un solo punto de verdad en el estado del form.
5. Validaciones en blur, error junto al campo, mensajes exactos de §3; el error global
   (`PortalAlert`) no reemplaza al de campo.
6. `canSubmit` sin cambios: ningún campo nuevo es obligatorio (§3.5).
7. Tests mínimos: payload completo con secciones intactas; hidratación de `string` y `number|null`;
   cambio de trackingMode fuerza `assetControlled`; sin permiso no se llama al endpoint y el campo
   queda deshabilitado con su copy; párrafo retirado ausente (CA-F1-07); Costos sigue solo lectura
   (CA-F1-08).
8. Fuera de alcance igualmente: alta (F2 ya ejecutada), tabla, filtros, subtabs, backend, DTO,
   migraciones, OpenAPI.

---

## 12. Trazabilidad de decisiones (mía vs fijada)

| Decisión | Origen |
| --- | --- |
| Cinco secciones HLD §7 + bloque Costos solo lectura intacto | Fijada (prompt maestro + HLD Aprobado) |
| 14 campos concretos y su reparto por sección | Fijada (prompt maestro; RF-CAT-06/07/08) |
| Exclusión de unidad de compra y factor (sin placeholder) | Fijada (ADR-085, restricción de secuencia) |
| Degradación del selector de proveedor como obligación | Fijada (prompt maestro §4.4); comportamiento y copy exactos: AI-PROD-UX |
| Secciones siempre visibles, sin acordeón; orden de bloques; grids | AI-PROD-UX (con evaluación de densidad y fallback en §2.2) |
| `CheckboxCard` para booleanos | AI-PROD-UX (única primitiva existente); a confirmar DS-OWNER |
| Labels, helperText y validaciones en blur por campo | AI-PROD-UX (alineados a `inventory-labels.ts` y mensajes del backend) |
| Resolución de ambigüedad `standardCost` (§4) | AI-PROD-UX (la ambigüedad estaba señalada por EM-ARCH; la resolución es de PROD-UX según el prompt) |
| Retiro del párrafo L355-357 sin sustituto; ajuste del header | AI-PROD-UX (retiro fijado por CA-F1-07; el «qué lo reemplaza» es decisión de UX) |
| `buildPayload` siempre completo y coherente | Fijada (prompt maestro §4.5); detalle de conversión de tipos: AI-PROD-UX |
| Guía de trackingMode→`assetControlled` con auto-check | AI-PROD-UX (dentro del mandato «guiar, no decidir» del prompt §4.2) |

**Nota de precisión:** el encargo habla de «15 campos» a incluir; la lista explícita por sección
suma 14 (8 compras + 4 inventario + 2 activos). Esta spec especifica los 14 concretos y no inventa
un campo adicional; si EM-ARCH identificó un decimoquinto, que lo nombre y se versiona.

---

## 13. Validación DS-OWNER 2026-09-02 — ajustes A1-A4

Los cuatro puntos que esta spec dejaba «a confirmar» o «a decisión de DS-OWNER» quedan validados
sin cambiar decisiones PROD-UX. Implementación conforme en F1 (2026-09-03).

| ID | Punto de la spec | Veredicto DS-OWNER | Evidencia en código |
| --- | --- | --- | --- |
| A1 | §3.4 Primitiva booleana («a confirmar DS-OWNER») | Confirmado `CheckboxCard` (`label` + `description`) para `purchasable`, `inventoryControlled`, `assetControlled`. Sin `Switch` nuevo. | `InventoryCatalogDrawer.tsx` L626-631, L758-763, L804-814 |
| A2 | §4/§10.4 Constante de ayuda de Costos (propuesta: constante nueva, no pisar `INVENTORY_AVERAGE_COST_HELP_TEXT`) | Aprobada constante nueva `INVENTORY_CATALOG_COSTS_SECTION_HELP_TEXT`; la compartida queda intacta. | `inventory-labels.ts` L873-874; drawer L514; test «usa la constante nueva» |
| A3 | §8.2 Validación en blur | Reforzada: además del blur, `handleSubmit` revalida y bloquea el guardado; el error de campo reemplaza al helper. | `InventoryCatalogDrawer.tsx` L406-414; test «bloquea el guardado (A3)» |
| A4 | §2.2 Estructura (recomendación siempre visibles; fallback `SectionAccordion` a decisión DS-OWNER) | Confirmadas secciones siempre visibles con `PortalSectionHeader`, sin acordeón; densidad ~2,5 pantallas aceptada, stop de navegación no activado. | `InventoryCatalogDrawer.tsx` L619-846; test «cinco secciones del HLD §7» |
