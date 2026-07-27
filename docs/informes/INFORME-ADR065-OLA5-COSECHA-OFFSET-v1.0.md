# INFORME — ADR-065 Ola 5 · Cosecha de superficies offset

**Versión:** 1.0  
**Fecha:** 2026-07-25  
**Autor:** AI-FE-PLATFORM  
**Estado:** Entregado parcial — checklist residual abajo; stop/go pendiente AI-SR-QA  
**Prompt:** `docs/prompts/PROMPT-ADR065-OLA5-COSECHA-OFFSET-v1.0.md`  
**Precondición:** [INFORME-ADR065-OLA4-PILOTO-SUSCRIPTORES-v1.0](./INFORME-ADR065-OLA4-PILOTO-SUSCRIPTORES-v1.0.md) GO provisional  
**Decisiones EM-ARCH:** E-2 TasksTable=FEED; E-3 SeguimientoTab «todos»; filtro cliente → diferir; `sortableFields`/`randomAccess` del servidor

---

## Entregables de esta sesión (≥3 módulos / superficies portal)

| # | Superficie | Anatomía | Specs |
| --- | --- | --- | --- |
| 1 | **Assurance · tickets** | URL `useTableQueryState` + `PortalTablePager` (`randomAccess` del `meta`); reemplazo de página; strip de conteo retirado del pie duplicado; búsqueda = filtro **local de la página actual** (no miente al pager); `Suspense` local | `AssuranceTicketsTable.spec` + `AssuranceClient.spec` |
| 2 | **Inventario · vida útil** | Namespace URL `usefulLife.*` + pager; status filtro servidor; sin «Cargar más» si `randomAccess` | `UsefulLifeAlertsPanel.spec` |
| 3 | **Inventario · kárdex** | Namespace URL `kardex.*` + pager; filtros servidor vía `buildListMovementsParams`; sin acumulación | `StockKardexPanel.spec` |

**API client:** `assuranceApi.tickets.list` normaliza dual-emit → `ListAssuranceTicketsResponse` (`ListResponse` + `total`).

**Veredicto local specs:** 15/15 verdes en las cuatro suites tocadas.

---

## Anatomía replicada del piloto Ola 4

- Página: `history.push`; filtros/size: `replace` + reset página 1.
- Pie: `PortalTablePager` + `PortalPageSizeSelect` cuando `total >` opción mínima y `randomAccess`.
- Si `randomAccess: false` → se conserva `PortalTablePagination` («Cargar más») con el mismo contrato de datos.
- `sortableFields`: solo del servidor (hoy `[]` en tickets / inventario flat) — **no se inventan columnas**.
- Inventario sin `meta` completo en runtime: FE deriva `ListMeta` con `normalizeListMeta` + `capabilities.randomAccess: true` provisional (Ola 2 tabla p95 pendiente).
- Mocks de test: **páginas disjuntas**; no acumular filas.

---

## Diferidas a Ola 6 / coordinación (motivo)

| Superficie | Motivo |
| --- | --- |
| `TasksTable` / Operations | **E-2 FEED** — no migrar a pager numerado; conserva «Cargar más» |
| `SuppliersPanel`, `PurchaseWorkspace`, `StockCountsWorkspace` (+ Issues / StockByProduct / LocationsMatrix con filtro cliente) | **Filtro en cliente** — pie mentiroso si se pagina offset; subir filtro a servidor (SR-FULL) o Ola 6 |
| `AssetLoansPanel`, historial `WriteOffsPanel` | **Hecho** en residual — [INFORME-ADR065-OLA5-RESIDUAL-INVENTARIO-v1.0](./INFORME-ADR065-OLA5-RESIDUAL-INVENTARIO-v1.0.md) |
| Lista de activos en `AssetsWorkspace` | Sigue cursor/`«Cargar más»` hasta offset servidor |
| `PendingVisitRequestInbox` | Cola que se vacía; candidato `randomAccess: false` — adoptar envelope + conservar «Cargar más» cuando el BE declare el flag |
| `SeguimientoTab` timeline | **Excepción E-3 preview** documentada en código: pager ad hoc + opción «todos» (no portar sin retirar «todos») |
| Web: users / audit / tenants | Sin consumo de `portal-ui`; primer consumidor web de pager dispararía **graduación `@iwana/ui`** → escalar EM-ARCH. Diferido a PR dedicado web |
| Comercial Select mobile sort | Fuera de alcance de esta cosecha offset (ya en piloto patrón) |

---

## Graduación `@iwana/ui`

**No disparada.** `apps/web` aún no es segundo consumidor de `PortalTablePager` / `PortalPageSizeSelect`. Cuando users/tenants/audit migren, abrir escalación EM-ARCH (contrato DS §2) antes de mover frontera de paquete.

---

## Checklist residual Ola 5

- [x] Migrar **comodatos + historial Bajas** a pager — ver [INFORME-ADR065-OLA5-RESIDUAL-INVENTARIO-v1.0](./INFORME-ADR065-OLA5-RESIDUAL-INVENTARIO-v1.0.md)
- [ ] Migrar **lista de activos** cuando `listAssets` sea offset (hoy cursor / «Cargar más»)
- [ ] Pending visits: envelope + `randomAccess` del servidor
- [ ] Web users / audit / tenants (tras decisión graduación UI)
- [ ] Evidencia Playwright 1280/375 claro/oscuro por módulo migrado
- [ ] Matchers E2E tolerancia a `page`/`size` en assurance e inventory
- [ ] `audit-ui.mjs` sin P0/P1 nuevos en superficies tocadas
- [ ] Gate `pnpm --filter @iwana/portal test` / build full (esta sesión: suites Ola 5 verdes)

---

## Stop/go FE-PLATFORM

| Gate | Resultado |
| --- | --- |
| Specs Assurance + UsefulLife + Kardex | **GO** (15) |
| TasksTable no tocado (E-2) | Cumplido |
| Filtro-cliente no migrado mentiroso | Cumplido (diferidas listadas) |
| SeguimientoTab «todos» no portado | Cumplido (comentario + excepción) |
| Sin commit | Cumplido |
| Graduación `@iwana/ui` | No aplica aún |
| E2E / evidencia navegador / build monorepo | **Pendiente** residual |

**Veredicto:** cosecha **parcial GO** — tres superficies portal listas para gate SR-QA; inventario Activos/Bajas y web quedan en checklist residual sin big-bang.
