# PROMPT — Paginación numerada · Fase 3: infraestructura y primitives de frontend

**Versión:** 1.0
**Estado:** Aprobado
**Generado por:** AI-EM-ARCH
**Archivo destino:** `docs/prompts/PROMPT-ADR065-OLA3-FE-INFRA-v1.0.md`
**Plan padre:** [2026-07-24-paginacion-numerada-adopcion.md](../plans/2026-07-24-paginacion-numerada-adopcion.md) — Ola 3

**Emisor:** AI-EM-ARCH
**Destinatario:** AI-FE-PLATFORM
**Fecha:** 2026-07-24
**Precondición:** Fase 1 cerrada (contrato `ListMeta` emitiéndose en dual-emit).
**Entradas:** [contrato DS](../specs/2026-07-24-paginacion-numerada-ds-contrato.md) — **es normativo, no orientativo** · [spec UX](../specs/2026-07-24-paginacion-numerada-ux.md) · [ADR-065](../adrs/ADR-065-Paginacion-Numerada-Tablas-Operativas.md)
**Skills:** `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `core-components`, `tailwind-patterns`, `iwana-identity-ui-review`, `wcag-audit-patterns`, `testing-patterns`

## Alcance

**1 · `useTableQueryState`** en `apps/portal/src/lib/`. Sobre `useSearchParams`, devuelve `{ page, pageSize, sort, filters, setQuery }`. **Dos comportamientos de historial en el mismo hook**, y esto es el núcleo:

- **`push`** al cambiar de página → el botón Atrás vuelve a la página anterior de la tabla (CA-PAG v2-21).
- **`replace`** para filtros, búsqueda y tamaño → una búsqueda con debounce no puede generar doce entradas de historial.

**2 · Portar `mergeUrlSearchParams`** de `apps/web/src/lib/` a `apps/portal/src/lib/`. Hoy el portal reimplementa la fusión de query inline en siete sitios de `InventoryClient.tsx` (`:1071, 1106, 1121, 1156, 1174, 1858, 2389`).

**3 · Unificar envelopes en `api-client.ts`** (8156 LOC). Las tres familias son estructuralmente idénticas: `UsersPaginationMeta` (`:3643-3651`), `CommercialListMeta` (`:1325-1333`), `InventoryListMeta` (`:6821-6830`). Colapsarlas en el `ListMeta` de `@iwana/shared` y migrar las 13 firmas legacy `page`/`limit` sueltas. Retirar el normalizador defensivo de `:1354-1385` si el contrato lo hace innecesario.

**4 · Auditoría de `<Suspense>`.** `useSearchParams` sin envolver **rompe `next build` en producción, no en dev**. Hay 11 consumidores en portal y 5 en web, varios dentro de clientes gigantes. Auditar cada árbol antes de añadir más.

**5 · Contrato de namespacing de query params.** `InventoryClient.tsx` renderiza ~9 tablas bajo la misma URL: `?page=3` es ambiguo. Definir el esquema (`?items.page=3&issues.page=1`, o página por tab) evitando colisión con los params ya ocupados: `tab`, `custody`, `action`, `serializedAssetId`, `commercialRef`. **Si el esquema afecta a URLs que los usuarios ya comparten, escala a AI-EM-ARCH antes de fijarlo.**

**6 · Primitives** en `apps/portal/src/components/shared/portal-ui.tsx`, con la API exacta del contrato DS §3:

- `PortalTablePager` — controlado puro, sin `defaultPage`.
- `PortalPageSizeSelect` — sobre `Select` de `@iwana/ui`, nunca un `<select>` crudo.
- `PORTAL_PAGE_SIZE_OPTIONS = [10, 20, 50]`, `PORTAL_DEFAULT_PAGE_SIZE = 20` (alineado a `USERS_PAGE_SIZE`).
- `PortalResultsStrip` gana `controls?: ReactNode` — cambio **aditivo**, `justify-end` por defecto.

**6-bis · `PortalDataTableSortableHead`** (contrato DS §5-bis), como **extensión** de `PortalDataTableHead` (`portal-ui.tsx:49-65`), que ya emite `scope="col"` por construcción. No lo reemplaces: una tabla debe poder mezclar columnas ordenables y no ordenables sin dos caminos de `<th>`.

- Controlado puro; **el ciclo lo calcula el primitive** (`sin orden → asc → desc → sin orden`). Una pantalla que implemente su propio ciclo es hallazgo.
- `useTableQueryState` gana `sortBy`/`sortDir` con `replace` y **reset a página 1**.
- `aria-sort` **no aparece hoy ni una vez en el repo**: se construye aquí y no se replica en catorce pantallas. Exactamente un `<th>` con `aria-sort` distinto de `none` por tabla.
- El nombre accesible del botón enuncia la **acción siguiente**, no el estado actual (`Ordenar por nombre, descendente`).
- **Un solo ícono**, no el par de carets apilados del demo: a 8×5 px no hay estado distinguible y el encabezado se vuelve una rejilla de ruido.
- El estado activo **no depende del ícono solo**: el rótulo pasa a `font-semibold` y `text-iwana-primary` (WCAG 1.4.1).
- **Columna no ordenable = sin botón y sin `aria-sort`.** No pintes un control deshabilitado: sugiere una capacidad que no existe.
- **Variante mobile: no crees un componente nuevo.** Bajo `sm` el botón no se renderiza y el orden se expone con el `Select` de `@iwana/ui` en la barra de filtros — es el patrón que ya existe en `AdditionalProductsPanel.tsx:619`, que pasa de ser el camino de Comercial a ser la variante mobile del contrato único.

**7 · Lo que se resuelve dentro del primitive, no en cada pantalla** — es la razón de que exista:

- **Foco (CA-PAG v2-25):** tras pulsar, el foco permanece en el control si sigue habilitado; si queda deshabilitado pasa al hermano habilitado. **Nunca al `<body>`.** Este es el fallo clásico de los paginadores numerados y replicarlo en 14 pantallas sería una regresión de accesibilidad a escala.
- **Carga (v2-27):** `aria-busy` + controles deshabilitados, sin desmontar el pager (evita CLS). Skeleton solo en la primera carga.
- **`aria-live`:** anuncio único `Página 3 de 7. Mostrando 41-60 de 128 usuarios.`
- **Colapso bajo `sm`:** números ocultos, quedan `Anterior` · `Página 3 de 12` · `Siguiente`.

## Restricciones

- **`PortalTablePagination` no se toca.** Cero breaking para sus 28 consumidores; su spec (`portal-ui.spec.tsx:220-257`) sigue verde.
- **Invariante:** una tabla monta un pie o el otro, nunca los dos.
- **Cero tokens nuevos.** Receta exacta del contrato DS §4. Prohibido `dark:bg-gray-{700..950}` (ADR-056 §2).
- **El activo en dark obliga a `ring-iwana-primary-300`** sobre `bg-iwana-primary-400`: sin el ring, 2.6:1 contra `dark-surface-2` y no conforme.
- **Lima fuera del pager por completo** — ni relleno, ni borde, ni subrayado.
- Números **ghost sin borde**; targets `h-11 min-w-11`.
- **El pie es hermano del contenedor con `overflow-x`, no hijo** — si el operador desplaza para ver una columna, la navegación no se va con él.
- Copy congelado de la spec UX §3. Español, sentence case, sin enums crudos.
- `labels` acepta solo `string`/funciones que devuelven `string`, nunca `ReactNode`.

## Entregables

1. `useTableQueryState` + `mergeUrlSearchParams` portado + envelopes unificados.
2. Auditoría de `<Suspense>` con la lista de árboles corregidos.
3. Esquema de namespacing documentado.
4. Los dos primitives + `PortalResultsStrip` extendido.
5. Specs cubriendo la matriz de estados completa del contrato DS §5.

## Stop/go

- **`pnpm build` de portal y web verde** — el fallo de `<Suspense>` solo aparece aquí, no en dev.
- `pnpm --filter @iwana/portal test` verde, incluidos los 28 consumidores intactos.
- `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sin P0/P1 en los archivos tocados.
- Recorrido de teclado verificado a mano: el foco nunca cae al `<body>` tras paginar, y permanece en el encabezado pulsado tras ordenar.
- `aria-sort` refleja el estado en el `<th>`; exactamente uno distinto de `none` por tabla.
- Contraste AA verificado en claro y oscuro, **incluido el estado deshabilitado**.

**Esta fase no migra ninguna tabla.** Solo entrega la infraestructura y los primitives.
