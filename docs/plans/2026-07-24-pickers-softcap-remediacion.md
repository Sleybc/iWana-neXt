# Plan — Remediacion de pickers con soft-cap silencioso (E-4 ADR-065)

**Fecha:** 2026-07-24
**Estado:** **GO-CON-DEUDA** · F1–F5B hechas · Residual: categorías + producto comercial embebido · Medición multi-tenant pendiente de entorno
**Orquestador:** AI-EM-ARCH (modo Architect + Orchestrator)
**ADR:** [ADR-065](../adrs/ADR-065-Paginacion-Numerada-Tablas-Operativas.md) §Excepciones ("Pickers y selectores en modal — deuda P1 independiente")
**ADR relacionado:** [ADR-064](../adrs/ADR-064-Paginacion-Tablas-Operativas-Portal.md) §8 (cota obligatoria vigente)
**Escalacion origen:** [E-4](../plans/2026-07-24-escalaciones-abiertas-paginacion.md#e-4--pickers-con-soft-cap-silencioso--deuda-p1-independiente)
**Prioridad:** P1 — fuera del camino critico de ADR-065

---

## Objetivo

Eliminar el truncamiento silencioso en pickers y selectores dentro de modales/drawers, reemplazando la carga con `limit` fijo sin advertencia por busqueda tipo-ahead contra el servidor con devolucion en tiempo real.

---

## Diagnostico

### Inventario completo de pickers con soft-cap

| Archivo | Linea | Limite | Contexto | En modal? | Advierte? |
|---|---|---|---|---|---|
| `CreateContractDialog.tsx` | 121-123 | 100 (PICKER_SOFT_CAP) | Plans/Products/Services catalogo | Si | **NO** |
| `ConvertExpedienteToContractDialog.tsx` | 41 | 100 | Plans catalogo | Si | **NO** |
| `expedientes/[id]/page.tsx` | 241-265 | 100 (magico) | Plans/Products/Services | No | **NO** |
| `expedientes/[id]/page.tsx` | 631 | 100 (magico) | **Usuarios activos — pagina unica, sin cursor** | No | **NO** |
| `TaskCoreFields.tsx` | 155, 164 | 6 | Prospect/Subscriber search | No (listbox) | **NO** |
| `SupplierPicker.tsx` | 64 | API default | Proveedor combobox | No | **NO** |
| `SupplierMultiPicker.tsx` | 65 | API default | Proveedor multi-combobox | No | **NO** |
| `InventoryClient.tsx` | 667-1295 | 100 (INVENTORY_PICKER_SOFT_CAP) | 13 prefetches de items/locations/assets/balances | Si (sub-componentes) | **NO** |
| `StockItemDetailDrawer.tsx` | 86 | 10 | Movimientos en drawer | Si | **NO** |

**Hallazgos criticos adicionales:**

- `expedientes/[id]/page.tsx:631` es el unico user picker que NO drena todas las paginas con cursor. Los demas (`AssuranceClient.tsx`, `OperationsClient.tsx`, `portal-user-options.ts`) ya usan cursor loop completo.
- `InventoryClient.tsx` usa `INVENTORY_PICKER_SOFT_CAP = 100` en 13 lugares distintos.
- Solo la matriz de balances (`stockLocationsMatrix`) muestra advertencia de truncamiento ("Ocupacion parcial"). Todos los demas truncan en silencio.
- `TaskCoreFields.tsx:155,164` usa `limit: 6` — si hay 50 prospectos que coinciden, el operador solo ve 6 sin saber que hay 44 mas.
- Los pickers de proveedores (`SupplierPicker`, `SupplierMultiPicker`) **no pasan `limit`** — dependen del default del backend, que es igual de opaco.

### Precedentes de lookup en el repo

Ya existen endpoints de busqueda tipo-ahead que sirven de patron:

| Endpoint | Archivo | Tipo |
|---|---|---|
| `GET /crm/subscribers/search` | `subscribers.controller.ts:119` | Busqueda de suscriptores |
| `GET /purchasing/suppliers/lookup` | `purchasing.controller.ts:318` | Busqueda de proveedores |

Ambos son **lookups**, no listados. El patron existe; la remediacion es expansion, no invencion.

---

## RACI

| Que | R | A | C | I |
|---|---|---|---|---|
| Inventariar + medir cardinalidad real | AI-SR-FULL | AI-EM-ARCH | — | — |
| Definir patron UX de picker con busqueda | AI-PROD-UX | AI-EM-ARCH | AI-DS-OWNER | AI-FE-PLATFORM |
| Contratar componente en design system | AI-DS-OWNER | AI-EM-ARCH | AI-PROD-UX | AI-FE-PLATFORM |
| Exponer endpoints de lookup por dominio | AI-SR-FULL | AI-EM-ARCH | AI-SEC-ENG | AI-FE-PLATFORM |
| Implementar pickers + migrar por modulo | AI-FE-PLATFORM | AI-EM-ARCH | AI-DS-OWNER, AI-PROD-UX | AI-SR-QA |

---

## Fases

### Fase 1 — Inventario de cardinalidad · AI-SR-FULL · **CERRADA 2026-07-25 (con bloqueo de medición representativa)**

**Entregable:** [INFORME-E4-PICKERS-FASE1-CARDINALIDAD-v1.0](../informes/INFORME-E4-PICKERS-FASE1-CARDINALIDAD-v1.0.md).

**Decisión AI-EM-ARCH:** local N=1 no representativo → **no reducir** fases 3–5. Remediación sigue justificada por truncamiento silencioso en código. Medición `tenants_over_cap` + p95 → [runbook PLAT-OPS](../informes/INFORME-E4-PICKERS-MEDICION-OPS-v1.0.md) — **BLOQUEO PENDIENTE DE ENTORNO** (staging/prod-read N≥3); no inventar números.

Medir contra la base de datos (no estimar) — protocolo en informe; estado local:

| Entidad | Cap actual | Cuantos tenants lo superan | Percentil 95 de cardinalidad |
|---|---|---|---|
| Usuarios activos | 100 | *pendiente multi-tenant* | *pendiente* |
| Planes activos | 100 | *pendiente multi-tenant* | *pendiente* |
| Productos adicionales activos | 100 | *pendiente multi-tenant* | *pendiente* |
| Servicios adicionales activos | 100 | ? | ? |
| Items de inventario | 100 | ? | ? |
| Locations | 100 | ? | ? |
| Assets | 100 | ? | ? |
| Proveedores | API default | ? | ? |

**Entregable:** Tabla con cardinalidad real. Si cero tenants superan el cap, la fase 3-5 se reduce a documentar.

### Fase 2 — Spec UX de picker con busqueda · AI-PROD-UX · **CERRADA 2026-07-25**

**Objetivo:** Definir el patron unico de picker con busqueda tipo-ahead para todo el portal.

**Entregable:** [docs/specs/2026-07-25-picker-typeahead-servidor-ux.md](../specs/2026-07-25-picker-typeahead-servidor-ux.md) — **congelada** (CA-PICK-01…16, estados S0–S6).

### Fase 3 — Contrato DS · AI-DS-OWNER · **CERRADA 2026-07-25**

**Entregable:** [docs/specs/2026-07-25-searchable-picker-ds-contrato.md](../specs/2026-07-25-searchable-picker-ds-contrato.md) — portal-first (`apps/portal/src/components/shared/`), no `@iwana/ui` en E-4.

### Fase 4 — Endpoints de lookup · AI-SR-FULL · **CERRADA 2026-07-25**

**Objetivo:** Exponer endpoints de busqueda por dominio donde no existan.

**Entregable:** [INFORME-E4-PICKERS-FASE4-LOOKUPS-v1.0](../informes/INFORME-E4-PICKERS-FASE4-LOOKUPS-v1.0.md).

| Dominio | Endpoint propuesto | Existe? | Parametros |
|---|---|---|---|
| Usuarios | `GET /users/search?q=&status=ACTIVE` | **Si (F4)** | q, status, limit |
| Planes | `GET /commercial/plans/search?q=&isActive=true` | **Si (F4)** | q, isActive, limit |
| Productos adicionales | `GET /commercial/additional-products/search?q=&isActive=true` | **Si (F4)** | q, isActive, limit |
| Servicios adicionales | `GET /commercial/additional-services/search?q=&isActive=true` | **Si (F4)** | q, isActive, limit |
| Items inventario | `GET /inventory/items/search?q=` | **Si (F4)** | q, limit |
| Locations | `GET /inventory/locations/search?q=` | **Si (F4)** | q, limit |
| Assets | `GET /inventory/assets/search?q=` | **Si (F4)** | q, limit |
| Suscriptores | `GET /crm/subscribers/search?q=` | **Si (exacto; gap typeahead)** | documentado dual-emit |
| Proveedores | `GET /purchasing/suppliers/lookup?q=` | **Si (documento; gap typeahead)** | documentado dual-emit |

Contrato uniforme: `GET /{domain}/{resource}/search?q={string}&limit={number}`. Respuesta: `{ data: { id, label, sublabel }[], total: number }`. Maximo 20 resultados por query.

### Fase 5 — Implementacion y migracion por modulo · AI-FE-PLATFORM · **Oleada A GO** · residual A + oleada B pendientes

**Informe oleada A:** [INFORME-E4-PICKERS-FASE5-OLEADA-A-v1.0](../informes/INFORME-E4-PICKERS-FASE5-OLEADA-A-v1.0.md)

**Orden de migracion** (por riesgo — los que mas truncan primero):

1. **Atribucion de usuarios** — **hecho** (SeguimientoTab + users/search).
2. **Catalogos en dialogos + CommercialInterestSection** — **hecho** ([addendum](../informes/INFORME-E4-PICKERS-FASE5-OLEADA-A-ADDENDUM-v1.0.md)).
3. **Pickers de inventario** (`InventoryClient`) — **oleada B en curso**.
4. **Pickers de proveedores** — **hecho**.
5. **TaskCoreFields** — **hecho**.

Cada modulo se migra completo: se retira el prefetch con `PICKER_SOFT_CAP`, se monta `SearchablePicker` con el endpoint de lookup correspondiente, y se verifica que el componente deja de truncar en silencio.

---

## Criterio de salida

- `grep PICKER_SOFT_CAP` no devuelve resultados en `apps/portal/src/` (la constante se depreca).
- `grep INVENTORY_PICKER_SOFT_CAP` no devuelve resultados en `apps/portal/src/`.
- Ningun picker dentro de modal/drawer carga con `limit` fijo sin busqueda.
- `SearchablePicker` es el unico componente usado para seleccion de entidades en modales.
- SR-QA verifica con un tenant de >100 items/usuarios/planes que todos los pickers muestran resultados mas alla del soft-cap anterior.

---

## No entra en este plan

- La paginacion numerada de tablas operativas (eso es ADR-065).
- El orden por columna (ADR-065 §17-22).
- Los pickers de dashboard/widgets con limite fijo intencional (ej. `RecentActivityPanel` con `limit: 8`).
- La matriz de balances (ya tiene advertencia de truncamiento).
