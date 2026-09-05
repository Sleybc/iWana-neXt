# ADR-084: Inventario — Federación de maestros en Settings (navegación, no datos)

**Version:** 1.1
**Estado:** Aprobado
**Fecha:** 2026-09-02
**Fecha aprobación:** 2026-09-01 (v1.0) · 2026-09-02 (enmienda v1.1)
**Modo activo:** Architect
**Autor:** AI-DOCS-ARCH + AI-EM-ARCH
**Aprobado por:** CTO Humano + AI-EM-ARCH (revisión cruzada SR-FULL/PROD-UX)
**Enmienda v1.1:** 2026-09-02 — decisión del CTO en sesión de auditoría. Sustituye el gate de
activación de D5 (baseline de telemetría → validación UX moderada), corrige el gate RBAC del alias
en D3 y cierra dos erratas. Trazabilidad completa en §Historial de versiones.
**Modulo:** MOD12 Inventario / SCM + MOD00 Configuración Control Plane
**Ownership:** MOD12 (datos y UI canónica) — alias federado en MOD00
**Decisión aprobada:** Opción C híbrida federada — 2026-09-01
**ADR base:** docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md (Aprobado)
**ADR antecedente patrón:** docs/adrs/ADR-082-Reglas-Federadas-Taxation-Settings.md (Propuesto)
**PRD relacionado:** docs/prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md
**PRD relacionado:** docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md (v1.7)
**HLD relacionado:** docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md (v1.1)
**HLD relacionado:** docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md (v1.7)
**Plan relacionado:** docs/plans/2026-09-01-inventario-maestros-ubicacion-inventory-vs-settings.md
**Spec congelada:** docs/specs/2026-08-19-inventario-module-subnav-ux.md (v1.2)

---

## Contexto

MOD12 Inventario / SCM expone 11 destinos en `PortalModuleSubnav` bajo `/dashboard/inventory`, definidos en `apps/portal/src/components/inventory/inventory-nav.ts:17-41`:

- Grupo **Operación**: Vista general (`overview`), Catálogo (`catalog`), Existencias (`stock`), Compras (`purchasing`), Proveedores (`suppliers`), Bodegas (`locations`), Salidas (`issues`), Conteos (`counts`).
- Grupo **Seguimiento**: Activos (`assets`), Movimientos (`movements`), Bajas (`writeoffs`).

Tres de esos destinos — **Catálogo** (`inventory_items` + `inventory_categories`, SKU autogenerado `{CAT}-{TIPO}-{NOMBRE}-{MARCA}-{MODELO}` max 60, `codePrefix` migración 052), **Proveedores** (`supplier_profiles` + Party/Rol atómico, ADR-052) y **Bodegas** (`stock_locations` con `responsibleRefId` y matriz `StockLocationsMatrix`) — funcionan como **maestros operativos precondición diaria** de transacciones co-localizadas: Existencias / Kardex / Reposición (`StockWorkspace.tsx:136`), Compras / RFQ, y Salidas. Se crean esporádicamente (ADMIN/NOC) y se consumen a diario en el mismo módulo.

Se planteó aliviar la saturación percibida de 11 tabs moviendo esos 3 maestros a `/dashboard/settings` como subsección. La pregunta de boundary es si son configuración transversal esporádica (como sedes/horarios/perfiles de ADR-040) o maestros SCM de uso diario.

Evidencia verificada al 2026-09-01 (plan `2026-09-01-inventario-maestros-ubicacion-inventory-vs-settings.md`):

- `apps/api/src/modules/configuration/services/settings-registry.service.ts:73-82` expone `SettingsSectionKey.INVENTORY` con `status: COMING_SOON`, `route: null`, `ownerModule: 'Inventory futuro'` — sin `TypeOrmModule`, sin importar `InventoryModule`, sin leer tablas de dominio. `configuration.controller.ts:32-40` y `configuration.module.ts` confirman que MOD00 solo publica metadata.
- Verificación de boundaries por `grep`: `apps/api/src/modules/configuration/**` 0 imports de `inventory_*`; `apps/api/src/modules/inventory/**` 0 imports de `configuration`.
- RBAC vigente: 11 tabs de Inventario bajo `INVENTORY_STOCK_READ` + excepción `INVENTORY_PURCHASING_READ` solo para `purchasing` (`inventory-nav.ts:78-87` `filterInventoryNavGroups`, `Sidebar.tsx:79-158` — Inventario en grupo **Menú** operativo, Configuración en **Administración**). No existen permisos granulares `CATALOG_READ` / `SUPPLIERS_READ` / `LOCATIONS_READ`.
  **Corrección v1.1:** esa excepción está incompleta. `suppliers` también requiere `INVENTORY_PURCHASING_READ` en backend, y hoy no se gatea en la UI — ver D3.
- Patrón precedente: ADR-082 (Propuesto) federó **Reglas** (Taxation + Commercial) en `apps/portal/src/components/settings/rules/rules-settings-nav.ts` con `?tab=compatibility|tax-catalog|tax-rules-app|tax-simulator` y `rules-settings-params.ts:1-33`, sin mover ownership de `tax_definitions` / `tax_rules` / `catalog_compatibility_rules`.

Sin decisión, el riesgo es doble: mover maestros a MOD00 rompería ADR-040 D1-D2 (MOD00 como control plane que centraliza experiencia, no datos) y duplicaría UI; mantenerlos sin evolución deja sin resolver el descubrimiento esporádico del ADMIN desde Settings.

## Decision

Se adopta la **federación de navegación, no de datos** — **Opción C híbrida federada** aprobada el **2026-09-01** — con ownership invariante:

> **MOD12 Inventario / SCM permanece owner exclusivo de datos, tablas y UI canónica de Catálogo, Proveedores y Bodegas. MOD00 Configuración expone únicamente un alias de navegación en el grid de Settings que monta UI federada del mismo código de MOD12. No hay movimiento de tablas, no hay proxy de datos, no hay duplicación de componentes.**

### D1. Federación de navegación, no de datos

- Tablas `inventory_items`, `inventory_categories`, `supplier_profiles`, `stock_locations` y derivadas permanecen en el schema tenant bajo `InventoryModule`. MOD00 no las absorbe ni las proxea.
- MOD00 publica en `settings-registry.service.ts:73-82` la entrada `SettingsSectionKey.INVENTORY` con transición `COMING_SOON` → `AVAILABLE`, `route: '/dashboard/settings/inventory?tab=catalog'`, `ownerModule: 'Inventory'`, `requiredPermissions: ['inventory.stock.read']` (misma llave que Sidebar; no `settings.manage`), siguiendo el patrón `SettingsSectionKey.RULES` de ADR-082 (Propuesto).
- El alias de Settings es **navegación federada**: el wrapper `apps/portal/src/app/dashboard/settings/inventory/page.tsx` monta `InventoryClient` filtrado a `catalog|suppliers|locations` con `federatedMode=true` (reusa `PortalModuleSubnav` y `rules-settings-nav.ts` como referencia, no copia componentes). La UI canónica sigue en `/dashboard/inventory?tab=catalog|suppliers|locations`.

### D2. Boundaries preservados

- MOD00 no importa entidades TypeORM de Inventario; Inventario no importa `configuration`. Comunicación solo por metadata de registry (sin `TypeOrmModule` en `configuration.module.ts`), igual que `settings-registry.service.ts:7-95` hoy.
- Cualquier consumo futuro de maestros por otros módulos (WFM, Billing, Assurance) será por puertos tipados exportados por `InventoryModule`, no por acceso directo a tablas — regla ADR-040 §Reglas 4 y ADR-048 §Reglas de integración.

### D3. RBAC sin sobre-permiso — **gate por grupo, no por bloque uniforme** (v1.1)

- La tarjeta Inventario en `SettingsSectionGrid` y el wrapper federado exigen `hasAllSettingsSectionPermissions` con `INVENTORY_STOCK_READ` (gate vigente de `inventory-nav.ts:78-87`). Un rol bodega/compras no necesita `settings.manage` para operar maestros; un ADMIN sin permisos de inventario no ve el alias.
- **Corrección v1.1 — los tres maestros no comparten gate.** La v1.0 los trató como un bloque uniforme bajo `INVENTORY_STOCK_READ`. La auditoría del 2026-09-02 verificó que **Proveedores no pertenece a ese eje**: todos sus endpoints viven en `apps/api/src/modules/inventory/purchasing.controller.ts` bajo `INVENTORY_PURCHASING_READ` (lectura, incluidos `GET /purchasing/suppliers` y `GET /purchasing/suppliers/:partyRefId`) y `INVENTORY_PURCHASING_MANAGE` (alta, edición y cambio de estado). Su panel se rotula además con eyebrow «Abastecimiento».
- **Defecto vivo derivado (independiente de la federación):** la pestaña Proveedores se ofrece hoy tras el gate de página `INVENTORY_STOCK_READ` (`apps/portal/src/app/dashboard/inventory/layout.tsx`), de modo que un rol con solo `inventory.stock.read` la ve y recibe **403** al usarla. Se corrige como defecto propio, sin esperar a la federación; el backend ya es correcto y no se toca (`PermissionsGuard` sigue siendo la barrera real).
- **Regla de activación:** el alias federado gatea **por grupo**, con la llave que el backend exige en cada uno — `INVENTORY_STOCK_READ` para Catálogo y Bodegas, `INVENTORY_PURCHASING_READ` para Proveedores. Activar el alias con un gate uniforme reproduciría el 403 **dentro de Configuración**, que es el peor sitio para descubrir un error de permisos.
- Sigue sin usarse `SETTINGS_*` como gate genérico, y sigue vigente la prohibición de crear permisos granulares nuevos (§Reglas 2).
- No se crean permisos nuevos `INVENTORY_CATALOG_READ` / `SUPPLIERS_READ` / `LOCATIONS_READ` en esta entrega (coste sin evidencia PoLP; ADR-083 los deja fuera hasta telemetría). La granularidad futura, si aplica, se gobernará por ADR-083 y PRD-MOD00 v1.7 §4.3.4.
- Deep-link y gate de `purchasing` (`INVENTORY_PURCHASING_READ`, `filterInventoryNavGroups`) no cambian.

### D4. Dual-routing y deep-links estables

- **Canónico:** `/dashboard/inventory?tab=catalog|suppliers|locations|stock|...` (con query preservada: `?tab=locations&custody=mobile`, `?tab=catalog&commercialRefId=...`, `?tab=locations&custody=mobile` documentados en `InventoryClient.tsx:884,975-990`).
- **Alias federado:** `/dashboard/settings/inventory?tab=catalog|suppliers|locations` (render federado del mismo `InventoryClient`). Tabs no-maestros en el alias (`?tab=stock|purchasing|issues|counts|assets|movements|writeoffs`) redirigen con 308 a `/dashboard/inventory?tab=X`.
- Bookmarks, QR de bodega, pickers de Compras y E2E `portal-inventory-scm.spec.ts` preservan `?tab` canónico. Alias es aditivo y reversible sin migración de datos (rollback: pasar registry entry a `COMING_SOON`).

### D5. Evidencia previa a federar — **validación UX, no baseline de telemetría** (enmendado v1.1)

- **Gate vigente (v1.1):** la activación del alias en producción exige **validación UX moderada de encontrabilidad** — 5 operadores y 3 admins, tareas «crear categoría → crear producto → verlo en Existencias» y «crear proveedor → crear solicitud», midiendo tiempo y clics contra el baseline actual (plan §Validation Plan). Esa validación es la evidencia habilitante; su informe vive en `docs/informes/`.
- **La telemetría queda como deseable no bloqueante.** `trackEvent('inventory.tab.view', {tab})` sigue instrumentado en `InventoryClient.tsx:handleTabChange` y en `Sidebar.tsx`, y se conserva: cuando exista provider, su serie histórica informará la decisión. Pero **no condiciona la activación**.
- **Por qué se enmienda (defecto D-1 de la auditoría 2026-09-02):** el gate de la v1.0 exigía un baseline de 7 días de esa telemetría, y era **inalcanzable**. `apps/portal/src/lib/analytics.ts` solo reenvía el evento si existe `window.__IWANA_TRACK__`; el `grep` de ese símbolo en todo el repo devuelve **un único hit — su propia definición**. Nadie inyecta el provider, de modo que los eventos se emiten a la nada y el baseline no podía completarse por esa vía. La Fase 2B, ya construida y pagada, quedaba congelada indefinidamente por una condición imposible de satisfacer. Elegir e integrar un provider es una decisión de tooling (posible coste o licencia) que no pertenece al camino crítico de una decisión de navegación.
- **Sin esa evidencia rige la Opción A** (mantener en Inventario). La v1.0 ya autorizaba expresamente, dentro de A, **ordenar dentro del mismo `PortalModuleSubnav` si DS-OWNER lo aprueba**: esa autorización **no depende de dato alguno** y se reafirma aquí, porque el plan v1.1 la había condicionado a la Fase 1 — más restrictivo que este ADR (defecto D-2, corregido en el plan v1.2).

---

## Alternativas descartadas

### A. Mantener únicamente en `/dashboard/inventory` sin alias federado (Opción A — status quo)

Descartada como **destino único definitivo**, aunque se mantiene como **base vigente hasta evidencia**.

- **Por qué no basta sola:** no alivia el descubrimiento esporádico del ADMIN que espera encontrar maestros también desde el hub de Configuración (hub que el producto posiciona como punto de entrada transversal). Deja sin patrón para futuros maestros que sí requieran descubrimiento dual.
- **Qué se conserva de A:** es la base operativa real hasta que Fase 1 produzca telemetría. Si CTO elige solo A, este ADR no se activa y basta con ordenar dentro de Inventario (sub-agrupar "Maestros" dentro del mismo `PortalModuleSubnav` con spec v1.2 → v1.3, sin mover de módulo).

### B. Mover maestros a `/dashboard/settings` como owner MOD00 (Opción B — mover)

Descartada.

- **Viola ADR-040 D1-D2:** Configuración centraliza experiencia, no ownership de datos operativos. Catálogo/Proveedores/Bodegas son maestros SCM de uso diario co-localizados con Existencias/Kardex/Compras/Salidas, no configuración transversal esporádica como sedes/horarios/perfiles. Moverlos exigiría que MOD00 posea o proxee `inventory_items` / `supplier_profiles` / `stock_locations`, rompiendo el modulith (cross-imports hoy 0) y la regla HLD-MOD00 §2.
- **RBAC con sobre-permiso:** forzaría `settings.read/manage` a roles bodega/compras para trabajo diario, violando PoLP (plan §Constraints) y el gate vigente `INVENTORY_STOCK_READ`.
- **Breaking change de deep-links/E2E:** rompería `?tab=catalog|suppliers|locations`, `custody=mobile`, `commercialRefId`, QR y pickers; exige migración de bookmarks sin beneficio de boundary.
- **Fragmenta IA:** Settings es `SettingsSectionGrid` con estados `AVAILABLE/COMING_SOON/NOT_CONFIGURED`; Inventario es `PortalModuleSubnav` operativo lima con `bg-iwana-surface-soft` + barra `bg-iwana-secondary` (spec v1.2). Mover maestros saca transacciones y maestros de su contexto operativo natural.
- **Solo viable si** CTO re-clasifica SCM como transversal vía ADR mayor — contradice PRD-MOD12-INVENTARIO-SCM-v1.0 §1-2 y ADR-048.

---

## Consecuencias

### Positivas

- El ADMIN descubre maestros desde Settings sin penalizar el flujo diario del operador, que sigue encontrando maestros y transacciones en el mismo `Menú` (Sidebar: Inventario vs. Administración).
- Cero movimiento de tablas, cero duplicación de UI, cero migración de datos; el alias es metadata + wrapper que reusa `InventoryClient` (patrón probado en `rules-settings-nav.ts:4-12` y `ADR-082` (Propuesto)).
- Boundaries auditables (`grep` 0 cross-imports) y tenancy preservada (`SET LOCAL search_path` por transacción).
- Rollback trivial: feature-flag `federatedMode` + registry entry → `COMING_SOON`, sin datos que revertir.

### Costos y tradeoffs

- Alias HTTP y dual-routing durante al menos una release (dos entrypoints canónicos documentados).
- Requiere mantener sincronizados `inventory-nav.ts:17-41` y `rules-settings-nav.ts`-like nav de Settings federado (mismo `PortalModuleSubnavGroup` contract).
- Requiere validación UX de encontrabilidad antes de activar el alias en producción (v1.1; la v1.0 exigía además un baseline de telemetría — ver D5).
- La tarjeta Inventory en Settings exige el mismo `INVENTORY_STOCK_READ` que Sidebar — coherencia ganada a costa de no usar `SETTINGS_*` como gate genérico.

### Riesgos aceptados

- **Desalineo temporal de nav:** si `inventory-nav.ts` añade un maestro y el alias no se actualiza, el alias queda incompleto. Mitigado por contrato congelado `PortalModuleSubnavGroup` y spec v1.2.
- **Doble entrypoint confundible:** mitigado por CTA "Ir a Inventario completo" en modo federado y redirect 308 para tabs no-maestros.
- **Telemetría sin provider:** **(v1.1)** ya no difiere la activación de C — el gate pasó a la validación UX (D5). `trackEvent` permanece no-op local hasta elegir provider, sin bloquear nada. Se acepta operar sin serie histórica de frecuencia por tab hasta entonces.

---

## Cumplimiento ADR-040 D1-D7

| Decisión ADR-040 | Cumplimiento en este ADR |
| --- | --- |
| **D1. Configuración centraliza la experiencia, no todo el ownership** | Cumple: MOD00 centraliza el descubrimiento (tarjeta Settings) pero no absorbe `inventory_items` / `supplier_profiles` / `stock_locations`. Owner permanece MOD12, igual que WFM/Inventory/Billing/Commercial conservan sus datos operativos en D1. |
| **D2. Organización/Sedes como capacidad transversal administrada desde Configuración** | Cumple por analogía: el alias Inventory no crea una nueva capacidad transversal; los maestros SCM no son sedes transversales sino operativos de dominio. No se replica el patrón Sedes para SCM. |
| **D3. WFM deja de ser owner conceptual de sede corporativa** | No aplica directamente; se respeta el principio de migración aditiva sin pérdida. Este ADR no toca `WfmOperatingSite` → `OrganizationSite` ni introduce migración de sedes. |
| **D4. Usuarios y acceso con rol base + perfiles configurables** | Cumple: no se crean roles backend dinámicos ni se altera `UserRole`. El alias respeta `UserRole` + `AccessProfile` y matriz `MOD00_ACCESS_V2` (ADR-083) sin bypass. |
| **D5. Permisos granulares son complemento, no reemplazo inmediato del RBAC** | Cumple: `INVENTORY_STOCK_READ` / `INVENTORY_PURCHASING_READ` siguen como gate; no se habilita bypass por ocultar botones. Toda acción sensible sigue validada en backend con `RolesGuard` + `PermissionsGuard`. |
| **D6. Catálogo inicial versionado y compatibilidad con `UserRole`** | Cumple: no se introducen claves nuevas `CATALOG_READ` / `SUPPLIERS_READ` / `LOCATIONS_READ`; se mantiene `MOD00_ACCESS_V2` sin `RESERVED` promovido sin endpoints. Matriz y plantillas permanecen en `access-control.constants.ts`. |
| **D7. Gobierno operativo del tenant y acceso modular** | Cumple: "dar acceso a Inventario" sigue significando asignar perfiles con `INVENTORY_STOCK_READ` (y `INVENTORY_PURCHASING_READ` para Compras), no crear roles backend ni confiar en ocultamiento de frontend. ADMIN tenant gobierna desde `/dashboard/settings/access` sin elevación. |

Reglas de implementación ADR-040 §Reglas 1-8: sin `tenant.settings` JSONB para maestros, sin roles dinámicos, sin acceso directo cross-tablas salvo puertos aprobados, tenant-aware por `search_path`, auditoría de movimientos sensibles preservada (ADR-048 R6), sin PII en sedes/permisos, sin migración destructiva.

---

## Reglas de implementacion

1. No usar `tenant.settings` JSONB para modelar Catálogo, Proveedores ni Bodegas.
2. No crear permisos granulares nuevos para maestros sin ADR-083 y evidencia PoLP.
3. **(v1.1)** Gate por grupo con la llave que exige el backend: `INVENTORY_STOCK_READ` para la tarjeta Settings y para Catálogo y Bodegas; `INVENTORY_PURCHASING_READ` para `purchasing` **y para `suppliers`**. Nunca `SETTINGS_*` como gate genérico.
4. No importar entidades TypeORM de Inventario en `configuration` ni viceversa; verificar `grep` 0 cross-imports en G6.
5. Dual-routing documentado: canónico `/dashboard/inventory?tab=X` + alias `/dashboard/settings/inventory?tab=catalog|suppliers|locations`; redirect 308 para tabs no-maestros.
6. Wrapper federado reusa `InventoryClient` filtrado; prohibida copia de `InventoryCatalogProductsPanel` / `SuppliersPanel` / `StockLocationsMatrix`.
7. **(v1.1)** Validación UX moderada previa a activar el alias en producción; sin esa evidencia rige solo A. La telemetría `inventory.tab.view` se conserva como deseable no bloqueante. Reordenar dentro del propio `PortalModuleSubnav` (Opción A) **no requiere evidencia previa**: lo aprueba DS-OWNER en carril rápido.
8. Rollback sin migración de datos: registry `COMING_SOON` + `federatedMode=false`.
9. **(v1.1)** La descripción del registry al activar declara el alcance federado real — **catálogo, proveedores y bodegas**. Nunca «existencias»: ese tab redirige con 308 (D4).

---

## Historial de versiones

### v1.0 → v1.1 (2026-09-02) — enmienda por auditoría del gate de activación

Decisión del CTO en sesión, con el mismo mecanismo de registro que la Fase R1
(`INFORME-MOD12-FASE-R1-REGULARIZACION-GATES-FEDERACION-v1.0.md` §1). Cuatro cambios:

| # | Cambio | Sección | Causa |
| --- | --- | --- | --- |
| D-1 | Gate de activación: baseline de 7 días de telemetría → **validación UX moderada**; telemetría degradada a deseable no bloqueante | D5, Regla 7, Costos, Riesgos, Criterio CTO | El gate era **inalcanzable**: `analytics.ts` solo emite si existe `window.__IWANA_TRACK__`, y el `grep` de ese símbolo devuelve un único hit — su propia definición. Sin provider, el baseline no podía completarse y la Fase 2B quedaba congelada indefinidamente |
| D-2 | Se reafirma que reordenar dentro del propio `PortalModuleSubnav` **no requiere evidencia previa** | D5, Regla 7 | El plan v1.1 había condicionado la Fase 2A a datos de Fase 1, siendo más restrictivo que este ADR. Corregido en el plan v1.2 |
| D-3 | Gate RBAC del alias pasa de bloque uniforme a **gate por grupo**; se registra el defecto vivo de Proveedores | D3, Regla 3 | Los endpoints de Proveedores viven en `purchasing.controller.ts` bajo `INVENTORY_PURCHASING_*`, pero su pestaña se ofrece con `inventory.stock.read` → 403 vivo. Activar con gate uniforme lo trasladaría al interior de Configuración |
| D-4 | Descripción del registry al activar: **catálogo, proveedores y bodegas** | Regla 9 (nueva) | El plan prescribía «catálogo, categorías y existencias»; Existencias no es tab federado — redirige con 308 (D4) |

**Sin cambios** en la decisión de fondo (federación de navegación, no de datos), en el ownership de
MOD12, en los boundaries, en el dual-routing ni en el rollback. La Opción B sigue descartada por las
mismas cuatro razones.

**Nota de cadena normativa:** este ADR cita a [ADR-082 (propuesto)](ADR-082-Reglas-Federadas-Taxation-Settings.md)
como patrón precedente, y ese ADR sigue sin aprobar. La cita es de **mecanismo**
(registry + wrapper federado + `?tab`), no de norma; la política difiere: ADR-082 (propuesto) D5 mudó
Reglas de módulo — Comercial dejó de mostrar el grupo —, mientras Inventario mantiene dual-routing
porque sus maestros tienen un consumidor operativo dominante y diario.

---

## Impacto documental

- Nuevo ADR: este documento (`ADR-084`), enmendado a v1.1 el 2026-09-02.
- Plan previo: docs/plans/2026-09-01-inventario-maestros-ubicacion-inventory-vs-settings.md (Aprobado, base de esta decisión; enmienda v1.1 de auditoría 2026-09-01).
- PRDs/HLDs sin cambio de contenido en v1: docs/prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md, docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md, docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md, docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md — delta solo si se activa federación (HLD-MOD12 v1.1 + HLD-MOD00 addendum).
- Informe futuro si se activa C: `docs/informes/INFORME-MOD12-SETTINGS-FEDERACION-MAESTROS-v1.0.md` + `docs/informes/INFORME-INVENTORY-MODULE-SUBNAV-v1.1.md`.

---

## Criterio de aprobacion CTO

La aprobación CTO de este ADR (estado Propuesto → Aprobado) autoriza:

1. Mantener ownership de Catálogo / Proveedores / Bodegas en MOD12 con UI canónica en `/dashboard/inventory` (`inventory-nav.ts:17-41`).
2. Exponer alias federado de solo navegación en MOD00 Settings (`settings-registry.service.ts:73-82` → `AVAILABLE` con `route:'/dashboard/settings/inventory?tab=catalog'`) bajo patrón `rules-settings-nav.ts` / ADR-082 (Propuesto), condicionado a la evidencia de D5 — **validación UX moderada desde v1.1**.
3. Dual-routing canónico + alias con **RBAC por grupo** (`INVENTORY_STOCK_READ` para Catálogo y Bodegas; `INVENTORY_PURCHASING_READ` para Proveedores — D3 v1.1) y rollback sin migración de datos.

Sin aprobación, rige Opción A (mantener en Inventario) sin alias. Dentro de A, reordenar el propio
`PortalModuleSubnav` está autorizado sin evidencia adicional (D5).

---

## Referencias

- AGENTS.md — Architecture Rules (boundaries, modulith, tenancy por `search_path`)
- docs/prds/Stack_Tecnologico.md
- docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md (v1.7)
- docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md (v1.7)
- docs/prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md (v1.1)
- docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md (v1.1)
- docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md
- docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md
- docs/adrs/ADR-082-Reglas-Federadas-Taxation-Settings.md (Propuesto)
- docs/adrs/ADR-083-Convergencia-RBAC-Granular-Modulos-Operativos.md
- docs/plans/2026-09-01-inventario-maestros-ubicacion-inventory-vs-settings.md
- docs/specs/2026-08-19-inventario-module-subnav-ux.md (v1.2)
- apps/portal/src/components/inventory/inventory-nav.ts:17-41
- apps/api/src/modules/configuration/services/settings-registry.service.ts:73-82
- apps/portal/src/components/settings/rules/rules-settings-nav.ts
- apps/portal/src/components/settings/rules/rules-settings-params.ts:1-33
