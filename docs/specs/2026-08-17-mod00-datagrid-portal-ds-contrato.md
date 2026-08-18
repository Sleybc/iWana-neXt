# Spec UX / Contrato DS - Datagrid operativo del portal

- **Fecha:** 2026-08-17
- **Modulo:** MOD00 y superficies operativas del portal
- **Alcance:** tablas operativas de `apps/portal` y primitives de `portal-ui.tsx`
- **Estado:** Aplicado y verificado
- **Fuentes:** Firma iWana, `iwana-identity-ui-review`, `senior-ui-systems-designer`, `ui-ux-pro-max`, ADR-064 y ADR-065

## Decision

El datagrid no necesita una primitive nueva. La anatomia canonica se compone con los tokens y primitives existentes:

```text
PortalPanel
  filtros / chips fuera del shell
  PortalResultsStrip segun el modo
  portalDataTableShellClassName
    una frontera overflow-x-auto
    table
      PortalDataTableHead o PortalDataTableSortableHead
      tbody con portalDataTableBodyClassName
      celdas con portalDataTableCellClassName
    exactamente un pie
      PortalTablePager si randomAccess=true
      PortalTablePagination si randomAccess=false
```

## Tokens obligatorios

- `portalDataTableShellClassName` para la superficie de la grilla.
- `portalDataTableHeadRowClassName` para el encabezado.
- `PortalDataTableHead` para `scope="col"` y estilo de encabezado.
- `portalDataTableBodyClassName` para fondo y divisores del cuerpo.
- `portalDataTableCellClassName` para densidad y contraste de celdas.
- `portalTableRowHoverClassName` para feedback de fila.
- `portalDataBusyRegionClassName` para refrescos sin atenuar texto.
- `PortalSkeletonBlock`, `PortalEmptyState` y `PortalAlert` para estados.
- `PortalPageSizeSelect` con opciones `[10, 20, 50]`.

No se crean tokens nuevos ni variantes locales equivalentes.

## Paginacion y URL

- El modo se deriva exclusivamente de `meta.capabilities.randomAccess`.
- Una tabla no monta ambos pies simultaneamente.
- En modo numerado, el conteo vive en `PortalTablePager`; el strip no duplica el conteo.
- En modo cursor, `PortalTablePagination` conserva `Cargar mas` y el cursor permanece en memoria.
- Filtros y busquedas se hidratan desde la URL y los cambios reemplazan la URL reiniciando la pagina.
- Cambiar de pagina usa `push` para que el boton Atras restaure la posicion.
- `sortableFields: []` es un estado valido; el orden solo se muestra cuando el servidor lo publica.

## Estados y accesibilidad

- Orden: `aria-sort`, `aria-current="page"`, foco visible y anuncio `aria-live`.
- Loading: `aria-busy`, controles deshabilitados y skeleton cuando corresponde; no opacidad sobre contenido.
- Empty: diferenciar primera carga de filtros sin resultados y ofrecer accion cuando existe.
- Error: `PortalAlert` con recuperacion cercana.
- Responsive: una sola frontera horizontal; pager con controles de 44 px y variante compacta bajo `sm`.
- Numeros y fechas tecnicas usan `tabular-nums` o `font-mono` cuando evita saltos de layout.
- Lima queda fuera del pager; la pagina activa usa azul primario.

## Excepciones

No se convierten en datagrid operativo los previews de hasta 10 filas, pickers, matrices fijas,
calendarios, tablas anidadas y detalles de un solo registro. Estas excepciones deben conservar su
contexto funcional y no reutilizarse para directorios remotos.

## Criterios de aceptacion

1. Typecheck, lint y tests del portal pasan.
2. `audit-ui.mjs` no reporta P0/P1 en los archivos del datagrid.
3. La paginacion y el estado de tabla sobreviven refresh y Atras donde el consumidor ya esta migrado.
4. La tabla mantiene estados loading, empty, error, readonly e inactivo.
5. La prueba E2E del pager queda compilable y lista para ejecutarse contra el stack levantado.
