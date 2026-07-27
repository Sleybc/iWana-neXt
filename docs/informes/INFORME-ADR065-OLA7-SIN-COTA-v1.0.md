# INFORME — ADR-065 Ola 7 · Grupo sin cota (ADR-064 §8)

**Versión:** 1.0  
**Fecha:** 2026-07-25  
**Autor:** AI-SR-FULL  
**Estado:** Entregado parcial ampliado — ≥8 recursos prioritarios + 3 extras; residual abajo  
**Plan:** [2026-07-24-paginacion-numerada-adopcion.md](../plans/2026-07-24-paginacion-numerada-adopcion.md) §Ola 7  
**Kickoff:** [INFORME-ADR065-KICKOFF-OLAS-RESTANTES-v1.0.md](./INFORME-ADR065-KICKOFF-OLAS-RESTANTES-v1.0.md)  
**Predecesor:** Ola 6 GO-CON-DEUDA — [KEYSET](./INFORME-ADR065-OLA6-KEYSET-v1.0.md) · [FE Parte B](./INFORME-ADR065-OLA6-FE-PARTE-B-v1.0.md)  
**Clasificación:** Uso interno  
**Commit:** No (orden orquestador)

---

## Resumen ejecutivo

Los listados del plan Ola 7 ya tenían soft-cap `.take(100)` (parche Ola 1) pero **ninguno** exponía `page`/`limit` + `ListMeta`. Esta ola los migra al contrato ADR-065 (`ListResponse<T>` vía `clampLimit` + `clampPage` DEF-2 + `buildPageMeta`, `sortableFields: []`, desempate `id`). Sin UI. Sin matriz de agregación (residual Ola 6).

**Veredicto propuesto:** **GO-CON-DEUDA** — BE listo para gate SR-QA; residual documentado (SLA policies, access-control excepciones, FE consumidores del envelope plano).

---

## 1. Recursos paginados

| # | Endpoint | Antes | Ahora | Notas |
| --- | --- | --- | --- | --- |
| 1 | `GET /purchasing/orders` | array plano + take 100 | `{ data, meta }` page/limit | Zod `page`/`limit` |
| 2 | `GET /wfm/events` | array plano + take 100 | `{ data, meta }` | DTO + desempate `id` ASC |
| 3 | `GET /wfm/work-orders` | array plano + take 100 | `{ data, meta }` | Query `page`/`limit` |
| 4 | `GET /opportunities` | `{ data }` + take 100 | `{ data, meta }` | pipes CRM |
| 5 | `GET /quotes` | `{ data }` + take 100 | `{ data, meta }` | pipes CRM |
| 6 | `GET /crm/contracts` | `{ data }` + take 100 | `{ data, meta }` | pipes CRM |
| 7 | `GET /crm/potentials` | `{ data }` + take 100 | `{ data, meta }` | deprecated OK |
| 8 | `GET /organization/sites` | `{ data }` + take 100 | `{ data, meta }` | DTO local (sin import CRM) |

### Extras mismo sweep

| Endpoint | Antes | Ahora |
| --- | --- | --- |
| `GET /crm/subscribers/:id/contracts` | **sin cota** | `{ data, meta }` page/limit |
| `GET /wfm/technicians/availability` | take 100 | `{ data, meta }` |
| `GET /wfm/operational-eventualities` | **sin cota** | `{ data, meta }` |

Conteo plan “9”: el 9º era el hermano `findAllBySubscriber` (sin `take`) — cerrado aquí.

---

## 2. Contrato aplicado

- Helper: `apps/api/src/common/pagination/` (`clampLimit`, `clampPage`, `buildPageMeta`, `ListMetaDto`).
- Default limit **20**, max **100**; DEF-2 `page * limit <= 10_000` → 400.
- `meta.capabilities.sortableFields: []` (sin p95 / sin índices Ola 2 publicados).
- `meta.capabilities.randomAccess: true`, `mode: 'page'`.
- ORDER BY recurso + **desempate `id`** en la misma dirección.
- Multi-tenant: sin cambios de schema; `runInTenantSchema` + `tenant_id` en QB donde aplica.
- **Breaking envelope** WFM/purchasing: array → `{ data, meta }`. CRM/org: `{ data }` → `{ data, meta }`.

---

## 3. OpenAPI + tests

| Artefacto | Resultado |
| --- | --- |
| Controllers CRM/org/WFM | `@ApiQuery` `page`/`limit` + `ListMetaDto` / DTO query |
| Purchase orders DTO | Zod + Swagger `page`/`limit` |
| `adr065-ola7-sin-cota.spec.ts` | opportunities DEF-2, quotes, contracts (+by-sub), orders, work-orders MAX_LIMIT |
| Specs actualizados | contracts, potentials, opportunities ctrl, org service/HTTP, schedule-events, operational-eventualities, inventory HTTP mock |

**Evidencia Jest (sesión):** suites Ola 7 + specs tocados **verdes** (`adr065-ola7-sin-cota`, org HTTP, schedule-events, contracts, potentials, …).

---

## 4. Checklist residual

| Ítem | Estado | Dueño |
| --- | --- | --- |
| Gate final SR-QA CA-PAG v2 | **Pendiente** | AI-SR-QA |
| FE consumidores envelope plano (WFM events/WO, purchase orders) | **Pendiente** | AI-FE-PLATFORM |
| `GET /assurance/sla-policies` (take 100, sin ListMeta) | Residual — cardinalidad baja | SR-FULL follow-up o excepción |
| `access-control` permissions/profiles | **Excepción ADR** (matriz/seed) — no tocar | — |
| `replenishment/suggestions` | **Excepción** (cómputo full documentado) | — |
| Matriz agregación ubicaciones | Residual **Ola 6** — fuera de alcance | SR-FULL/FE según Ola 6 |
| Índices / `sortableFields` no vacíos | Ola 2 + medición p95 | — |
| Actualizar plan adopción §Ola 7 → GO-CON-DEUDA | Orquestador | AI-EM-ARCH |

---

## 5. Stop/go

| Criterio | Resultado |
| --- | --- |
| ≥4 recursos paginados desde cero | **Sí** (8 + 3 extras) |
| Helper común + DEF-2 + desempate id | **Sí** |
| `sortableFields: []` | **Sí** |
| Sin UI / sin matriz Ola 6 | **Sí** |
| OpenAPI mínimo | **Sí** |
| Jest mínimos | **Sí** |
| Gate SR-QA | **No** (siguiente) |

**Propuesta a orquestador:** marcar Ola 7 BE **GO-CON-DEUDA**; liberar AI-SR-QA para gate final; FE de envelope como deuda explícita post-BE.
