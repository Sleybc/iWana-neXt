# INFORME — Auditoría backend MOD06 Commercial

**Versión:** 1.1
**Estado:** Vigente
**Fecha:** 2026-08-14
**Módulo:** MOD06 — CommercialModule
**Modo:** Mixto (Architect + EM + Orchestrator) → ejecutor de remediación (Tracks 0/A/B)
**Autor:** AI-EM-ARCH
**Clasificación:** Confidencial — Uso interno
**Cambio v1.1:** cierre de remediación backend (`PROMPT-MOD06-REMEDIACION-BACKEND-v1.0.md`). Hallazgos de §3 se conservan como evidencia de auditoría; el estado de pago está en §9.

## Trazabilidad

| Artefacto | Estado al citar |
| --- | --- |
| [PRD-MOD06-COMERCIAL-DEFINICION-v1.0.md](../prds/PRD-MOD06-COMERCIAL-DEFINICION-v1.0.md) (cabecera v1.2) | Aprobado |
| [HLD-MOD06-ARQUITECTURA-v1.0.md](../hlds/HLD-MOD06-ARQUITECTURA-v1.0.md) | Aprobado |
| [HLD-MOD06-TAXATION-DEPENDENCY-v1.1-addendum.md](../hlds/HLD-MOD06-TAXATION-DEPENDENCY-v1.1-addendum.md) | Aprobado |
| [ADR-028](../adrs/ADR-028-Extraccion-Modulo-Comercial.md) | Aprobado |
| [ADR-029](../adrs/ADR-029-Bounded-Context-Taxation-Catalogo-Unificado.md) | Aprobado |
| [ADR-031](../adrs/ADR-031-Rediseno-Tributario-Comercial-Impuestos-Reglas-Simulador.md) | Aprobado |
| Superficie UI de referencia | `apps/portal/src/components/commercial/` (no auditada aquí) |
| Código | `apps/api/src/modules/commercial/` |

**Protocolo:** [Protocolo_Colaboracion_Multiagente_v1.md](../roles/Protocolo_Colaboracion_Multiagente_v1.md) v1.5. Tracks de auditoría: AI-SR-FULL, AI-SEC-ENG, AI-SR-QA, AI-DATA-ENG (on-demand). v1.0 fue solo lectura; v1.1 registra la implementación en modo ejecutor.

**Prompt de remediación:** [PROMPT-MOD06-REMEDIACION-BACKEND-v1.0.md](../prompts/PROMPT-MOD06-REMEDIACION-BACKEND-v1.0.md)

---

## 1. Veredicto

**Ajustar** (v1.0, auditoría). **Remediación backend ejecutada** (v1.1, Tracks 0/A/B). Huecos de evidencia G6 (CA-R04/R05/R07) **cerrados** con specs. Pendiente: re-firma G6 de AI-SR-QA; no hay merge en este acto.

| Pregunta | Respuesta |
| --- | --- |
| ¿Hay crítica de seguridad (fuga tenant / bypass JWT)? | No. SEC-ENG: **GO con ajustes**. Sin escalación al CTO. |
| ¿Se puede mergear un refactor DRY/perf hoy? | No. SR-QA: **sí, con tests previos**. |
| ¿Hace falta ADR nuevo? | No. Las decisiones caben en ADR-028 / ADR-031. |
| ¿Hace falta migración? | Sí, en Track B. No reabrir 017/019/020. |
| Factibilidad sin cambiar contrato HTTP | **Viable** (Track A). Unique de compatibilidad y `tenant_id` en precios son Track B. |

**Impacto (tenant / seguridad / escala / regulación):** sin impacto de aislamiento si se mantiene `runInTenantSchema`. Seguridad: defensa en profundidad incompleta en precios y tax applications. Escala: el catálogo por tenant es cientos–miles de ítems; el cuello es round-trips, no I/O. Regulación IVA/estrato de seeds `019`: **requiere verificación con fuente oficial** (no se cierra en esta auditoría).

---

## 2. Alcance ejecutado

Auditoría de solo lectura del backend MOD06 y de consumidores internos (CRM, Tenant, Inventory) **solo** para boundaries. La UI del portal se usó como mapa de hot paths, no como objeto de review visual.

| Track | Agente | Entrega |
| --- | --- | --- |
| Backend (bugs, DRY, perf, drift) | AI-SR-FULL | 21 hallazgos |
| AppSec (ASVS L2, STRIDE, tenancy) | AI-SEC-ENG | 11 hallazgos; GO con ajustes |
| Calidad (criterio↔test, cobertura) | AI-SR-QA | 150 tests PASS; branches 62.63%; harness previo |
| Datos (índices, SCD, CTI, SQL) | AI-DATA-ENG | 13 hallazgos; migración nueva sí |

---

## 3. Hallazgos consolidados (por severidad)

IDs originales de cada track se conservan entre paréntesis. Un mismo defecto puede aparecer en varios tracks; aquí queda **una** fila.

### 3.1 Alta — corregir en Track A (sin cambiar HTTP)

| ID | Defecto | Evidencia verificada | Impacto |
| --- | --- | --- | --- |
| A-01 | Motor tributario no filtra vigencia | `tax-application.service.ts` `_findMatchingRule` (~148–174): `isActive` + segmento/estrato/municipio; **sin** `validFrom`/`validTo`. El dashboard sí filtra vigencia. | `resolve()` / `simulate()` pueden aplicar regla vencida o futura. |
| A-02 | `BundleService.findOne` carga todo el catálogo | `bundle.service.ts` ~133–135: `find(CatalogItem, { where: { id: undefined as never } })`. TypeORM ignora `undefined` → full scan. El QB siguiente es el correcto. | Cada detalle de combo barre `catalog_items`. |
| A-03 | Precio de bundle inflable | `calculatePrice` une `selectedOptionalItemIds` sin intersectar con ítems opcionales del bundle. | Total manipulado con UUIDs ajenos del mismo tenant. |
| A-04 | N+1 al hidratar catálogo | `findAll` llama `_hydrateItem` por fila: 1 detalle CTI + 1 precio vigente. `limit=20` → ~40 queries extra. El adapter CRM ya hace batch `ANY(:ids)`. | Hot path de las tres pestañas del portal. |
| A-05 | Dashboard ~15 queries | `getSummary` hace `Promise.all` de 15 statements; `countOffersAtRisk` re-escanea expiring + near-use; recent changes sin `LIMIT` por rama. Constantes 7d / 0.8 duplican `commercial-offer-filters.ts`. | Carga al abrir Comercial (alerts strip). |
| A-06 | ILIKE del listado sin escape | `catalog.service.ts` `name: \`%${name}%\``. El picker sí escapa. | `%` / `_` en el nombre rompen el filtro. |

### 3.2 Alta — Track B (modelo / boundary; decisión ya tomada en §4)

| ID | Defecto | Impacto |
| --- | --- | --- |
| B-01 | Unique `idx_compat_one_active_successor` sobre `source_item_id` **cualquier** `rule_type` | Impide REQUIRES + EXCLUDES en el mismo ítem. El comentario de `020` habla de “un sucesor” (REPLACES). 23505 → 500. |
| B-02 | SCD: unique por `is_current` sí; no hay `CHECK (is_current = (valid_to IS NULL))` | Dos filas con `valid_to IS NULL` y `is_current=false` son posibles. Evento de precio se emite dentro del callback, antes del commit del helper. |
| B-03 | `tax_rule_applications` sin FK física a `tax_rules` ni unique `(tax_rule_id, tax_definition_id)` | Huérfanos y duplicados; dashboard `tax_rules_coverage_gap`. |
| B-04 | TenantModule lee `catalog_items` + `product_details` directo | Violación de modulith (ADR-028). Endpoint deprecado. |
| B-05 | `createSnapshot` / `getActivePlans` fijan `RESIDENTIAL`; CRM carga **todos** los planes para un `.find(id)` | Cotización no-residencial incorrecta; scan unbounded. |

### 3.3 Media

| ID | Defecto | Notas |
| --- | --- | --- |
| M-01 | `CommercialModule` exporta `CatalogService` y `PriceHistoryService`; `ITaxApplicationReadPort` = la clase de escritura | Bypass RBAC futuro (SEC-01/03). Hoy sin consumidores. |
| M-02 | Puerto de catálogo acepta `tenantId`/`schemaName` del caller | Confused deputy (SEC-02). CRM hoy pasa contexto JWT; el adapter no lo afirma. |
| M-03 | `catalog_price_history` sin columna `tenant_id`; tax applications CUD por `id` solo | Aislamiento depende solo de `search_path` (HLD §13 pide doble control). |
| M-04 | Paginate keyset copiado ~8 veces | bundle / promo / compat / tax listRules / listApplications. |
| M-05 | KPI “sin precio” dashboard vs chip de catálogo | Dashboard: cualquier segmento; catálogo: solo RESIDENTIAL. |
| M-06 | Precios / descuentos / tasas sin cota numérica | `numeric(14,2)` acepta negativos. |
| M-07 | `incrementUse` read-modify-write; sin caller Billing | Carrera si se usa después. |
| M-08 | Eventos `commercial.*` sin `@OnEvent`; `TAX_RULE_CHANGED` nunca se emite | Dead letter. `deactivatedBy` usa `tenantId`, no `user.sub`. |
| M-09 | ThrottlerModule declarado, `ThrottlerGuard` no está en `APP_GUARD` | Hueco de **plataforma**, no solo MOD06. |
| M-10 | RBAC más restrictivo que el PRD | CUD catálogo/bundles/compat = `ADMIN`+`SYSTEM_ADMIN` **sin** `ACCOUNTANT`. Promos/tax sí incluyen Facturación. |
| M-11 | `any` en `ALWAYS` / `targetSegments`; `isLoan` sin `@IsBoolean`; segmento query sin `ParseEnumPipe` | Deuda TypeScript / validación. |
| M-12 | Alta ítem + precio no atómica | Dos HTTP; ítem huérfano si el segundo falla. |

### 3.4 Baja / drift documental

- Envelopes HTTP distintos (`{ data: ListResponse }` vs `{ data, meta }` vs objeto plano): **no unificar** en esta fase.
- HLD §3 nombra `tax-classification.service.ts`, DTOs `create-plan.dto.ts` Zod y carpeta `adapters/`. Código real: `TaxApplicationService`, class-validator, adapters dentro de `ports/`. El addendum v1.1 ya documenta el corte tributario.
- Feature flag `TAXATION_USE_CATALOG` citado en el puerto: **no existe**; siempre catálogo (ADR-031).
- `UpdateTaxRuleDto` sin `PATCH /tax-rules/:id`. Portal: GET+POST reglas + CRUD applications + simulate.
- Contratos de catálogo no están en `@iwana/shared` (solo dashboard + tax snapshot).
- CA-01 del PRD pide Zod; el resto de la API Nest usa class-validator + `ValidationPipe`. Ver §4.6.

---

## 4. Decisiones (desempates)

Ninguna abre ADR. Ninguna escala al CTO.

### 4.1 Unique de compatibilidad

**[DESEMPATE]** Área RACI: Arquitectura (modelo) · Posiciones: SR-FULL/DATA-ENG = unique demasiado ancho; el comentario de `020` = “un sucesor”. · **Decisión:** el unique parcial vigente se **estrecha** a `rule_type = 'REPLACES'`. Se añade unique activo `(source_item_id, target_item_id, rule_type)`. · Justificación: PRD RF-COM-21 y HLD §5.8 permiten REQUIRES, EXCLUDES y REPLACES independientes. El índice actual contradice el PRD, no al revés. · Registro en: este informe + prompt Track B.

### 4.2 Motor tributario

**Decisión:** `resolve()` / `simulate()` usan **solo** `tax_rule_applications` + `TaxCatalogReadPort` (ADR-031). `TaxRule.ratePercentage` es legado; no se usa en el matcher; no se borra la columna en esta fase. El matcher **debe** filtrar vigencia igual que el dashboard. No unique rígido de la 4-tupla (el desempate es `priority`).

### 4.3 Contrato HTTP

**Congelado.** No se unifican envelopes. No se añade `PATCH /tax-rules/:id`. No se introduce endpoint atómico ítem+precio (queda deuda M-12, fuera de esta fase). Alta de plan sigue en dos calls.

### 4.4 Puertos y exports

- Dejar de exportar `CatalogService` y `PriceHistoryService` (Track A; sin consumidores).
- `ITaxApplicationReadPort` deja de ser `useExisting: TaxApplicationService`; adaptador de solo lectura (Track A).
- Relocar `PlanCatalogReadPort` de `crm/ports` a Commercial: **Track B** (inversión de dependencia). No es nuevo bounded context; ADR-028 ya asigna el catálogo a MOD06.
- `createSnapshot` recibe segmento de forma **aditiva** (Track B). Default documentado `RESIDENTIAL` si el caller no lo pasa.
- SQL directo de TenantModule `getAdditionalProducts`: delegar al puerto o retirar shim (Track B). No romper clientes del path deprecado sin inventario de callers.

### 4.5 Defensa en profundidad de precios

Añadir `tenant_id` a `catalog_price_history` (Track B) con pre-check. Filtrar `tenantId` en tax applications CUD ya en Track A (no exige migración).

**No** introducir `EXCLUDE USING gist` / `btree_gist` (fuera de baseline; sería ADR).

### 4.6 Zod vs class-validator (CA-01)

**Decisión:** no introducir Zod solo en MOD06. El boundary Nest vigente del repo es class-validator + `ValidationPipe` (`whitelist` + `forbidNonWhitelisted`). CA-01 queda como **drift documental del PRD**, no como defecto de código bloqueante. Enmienda de PRD (una línea en la tabla de CA) se emite en el cierre de la remediación, no en este acto.

### 4.7 CA-06/07 (compatibilidad vs cotizar)

El criterio dice “impide cotizar”. `QuotesService` no llama `validateCombination`. **Fuera de esta fase** (es cableado CRM, no hardening del catálogo). Queda deuda de producto; no se enmenda el PRD hasta una fase CRM.

### 4.8 Throttling

Hueco de plataforma (`ThrottlerModule` sin `ThrottlerGuard` global). Se informa a AI-PLAT-OPS; **no** se parchea un guard solo en Commercial. No bloquea Track A/B.

### 4.9 KPI “sin precio”

Alinear dashboard al chip del catálogo: **solo RESIDENTIAL**. Extraer SQL compartido. Es corrección de producto coherente con el comentario ya existente en `findAll`.

---

## 5. Hot paths (portal → API)

| UI | Endpoint | Riesgo hoy | Remedio |
| --- | --- | --- | --- |
| Carga Comercial / alerts | `GET /commercial/dashboard/summary` | Alto — 15 queries | Consolidar SQL |
| Planes / productos / servicios | `GET /commercial/catalog?type=…` | Alto — N+1 hydrate | Batch 2–3 queries |
| Detalle combo | `GET /commercial/bundles/:id` | Alto — full scan | Borrar `find` muerto |
| Pickers | `GET /commercial/{plans\|additional-products\|additional-services}/search` | Bajo–medio | Ya limit 20; escape OK |
| Simulador | `POST /commercial/tax/simulate` | Medio — vigencia | Predicado + índice |
| CRM prospecto | puerto `getActivePlans` | Alto en CRM | `getPlanById` aditivo (B) |

Estimación DATA-ENG (cientos–miles de ítems/tenant): listado **5–10×** menos round-trips (p95 típico 150–300 ms → 30–60 ms); dashboard **~30–50%** p95; tax resolve: latencia irrelevante, deja de aplicar reglas vencidas.

---

## 6. Calidad (red de seguridad)

Evidencia SR-QA: 18 suites, **150 tests PASS**. Statements 85.46% / lines 85.95% / functions 79.14% / **branches 62.63%**. `tax-application.service` ~49.5% stmts. Picker HTTP **0%**. Isolation real **solo catálogo**.

CA del PRD sin evidencia suficiente para un refactor: CA-03 (dos segmentos), CA-05 (concurrencia `incrementUse`), CA-09 (migración 018), CA-10 (isolation incompleta), CA-11 (`audit_log` vs interceptor+eventos).

**Regla de fase:** Track 0 (harness) **antes** de tocar QueryBuilders del dashboard, `_hydrateItem` o el matcher tributario.

---

## 7. Plan de pago de deuda

| Track | Dueño | Qué | Contrato congelado |
| --- | --- | --- | --- |
| 0 | AI-SR-QA | Harness: isolation HTTP extra-catálogo, tax CRUD, picker HTTP, CA-03, bundle `FIXED_AMOUNT`, offer-filters | HTTP + puertos CRM |
| A | AI-SR-FULL | Bugs A-01…A-06, unexport services, adaptador tax read, `tenantId` en applications, DRY keyset, roles helper, cotas numéricas, 23505→409 | HTTP congelado; **sin** migración |
| B | AI-SR-FULL (DATA-ENG C) | Migración tenant siguiente (hoy 113 si HEAD no añadió otra): unique REPLACES, CHECKs SCD/dinero con pre-check, índice tax matcher, FK applications, `tenant_id` en price history, índices de apoyo. Relocar puerto CRM. Segmento en snapshot. Delegar SQL Tenant. | HTTP congelado; puerto `createSnapshot` **versiona** (aditivo) |

Fuera de fase: Zod, envelopes, alta atómica, cablear quotes↔compatibilidad, ThrottlerGuard global, `btree_gist`, borrar `ratePercentage`.

---

## 8. Stop / go

- Tracks 0, A y B **cerrados** en rama `fix/mod06-commercial-backend-remediation` (evidencia §9).
- **GO de calidad (G6):** dictamen inicial GO CON AJUSTES; los tres ajustes de evidencia (isolation tax/compat, batch de catálogo, KPI RESIDENTIAL) están pinneados. Re-firma SR-QA pendiente.
- **NO** G6.5 / G7: este acto no autoriza merge ni producción.
- **NO-GO** si alguien propone unificar envelopes, introducir Zod solo aquí, o `EXCLUDE gist` (sigue vigente).

**Deuda crítica de seguridad:** ninguna. Deuda alta de auditoría A-01…A-06 y B-01…B-05 **pagada** en código (ver §9). Fuera de fase: Zod, envelopes, alta atómica ítem+precio (M-12), cablear quotes↔compatibilidad (CA-06/07), ThrottlerGuard global, `btree_gist`, borrar `ratePercentage`, GIN `pg_trgm` en `catalog_items.name`.

---

## 9. Cierre de remediación (v1.1)

Prompt: [PROMPT-MOD06-REMEDIACION-BACKEND-v1.0.md](../prompts/PROMPT-MOD06-REMEDIACION-BACKEND-v1.0.md). Contrato HTTP **congelado**. Sin ADR nuevo. Enmienda CA-01 del PRD (class-validator, no Zod) aplicada en el mismo acto.

### 9.1 Tracks

| Track | Estado | Qué quedó |
| --- | --- | --- |
| 0 | Cerrado | Harness: isolation HTTP extra-catálogo, tax CRUD HTTP, picker `limit=50`→400, CA-03 RESIDENTIAL vs SOHO, bundle `FIXED_AMOUNT`, offer-filters, catalog HTTP PATCH/DELETE/POST/403 SALES. |
| A | Cerrado | A-01 vigencia tax; A-02 sin full scan de bundles; A-03 opcionales ajenos → 400; A-04 hydrate batch; A-05 dashboard 4 statements + KPI RESIDENTIAL; A-06 ILIKE escape. Unexport `CatalogService`/`PriceHistoryService`. `ITaxApplicationReadPort` = adaptador de lectura. 23505→409. Cotas dinero/%; `incrementUse` atómico. |
| B | Cerrado | Migración tenant **113** (`HardenCommercialConstraints1130000000000`): unique REPLACES, CHECKs SCD/dinero, FK applications→`tax_rules` (sin FK a `tax_definitions`), `tenant_id` NOT NULL en `catalog_price_history`, índices de apoyo. `down()` restaura `idx_compat_one_active_successor`. Puerto `PlanCatalogReadPort` owner Commercial (CRM re-exporta). `getPlanById` + `createSnapshot(..., segment?)` default **RESIDENTIAL**. Adapter ignora tenant/schema del caller (`TenantContext.getOrThrow()`). CRM potentials/prospects dejan de cargar todo el catálogo. |

### 9.2 Shim Tenant (B-04)

`TenantService.getAdditionalProducts` **no** se cableó a `CommercialCatalogReadPort.getActiveProducts()`: `TenantModule` no importa `CommercialModule` (ciclo) y el puerto no trae `category`, requerido por `AdditionalProductResponseDto`. SQL cruzado permanece con **comentario de retiro 2026-09-30**. Path deprecado intacto.

### 9.3 CA-R01…R10

| ID | Resultado |
| --- | --- |
| CA-R01 | Pagado — matcher filtra `validFrom`/`validTo`. |
| CA-R02 | Pagado — `findOne` de bundle no barre `catalog_items`. |
| CA-R03 | Pagado — opcionales ajenos → 400. |
| CA-R04 | Pagado — `_hydratePage` batch; `catalog.service.spec.ts` pinnea 4 QBs + `ANY(:ids)` independiente de `limit`. |
| CA-R05 | Pagado — `commercial-dashboard.service.spec.ts` pinnea 4 statements y KPI `customer_segment` = RESIDENTIAL. |
| CA-R06 | Pagado — unique activo estrecho a REPLACES; unique `(source, target, rule_type)`. |
| CA-R07 | Pagado — isolation HTTP bundle/promo/tax/compat/dashboard/picker (`commercial-resources.tenant-isolation.spec.ts`). |
| CA-R08 | Pagado — `commercial.module.ts` exporta solo puertos de lectura. |
| CA-R09 | Pagado — spec `113_harden_commercial_constraints.spec.ts` (pre-checks + `down` + sin gist / sin `tax_definitions`). |
| CA-R10 | Pagado — ver cobertura §9.4. |

### 9.4 Cobertura (CA-R10)

Comando (glob relativo a `rootDir=src` de Jest API):

```text
pnpm --filter @iwana/api exec jest src/modules/commercial --coverage --collectCoverageFrom="modules/commercial/**/*.ts" --coveragePathIgnorePatterns=".spec.ts" --coverageReporters=text-summary --coverageThreshold="{}"
```

| Métrica | Baseline auditoría | Cierre v1.1 |
| --- | --- | --- |
| Tests | 150 PASS (18 suites) | **194 PASS (21 suites)** |
| Statements | 85.46% | **89.06%** (1466/1646) |
| Lines | 85.95% | **89.66%** (1353/1509) |
| Functions | 79.14% | **89.04%** (195/219) |
| Branches | 62.63% | **67.93%** (322/474) |

Migración 113: 2 tests PASS. Specs CRM `potentials` + `prospects` (cableado `getPlanById`): 14 tests PASS.

GIN `pg_trgm` en `catalog_items.name`: **no incluido** (prioridad baja del prompt). Pre-checks de 113 abortan en runtime si hay suciedad SCD/applications; no se aplicó la migración contra un tenant de desarrollo en este acto (spec de fuente + `down` sí).
