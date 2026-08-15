# PROMPT — Remediación backend MOD06 Commercial

**Versión:** 1.0
**Estado:** Emitido (G4)
**Fecha:** 2026-08-14
**Módulo:** MOD06 — CommercialModule
**Fase:** Remediación backend (auditoría 2026-08-14)
**Generado por:** AI-EM-ARCH (modo Orchestrator)
**Archivo destino:** `docs/prompts/PROMPT-MOD06-REMEDIACION-BACKEND-v1.0.md`
**Plantilla:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md) *(en revisión)* — la ruta la respalda `AGENTS.md` → Documentation Rules.

## Contratos congelados

| Contrato | Estado | Artefacto |
| --- | --- | --- |
| HTTP `/api/v1/commercial/**` | **Congelado** | Controllers actuales. No unificar envelopes. No añadir `PATCH /tax-rules/:id`. No endpoint atómico ítem+precio. |
| Contrato de componente UI | N/A | Esta fase no toca `apps/portal` ni `@iwana/ui`. |
| Puerto CRM `PlanCatalogReadPort` / `createSnapshot` | Congelado en Track 0 y A. **Versiona aditivo en Track B** (segmento opcional + `getPlanById`). |
| OpenAPI | Actualizar solo si un campo de respuesta **ya existía** y se documentaba mal. No breaking changes. |

---

## 1. Objetivo exacto de la fase

Hacer el backend comercial **correcto y más rápido** sin cambiar el contrato HTTP que consume `apps/portal/src/components/commercial/`.

- **Resultado esperado:** vigencia tributaria real, listado de catálogo sin N+1, detalle de bundle sin full scan, precio de combo no inflable, dashboard con menos round-trips, unique de compatibilidad alineado al PRD, defensa en profundidad de `tenant_id`, y red de tests que cubra isolation más allá del catálogo.
- **Lo que sí entra:** Tracks 0 → A → B en ese orden. Código en `apps/api/src/modules/commercial/`, tests del módulo, una migración tenant nueva numerada (Track B), ajuste mínimo de CRM/Tenant **solo** en Track B para el puerto y el SQL cruzado.
- **Lo que no entra:** frontend, unificar envelopes, Zod, ThrottlerGuard global, `btree_gist` / `EXCLUDE gist`, cablear `QuotesService.validateCombination`, borrar columna `ratePercentage`, alta atómica ítem+precio, cambiar RBAC para añadir `ACCOUNTANT` a CUD de catálogo (es producto; queda fuera).

---

## 2. Artefactos de entrada obligatorios

- Informe de auditoría: `docs/informes/INFORME-MOD06-AUDITORIA-BACKEND-v1.0.md` (**abrir y seguir §4 decisiones; no reabrir desempates**).
- PRD: `docs/prds/PRD-MOD06-COMERCIAL-DEFINICION-v1.0.md`
- HLD: `docs/hlds/HLD-MOD06-ARQUITECTURA-v1.0.md` + addendum taxation v1.1
- ADRs: ADR-028, ADR-029, ADR-031 (todos Aprobado)
- Skill: `nestjs-expert`, `backend-security-coder`, `postgresql`, `database-migration`, `testing-patterns`
- Código: `apps/api/src/modules/commercial/`
- Migraciones de referencia: `017`, `019`, `020`, `023`, `025`, `086`, `089` — **no reabrirlas**. Siguiente número tenant: el posterior al máximo existente (hoy `112` → `113` si HEAD no añadió otra).

Artefactos faltantes: ninguno para arrancar Track 0.

---

## 3. Secuencia de tracks

El workflow de gobierno ya ocurrió (auditoría = review). Esta fase es **implementación**. Los tracks no son paralelos: Track A espera el harness de Track 0; Track B espera A verde + pre-checks de datos.

### Track 0 — AI-SR-QA (solo tests, sin features)

Escribir **antes** de refactorizar QueryBuilders.

1. Isolation HTTP (mismo patrón que `catalog.tenant-isolation.spec.ts`): GET by id de bundle, promotion, tax-rule, compatibility-rule; dashboard summary; picker. JWT tenant B → 404 o vacío. Assert `schemaName`.
2. Unit + HTTP de `TaxApplicationService` CRUD: `listRules`, `createRule`, `list/create/update/deleteApplication` + rutas `tax-rule-applications` + 401.
3. Picker HTTP: 200 `{ id, label, sublabel }`, 401, `q` vacío, límite ≤ 20.
4. CA-03: `getCurrentPrice` mismo `itemId`, `RESIDENTIAL` vs `SOHO` → precios distintos.
5. Bundle `FIXED_AMOUNT` en `calculatePrice`.
6. Spec de `utils/commercial-offer-filters.ts` (ventana 7d, ratio 0.8, remaining 2).
7. Catalog HTTP faltante: PATCH, DELETE, POST `/services`, 403 de rol de solo lectura en escritura.

**No** exigir en este track: migración 018, `audit_log` real, concurrencia SCD contra PostgreSQL (eso puede ir con Track A/B cuando el código cambie). **Sí** dejar el spec de isolation listo para que Track A no lo rompa.

Criterio de salida Track 0: los specs nuevos pasan; no se modifica producción salvo fixtures de test.

### Track A — AI-SR-FULL (sin migración)

Implementar en este orden (ROI):

1. **Borrar** el `find(CatalogItem, { where: { id: undefined as never } })` en `BundleService.findOne`. Dejar el `QueryBuilder` con `ANY(:ids)`.
2. **Vigencia en `_findMatchingRule`:** mismo predicado que el dashboard (`valid_from <= now AND (valid_to IS NULL OR valid_to >= now)`). Desempate `priority DESC`. Si `stratum`/`municipalityCode` se omiten, no casar reglas que los restringen.
3. **`calculatePrice`:** intersectar `selectedOptionalItemIds` con ítems `isRequired=false` del bundle; 400 si hay extra.
4. **`hydratePage(ids)`:** 2–3 queries batch (detalles CTI por tipo + precios vigentes RESIDENTIAL). Misma forma de respuesta. Reusar el patrón de `CommercialCatalogReadAdapter`.
5. **Dashboard:** consolidar COUNTs en 1–4 statements; `LIMIT` por rama **antes** del UNION de recent changes; importar constantes desde `commercial-offer-filters.ts`; KPI “sin precio” = solo RESIDENTIAL (decisión §4.9 del informe).
6. **Escape ILIKE** del listado de catálogo: reutilizar `escapePickerLikePattern`.
7. Helper interno `paginatedKeyset` para bundle/promo/compat/tax listados. Envelope `{ data, meta }` intacto.
8. `where: { id, tenantId }` en tax applications CUD y listado.
9. Dejar de exportar `CatalogService` y `PriceHistoryService`. `ITaxApplicationReadPort` → adaptador de solo lectura (no `useExisting` del servicio de escritura).
10. Mapear unique violation `23505` → 409 en precios y compatibilidad. Comparar `basePrice` numérico en SCD. `SELECT … FOR UPDATE` del precio vigente. Emitir eventos **después** del commit (o no emitir dentro del callback si el helper commitea después).
11. Cota numérica: precios/descuentos ≥ 0; `PERCENTAGE` y tasa 0–100. `@IsBoolean()` en `isLoan` / `requiresInventory`. `ParseEnumPipe` en `segment`. Eliminar `as any` (`InstallationRule.ALWAYS`, `CustomerSegment[]`).
12. `incrementUse`: `UPDATE … SET current_uses = current_uses + 1 WHERE (max_uses IS NULL OR current_uses < max_uses) RETURNING`.
13. Roles: extraer `COMMERCIAL_READ_ROLES` / `COMMERCIAL_WRITE_ROLES` **sin cambiar** la matriz actual (no añadir `ACCOUNTANT` a CUD de catálogo).
14. Puerto del picker: unificar los 3 métodos HTTP contra el `searchForPicker` ya existente (mismo path y query).

Tests: actualizar unitarios mockeados que aserten SQL texto; no debilitar assertions. Correr:

```text
pnpm --filter @iwana/api exec jest src/modules/commercial --coverage --coverageReporters=text-summary
```

### Track B — AI-SR-FULL (DATA-ENG consultado; migración nueva)

Migración **reversible**, escrita a mano, con pre-checks que **abortan** si hay suciedad (no forzar).

1. Reemplazar `idx_compat_one_active_successor` por unique parcial `(source_item_id) WHERE is_active AND rule_type = 'REPLACES'`. Unique activo `(source_item_id, target_item_id, rule_type) WHERE is_active`. Índice `(tenant_id, target_item_id, is_active)`.
2. `CHECK (is_current = (valid_to IS NULL))` en `catalog_price_history` **solo si** `COUNT(*) WHERE is_current IS DISTINCT FROM (valid_to IS NULL) = 0`. Unique parcial extra `(item_id, customer_segment) WHERE valid_to IS NULL` con el mismo pre-check de duplicados.
3. CHECKs: `base_price >= 0`, `installation_fee >= 0`, `discount_value >= 0`, `rate_percentage BETWEEN 0 AND 100`, `valid_from <= valid_to` en promotions, `stratum_from <= stratum_to` (o NULL).
4. Índice `tax_rules (tenant_id, is_active, customer_segment, priority DESC) WHERE is_active = true`.
5. FK `tax_rule_applications.tax_rule_id → tax_rules(id)` + unique `(tax_rule_id, tax_definition_id)` con pre-check de huérfanos/duplicados. **No** FK física a `tax_definitions` (ADR-031).
6. `tenant_id` NOT NULL en `catalog_price_history` (backfill desde `catalog_items.tenant_id`) + filtro en el servicio.
7. Índices de apoyo: `catalog_bundle_items (item_id)`; `catalog_promotions (tenant_id, is_active, valid_from DESC, id DESC)`; opcional `catalog_bundles (tenant_id, is_active, valid_to) WHERE is_active AND valid_to IS NOT NULL`. GIN `pg_trgm` en `catalog_items.name` **solo si** el typecheck/tests no se complican; `pg_trgm` ya existe (ADR-062). Prioridad baja.
8. Relocar token `PlanCatalogReadPort` a Commercial (o re-exportarlo desde Commercial; CRM importa el token del owner). Añadir `getPlanById`. `createSnapshot(..., segment?: CustomerSegment)` aditivo; default documentado `RESIDENTIAL`. Adapter: **ignorar** `schemaName`/`tenantId` del caller y usar `TenantContext` (o assert igualdad).
9. `TenantService.getAdditionalProducts`: delegar a `CommercialCatalogReadPort.getActiveProducts()` o documentar shim + issue; no dejar SQL de tablas ajenas sin comentario de retiro con fecha.

**No** `EXCLUDE USING gist`. **No** JOIN SQL a `tax_definitions`.

---

## 4. Restricciones no negociables

- No romper boundaries: Commercial no JOIN a tablas de Taxation; Tenant/CRM no leen tablas comerciales salvo el shim que Track B retira o delega.
- Tenant desde JWT / `TenantContext.getOrThrow()`; `SET LOCAL search_path` por transacción.
- `@Roles(UserRole.*)` — sin string literals.
- Cero `any`. Cero PII. Cero secretos.
- Migraciones reversibles; nunca `synchronize`.
- Package manager: `pnpm`.
- AI-FE-PLATFORM no interviene. AI-PROD-UX / AI-DS-OWNER no intervienen.
- No reabrir desempates del informe §4.

---

## 5. Entregables técnicos

| Track | Entregable |
| --- | --- |
| 0 | Specs nuevos en `apps/api/src/modules/commercial/**` |
| A | Código services/controllers/ports/utils + tests verdes |
| B | `packages/database/src/migrations/tenant/NNN_*.ts` (+ down) + ajustes CRM/Tenant mínimos + OpenAPI si aplica |

Sin frontend. Sin cambio de envelope.

---

## 6. Entregables documentales

- Actualizar **este mismo** informe vivo `docs/informes/INFORME-MOD06-AUDITORIA-BACKEND-v1.0.md` al cerrar cada track (no crear INFORME-v1.1 por cada commit). Subir a v1.1 solo al cierre de Track B.
- Enmienda de una línea a CA-01 del PRD (class-validator, no Zod) **al cierre de B**, no antes.
- No ADR nuevo.

---

## 7. Criterios de aceptación

- **CA-R01:** `_findMatchingRule` no selecciona reglas fuera de vigencia. Test unitario.
- **CA-R02:** `GET /commercial/bundles/:id` no ejecuta `find` de catálogo sin ids. Test de servicio (no full scan).
- **CA-R03:** `calculatePrice` ignora/400 opcionales que no pertenecen al bundle.
- **CA-R04:** `GET /commercial/catalog` hidrata una página con O(1) queries respecto al `limit` (batch), misma forma JSON.
- **CA-R05:** `GET /commercial/dashboard/summary` misma forma JSON; menos de 15 statements; KPI missing price = RESIDENTIAL.
- **CA-R06:** Un ítem puede tener REQUIRES y EXCLUDES activos a la vez; REPLACES sigue siendo uno por fuente.
- **CA-R07:** Isolation HTTP de bundle/promo/tax/compat/dashboard/picker (tenant B no ve tenant A).
- **CA-R08:** `CommercialModule` no exporta servicios de escritura. `ITaxApplicationReadPort` no es la clase CUD.
- **CA-R09:** Migración B reversible; `down()` restaurable; pre-checks abortan con mensaje si hay suciedad SCD/applications.
- **CA-R10:** Suite `src/modules/commercial` verde. Lines/statements del módulo ≥ 80%. No bajar branches respecto al baseline 62.63% sin justificación en el informe.

---

## 8. Criterio de stop/go

Detenerse inmediatamente si:

- Un pre-check de Track B encuentra filas SCD inconsistentes o applications huérfanas → `[BLOQUEO]` a EM-ARCH con conteo (sin PII); no aplicar CHECKs a ciegas.
- Un caller externo de `CatalogService` / `PriceHistoryService` aparece al quitar el export → `[BLOQUEO]` (inventario de imports).
- Se necesita cambiar envelope HTTP o el shape del dashboard → no parchear; volver a EM-ARCH.
- Se propone `btree_gist`, Kafka, caché Redis nueva, o Zod solo en este módulo → stop.

Documentar causa en el informe vivo. Escalar a EM-ARCH. Recomendación esperada: opción única, no menú.

---

## 9. Criterio de salida de la fase

- Backend: CA-R01…R10.
- Frontend: no aplica (contrato HTTP intacto; smoke manual del portal Comercial opcional, no bloqueante).
- Base de datos: migración B con `down` verificado en dev.
- Tests: comando de §3 Track A en verde.
- Documentación: informe vivo actualizado; CA-01 enmendado al cierre de B.

**Stop/go de cierre:** GO de calidad (G6) lo firma AI-SR-QA contra CA-R01…R10. Este prompt **no** autoriza merge (G6.5) ni producción (G7).
