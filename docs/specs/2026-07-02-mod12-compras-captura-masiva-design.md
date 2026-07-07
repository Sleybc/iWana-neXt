# MOD12 Compras Captura Masiva Design

**Fecha:** 2026-07-02  
**Estado:** Aprobado para plan de ejecucion  
**Modo activo:** Mixto  
**Responsable:** AI-EM-ARCH  
**Modulo base:** MOD12 Inventario / SCM  
**Perfil activo:** `docs/roles/Perfil_IA_EM_Architect_Unificado_v1.md`  
**Referencias:** `docs/specs/2026-06-25-mod12-compras-workspace-hibrido-design.md`, `docs/specs/SPEC-MOD12-COMPRAS-UI-ALIGNMENT-v1.0.md`, `docs/prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md`, `docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md`, `docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md`

---

## 1. Contexto y motivacion

El submodulo de Compras ya cuenta con un workspace hibrido funcional, pero la entrada de solicitudes sigue penalizando el caso operativo donde el usuario necesita agregar `10-20+` productos en una sola solicitud. El patron actual en `apps/portal/src/components/inventory/PurchaseRequestComposer.tsx` obliga a construir la solicitud linea por linea:

- elegir origen,
- buscar producto,
- seleccionar producto,
- ajustar cantidad,
- ajustar unidad,
- seleccionar proveedor sugerido,
- repetir el ciclo para cada nueva linea.

Esta mecanica funciona para 1-3 productos, pero se vuelve lenta, repetitiva y cognitivamente pesada para reposiciones o compras de proyecto con volumen medio. El problema no es solo visual: la captura actual mezcla descubrimiento, seleccion y edicion fina en el mismo momento de la interaccion.

La evolucion buscada no cambia boundaries ni contratos core del submodulo. La mejora se concentra en la experiencia de captura dentro del portal tenant, manteniendo la arquitectura de MOD12 y reusando los contratos ya vigentes cuando sea posible.

---

## 2. Objetivo del rediseño

Convertir `Nueva solicitud de compra` en una experiencia de `captura masiva + revision operativa`, donde el usuario:

1. descubre productos desde dos fuentes de entrada claras,
2. selecciona varios productos de forma acumulativa,
3. consolida la seleccion en un borrador unico,
4. afina cantidades, proveedor y notas en una tabla compacta,
5. crea la solicitud sin tener que reconstruir cada linea desde cero.

El objetivo explicito es que agregar `10-20+` productos deje de ser un caso doloroso sin introducir complejidad innecesaria como importaciones CSV, plantillas o reglas avanzadas por lote en esta fase.

---

## 3. Alcance

### 3.1 En scope

- Redisenar la experiencia de `PurchaseRequestComposer`.
- Reemplazar el patron `linea por linea` por el patron `seleccionar primero, editar despues`.
- Introducir dos tabs de captura: `Sugeridos` y `Catalogo`.
- Mantener una seleccion compartida y persistente entre tabs, filtros y busquedas.
- Introducir una tabla compacta de `Lineas seleccionadas` como unica fuente de verdad de la solicitud antes del submit.
- Reordenar la jerarquia visual del workspace de compras para que la captura masiva sea mas clara.
- Mantener el caso mobile con un flujo de dos pasos, sin depender de tablas anchas como patron principal.
- Cubrir pruebas unitarias y de integracion frontend del nuevo flujo.

### 3.2 Fuera de scope

- Importacion CSV o Excel.
- Plantillas reutilizables de compra.
- Reglas avanzadas por lote o macros de edicion.
- Nuevo bounded context para compras.
- Nuevas tablas o cambios de schema obligatorios para esta fase.
- Scoring avanzado de proveedores.
- Motor nuevo de sugerencias basado en IA o analitica historica compleja.

---

## 4. Usuarios y casos operativos

### 4.1 Usuario principal

Operador administrativo o responsable de abastecimiento en el portal tenant que debe crear solicitudes de compra con mezcla de:

- productos de reposicion,
- productos recurrentes ya catalogados,
- eventualmente alguna linea libre no catalogada.

### 4.2 Casos de uso clave

1. Crear una reposicion rapida a partir de productos que ya estan en o bajo minimo.
2. Construir una compra de proyecto seleccionando varias referencias del catalogo.
3. Mezclar productos sugeridos y productos buscados manualmente en una sola solicitud.
4. Ajustar cantidades y proveedor sugerido despues de seleccionar los productos, no antes.

---

## 5. Decisiones aprobadas

1. La entrada de `Nueva solicitud de compra` pasa a ser un flujo mixto con tabs `Sugeridos` y `Catalogo`.
2. Ambas tabs alimentan una misma seleccion temporal compartida.
3. La captura inicial y la edicion de lineas se separan en dos subfases visibles dentro del mismo composer.
4. La tab inicial puede variar por tipo de compra:
   - `REPLENISHMENT` y `URGENT_OPERATION` abren en `Sugeridos`.
   - `PROJECT` y `FREE_PURCHASE` abren en `Catalogo`.
5. La seleccion no se pierde al cambiar de tab, filtro o busqueda.
6. La tabla `Lineas seleccionadas` es la unica fuente de verdad para cantidad, unidad, proveedor y notas antes de crear la solicitud.
7. La linea libre manual se conserva, pero deja de ser el camino dominante de la pantalla.
8. No se requiere nuevo endpoint en esta fase si los datos vigentes permiten construir `Sugeridos` desde catalogo, balances y metadata existente. Si el volumen o performance no alcanzan, eso escala a fase posterior.

---

## 6. Experiencia objetivo

### 6.1 Jerarquia general

La pantalla deja de sentirse como un formulario largo y pasa a estructurarse asi:

1. `Cabecera compacta de solicitud`
2. `Agregar productos`
3. `Lineas seleccionadas`
4. `Justificacion y cierre`

La tarea dominante es `Agregar productos`. Los KPIs, filtros de bandeja y otras superficies del workspace no deben competir visualmente con esta tarea cuando el usuario ya abrio la creacion de solicitud.

### 6.2 Cabecera compacta de solicitud

Bloque corto con:

- tipo de compra,
- area solicitante,
- prioridad,
- fecha requerida.

Debe ocupar poca altura y funcionar como contexto, no como el bloque dominante. La justificacion queda mas abajo junto al cierre porque no debe frenar la seleccion inicial.

### 6.3 Bloque Agregar productos

Bloque principal del composer con:

- tabs `Sugeridos` y `Catalogo`,
- busqueda/filtros segun tab,
- resultados seleccionables,
- barra persistente de seleccion.

#### Tab Sugeridos

Su objetivo es velocidad operativa, no exploracion. Debe mostrar una lista densa y corta, idealmente `6-12` filas de alta confianza.

Cada fila debe mostrar:

- nombre del producto,
- SKU,
- stock actual,
- umbral operativo o punto de reposicion cuando exista,
- proveedor sugerido si existe,
- motivo visible de sugerencia.

Motivos permitidos en esta fase:

- `Bajo minimo`
- `Sin stock`
- `Consumo reciente alto` solo si existe senal disponible sin nuevo contrato
- `Compra frecuente` solo si existe senal disponible sin nuevo contrato
- `Proveedor sugerido disponible`

Si el sistema no puede sustentar una sugerencia con dato visible, no debe etiquetarla como sugerida.

#### Tab Catalogo

Su objetivo es precision operativa. Sustituye el patron de `Input + Select` largo por una lista o tabla de seleccion multiple.

Columnas recomendadas:

- checkbox,
- producto,
- SKU,
- categoria,
- unidad,
- proveedor sugerido,
- estado de compra.

Filtros compactos:

- busqueda por SKU, nombre, marca o modelo,
- categoria,
- tipo de producto,
- disponible para compras.

No se hace edicion detallada en esta tab. Solo descubrimiento y seleccion.

### 6.4 Barra persistente de seleccion

Debe vivir dentro del bloque `Agregar productos` y permanecer visible cuando haya seleccion activa.

Contenido minimo:

- contador de productos seleccionados,
- accion `Limpiar seleccion`,
- CTA `Agregar al borrador`.

La barra debe representar una sola cesta temporal compartida entre `Sugeridos` y `Catalogo`.

### 6.5 Lineas seleccionadas

Segunda subfase del flujo. Aqui el usuario ya no descubre productos: afina la solicitud.

Tabla compacta con columnas base:

- producto,
- origen (`Sugerido`, `Catalogo`, `Manual`),
- cantidad,
- unidad,
- proveedor sugerido,
- notas,
- accion quitar.

Comportamiento:

- cantidad y proveedor se editan inline,
- notas se pueden expandir por fila o editar inline si el control no rompe densidad,
- se permite seleccion multiple de filas para acciones masivas.

Acciones masivas aprobadas:

- `Quitar seleccionadas` entra en fase 1 como minimo viable si la tabla ya soporta seleccion multiple.
- `Aplicar proveedor` y `Cambiar cantidad` quedan aprobadas para fase 2 si el equipo necesita cerrar primero la base de captura masiva sin ensanchar demasiado el alcance.

### 6.6 Justificacion y cierre

Bloque final con:

- justificacion,
- resumen de lineas,
- total estimado si los datos lo permiten sin reglas nuevas,
- CTA `Crear solicitud`.

En desktop se recomienda footer sticky del composer. En mobile el CTA debe quedar en footer sticky seguro para no depender de scroll largo.

---

## 7. Comportamiento funcional

### 7.1 Flujo

1. El usuario abre `Nueva solicitud`.
2. Diligencia la cabecera minima.
3. El sistema activa por defecto `Sugeridos` o `Catalogo` segun el tipo de compra.
4. El usuario selecciona productos en una o ambas tabs.
5. La seleccion persiste al cambiar de tab, filtro o busqueda.
6. El usuario confirma `Agregar al borrador`.
7. El sistema crea lineas temporales con prefill:
   - cantidad `1`,
   - unidad de compra o unidad base,
   - proveedor sugerido si existe,
   - origen de linea.
8. El usuario afina las lineas.
9. Completa justificacion y crea la solicitud.

### 7.2 Regla de persistencia

La seleccion compartida no debe perderse por:

- cambiar de tab,
- aplicar filtros,
- limpiar busqueda,
- volver desde `Lineas seleccionadas` a `Agregar productos`.

Solo se pierde por:

- `Limpiar seleccion`,
- quitar productos del borrador,
- cerrar el composer sin guardar si el equipo decide no soportar draft persistente en esta fase.

### 7.3 Validaciones

- No se puede crear solicitud sin lineas.
- Cada linea debe tener cantidad valida mayor a cero.
- La linea manual debe exigir descripcion visible.
- Ausencia de proveedor sugerido no bloquea la solicitud; se presenta como advertencia operativa.
- Si una fila es invalida, la validacion debe ocurrir por fila o por blur, no solo al final del formulario.

---

## 8. Impacto tecnico esperado

### 8.1 Frontend

Se espera una refactorizacion enfocada en `apps/portal/src/components/inventory/`:

- dividir `PurchaseRequestComposer` en subcomponentes mas pequenos,
- introducir estado de captura masiva desacoplado del render de cada fila,
- reutilizar primitives del portal en lugar de agregar estilos ad hoc.

Componentes o modulos recomendados:

- `PurchaseRequestHeaderCompact`
- `PurchaseSourceTabs`
- `PurchaseSuggestionList`
- `PurchaseCatalogBulkTable`
- `PurchaseSelectionBar`
- `PurchaseDraftLinesTable`
- `PurchaseBulkEditBar`
- `PurchaseStickyFooter`
- utilidades `purchase-suggestions.ts`
- utilidades o hook `purchase-request-draft.ts`

### 8.2 Backend

En esta fase el cambio puede ejecutarse sin contrato nuevo si:

- `inventoryApi.listCatalogOptions()` cubre la tab `Catalogo`,
- `items + balances` ya cargados en `InventoryClient` cubren `Sugeridos`,
- `CreatePurchaseRequestDto` ya soporta `sourceKind` mixto con `inventoryItemId` y linea libre.

Si durante ejecucion se confirma que el volumen del catalogo o la calidad de sugerencias no alcanza, se documenta como follow-up de fase 2:

- endpoint dedicado de sugerencias,
- busqueda server-side para compras,
- ranking mas rico por consumo o historial.

### 8.3 Testing

La cobertura minima debe incluir:

- seleccion compartida entre tabs,
- borrador con mezcla de productos sugeridos y de catalogo,
- preservacion de seleccion al cambiar filtros,
- creacion de solicitud con multiples lineas,
- defaults por tipo de compra,
- validaciones por fila,
- comportamiento mobile del flujo en dos pasos.

---

## 9. Responsive y accesibilidad

### 9.1 Desktop

- `>=1280px`: composer embebido en split con la bandeja, manteniendo el patron aprobado del workspace.
- header sticky dentro del bloque `Agregar productos` cuando haga falta.
- footer sticky del composer con resumen y CTA principal.

### 9.2 Mobile

- composer en drawer o pantalla completa segun el patron actual.
- flujo en dos pasos visuales:
  1. `Sugeridos | Catalogo`
  2. `Lineas seleccionadas`
- CTA principal siempre visible en footer sticky.
- no depender de tabla horizontal como patron base.

### 9.3 Accesibilidad

- foco visible en tabs, checkboxes, filas y CTAs.
- la seleccion no puede depender solo del color.
- tabs con labels claras y contadores legibles.
- errores por fila deben ser anunciables y visibles.
- no ocultar acciones frecuentes en menus de kebab.

---

## 10. Estados obligatorios

### 10.1 Sugeridos

- loading
- vacio sin sugerencias
- error de carga si la senal requerida falla
- resultados con seleccion

### 10.2 Catalogo

- loading
- vacio de busqueda
- error de carga
- resultados con multiseleccion

### 10.3 Borrador

- borrador vacio
- filas invalidas
- bulk actions activas
- submit en progreso
- error de submit
- exito de submit

---

## 11. Riesgos y restricciones

### 11.1 Riesgos

- usar `catalogOptions` completo puede seguir siendo costoso si el catalogo crece mucho;
- construir sugerencias solo en cliente puede limitar la riqueza del ranking;
- si el borrador no se modela fuera del render de filas, la experiencia puede seguir degradandose;
- demasiadas columnas o demasiadas cards pueden romper la claridad iWana y la densidad controlada.

### 11.2 Restricciones no negociables

- no romper ADR-048,
- no crear nuevo BC,
- no mezclar item master fisico con catalogo comercial,
- no introducir estilos visuales ajenos a las primitives del portal,
- no mostrar identificadores tecnicos como texto principal,
- no usar tabs como capa superficial sobre el patron viejo de `agregar linea`.

---

## 12. Criterios de aceptacion

1. El usuario puede crear una solicitud con `10-20+` productos sin repetir el formulario completo por cada linea.
2. `Sugeridos` y `Catalogo` comparten una misma seleccion temporal.
3. La seleccion persiste entre tabs y filtros.
4. `Catalogo` ya no depende de un `Select` largo como mecanismo primario de captura.
5. `Lineas seleccionadas` concentra la edicion fina.
6. El flujo mobile no obliga a scroll largo para continuar ni a usar tablas anchas como patron principal.
7. La nueva experiencia conserva copy operacional y coherencia con la identidad iWana.
8. El caso de linea manual sigue soportado.
9. Las pruebas del portal cubren seleccion, consolidacion y submit de multiples lineas.

---

## 13. Fases de entrega

### Fase 1 - Quick wins obligatorios

- tabs `Sugeridos` y `Catalogo`,
- seleccion compartida,
- editor compacto de lineas,
- soporte visible para linea manual dentro del nuevo borrador,
- barra sticky de seleccion,
- footer sticky de cierre,
- mobile en dos pasos,
- pruebas frontend principales.

### Fase 2 - Potenciadores

- ranking mas rico de sugerencias,
- acciones masivas mas completas (`Aplicar proveedor`, `Cambiar cantidad`),
- mejor total estimado,
- preferencia persistida de tab inicial,
- posible endpoint dedicado si el volumen o performance lo exige.

### Fase 3 - Evolucion avanzada

- importacion masiva,
- plantillas,
- reglas complejas por lote,
- automatizacion de recomendacion mas inteligente.

---

## 14. Decision arquitectonica

**Modo:** Mixto  
**Recomendacion:** aprobar el rediseño de `Nueva solicitud de compra` como evolucion UI/UX y de estado frontend dentro de MOD12, sin nuevo ADR ni cambio de schema obligatorio en fase 1.  
**Justificacion:** el problema principal es de flujo operativo y no requiere alterar boundaries ni modelo de datos base para entregar valor inmediato. El diseno propuesto preserva contratos vigentes, mejora la captura masiva y deja explicitado el camino para una fase 2 si se necesita profundizar en sugerencias o performance.  
**Impacto:** medio en frontend, bajo en backend para fase 1, alto en experiencia de usuario.  
**Alternativas descartadas:** mantener el formulario lineal con mejoras cosmeticas; priorizar solo sugerencias y ocultar catalogo; introducir CSV/import masiva en esta fase.  
**Requiere ADR:** No.  
**Requiere CTO:** No para ejecucion de fase 1; si aparece necesidad de nuevo contrato backend o cambio de boundary, se escala.
