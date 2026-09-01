# Plan — Ubicación de maestros Catálogo / Proveedores / Bodegas: ¿Inventario o Settings?

> **Modo AI-EM-ARCH:** Architect + Product Architect + Orchestrator (decisión de boundaries y roadmap, no código ni mockups)
> **Fecha:** 2026-09-01
> **Versión:** 1.1 — enmienda de auditoría multiagente 2026-09-01 (correcciones de citas, regularización de gates y estado real de implementación)
> **Módulos afectados:** MOD12 Inventario/SCM (`/dashboard/inventory`) y MOD00 Configuración (`/dashboard/settings`)
> **Estado:** Aprobado — C híbrida federada autorizada 2026-09-01 (ADR-084 Aprobado) — Fase 0 COMPLETADA; Fase R1 (regularización de gates) COMPLETADA; Fase 1 parcial (telemetría viva, baseline 7 días pendiente); Fase 2B implementación **dormant en main** (registry en `COMING_SOON` hasta baseline)
> **Aprobación:** CTO Humano 2026-09-01 (ADR-084 D1-D7 compliance verificado)
> **Specs/HLDs base:** `PRD-MOD12-INVENTARIO-SCM-v1.0.md` (interna v1.1, ADR-068), `PRD-MOD12-CATALOGO-MAESTRO-ARTICULOS-v1.0.md`, `HLD-MOD12-INVENTARIO-SCM-v1.0.md` (interna v1.1, ADR-068), `PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` (v1.7 — principio de federación en §1 Objetivo), `HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` (v1.7 — control plane federado en L18-20), `docs/specs/2026-08-19-inventario-module-subnav-ux.md` v1.2 (congelada — árbol de 11 destinos en §1 L27-42, contrato visual en §2 L50-52), `ADR-040` Configuración Control Plane (Aprobado — prohibición de acceso a tablas de dominio en §Reglas 4), `ADR-064/065` Paginación (064 parcialmente superado por 065), `ADR-069` G6.5, `ADR-082` (Propuesto), `ADR-083` (Aprobado 2026-08-28)
> **Briefing multiagente:** workflow `c292fe2e` (4 investigadores + síntesis) — ver resumen en Contexto
> **Auditoría v1.1:** 3 agentes exploradores (FE, BE, docs) verificaron citas contra código y artefactos; hallazgos y regularización en `docs/informes/INFORME-MOD12-FASE-R1-REGULARIZACION-GATES-FEDERACION-v1.0.md`

## Goal

Decidir dónde deben vivir los tres maestros operativos **Catálogo** (`inventory_items` + `inventory_categories`), **Proveedores** (`supplier_profiles`) y **Bodegas** (`stock_locations`) sin saturar `/dashboard/inventory` y sin romper el modulith: si se mantienen en Inventario, si se mueven a `/dashboard/settings`, o si se adopta un modelo híbrido federado. Entregar una ruta decidida, trazable a ADRs y ejecutable por fases con gates.

## Success Criteria

- [x] CTO aprueba la ubicación elegida (A, B o C) y, si aplica, el ADR delta que formaliza el cambio de boundary/ruta — **ADR-084 Aprobado 2026-09-01**.
- [ ] No se introduce acceso directo de MOD00 a tablas de MOD12 ni a la inversa (check `grep` de imports TypeORM entre bounded contexts = 0).
- [ ] Tenancy preservada: todo read/write de maestros resuelve `tenantId/schema` desde JWT por transacción (`SET LOCAL search_path`), sin hardcode.
- [ ] RBAC mantiene PoLP: un rol bodega/compras no necesita `settings.manage` para operar maestros si su trabajo es diario; un ADMIN no pierde descubrimiento desde Settings si su trabajo es esporádico.
- [ ] Deep-links y bookmarks estables: `?tab=catalog|suppliers|locations|stock`, `?tab=locations&custody=mobile`, `?tab=catalog&commercialRefId=...` no rompen; si se crea alias en Settings, hay redirect 308 o render federado documentado.
- [ ] Validación UX: test de encontrabilidad (5 operadores / 3 admins) no degrada tiempo-a-tarea vs. baseline Inventario actual; informe `INFORME-INVENTORY-MODULE-SUBNAV-v1.0` sigue verde.

## Context And Current Facts

**Qué existe hoy (evidencia verificada por auditoría v1.1 contra el código real):**

- **IA de Inventario (11 destinos, `PortalModuleSubnav`):** `apps/portal/src/components/inventory/inventory-nav.ts:17-41` agrupa `Operación` (Vista general, Catálogo, Existencias, Compras, Proveedores, Bodegas, Salidas, Conteos) + `Seguimiento` (Activos, Movimientos, Bajas). Spec `2026-08-19-inventario-module-subnav-ux.md` v1.2 congelada: §1 L27-42 declara el árbol de 11 destinos; §2 L50-52 el contrato visual (activo = `bg-iwana-surface-soft` + barra `h-0.5 bg-iwana-secondary` + icono `text-iwana-secondary-700`, sticky `lg:top-(--portal-sticky-offset)`, `<lg` dialog trigger `Sección: {label}`). Informe v1.2 GO confirma KPIs sueltos + panel “Atención ahora”.
- **Catálogo:** maestro operativo MOD12. Entidades `inventory_items` (SKU autogenerado `{CAT}-{TIPO}-{NOMBRE}-{MARCA}-{MODELO}` max 60, colisión `-001`) y `inventory_categories` (`codePrefix` varchar(3) `^[A-Z0-9]{2,3}$` único por tenant, migraciones 052-055). UI: `InventoryCatalogProductsPanel`, `InventoryCatalogCategoriesPanel`, `InventoryCatalogDrawer`/`InventoryCategoryDrawer` + subtabs internas Productos/Categorías en `InventoryClient.tsx:2442-2467` (default `categories` desde 2026-09-01). Creación esporádica (ADMIN/NOC), consumo diario (Existencias/Kardex/Compras picker).
- **Proveedores:** maestro SCM. `SupplierProfile` + Party+Rol atómico — la creación atómica vive en el backend (`apps/api/src/modules/inventory/services/supplier-profile.service.ts:74-107`, `ensurePartyWithRole` en transacción; endpoint `purchasing.controller.ts:319-328`), ADR-052 Puerto Comando/Parties. UI: `SuppliersPanel` + `SupplierFormDrawer`. Uso ligado a RFQ/Compra (flujo proveedor→cotización→orden→recepción).
- **Bodegas:** `stock_locations` con `responsibleRefId` UUID y matriz `StockLocationsMatrix` + `StockLocationsPanel`. Filtro `custody=mobile|all` resuelto en `InventoryClient.tsx:866-869` (normalizador `:175-177`). Uso diario junto a saldos/Kardex (`StockWorkspace.tsx:136` 4 tabs: Por producto / Por bodega / Kardex / Reposición).
- **Settings (MOD00 Control Plane):** `HLD-MOD00 v1.7 L18-20` + `PRD-MOD00 v1.7 §1` + `ADR-040 D1 y §Reglas 4`: MOD00 centraliza **experiencia** (orquestación UX, registry metadata), no ownership de datos operativos. Owners permanecen en WFM/Inventory/Billing/Commercial. Evidencia código: `apps/api/src/modules/configuration/services/settings-registry.service.ts` (94 líneas, sin DI de repositorios) solo publica metadata; `configuration.controller.ts:33-50` expone `GET /configuration/settings-sections` sin `TypeOrmModule`; `configuration.module.ts:11` importa `AccessControl/Tenant/Users/Organization`, no `InventoryModule`. El wrapper federado `apps/portal/src/app/dashboard/settings/inventory/page.tsx` **existe en main (dormant)**: monta `InventoryClient federatedMode` filtrado a `catalog|suppliers|locations` y redirige con 308 (`permanentRedirect`) los tabs no-maestros a `/dashboard/inventory?tab=X` preservando query.
- **Telemetría (Fase 1 FE ya implementada):** `apps/portal/src/lib/analytics.ts` exporta `trackEvent` (no-op hasta inyectar provider); `InventoryClient.tsx:1006` emite `inventory.tab.view` en `handleTabChange` y `Sidebar.tsx:305-312` en clicks de nav. Spec dedicada `InventoryClient.telemetry.spec.tsx`. Pendiente: contrato en `@iwana/shared` (hoy 0 hits) y baseline de 7 días. El campo `ownerModule` ya existe en la respuesta de settings-sections (`settings-section.schema.ts:8`); `telemetry` no se implementa (decisión: no-op local hasta elegir provider).
- **RBAC actual (MOD12 coherente):** `packages/shared/src/enums/access-control/access-permission-key.enum.ts:47-50` define `INVENTORY_STOCK_READ/MANAGE` + `INVENTORY_PURCHASING_READ/MANAGE` (mapeo por rol en `apps/api/src/modules/access-control/access-control.constants.ts`). Gate de pestaña Compras: `filterInventoryNavGroups` (`inventory-nav.ts:78-87`), **cableado en `InventoryClient.tsx` desde la regularización R1** con la misma semántica del Sidebar (visible en loading/degradado/tripwire; oculto solo con permisos efectivos resueltos). `Sidebar.tsx:80-159`: Inventario en grupo **Menú** (gate `INVENTORY_STOCK_READ` en :132), Configuración en **Administración**. No existen `INVENTORY_CATALOG_READ`/`SUPPLIERS_READ`/`LOCATIONS_READ` granulares (ADR-083 Aprobado los deja fuera hasta telemetría).
- **Deep-links:** `handleTabChange` (`InventoryClient.tsx:996-1019`, `router.replace ?tab=` en 1008-1016), handler de custody `:975-994`, legacy `?tab=summary`→`overview` (`inventory-tab-params.ts:28-38`). `useSearchParams` está **centralizado en `InventoryClient`** — los drawers no leen URL, reciben props. E2E `portal-inventory-scm.spec.ts` cubre estos links; `portal-inventory-scm-federated.spec.ts` (nuevo, en main) cubre el alias federado.
- **Boundaries verificados (grep):** `apps/api/src/modules/configuration/**` 0 imports de `inventory_*`; `apps/api/src/modules/inventory/**` 0 imports de `configuration`. `settings-registry.service.ts` no inyecta repositorios de inventario. Conclusión workflow: mover maestros a MOD00 rompería ADR-040 D1 y §Reglas 4 (patrón “MOD00 no lee tablas de dominio”).

**Qué pide el usuario:** Aliviar saturación percibida de 11 tabs en Inventario moviendo 3 maestros a Settings como subsección, para ordenar el módulo. Requiere evaluar si son maestros operativos (uso diario, co-localizados con transacciones) o transversales (configuración esporádica).

## Constraints And Non-goals

**Constraints:**
- Mantener arquitecturas aprobadas: Modulith con boundaries explícitos (`AGENTS.md` Architecture Rules), multi-tenant por schema PostgreSQL, `SET LOCAL search_path` por transacción, no `synchronize:true`, stack NestJS+Next App Router+TypeORM+pg+BullMQ (`Stack_Tecnologico.md`).
- No introducir nuevo stack ni patrón (CQRS/EDA) sin ADR-CTO.
- RBAC granular existe solo donde PRD lo exige (Compras granular por ADR-083, ya Aprobado); no inventar 3 permisos nuevos sin coste/beneficio validado.
- Deep-links estables: bookmarks, QR de bodega, picker de Compras y E2E no pueden romper sin migración con redirects.
- UX: `PortalModuleSubnav` y `portalResourceTab*` congelados por spec v1.2; cambios de nave requieren DS-OWNER review.

**Non-goals (fuera de este plan):**
- Rediseñar el flujo transaccional (Existencias, Movimientos, Bajas, Salidas, Conteos, Activos, Reposición) ni migrar `PurchaseWorkspace`/`StockWorkspace`.
- Cambiar modelo de datos (SKU, `codePrefix`, Party/Location) ni migraciones 052-055.
- Unificar permisos de Inventario en granular fino (ADR-083 lo hará si aplica) ni tocar `WfmOperatingSite`.
- Tocar infra (Docker, pgBouncer) ni observabilidad más allá de `trackEvent` por tab.
- Refactors de duplicación detectados por la auditoría v1.1 (drawers gemelos, generadores de número, envelopes de paginación): se gobiernan en plan aparte `2026-09-01-inventario-dedup-refactors.md` (Propuesto).

## Key Decisions

| # | Decisión | Recomendación | Alternativas descartadas y por qué |
|---|----------|---------------|------------------------------------|
| 1 | **Naturaleza de los 3 maestros** | **Operativos MOD12**, no transversales MOD00. Catálogo/Proveedores/Bodegas son precondición diaria de transacciones (Existencias/Kardex/Reposición/Compras/Salidas) y se editan en contexto operativo, no de control plane. | Tratarlos como “configuración” (como roles/sedes) — descartado: PRD-MOD12 §6 y ADR-040 D1 definen MOD00 como federador de UX, no owner de maestros SCM; su uso es diario y co-localizado con saldos, a diferencia de calendario/turnos. |
| 2 | **Destino a corto plazo** | **Opción A: mantener en `/dashboard/inventory`** como base operativa. Menor riesgo, 0 migraciones, preserva boundaries y deep-links. | **Opción B (mover a Settings)** — descartada como destino único: viola ADR-040, exige que MOD00 posea/proxee tablas, fuerza `settings.read/manage` a roles bodega (sobre-permiso), breaking change de deep-links/E2E, y fragmenta IA (Settings es `SettingsSectionGrid` con `AVAILABLE/COMING_SOON/NOT_CONFIGURED`, no `PortalModuleSubnav` operativo). Solo viable si CTO re-clasifica SCM como transversal vía ADR mayor — contradice PRD-MOD12. |
| 3 | **Evolución deseable** | **Opción C híbrida federada (AUTORIZADA — ADR-084 Aprobado).** MOD00 expone **atajos** en Settings grid (`COMING_SOON`→`AVAILABLE` con `route:/dashboard/settings/inventory?tab=catalog`) que montan UI federada de MOD12 vía `SettingsSectionKey.INVENTORY` (mismo patrón que Reglas: `apps/portal/src/components/settings/rules/rules-settings-nav.ts:5-16` con 4 tabs `compatibility|tax-catalog|tax-rules-app|tax-simulator`, `ADR-082 (Propuesto)`). Inventory sigue siendo owner de datos/UI canónica (`/dashboard/inventory?tab=catalog` canónico). | Federar solo navegación sin UI (solo link) — descartado: no reduce descubrimiento real; duplicar UI con copia — descartado: deuda y divergencia. |
| 4 | **Alivio de saturación sin mover** | **Ordenar dentro de Inventario** (complemento, condicionado a datos Fase 1): telemetría por tab ya viva; si `frequency(Catálogo|Proveedores|Bodegas) << frequency(Existencias|Compras|Salidas)` evaluar sub-agrupar o colapsar “Maestros” dentro del mismo `PortalModuleSubnav` (DS-OWNER decide, carril rápido UI). No mover de módulo sin datos. | Mover por estética sin datos — descartado: especulación; reordenar tabs sin spec — descartado: spec v1.2 congelada. |
| 5 | **RBAC** | Mantener gate actual (`INVENTORY_STOCK_READ` + `INVENTORY_PURCHASING_READ` para Compras) hasta ADR-083. Si se federa, tarjeta Inventory en Settings exige `hasAllSettingsSectionPermissions` con `INVENTORY_STOCK_READ` (no `SETTINGS_MANAGE`), misma llave que Sidebar — evita sobre-permiso. | Crear 3 permisos nuevos (`CATALOG_READ`, `SUPPLIERS_READ`, `LOCATIONS_READ`) ahora — descartado: coste de migración RBAC + re-mapeo Sidebar/nav sin evidencia de necesidad PoLP. |
| 6 | **Deep-links / compat** | Dual-routing si se federa: canónico `/dashboard/inventory?tab=X` + alias `/dashboard/settings/inventory?tab=X` con 308 o render federado. Sin federación, no hay redirect. | Romper `?tab` y re-mapear E2E/pickers — descartado: alto coste y riesgo de bookmarks/QR. |
| 7 | **Documentación** | ADR-084 (Aprobado 2026-09-01) formaliza “federación de navegación, no de datos” y deja B descartada con justificación ADR-040. Delta HLD-MOD12 se aplica **en sitio** (archivo v1.0, versión interna 1.2 — la convención usada por MOD00/MOD12; no crear archivo `v1.1` nuevo porque colisiona con la versión interna 1.1 ya existente por ADR-068). | PRD nuevo de maestros — innecesario: ya están en PRD-MOD12; HLD nuevo como archivo — descartado por colisión de versiones. |

## Recommended Approach

**Fase 0 (decisión gobernada): COMPLETADA 2026-09-01 — ADR-084 Aprobado (C híbrida federada autorizada).** Decisión: **C completa (una sola vez, no rápido)** — ownership en MOD12, alias federado en MOD00. B descartada definitivamente (viola ADR-040 D1 y §Reglas 4). A solo como parche rápido también descartado: sin federación se garantiza refactor en 9 meses.

**Por qué C completa ahora (duradera):**
- Respeta Modulith federado: `configuration.controller.ts` y `settings-registry.service.ts` no tocan tablas WFM/Inventory; Inventario no importa `configuration`. 0 cross-imports verificado.
- UX durable: operador sigue en `Menú` (Sidebar: Inventario), ADMIN descubre también desde `Administración` via alias — mismo patrón que Reglas (`rules-settings-nav.ts` + ADR-082 (Propuesto)). Sin fragmentar flujo diario (Catálogo→Existencias/Kardex/Compras).
- RBAC PoLP desde día 1: tarjeta Settings exige `INVENTORY_STOCK_READ` (misma llave Sidebar), no `settings.manage`. Sin sobre-permiso. Sin crear 3 permisos nuevos.
- Dual-routing estable para siempre: canónico `/dashboard/inventory?tab=catalog` + alias `/dashboard/settings/inventory?tab=catalog` (308 para no-maestros). Cero migración de datos, rollback trivial a `COMING_SOON`.
- Coste 3-5 días bien invertidos hoy evita el refactor más caro (mover tablas + RBAC + deep-links) mañana.

**Qué NO hacer:** mover maestros a Settings como owner (B), dejar solo en Inventario esperando refactor (A-parche), crear permisos nuevos sin evidencia, duplicar UI con copia, **activar el alias en producción antes del baseline** (ADR-084 D5 / Regla 7).

## Work Plan

### Fase 0 — Decisión y gobierno (AI-EM-ARCH, 1 sesión) — ✅ COMPLETADA 2026-09-01
- **Entregables:** este plan (Aprobado) + `ADR-084-Inventario-Maestros-Federacion-Settings.md` (Aprobado 2026-09-01, compliance ADR-040 D1-D7 verificado).
- **Depende de:** lectura `ADR-040`, `PRD-MOD00 §1`, `HLD-MOD00`, `inventory-nav.ts`, `settings-registry.service.ts` — verificado.
- **Gate:** aprobación CTO 2026-09-01 — PASSED. B descartada, C completa autorizada como ruta única (no A+C diferida).

### Fase R1 — Regularización de gates (auditoría v1.1, AI-EM-ARCH + SR-FULL + FE-PLATFORM, 1 sesión) — ✅ COMPLETADA 2026-09-01
La auditoría multiagente detectó que la implementación Fase 2B adelantó al gate propio de ADR-084 (registry en `AVAILABLE` sin baseline). Regularización aplicada:
- **Registry revertido a `COMING_SOON`** (`settings-registry.service.ts`, bloque INVENTORY en estado pre-activación; spec actualizada a expectativa `COMING_SOON`). El alias directo por URL queda como residual documentado y aceptado (no descubrible desde el grid; RBAC intacto; backend sigue siendo la barrera).
- **Wiring CA-GATE-06:** `filterInventoryNavGroups` conectado en `InventoryClient.tsx` (no-federado) — Compras se oculta solo con permisos efectivos resueltos (`ready` + set no vacío + no-ADMIN + sin `inventory.purchasing.read`); en loading/degradado queda visible, mismo criterio del Sidebar.
- **Docs corregidos:** plan v1.1 (esta enmienda), erratas de ADR-084 (estado del plan, refs de línea), comentario de `inventory-nav.ts`.
- **Código Fase 2B en main como dormant:** wrapper `settings/inventory/page.tsx`, nav federada (`INVENTORY_FEDERATED_TABS`/`INVENTORY_FEDERATED_NAV_GROUPS`), e2e `portal-inventory-scm-federated.spec.ts`, telemetría (`analytics.ts` + `InventoryClient.tsx` + `Sidebar.tsx`). Reactivación = revertir el bloque INVENTORY del registry a `AVAILABLE` (2 líneas) tras completar Fase 1.
- **Gate:** cumplimento ADR-084 D5/Regla 7 — la activación en producción queda condicionada a baseline + validación UX.

### Fase 1 — Instrumentación y baseline (AI-SR-FULL + AI-FE-PLATFORM + SR-QA, baseline 7 días de calendario) — 🔶 PARCIAL
- **FE (✅ hecha):** `trackEvent('inventory.tab.view')` vivo en `InventoryClient.tsx:1006` (`handleTabChange`) y `Sidebar.tsx:305-312` (clicks Inventario/Settings); no-op local en `analytics.ts` hasta elegir provider. Spec `InventoryClient.telemetry.spec.tsx` en verde.
- **BE (✅ hecha):** `GET /configuration/settings-sections` ya expone `ownerModule` (`settings-section.schema.ts:8`); el campo `telemetry` **no se implementa** (decisión: no-op local, no bloquea C).
- **QA (⏳ pendiente):** baseline manual de 7 días: 5 operadores completan “crear categoría → crear producto → ver en Existencias” y “crear proveedor → crear solicitud” midiendo tiempo y clics. Guardar en `docs/informes/`.
- **Salida:** dashboard temporal de frecuencia por tab (7 días) → habilita decisión de reactivación del alias.

### Fase 2A — Ordenar dentro de Inventario (DS-OWNER + FE-PLATFORM, 1 día) — ⏸ condicionada a datos Fase 1
- **DS-OWNER:** evaluar sub-agrupar “Maestros” dentro del mismo `PortalModuleSubnav` (ej. divider + eyebrow “Maestros” dentro de `Operación`) o colapsar en `<lg` sin cambiar módulo. Decisión en carril rápido UI; si toca spec v1.2, versionar a v1.3.
- **FE:** aplicar ajuste mínimo en `portal-ui.tsx`/`inventory-nav.ts` (solo presentación, no ruta). Mantener `?tab` canónico.
- **Docs:** `INFORME-INVENTORY-MODULE-SUBNAV-v1.1.md` con antes/después y métrica de encontrabilidad (hoy no existe — sin colisión).

### Fase 2B — C completa (SR-FULL + FE-PLATFORM + DS-OWNER, 3-5 días) — 🔶 IMPLEMENTACIÓN DORMANT EN MAIN; activación pendiente de Fase 1
1. **Registry (BE):** al reactivar (post-baseline + validación UX), reemplazar el bloque `SettingsSectionKey.INVENTORY` de `settings-registry.service.ts` por: `status:AVAILABLE route:'/dashboard/settings/inventory?tab=catalog' ownerModule:'Inventory' description:'Maestros SCM del inventario: catálogo, categorías y existencias.' requiredPermissions:['inventory.stock.read']` (clave existente, **no** `INVENTORY_MAESTROS`).
2. **Wrapper (FE): ✅ hecho** — `apps/portal/src/app/dashboard/settings/inventory/page.tsx` monta `InventoryClient` con `initialTab` filtrado a `catalog|suppliers|locations` y `federatedMode=true` (oculta grupos no-maestros, muestra eyebrow “Maestros” + CTA “Ir a Inventario completo”). Reusa `PortalModuleSubnav` sin duplicar UI.
3. **Dual-routing: ✅ hecho** — `permanentRedirect` (308) en `page.tsx` si `?tab` no es maestro → `/dashboard/inventory?tab=X` preservando `custody`/`commercialRef`/`serializedAssetId`. Sin `middleware` ni `next.config`.
4. **RBAC: ✅ hecho** — `settings-priority.ts:20-27` + `SettingsSectionGrid.tsx:98-215` verifican `hasAllSettingsSectionPermissions` con `INVENTORY_STOCK_READ` para mostrar tarjeta; `Sidebar.tsx` no duplica lógica; gate de `purchasing` cableado (R1).
5. **Docs (⏳ al activar):** HLD-MOD12 delta en sitio (v1.0 → interna 1.2); `INFORME-MOD12-SETTINGS-FEDERACION-MAESTROS-v1.0.md` con G6/G6.5/G7 registrados por separado (ADR-069).
- **Contratos congelados (declarar en prompt de fase):** `docs/specs/2026-08-19-inventario-module-subnav-ux.md v1.2`, `apps/portal/src/components/shared/portal-ui.tsx` (`PortalModuleSubnav` API), `packages/shared/src/enums/access-control/*`, `apps/api/src/modules/configuration/services/settings-registry.service.ts` metadata contract.

### Fase 3 — Validación y rollout (SR-QA + PLAT-OPS, 1-2 días) — ⏳ al activar
- Ver Validation Plan. Gate G6/G6.5/G7 por fase (ADR-069).

## Validation Plan

| Fase | Qué validar | Comando / check | Evidencia esperada |
|------|-------------|-----------------|-------------------|
| 0/R1 | Citas ADR/PRD/HLD abiertas y en estado Aprobado | `pnpm audit:adr-citations` | `BLOQUEANTE: 0`; ADR-040, ADR-084, PRD-MOD12, HLD-MOD00 citados con ruta y estado |
| 0/R1 | Boundaries sin cross-import | `grep -R "from.*inventory" apps/api/src/modules/configuration --include="*.ts" ; grep -R "from.*configuration" apps/api/src/modules/inventory --include="*.ts"` | 0 hits |
| 1 | Telemetría por tab | `pnpm --filter @iwana/portal test src/components/inventory/InventoryClient.telemetry.spec.tsx` + manual 7 días | Spec verde; eventos por `?tab` (catalog/suppliers/locations/stock/purchasing/issues/counts/assets) con tendencia tras baseline |
| 1 | Tenancy no regresa | `pnpm --filter @iwana/api exec jest src/modules/inventory/tests/inventory-item.service.spec.ts src/modules/inventory/tests/supplier-profile.service.spec.ts` | Pass; sin `schema` hardcodeado (specs de inventory viven en `src/modules/inventory/tests/`) |
| 2A/2B | UX encontrabilidad | Test moderado 5 op + 3 admin (tarea: crear categoría/proveedor/bodega y usarlo) | Tiempo-a-tarea no degrada vs baseline; SUS no baja |
| 2A/2B | Typecheck & lint | `pnpm --filter @iwana/portal typecheck && pnpm lint` | Verde |
| 2A/2B | UI audit | `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/inventory/InventoryClient.tsx apps/portal/src/components/shared/portal-ui.tsx --json` | P0 0, P1 0 |
| 2B | Registry dormante | `pnpm --filter @iwana/api exec jest src/modules/configuration/services/settings-registry.service.spec.ts` | INVENTORY en `COMING_SOON`/`route:null` hasta activación (ADR-084 D5/Regla 7) |
| 2B | Gate Compras (CA-GATE-06) | `pnpm --filter @iwana/portal test src/components/inventory/inventory-nav.spec.ts src/components/inventory/InventoryClient.spec.tsx` | Sin permiso efectivo la pestaña Compras se oculta con permisos resueltos; visible en degradado |
| 2B | Dual-routing | `pnpm exec playwright test e2e/tests/portal-inventory-scm-federated.spec.ts` + manual: `/dashboard/settings/inventory?tab=catalog` y `?tab=suppliers` y `?tab=locations&custody=mobile` → 200 y monta maestros; `?tab=stock` → 308 a `/dashboard/inventory?tab=stock`; bookmarks antiguos intactos | Pass |
| 2B | RBAC | Login rol bodega (solo `inventory.stock.read`) ve tarjeta Inventory en Settings y subnav maestros (al activar); rol viewer sin permiso no ve tarjeta ni tab `purchasing` | Pass |
| 3 | E2E | `pnpm test:e2e:portal` (o subset `portal-inventory-scm.spec.ts` + `portal-inventory-scm-federated.spec.ts`) + `pnpm test:e2e` web | Verde, incluyendo picker catalog→compra y custody mobile |
| 3 | G6.5 | CI Linux por SHA (ADR-069) | `INFORME-G6.5` con sha, conteos, duración |
| 3 | Rollback drill | Revertir flag `federatedMode` / registry entry a `COMING_SOON` y re-validar `/dashboard/inventory?tab=catalog` | 200 sin alias |

Riesgo mayor a validar: **Fase 2B dual-routing + RBAC** (dos entrypoints, dos permisos). Si falla, el usuario queda sin maestros o con sobre-permiso.

## Risks / Rollback

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Mover a Settings sin ADR rompe Modulith (MOD00 lee tablas SCM) | Alta si se elige B | Alto (acoplamiento transversal, blob oculto) | Bloquear B sin ADR-CTO; validar grep 0 cross-imports en G6 |
| RBAC sobre-permiso: rol bodega necesita `settings.manage` para ver maestros | Alta si se exige `SETTINGS_*` | Medio (PoLP) | Tarjeta Settings exige `inventory.stock.read`, no `settings.*` |
| Breaking deep-links/bookmarks/QR | Alta si se cambia `?tab` | Alto (operación diaria) | Dual-routing + redirect 308 + E2E de deep-links |
| Activar alias antes de evidencia (violación ADR-084 D5/R7) | ~~Ocurrió en working tree~~ → **regularizado en R1** (registry `COMING_SOON` en main) | Alto (decisión sin datos) | Activación solo tras baseline 7 días + validación UX; revert a `COMING_SOON` como estado por defecto |
| Saturación percibida persiste (11 tabs siguen en Inventario) | Media | Medio (carga cognitiva) | Fase 2A: sub-agrupar “Maestros” dentro del mismo subnav + medir Fase 1 antes de federar |
| Duplicación UI si se copia en vez de federar | Media | Medio (deuda) | Wrapper monta `InventoryClient` filtrado, no copia componentes |
| Alias directo por URL sin tarjeta (residual post-R1) | Baja | Bajo | Documentado como aceptado: no descubrible desde grid; RBAC y backend intactos |
| Telemetría sin provider (no-op local) | Alta | Bajo | No-op local + contrato `@iwana/shared` futuro hasta elegir provider; decisión C no bloqueada por esto |

**Rollback:**
- Solo A / Fase 2A: revert commit de `portal-ui.tsx`/`inventory-nav.ts` (1 commit).
- A+C / Fase 2B: feature-flag `federatedMode` + registry entry `INVENTORY` → pasar a `COMING_SOON` sin deploy; alias 308 retira sin migrar datos (cero tablas movidas). No hay migración de datos que revertir. **Estado actual en main: registry ya en `COMING_SOON` (dormant).**

## Open Questions

1. **¿Cuándo se completa el baseline?** La telemetría ya está viva; el baseline de 7 días + test UX (5 op / 3 admin) es la condición de reactivación del alias. La “saturación” sigue siendo percepción hasta entonces.
2. **¿RBAC granular futuro?** ADR-083 (Aprobado 2026-08-28) prevé convergencia RBAC granular por módulos operativos. Si Inventario migra a permisos finos, ¿se crean `INVENTORY_CATALOG_READ`/`SUPPLIERS_READ`/`LOCATIONS_READ` y se re-mapean Sidebar + registry? Este plan los deja fuera hasta evidencia.
3. **¿Settings debe mostrar tarjeta “Inventario — Maestros” a rol ADMIN solo o también a bodega/compras?** Propuesta: misma llave que Sidebar (`inventory.stock.read`) para ambos; confirmar con Product.
4. **¿Se desea sub-agrupar “Maestros” dentro de Inventario ya (Fase 2A) aunque se federe luego?** DS-OWNER propone; no bloquea C. Decisión UX pendiente.

---

**Próximo paso:** completar baseline Fase 1 (7 días) + validación UX → decisión de reactivación del alias (registry `AVAILABLE`) → `INFORME-MOD12-SETTINGS-FEDERACION-MAESTROS-v1.0.md` con G6/G6.5/G7. La deuda de duplicación detectada se gobierna en `docs/plans/2026-09-01-inventario-dedup-refactors.md` (Propuesto).
