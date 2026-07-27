# INFORME — Gate AI-SR-QA · ADR-065 Ola 4 (piloto Suscriptores)

**Versión:** 1.0  
**Fecha:** 2026-07-25  
**Autor:** AI-SR-QA  
**Estado:** Gate emitido  
**Entradas:** [INFORME-ADR065-OLA4-PILOTO-SUSCRIPTORES-v1.0](./INFORME-ADR065-OLA4-PILOTO-SUSCRIPTORES-v1.0.md) · [spec UX CA-PAG v2 + CA-ORD](../specs/2026-07-24-paginacion-numerada-ux.md) · código `SubscribersListClient` + specs · BE `sortableFields: []` (Ola 2)  
**Prompt:** `docs/prompts/PROMPT-ADR065-OLA4-PILOTO-v1.0.md`

---

## Veredicto

| Campo | Valor |
| --- | --- |
| **Veredicto** | **GO-CON-DEUDA** |
| Patrón página / URL / pie (CA-PAG directorio core) | **GO** |
| CA-ORD con `sortableFields: []` | **GO condicionado** — no se inventan sortables; ciclo completo diferido a poblar campos (Ola 2) |
| Evidencia E2E 1280/375 claro/oscuro | **Cerrada** (H-E2E-01 · PASS 2026-07-25) — capturas en `docs/informes/evidence/adr065-ola4-subscribers/` |
| Avance a Ola 5 (cosecha) | **Permitido** tras cerrar o aceptar explícitamente la deuda P1 de evidencia E2E |

No hay **P0** de producto sobre el patrón de reemplazo de página, estado en URL ni pie numerado. El NO-GO del prompt («solo si falla el patrón de página/URL/pie») **no aplica**.

---

## Ejecución de evidencia

| Compuerta | Resultado | Notas |
| --- | --- | --- |
| `SubscribersListClient.spec.tsx` (8) | **PASS** | 8/8 — páginas disjuntas, size/filtro replace, fuera de rango, sin sortables inventados, empates con `sortableFields` mock, página única, cero resultados |
| `list-meta.spec.ts` (`listPageWindow` + `normalizeListMeta`) | **PASS** | Incluido en corrida conjunta con piloto |
| Typecheck portal (`tsc --noEmit`) | **PASS** | Sin errores en archivos del piloto en esta corrida |
| `TaskForm.spec.tsx` (E-4, colateral) | **PASS** (7/7) | Conflicto documentado por FE-PLATFORM; en gate actual el spec ya espera `limit: 20` / `page: 1` — **no bloquea**; se registra como deuda colateral histórica |
| E2E `portal-crm-subscribers-pagination.spec.ts` | **PASS** (cierre H-E2E-01 · 2026-07-25) | Matcher estable (`visiblePagerCount` + `exact` en posición mobile). Capturas en `docs/informes/evidence/adr065-ola4-subscribers/` |
| Verificaciones manuales prompt (foco ≠ body, contraste AA deshabilitado, v2-35 alcance) | **Sin evidencia** | Marcadas como deuda / fuera de alcance FE puro |

---

## Matriz CA-PAG v2 (aplicable al piloto)

Clasificación: **directorio** (`meta.capabilities.randomAccess: true`). Variante feed **N/A**.

### Comunes

| ID | Resultado | Evidencia / nota |
| --- | --- | --- |
| v2-01 | **PASS** | Primera petición `page: 1`, `limit: 20` (unit) |
| v2-02 | **PASS** | `listParams` siempre lleva `limit` |
| v2-03 | **PASS** | Filtros/búsqueda fuera del shell de tabla (`portalDataTableShellClassName`) |
| v2-04 | **PASS** | Empty filtrado ≠ vacío inicial; CTA «Limpiar filtros» (unit) |
| v2-05 | **PARCIAL** | Targets/teclado en `PortalTablePager` (Ola 3); sin E2E de foco en esta corrida |
| v2-06 | **PARCIAL** | `min-h-11` / botones pager; sin medición visual 44×44 en evidencia |
| v2-07 | **PARCIAL** | Soft refresh mantiene filas + atenuación; sin assert de altura de shell |
| v2-08 | **PASS** | Un conteo **visible**; duplicado DOM es `sr-only` `aria-live` (contrato v2-26) — no viola «visible una sola vez» |
| v2-09 | **PASS** | Sin «Fin de resultados» / relleno / badge decorativo |

### Feed (`randomAccess: false`)

| ID | Resultado |
| --- | --- |
| v2-10…v2-13 | **N/A** |

### Directorio (`randomAccess: true`)

| ID | Resultado | Evidencia / nota |
| --- | --- | --- |
| v2-20 | **PASS** | `useTableQueryState` + unit (page/size/filtros/sort en URL) |
| v2-21 | **PASS** | `setPage` → `push`; filtros/size/sort → `replace` |
| v2-22 | **PASS** | Unit: `size=10` + sin `page=` (vuelve a 1) |
| v2-23 | **PASS** | Unit: filtro resetea `page` |
| v2-24 | **PASS** | `scrollIntoView` al shell tras cambio de `page` (try/catch jsdom) |
| v2-25 | **PARCIAL** | Retención de foco en primitive Ola 3; **sin E2E** en esta corrida |
| v2-26 | **PASS** (código) | `aria-live="polite"` + anuncio; el fallo E2E confirma que el nodo existe |
| v2-27 | **PASS** | Skeleton solo primera carga; refresh → `opacity-60` + `aria-busy` |
| v2-28 | **PASS** | Unit: «1 suscriptor», sin nav |
| v2-29 | **PASS** | Unit: cero resultados sin pie |
| v2-30 | **PASS** (código/mock) | Página parcial prevista en E2E; unit no lo aísla; mock E2E `PAGE3` length 5 |
| v2-31 | **PASS** | Unit: `page=99` → `replace` `page=2` + aviso exacto una vez |
| v2-32 | **PASS** | `parsePositiveInt` → fallback 1 |
| v2-33 | **PARCIAL** | Retroceso si página vacía con `total>0` implementado; mutaciones CUD viven en otras rutas (remount al volver). Sin spec de post-mutación en listado |
| v2-34 | **SIN EVIDENCIA** | Requiere captura claro/oscuro — bloqueada por E2E rojo |
| v2-35 | **FUERA / BE** | Alcance por operador; no verificable solo en FE del piloto |
| v2-36 | **N/A** | Sin selección múltiple en Suscriptores |

---

## Matriz CA-ORD (condicionado a `sortableFields`)

**Hecho Ola 2:** `apps/api/.../subscribers.service.ts` declara `SORTABLE_FIELDS: string[] = []` y lo emite en `capabilities.sortableFields`.

| ID | Resultado | Nota |
| --- | --- | --- |
| CA-ORD-01 | **PASS** | Unit: con `[]` no hay botones «Ordenar por…» ni Select mobile; `renderHead` solo activa `PortalDataTableSortableHead` si `sortableFields.includes(field)`. **No se inventan sortables locales.** |
| CA-ORD-02…11, 13–14 | **N/A (runtime)** | Sin campos publicados no hay ciclo UI en producción |
| CA-ORD-12 | **PASS (mock)** | Unit con `sortableFields: ['status']`: páginas disjuntas bajo mismo valor (empates) |
| CA-ORD-03…06 (mock parcial) | **Cubierto por infra** | `setSort` hace `replace` + `page: 1`; unit no ejercita el ciclo de tres clics completo en UI |

**Regla de gate aplicada:** no se falla CA-ORD por columnas no publicadas; se falla solo si el FE inventa lista hardcodeada de sortables — **no ocurre**.

---

## Hallazgos

### P0 — Bloqueantes de producto

*Ninguno.*

### P1

| ID | Hallazgo | Impacto | Destino |
| --- | --- | --- | --- |
| **H-E2E-01** | ~~E2E usa `getByText(/Mostrando…/)` en modo estricto…~~ **CERRADO** (FE-PLATFORM 2026-07-25) — ver addendum | Suite E2E verde; capturas regeneradas | Parche aplicado en spec piloto; helper compartido diferido a Ola 5 |

### P2

| ID | Hallazgo | Impacto | Destino |
| --- | --- | --- | --- |
| **H-UX-375-01** | Spec UX §5 / DS: bajo `sm`, `PortalPageSizeSelect` debe ir **junto a filtros**, fuera del pie. El piloto inyecta el control **solo** en `PortalTablePager` (`pageSizeControl`). | En 375 px el selector permanece en el pie | Ola 5: patrón de colocación dual (pie ≥sm / filtros &lt;sm) en la receta de cosecha |
| **H-CA-v2-33** | Sin test que demuestre recarga de página actual tras crear/editar/borrar desde el flujo del listado | Cobertura parcial del criterio | Ola 5 o spec de integración al volver del detalle/alta |
| **H-MANUAL-01** | Sin evidencia de v2-25 (foco), v2-34 (AA deshabilitado), v2-35 (totales por alcance) | Verificaciones del prompt no cerradas | Checklist manual post-parche E2E o axe en Playwright |

### P3

| ID | Hallazgo | Impacto | Destino |
| --- | --- | --- | --- |
| **H-E4-COLATERAL** | Conflicto `TaskForm.spec` (E-4) documentado por FE-PLATFORM (expectativas `limit` / firma). **En esta corrida: PASS 7/7** — no bloquea el piloto | Deuda colateral / ruido de coordinación | Mantener vigilancia; no revertir E-4 por Ola 4 |
| **H-ORD-DEBT** | `sortableFields: []` deja CA-ORD runtime diferido | Orden UI no ejercitable en prod hasta Ola 2 | Poblar `SORTABLE_FIELDS` + re-gate ORD |
| **H-E2E-ORD** | E2E declara orden fuera de alcance («cubierto en unit») | Aceptable mientras BE emite `[]`; al poblar campos, ampliar E2E | Ola 2 / 5 |

---

## Trazabilidad criterio ↔ test (piloto)

| Criterio (muestra) | Spec |
| --- | --- |
| Reemplazo de página / no acumulación | `reemplaza la página: página 2 muestra filas distintas` |
| v2-22 size → page 1 | `cambia el tamaño con replace y vuelve a página 1` |
| v2-23 filtro → page 1 | `filtro hace replace y resetea página` |
| v2-31 fuera de rango | `corrige página fuera de rango con replace y aviso una sola vez` |
| CA-ORD-01 sin inventar | `sin sortableFields no inventa encabezados ordenables` |
| CA-ORD-12 empates (mock) | `con sortableFields autorizados ordena y no repite filas…` |
| v2-28 / v2-29 | `página única…` / `cero resultados: sin pie` |
| Ventana de conteo | `list-meta.spec.ts` → `listPageWindow` |

---

## Lecciones a incorporar en Ola 5 (cosecha)

1. **Matchers de conteo:** siempre asumir DOM dual (visible + `aria-live`). Unit ya usa `getAllByText`; **E2E debe igualar** o el gate se queda sin evidencia aunque el producto esté bien.
2. **Aplicar lecciones del piloto al propio E2E del piloto** antes de declarar «artefacto listo» — la lección #4 existía y el spec Playwright la violó.
3. **`sortableFields: []` es estado válido:** la receta de cosecha debe ramificar UI (sin cabezales ordenables / sin Select mobile) y no hardcodear columnas por módulo.
4. **Page size en 375:** al migrar cada tabla, decidir colocación del `pageSizeControl` (filtros vs pie) según UX §5; el slot del pager no basta solo.
5. **Mocks disjuntos por página** y `size` ∈ `{10,20,50}` — ya documentado; obligatorio en plantilla de specs de cosecha.
6. **Dual-emit `total` + `meta`** y no tocar pickers E-4 en el mismo PR de migración de directorio — reduce colisiones; vigilar `TaskForm` como canario.
7. **Suspense local** al adoptar `useTableQueryState` — mantener en la checklist de migración.
8. **Evidencia visual es deliverable del gate**, no opcional: sin capturas, el veredicto máximo es GO-CON-DEUDA aunque los unit pasen.
9. **v2-33 en listados sin mutación in-place:** documentar si el remount al volver del alta/detalle es la estrategia aceptada, o exigir `loadPage` post-mutación explícito.
10. **Al poblar `sortableFields`:** reabrir CA-ORD-02…14 + E2E de ciclo de tres estados × página × filtro (hoy solo unit condicional).

---

## Decisión de avance

| Pregunta | Respuesta |
| --- | --- |
| ¿Se puede cosechar (Ola 5) el patrón? | **Sí, con deuda explícita** — no replicar el matcher E2E roto; cerrar H-E2E-01 en paralelo o como primer ítem de Ola 5 |
| ¿Hay que corregir el patrón de producto antes de cosechar? | **No** (no hay P0 de página/URL/pie) |
| ¿CA-ORD bloquea? | **No** — Ola 2 `[]`; ORD-01 verificado |

**Firma de gate:** AI-SR-QA · 2026-07-25 · **GO-CON-DEUDA**

---

## Addendum — cierre H-E2E-01 (AI-FE-PLATFORM · 2026-07-25)

| Campo | Valor |
| --- | --- |
| **Hallazgo** | H-E2E-01 |
| **Cambio** | `e2e/tests/portal-crm-subscribers-pagination.spec.ts` — helper local `visiblePagerCount` (`p:not([aria-live])` + texto del conteo) y `getByText('Página N de M', { exact: true })` en 375 px (evita el mismo choque con `aria-live`). Aplica lección piloto #4; no se extrajo helper compartido (Ola 5). |
| **CA-PAG** | Se mantiene aserción de conteo visible (v2-08); no se debilitó a `getAllByText` sin filtrar live. |
| **E2E** | **PASS** — `pnpm test:e2e:portal -- e2e/tests/portal-crm-subscribers-pagination.spec.ts` (1/1, ~5.7s). |
| **Evidencia** | Capturas regeneradas en `docs/informes/evidence/adr065-ola4-subscribers/`. |
| **H-UX-375-01 (P2)** | **Residual** — no trivial: exige colocación dual del `PortalPageSizeSelect` (filtros &lt;sm / pie ≥sm) en receta de cosecha Ola 5; no se parcheó solo en el piloto. |

**H-E2E-01 cerrado.** Deuda P1 de evidencia E2E del gate Ola 4 resuelta.
