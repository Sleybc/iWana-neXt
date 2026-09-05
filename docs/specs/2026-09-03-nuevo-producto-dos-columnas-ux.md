# UX spec — «Nuevo producto» a dos columnas (re-layout sin cambio funcional)

**Fecha:** 2026-09-03
**Estado:** Congelada v1.1 (v1 congelada + validación DS-OWNER 2026-09-03; cambios posteriores se versionan, nunca se parchean en silencio — protocolo §3bis)
**Dueño:** AI-PROD-UX
**Historial v1 → v1.1 (validación DS-OWNER 2026-09-03):** 4 ajustes vinculantes que prevalecen sobre v1 donde difieran — (1) anclaje del span por tabla (§3bis), (2) `min-w-0` exacto por celda (§4), (3) nota táctil `h-10`/`h-11` aceptada tal cual (§7), (4) §11 reescrito con wrappers/spans exactos.
**Alcance:** solo re-layout CSS del cuerpo de `InventoryCreateProductDialog.tsx`. Sin componentes nuevos, sin tokens nuevos, sin cambiar el shell, sin tocar H4/H5 ni Fase A/B, sin strings nuevos.
**Modo:** `iwana-identity-ui-review` (diseño) + `senior-ui-systems-designer` (proporcionado: 2 opciones, sin propuestas decorativas) + `system-vocabulary-review` + `ui-ux-pro-max` (subordinada, solo P1/P2/P5/P8).

## 1. Decisión

Opción A (pareo semántico) sobre contenedor `grid grid-cols-1 gap-4 md:grid-cols-2`. Los bloques full-width llevan `md:col-span-2`. El orden DOM no cambia: el tabuleo sigue al ojo y los tests F2 de orden relativo siguen verdes.

## 2. Opciones evaluadas (senior-ui-systems-designer, proporcionado)

**Opción A — pareo semántico (recomendada).** Filas: Nombre (full) → Categoría (full) → [Tipo | Control] → Unidad (full) → [Marca | Modelo] → [Código de barras | Formato] → Código sugerido (full) → details (full) → alerts (full, al inicio del DOM). Pares de igual naturaleza y altura (select|select, input|input, input|select de la pareja «van juntos»); Unidad full como separador entre clasificación e identidad; 8 filas frente a 12 bloques.

**Opción B — compactación máxima (descartada).** Emparejar Unidad con otro campo ([Tipo | Unidad] con Control full, o [Unidad | Marca]) para eliminar la fila full suelta. Se descarta por tres motivos: rompe el par natural de clasificación Tipo|Control dejando un Select corto a ancho completo; mezcla tipos de control con alturas distintas (select con helper/error frente a input), lo que desalinea filas cuando aparece validación; y cualquier variante que separe Marca|Modelo o Código|Formato deja huérfanos los helpers «Ambos…» y «Va junto al código», lo que obligaría a cambiar copy (hallazgo de vocabulario) y violaría la restricción de cero strings nuevos.

## 3. Filas y celdas exactas (orden DOM = orden visual, sin reordenar JSX)

| Fila | Izquierda | Derecha | Span |
| --- | --- | --- | --- |
| 1 | Alerta error (`PortalAlert`, condicional) | — | Full (`md:col-span-2` por alerta) |
| 2 | Alerta validación (`PortalAlert`, condicional) | — | Full |
| 3 | `Input` Nombre (required, autofocus) | — | Full |
| 4 | Bloque Categoría (`Select` + link `Crear categoría aquí` + región inline) | — | Full, `space-y-2` interno intacto |
| 5 | `Select` Tipo de producto | `Select` Control de material | Mitad / mitad |
| 6 | `Select` Unidad de medida (catálogo F5a) | — | Full |
| 7 | `Input` Marca | `Input` Modelo + helper «Ambos…» | Mitad / mitad |
| 8 | `Input` Código de barras + helper F4 | `Select` Formato del código + helper «Va junto al código…» | Mitad / mitad |
| 9 | Well «Código sugerido» (condicional, preview viva) | — | Full |
| 10 | `<details>` Descripción | — | Full |

Unidad queda full porque no tiene pareja natural (etiquetas del catálogo de 4–9 caracteres no justifican media columna y el full-width actúa como separador visual entre clasificación e identidad). Categoría queda full por ser bloque complejo de altura variable (región inline inyectada, Fase A intacta). Preview y details conservan su posición relativa (preview tras sus 5 inputs: F2 CA-F2-04).

## 3bis. Anclaje del span — SOLO en el hijo directo del grid (validación DS-OWNER 2026-09-03)

`className` con `md:col-span-2` PROHIBIDO en `Input`/`Select`: cae en el control interno y es span-muerto sobre el grid (verificado: `Input.tsx:69` el wrapper solo acepta `containerClassName`; `Select.tsx:402-404` wrapper sin prop de clase). Un solo mecanismo, auditable por grep:

| Bloque | Mecanismo |
| --- | --- |
| `Input` Nombre (full) | wrapper `<div className="md:col-span-2 min-w-0">` (NO `className` ni `containerClassName`, uniformidad con `Select`) |
| Bloque Categoría (full) | span sobre su propia clase: `space-y-2 md:col-span-2 min-w-0` (ya es hijo directo; no envolver de nuevo; su `space-y-2` interno intacto) |
| `Controller`+`Select` Tipo, Control, Unidad (full), Formato | CADA `Controller` envuelto en `<div>` mínimo (`min-w-0`; + `md:col-span-2` solo en Unidad) |
| `Input` Marca, Modelo, Código (mitades) | wrapper `<div className="min-w-0">` |
| Well «Código sugerido» y `details` (planos) | span sobre su propia clase (`md:col-span-2 min-w-0` añadido a sus clases existentes, sin tocar el resto) |
| Cada `PortalAlert` | `className="md:col-span-2 min-w-0"` directo SÍ válido (excepción: `portal-ui.tsx:1880` fusiona `className` en el div raíz que ES el item del grid) |

Cero ocurrencias nuevas del anti-patrón span-muerto (no consolidar hermanos en este tramo).

## 4. Breakpoint y gap (con matemática real)

- **Breakpoint: `md` (768px).** El shell está capado a `max-w-2xl` (672px) con `px-6`, así que desde `md` el drawer mide 672px fijos: contenido 624px → columna `(624 − 16) / 2 = 304px`. La opción `sm` (640px) daría 288px y funciona para las opciones fijas más largas («Sin código de barras», 19 caracteres), pero se rechaza: introduce una segunda convención de breakpoint en el módulo (los 4 drawers hermanos — `StockIssueFormDrawer`, `StockTransferDialog`, `StockLocationFormDialog`, `InventoryCatalogDrawer` — usan `md`) a cambio de ganar solo la banda estrecha 640–767px.
- **Gap: `gap-4` (16px).** Preserva exacto el ritmo vertical actual (`space-y-4`, cero regresión vertical) y coincide con la familia de drawers del módulo. La desviación frente al `gap-3` de `StockIssueComposer` es deliberada y documentada: composer ≠ drawer.
- **Clase del contenedor:** `grid grid-cols-1 gap-4 md:grid-cols-2` (reemplaza `space-y-4`). `min-w-0` exacto (validación DS-OWNER 2026-09-03): TODA celda directa del grid lleva `min-w-0` (regla anti-desborde con nombres de categoría definidos por el tenant); `md:col-span-2` SOLO en Nombre, Categoría, Unidad, well, `details` y cada alerta — Tipo, Control, Marca, Modelo, Código, Formato son mitades sin span.

## 5. Helpers y errores

Cada `helperText`/`error` sigue viviendo como prop de su propio `Input`/`Select`: se renderiza bajo su campo, dentro de su celda, sin spanning. Verificación de antecedentes (vocabulario): el helper de Modelo («Opcional. Ambos forman parte del código del producto, que no se puede modificar después.») conserva a Marca como vecina izquierda de la misma fila — «ambos» no queda huérfano; el helper de Formato («Va junto al código: uno sin el otro se rechaza.») conserva a Código como vecino — la pareja CA-F4-08 no se separa. Los errores largos (p. ej. dígito de control EAN-13, ~110 caracteres) envuelven a 3–4 líneas en 304px: aceptable y junto al campo (P8). Las alertas quedan full-width al inicio del DOM (resumen de errores arriba, patrón P8).

## 6. Vocabulario (system-vocabulary-review)

El re-layout no añade, cambia ni mueve ni una cadena. Veredicto: sin hallazgos, sin propuesta de copy. Condición: si una implementación futura separase los pares Marca|Modelo o Código|Formato, los helpers perderían antecedente y haría falta revisión de vocabulario — esta spec lo prohíbe.

## 7. Responsive y estados

- **< `md`:** una columna idéntica a hoy (base `grid-cols-1`), sin scroll horizontal; en teléfonos el drawer es ancho completo de viewport como hoy.
- **Foco visible:** sin cambios, resuelto por las primitivas (`Input`/`Select`/`Button` con `focus-visible`).
- **Táctil (validación DS-OWNER 2026-09-03):** trigger de `Select` en `h-11` (44px, verificado en `packages/ui/src/components/Select.tsx:472`) frente a `Input` en `h-10` (40px, `Input.tsx:97`) — asimetría preexistente aceptada tal cual (la fila Código|Formato mezcla 4px). Cumple el mínimo WCAG 2.2 (24px). PROHIBIDO `items-end`/`items-start` u otros hacks de alineación.
- **Dark mode:** sin cambios (tokens ya resueltos por las primitivas; shell con `dark-surface-2` intacto).

## 8. Lo que NO cambia

Lógica `skuPreview`/`watch()`, esquema Zod, `buildPayload`, validación de pareja de código de barras, `canSubmit`/envío, copy, shell (`max-w-2xl`), capas (`z-[1200]`/`z-[1201]`), `usePortalSideDrawerA11y`, `useDiscardChangesGuard`, footer sticky (Cancelar / Crear producto), ids y nombres accesibles, H4/H5, Fase A (debounce, autosugerencia de prefijo, creación inline).

## 9. Tests que deben seguir verdes y por qué (suite `InventoryCreateProductDialog.spec.tsx`)

El cambio es solo clases CSS del contenedor + spans; el DOM relativo no se altera y ningún test aserta clases de layout (todas las consultas son por rol/texto).

- `muestra marca y modelo fuera del acordeón…` (F2): aserta con `compareDocumentPosition` que Marca y Modelo preceden a «Código sugerido» y que no están dentro de `details` — se preserva porque no se mueve ningún nodo.
- `shows the composed code preview…` (F2/CA-F2-04): preview tras sus inputs — posición relativa intacta.
- Tests F4 (CA-F4-01/03/08, pareja a medias) y F5a (catálogo de unidades): dependen de esquema y payload, no de layout.
- Tests de envío mínimo, `PortalAlert` de error, affordance inline de categoría y guard de descarte: comportamiento intacto.

## 10. Notas para DS-OWNER (validado 2026-09-03)

Contrato del shell `max-w-2xl` sin cambios (no requiere versión nueva); `gap-4` + breakpoint `md` frente a la alternativa `gap-3`/`sm` (§4); anclaje del span SOLO en el hijo directo del grid según tabla §3bis (span-muerto en primitivas prohibido); cada alerta condicional conserva su ternario `? : null` (sin filas fantasma de 0px con gap); `min-w-0` exacto según §4; asimetría `Input h-10` frente a `Select h-11` aceptada tal cual (§7).

## 11. Notas para FE-PLATFORM — mover exactamente (reescrito, validación DS-OWNER 2026-09-03)

1. Contenedor del cuerpo: `space-y-4` → `grid grid-cols-1 gap-4 md:grid-cols-2`. Sin `items-end`/`items-start` ni otros hacks.
2. Nombre: envolver el `Input` en `<div className="md:col-span-2 min-w-0">` (NO `className` ni `containerClassName` en la primitiva).
3. Categoría: span sobre su propia clase → `space-y-2 md:col-span-2 min-w-0` (no envolver de nuevo; `space-y-2` interno intacto; región inline conserva su ternario `? : null`).
4. Tipo, Control, Unidad, Formato: envolver CADA `Controller` en `<div>` mínimo (`min-w-0`; + `md:col-span-2` solo en Unidad). Orden DOM intacto: Tipo → Control → Unidad → … → Código → Formato.
5. Marca, Modelo, Código: envolver cada `Input` en `<div className="min-w-0">` (mitades, sin span).
6. Cada `PortalAlert`: `className="md:col-span-2 min-w-0"` directo (excepción válida, raíz fusionada). Ternarios `? : null` intactos.
7. Well «Código sugerido» (ternario `? : null` intacto) y `details`: añadir `md:col-span-2 min-w-0` a sus clases existentes, sin tocar el resto.
8. NO tocar: todo lo listado en §8, shell `max-w-2xl`, capas, header, footer, Fase A, ids (`inventory-create-product-*`), `aria-label`s, helpers, copy, hooks, validación, payload, orden de nodos. Cero className-span en primitivas.
