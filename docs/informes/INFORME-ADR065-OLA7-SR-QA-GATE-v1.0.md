# INFORME — Gate final AI-SR-QA · ADR-065 Ola 7 (CA-PAG v2)

**Versión:** 1.0  
**Fecha:** 2026-07-25  
**Autor:** AI-SR-QA  
**Estado:** Gate emitido  
**Entradas:**
- [Plan adopción](../plans/2026-07-24-paginacion-numerada-adopcion.md) · [Kickoff olas restantes](./INFORME-ADR065-KICKOFF-OLAS-RESTANTES-v1.0.md)
- [Ola 4 SR-QA](./INFORME-ADR065-OLA4-SR-QA-GATE-v1.0.md)
- [Ola 7 BE sin cota](./INFORME-ADR065-OLA7-SIN-COTA-v1.0.md)
- Ola 6: [FE Parte B](./INFORME-ADR065-OLA6-FE-PARTE-B-v1.0.md) · [Side peeks](./INFORME-ADR065-OLA6-SIDE-PEEKS-v1.0.md) · [Assets/Counts](./INFORME-ADR065-OLA6-FE-ASSETS-COUNTS-v1.0.md)
- [Spec UX CA-PAG v2 + CA-ORD](../specs/2026-07-24-paginacion-numerada-ux.md)

**Alcance:** verificación de criterios CA-PAG v2 (y CA-ORD donde aplique) al cierre del programa de olas; **sin** implementar features; **sin** commit.

---

## Veredicto

| Campo | Valor |
| --- | --- |
| **Veredicto** | **GO-CON-DEUDA** |
| Patrón CA-PAG directorio (página / URL / pie) en superficies migradas | **GO** |
| Ola 7 BE (`ListMeta` + DEF-2 + desempate `id`) | **GO** (Jest verde) |
| CA-ORD runtime | **GO condicionado** — `sortableFields: []` en producción; no se inventan sortables |
| DoD global «CA-PAG v2 completo + CA-ORD-01…14» | **No cerrado** — deuda viva explícita abajo |
| Release conjunto BE Ola 7 + portal sin FE envelope | **HOLD** — ver H-FE-ENVELOPE-OLA7 |

No hay **P0** que invalide el patrón de paginación numerada ya cosechado (piloto + Olas 5/6). El NO-GO del programa solo aplicaría si fallara el patrón página/URL/pie o hubiera defecto crítico sin mitigación: **no aplica**.

Queda **GO-CON-DEUDA** porque el DoD del plan (CA-PAG v2 completo + ORD + evidencia por ola + sin residuales críticos de adopción) **no** está cerrado, y porque el envelope breaking de Ola 7 BE aún tiene consumidores FE en array plano.

---

## Ejecución de evidencia (esta sesión)

| Compuerta | Resultado | Notas |
| --- | --- | --- |
| `adr065-ola7-sin-cota.spec.ts` + `common/pagination/*` | **PASS** | 7 suites / 78 tests |
| Suites CRM/org/WFM tocadas por Ola 7 | **PASS** | 23 suites / 228 tests (contracts, potentials, opportunities, organization, schedule-events, work-orders, eventualities, HTTP/isolation WFM, …) |
| Portal: piloto + cosecha + Ola 6 pager | **PASS** | 15 suites / 77 tests (`SubscribersListClient`, `list-meta`, `portal-ui`, Assurance tickets, UsefulLife, Kardex, Purchase/Issues/Assets/Counts/Suppliers, StockWorkspace, …) |
| E2E `portal-crm-subscribers-pagination.spec.ts` | **PASS** | 1/1 · ~5.7 s — único E2E de pager del programa |
| E2E cosecha Ola 5/6 / Ola 7 FE | **BLOQUEO** | No existen specs Playwright equivalentes; evidencia visual solo en `docs/informes/evidence/adr065-ola4-subscribers/` |
| Checklist manual AA foco / v2-34 / v2-35 | **SIN EVIDENCIA** | Arrastra Ola 4 (H-MANUAL-01) |

---

## Matriz CA-PAG v2 (agregada · programa)

Clasificación por superficie: **directorio** donde `randomAccess: true` y pager numerado; **feed** donde se conserva «Cargar más» / `randomAccess: false`; **N/A** fuera de tablas operativas.

Leyenda: **PASS** · **PARCIAL** · **N/A** · **DEUDA** · **BLOQUEO evidencia**.

### Comunes

| ID | Resultado | Evidencia / nota |
| --- | --- | --- |
| v2-01 | **PASS** (migradas) | Unit piloto + workspaces Ola 5/6: primera página ≤ size (default 20) |
| v2-02 | **PASS** (migradas) | Peticiones con `limit`; soft-cap sin meta residual en `sla-policies` (deuda) |
| v2-03 | **PASS** (migradas) | Filtros fuera del shell (`portalDataTableShellClassName`) |
| v2-04 | **PASS** (piloto + varias) | Empty filtrado ≠ vacío; CTA limpiar donde aplica |
| v2-05 | **PARCIAL** | Primitive Ola 3; sin E2E de teclado/foco fuera del piloto |
| v2-06 | **PARCIAL** | `min-h-11` en pager; sin medición visual 44×44 sistemática |
| v2-07 | **PARCIAL** | Soft refresh + atenuación; sin assert de altura de shell |
| v2-08 | **PASS** (piloto E2E) | Conteo visible único + `aria-live` sr-only |
| v2-09 | **PASS** (código migrado) | Sin ornamento de pie |

### Feed (`randomAccess: false`)

| ID | Resultado | Nota |
| --- | --- | --- |
| v2-10…v2-13 | **PASS / N/A** | TasksTable E-2 feed; kárdex/audit/colas según flag; no se forzó pager numerado |

### Directorio (`randomAccess: true`)

| ID | Resultado | Evidencia / nota |
| --- | --- | --- |
| v2-20 | **PASS** (migradas) | `useTableQueryState` + URL namespaced |
| v2-21 | **PASS** | `push` página / `replace` filtros·size·sort |
| v2-22 | **PASS** | Unit: size → page 1 |
| v2-23 | **PASS** | Unit: filtro/orden → page 1 |
| v2-24 | **PASS** (código) | `scrollIntoView` al shell |
| v2-25 | **PARCIAL** | Primitive; sin E2E foco ≠ body fuera de piloto |
| v2-26 | **PASS** (piloto) | `aria-live` + anuncio |
| v2-27 | **PASS** | Skeleton 1ª carga; refresh atenuado |
| v2-28 | **PASS** | Página única: solo conteo |
| v2-29 | **PASS** | Cero resultados: sin pie |
| v2-30 | **PASS** | Última página parcial sin relleno |
| v2-31 | **PASS** | Fuera de rango → replace + aviso |
| v2-32 | **PASS** | `parsePositiveInt` → 1 |
| v2-33 | **PARCIAL** | Retroceso página vacía; post-mutación in-list uneven |
| v2-34 | **BLOQUEO evidencia** | Capturas claro/oscuro solo piloto; AA deshabilitado sin axe |
| v2-35 | **DEUDA / BE** | Alcance por operador — no cerrado en gate FE |
| v2-36 | **N/A** mayoritario | Sin selección múltiple en superficies migradas |

**Superficies Ola 7 BE sin UI de directorio aún:** WFM events/WO, purchase orders (consumidores FE en array) — CA-PAG de producto **no aplica** hasta FE; riesgo de regresión de listado documentado abajo.

---

## Matriz CA-ORD (donde aplique)

| ID | Resultado | Nota |
| --- | --- | --- |
| CA-ORD-01 | **PASS** | FE lee `sortableFields`; no inventa listas locales (piloto + cosecha + Ola 6) |
| CA-ORD-02…11, 13–14 | **N/A (runtime)** | `sortableFields: []` post Ola 2 (sin p95) |
| CA-ORD-12 | **PASS (mock / BE)** | Unit piloto con mock; desempate `id` en Ola 7 BE |
| CA-ORD-03…06 (infra) | **Cubierto** | `setSort` → `replace` + page 1; ciclo UI 3 estados diferido |

**Regla de gate:** no se falla ORD por columnas no publicadas; se fallaría solo si el FE inventara sortables — **no ocurre**.

---

## Deuda viva restante (matriz agregada)

| ID | Ítem | Severidad | Estado | Dueño | Notas |
| --- | --- | --- | --- | --- | --- |
| **D-AGG** | Matriz agregación ubicaciones / retirar `drainInventoryBalances` | **P1** | Abierta (Ola 6) | SR-FULL → FE | Aviso UI + drain; sin endpoint de agregación |
| **D-SLA** | `GET /assurance/sla-policies` — `.take(100)` sin `ListMeta` | **P2** | Residual Ola 7 | SR-FULL | Cardinalidad baja; excepción candidata documentada |
| **D-P95** | Medición p95 + `sortableFields` no vacíos + R-5 | **P1** (perf/ORD) | Ola 2 incompleta | SR-FULL · PLAT-OPS | Índices 089 OK; sin p95 no se publican campos |
| **D-WEB-UI** | `apps/web` users/audit/tenants + graduación `@iwana/ui` | **P2** | Diferido | FE-PLATFORM · EM-ARCH | Sin segundo consumidor del pager |
| **H-UX-375** | `PortalPageSizeSelect` bajo `sm` debe ir junto a filtros (§5 UX) | **P2** | Abierta | FE-PLATFORM | Sigue en pie vía `pageSizeControl` (piloto y cosecha) |
| **E-4** | Residual categorías / producto comercial soft-cap | **P2** | Parcial (F5A/B GO) | FE-PLATFORM | Sin `categories/search`; producto comercial en drawer |
| **H-FE-ENVELOPE-OLA7** | Consumidores FE aún tipados/usando **array plano** frente a BE `{ data, meta }` | **P1 · HOLD release** | Abierta | FE-PLATFORM | `wfmApi.events.list`, `wfmApi.workOrders.list`, `purchasingApi.listOrders`; `CalendarSettingsClient` trata `organizationApi.list()` como array pese a `ListResponse` en client |
| **H-E2E-COSECHA** | E2E + capturas 1280/375 claro/oscuro por módulo migrado | **P2** | Solo piloto | SR-QA · FE | Olas 5–6 sin Playwright de pager |
| **H-MANUAL-01** | v2-25 foco, v2-34 AA disabled, v2-35 alcance | **P2** | Sin evidencia | SR-QA | Checklist manual / axe |
| **D-EXC** | `access-control` permissions/profiles; `replenishment/suggestions` | — | Excepción ADR | — | No tocar (Ola 7 BE) |

---

## Hallazgos de esta corrida

### P0 — Bloqueantes de patrón / producto del gate

*Ninguno* sobre el patrón página/URL/pie en superficies ya migradas.

### P1

| ID | Hallazgo | Impacto | Destino |
| --- | --- | --- | --- |
| **H-FE-ENVELOPE-OLA7** | BE Ola 7 rompe envelope array→`{data,meta}` en WFM/purchasing; FE sigue con `Array.isArray` / `.find` sobre respuesta. Org settings ya consumen `ListResponse`; Calendar settings **no**. | Agenda WFM / OC / sitios de calendario vacíos o rotos si se despliega BE sin FE | FE-PLATFORM antes de release; dual-emit temporal o paridad FE |
| **D-AGG** | Matriz sigue drenando balances | Perf + lectura cruzada incompleta | SR-FULL endpoint + FE |
| **D-P95** | ORD runtime y ajuste `randomAccess` sin medición | CA-ORD diferido; riesgo de directorio lento | Sub-fase Ola 2 |

### P2

| ID | Hallazgo | Destino |
| --- | --- | --- |
| **H-UX-375** | Page size en pie en 375 px | Receta dual filtros/pie |
| **D-SLA** | sla-policies sin meta | Follow-up o excepción firmada |
| **D-WEB-UI** | Web sin pager / `@iwana/ui` | PR dedicado post graduación |
| **E-4 residual** | Categorías / producto comercial | Micro-ola pickers |
| **H-E2E-COSECHA** / **H-MANUAL-01** | Evidencia incompleta fuera del piloto | SR-QA + FE |

---

## Trazabilidad criterio ↔ evidencia (muestra)

| Criterio | Evidencia |
| --- | --- |
| Ola 7 ListMeta + DEF-2 | `adr065-ola7-sin-cota.spec.ts` (opportunities, quotes, contracts, orders, work-orders) |
| Helper común | `clamp-*` / `build-page-meta` / `picker-search` specs |
| Piloto CA-PAG + ORD-01 | `SubscribersListClient.spec.tsx` + E2E subscribers |
| Cosecha / Ola 6 pager | Specs Assurance, UsefulLife, Kardex, Purchase, Issues, Assets, Counts, Suppliers, StockWorkspace |
| Side peeks no vacíos | `StockWorkspace.spec` (Ola 6 informe) |
| E2E programa | Solo `e2e/tests/portal-crm-subscribers-pagination.spec.ts` |

---

## Decisión de avance

| Pregunta | Respuesta |
| --- | --- |
| ¿El patrón CA-PAG directorio está listo como default de tablas migradas? | **Sí**, con deuda P2 de UX mobile / evidencia |
| ¿El programa ADR-065 puede cerrarse como «completo»? | **No** — DoD global incompleto |
| ¿Se puede mergear Ola 7 BE a un entorno con portal actual? | **No sin FE envelope** (HOLD H-FE-ENVELOPE-OLA7) o dual-emit |
| ¿CA-ORD bloquea el gate? | **No** — ORD-01 OK; resto N/A hasta p95 |
| ¿Veredicto de gate final? | **GO-CON-DEUDA** |

**Firma de gate:** AI-SR-QA · 2026-07-25 · **GO-CON-DEUDA**

---

## Addendum — condiciones para subir a GO

1. Cerrar **H-FE-ENVELOPE-OLA7** (WFM events/WO, purchase orders, CalendarSettings) o dual-emit temporal.
2. Aceptar o cerrar **D-AGG**, **D-P95**, **H-UX-375**, **E-4 residual**, **D-WEB-UI**, **D-SLA** por disposición EM-ARCH.
3. Ampliar E2E/evidencia al menos a una superficie Ola 5 y una Ola 6 (o aceptar explícitamente evidencia solo-piloto).
4. Tras poblar `sortableFields`, re-gate CA-ORD-02…14.
