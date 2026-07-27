# INFORME — ADR-065 Ola 4 · Piloto extremo a extremo (Suscriptores)

**Versión:** 1.0  
**Fecha:** 2026-07-25  
**Autor:** AI-FE-PLATFORM  
**Estado:** Entregado — stop/go pendiente de gate AI-SR-QA  
**Prompt:** `docs/prompts/PROMPT-ADR065-OLA4-PILOTO-v1.0.md`  
**Precondición:** [INFORME-ADR065-OLA3-FE-INFRA-v1.0](./INFORME-ADR065-OLA3-FE-INFRA-v1.0.md) **GO**  
**Contratos:** [DS](../specs/2026-07-24-paginacion-numerada-ds-contrato.md) · [UX](../specs/2026-07-24-paginacion-numerada-ux.md) · [ADR-065](../adrs/ADR-065-Paginacion-Numerada-Tablas-Operativas.md)

---

## Entregables

| # | Entregable | Ubicación |
| --- | --- | --- |
| 1 | Suscriptores migrado a anatomía ADR-065 | `apps/portal/src/components/crm/subscribers/SubscribersListClient.tsx` |
| 2 | `subscribersApi.list` → `ListResponse` + dual-emit `total` | `apps/portal/src/lib/api-client.ts` |
| 3 | Helper `listPageWindow` | `apps/portal/src/lib/list-meta.ts` |
| 4 | Specs unitarios (conjuntos disjuntos por página) | `SubscribersListClient.spec.tsx` (8) + `list-meta.spec.ts` |
| 5 | E2E Playwright + capturas | `e2e/tests/portal-crm-subscribers-pagination.spec.ts` → `docs/informes/evidence/adr065-ola4-subscribers/` |
| 6 | Lecciones aprendidas | § siguiente |

**Fuera de alcance:** Ola 5 (cosecha), otras tablas, poblar `sortableFields` (deuda Ola 2).

---

## Anatomía aplicada

- **URL state** vía `useTableQueryState`: `page` (push), `size` / filtros / búsqueda / `sortBy`/`sortDir` (replace + reset página 1).
- **Reemplazo de página** (retirado `mergeSubscribers` y «Cargar más»).
- **Pie:** `PortalTablePager` + `PortalPageSizeSelect` (si `total >` opción mínima).
- **Strip:** sin conteo (modo directorio; conteo solo en el pie).
- **Vocabulario:** `{ singular: 'suscriptor', plural: 'suscriptores' }`.
- **Orden:** solo si `meta.capabilities.sortableFields` incluye el campo → `PortalDataTableSortableHead` (+ Select mobile). Hoy BE emite `sortableFields: []` → orden default servidor; **no se inventan columnas**.
- **Estados:** skeleton primera carga; atenuación + `aria-busy` en refresh; página única / parcial / cero (con «Limpiar filtros»); fuera de rango → `replace` + aviso UX v2-31 una vez.
- **Suspense local** alrededor del cliente (además del root).

### Búsqueda

La búsqueda de la tabla pasa a `GET /crm/subscribers?search=` (paginable). El endpoint determinista `/crm/subscribers/search` (hash PII) **no se usa** en este listado; permanece para pickers / E-4. Placeholder alineado: «nombre, NIT o razón social».

### Dual-emit y E-4

`ListSubscribersResponse = ListResponse<T> & { total }` — `total` plano se conserva para no romper `TaskCoreFields` (typeahead con `response.total`). **No se tocó código E-4.**

---

## Conflicto con E-4 (documentado, no revertido)

`TaskForm.spec.tsx` falla 2 casos de pickers (`listExpedientes` / `subscribersApi.list`): el spec espera `limit: 6` y firma antigua; el código E-4 llama con `limit: 20` + `signal` / `page`. **Fallo preexistente / paralelo a Ola 4** — no causado por el piloto de Suscriptores (dual-emit mantiene `.total`). No se revirtió ni parcheó E-4.

---

## Lecciones aprendidas (valor para Ola 5)

1. **Mocks de listado deben devolver páginas disjuntas** — el test de acumulación («40 filas tras Cargar más») es inválido; el criterio es «página 2 = 20 filas distintas, sin las de página 1».
2. **`size` fuera de `PORTAL_PAGE_SIZE_OPTIONS` se silencia a 20** — no usar `size=2` en tests de empates; usar 10/20/50.
3. **Select `@iwana/ui` es combobox** — `userEvent.selectOptions` / `selectOption` nativo fallan; abrir trigger + `option`.
4. **Conteo del pager aparece dos veces en el DOM** (visible + `aria-live`) — assertions con `getAllByText` / roles, no `getByText` estricto.
5. **`scrollIntoView` rompe jsdom** — mockear o try/catch en el efecto de v2-24.
6. **Matchers E2E:** nunca `url ===` exacto; usar `url.includes('/crm/subscribers')` tolerante a `page`/`size`/`status`.
7. **No acoplar sort UI a lista hardcodeada** — leer `sortableFields`; con `[]` la tabla opera sin cabezales ordenables y con orden default.
8. **Dual-emit `total` + `meta`** evita pelear con pickers E-4 en el mismo PR del piloto.
9. **Suspense local** al adoptar `useSearchParams` / `useTableQueryState`, además del root (recomendación Ola 3).
10. **Búsqueda determinista vs list search** son caminos distintos: el piloto directorio necesita el list paginado; no mezclar acumulación/search exacto en la misma tabla.

---

## Stop/go Ola 4

| Gate | Resultado |
| --- | --- |
| Specs piloto Suscriptores (8) | **GO** |
| `list-meta` (+ `listPageWindow`) | **GO** |
| Typecheck archivos del piloto | **GO** (errores residuales Inventory/`MovementsWorkspace` ajenos — paralelo) |
| `TaskForm.spec` (E-4) | **Conflicto documentado** — no bloquea el piloto; no se revirtió E-4 |
| E2E + evidencia 1280/375 claro/oscuro | Artefacto listo; ejecución/capturas en `docs/informes/evidence/adr065-ola4-subscribers/` al correr Playwright portal |
| Sin commit / sin Ola 5 | Cumplido |

**Veredicto FE-PLATFORM:** listo para **gate AI-SR-QA** (CA-PAG v2 + CA-ORD condicionado a `sortableFields`). Recomendación: **GO-CON-DEUDA** si SR-QA acepta ORD diferido hasta poblar `sortableFields` (Ola 2); **NO-GO** solo si falla el patrón de página/URL/pie en Suscriptores.
