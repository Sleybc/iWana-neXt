---
title: 'PRD — Módulo Comercial: Catálogo de Planes, Productos y Servicios'
version: '1.2'
owner: 'Arquitectura de Soluciones / Producto'
date: '2026-04-20'
status: 'Aprobado para Diseño e Implementación'
classification: 'Confidencial — Uso Interno'
module: 'MOD06'
codeName: 'CommercialModule'
author: 'AI-EM-ARCH (Modo Architect)'
references:
  - PRD_Sistema_ISP_Colombia_v2_3.md (Sección 5.9, 8.1, 8.2)
  - HLD-MOD06-ARQUITECTURA-v1.0.md
  - ADR-028-Extraccion-Modulo-Comercial.md
  - HLD-MOD05-ARQUITECTURA-v2.0.md (puertos de integración)
  - PRD-MOD06-COMERCIAL-ADDENDUM-FASE-02-v1.0.md (consolidado en esta versión)
  - docs/ideas/modulo_comercial.md (PRD semilla)
  - docs/ideas/actulizacion_prd_base.md (instrucciones de actualización)
---

---

## 1. Contexto y Motivación

### 1.1 Problema a resolver

El ISP necesita una fuente única de verdad para su oferta comercial: planes de Internet, productos tangibles (routers, ONTs), servicios adicionales (IP pública, traslados), combos (triple play) y promociones temporales.

Actualmente la información de catálogo está dispersa:

- `PlanCatalogItem` en TenantModule — solo planes con precio plano sin historial
- `AdditionalProduct` en TenantModule — productos sin precio ni flag de comodato
- Sin historial de precios inmutable (SCD Tipo 2)
- Sin bundles, promociones ni reglas de compatibilidad
- Sin clasificación tributaria configurable (IVA, retención, ICA)
- Sin pricing por segmento de cliente

### 1.2 Decisión clave

Extraer el dominio comercial como Bounded Context independiente (`CommercialModule`), migrando las entidades existentes de TenantModule y ampliando con motor de precios SCD Tipo 2, bundles, promociones, reglas de compatibilidad y clasificación tributaria configurable.

**Referencia:** ADR-028-Extraccion-Modulo-Comercial.md

### 1.3 Evolución

| Versión | Cambio                                                                                                                                                                                                                                    |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1.0    | Definición inicial completa: catálogo unificado + motor de precios + bundles + promociones + tax rules + compatibilidad                                                                                                                   |
| v1.1    | Consolidación final del addendum de Fase 02: `commercialApi` explícito en portal, retiro de catálogo comercial desde `tenantSelfApi` y cierre del ownership frontend del módulo                                                           |
| v1.2    | Rediseño UX del catálogo de productos en portal: vista unificada con búsqueda/filtros, modal por bloques y formalización del set mínimo de captura vigente (`name`, `description`, `category`, `isLoan`, `requiresInventory`, `isActive`) |

---

## 2. Alcance

### 2.1 En scope

| Área                           | Detalle                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Catálogo unificado             | CRUD de Planes, Productos y Servicios Adicionales con Class Table Inheritance                                          |
| Motor de Precios               | SCD Tipo 2 con historial inmutable, pricing por segmento de cliente                                                    |
| Bundles / Combos               | Agrupación de ítems mixtos con descuento y vigencia temporal                                                           |
| Promociones                    | Descuentos temporales sobre ítems, bundles o instalación con límite de usos                                            |
| Reglas de compatibilidad       | REQUIRES, EXCLUDES, REPLACES entre ítems del catálogo                                                                  |
| Clasificación tributaria       | IVA exento/excluido/pleno, retención, ICA municipal — configurable por UI                                              |
| Tabla de reglas tributarias    | Mapeo (clasificación × segmento × estrato × municipio) → impuestos con tasas                                           |
| Integración CRM                | Puerto de lectura para Expediente Único (cotización, selección de plan)                                                |
| Integración portal empresarial | `commercialApi` como entrypoint frontend del catálogo comercial para Settings y Expediente                             |
| UX de catálogo en portal       | Rediseño de productos como catálogo maestro unificado, con búsqueda, filtros y edición rápida sin subsecciones rígidas |
| Eventos de dominio             | `PlanPriceUpdated`, `CatalogItemDeactivated`, `PromotionStarted/Expired`                                               |
| Migración de datos             | Migración de `plan_catalog_items` y `additional_products` desde TenantModule                                           |
| RBAC                           | CRUD: Gerencia Comercial, Facturación, SuperAdmin. Lectura: SAC, Ventas, Técnicos                                      |

### 2.2 Fuera de scope

| Área                                                                      | Razón                                                                                               |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Cálculo/liquidación de impuestos en factura                               | Responsabilidad de Billing (futuro)                                                                 |
| Contribuciones CRC y Fondo TIC                                            | Aplican sobre ingresos del ISP, no por ítem                                                         |
| Inventario físico (MACs, seriales)                                        | Dominio de Inventory/WFM                                                                            |
| Facturación y cobro                                                       | Dominio de Billing                                                                                  |
| Vigencia programada futura de precios                                     | Diferido a v1.1 (Fase 2)                                                                            |
| Catálogo público sin autenticación                                        | Diferido a v1.1 (Portal Cliente, Fase 2)                                                            |
| Movimiento de `coverage` fuera de `tenantSelfApi`                         | Fuera del alcance del cierre frontend actual                                                        |
| Refactorización masiva del cliente HTTP del portal                        | El cierre frontend debe permanecer focalizado en ownership comercial                                |
| Captura de inventario físico por unidad (serial, MAC, IMEI, lote, bodega) | Dominio futuro de Inventory/WFM, fuera del catálogo maestro actual                                  |
| Enriquecimiento de producto maestro con marca, modelo y SKU               | Diferido a ampliación posterior del catálogo comercial; no hace parte del contrato vigente de MOD06 |

---

## 3. Personas y Casos de Uso

### 3.1 Personas primarias

| Persona                 | Rol                | Caso de uso principal                                                                           |
| ----------------------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| **Gerente Comercial**   | COMMERCIAL_MANAGER | Crear planes, definir combos, lanzar promociones, ajustar precios por segmento                  |
| **Jefe de Facturación** | BILLING_MANAGER    | Configurar clasificación tributaria, ajustar tasas de impuestos, verificar historial de precios |
| **SuperAdmin (TI)**     | TENANT_ADMIN       | Configuración inicial del catálogo, soporte técnico al módulo, migración de datos               |

### 3.2 Personas secundarias (solo lectura)

| Persona              | Rol              | Caso de uso principal                                          |
| -------------------- | ---------------- | -------------------------------------------------------------- |
| **Asesor comercial** | SALES_EXECUTIVE  | Consultar planes y precios vigentes para cotizar en CRM        |
| **Agente SAC**       | SUPPORT_AGENT    | Consultar características del plan del suscriptor para soporte |
| **Técnico de campo** | FIELD_TECHNICIAN | Consultar tarifa de materiales/servicios adicionales en OT     |

### 3.3 Flujos principales

#### Flujo 1: Crear plan con pricing por segmento

1. Gerente Comercial crea plan (nombre, velocidad, tecnología, regla instalación)
2. Sistema solicita clasificación tributaria
3. Gerente define precios por segmento: RESIDENTIAL=$89,900, SOHO=$129,900, PYME=$199,900
4. Sistema crea `CatalogItem` + `PlanDetail` + N registros en `CatalogPriceHistory`
5. Audit log registra la creación

#### Flujo 2: Cambiar precio de un plan

1. Jefe de Facturación selecciona plan y segmento a modificar
2. Ingresa nuevo precio
3. Sistema cierra registro anterior (`valid_to = NOW()`, `is_current = false`)
4. Sistema crea nuevo registro (`valid_from = NOW()`, `is_current = true`)
5. Emite evento `commercial.price.updated` → Billing recalcula proyecciones
6. Historial queda inmutable para consulta y auditoría

#### Flujo 3: Crear bundle triple play

1. Gerente selecciona ítems: Plan Fibra 500 + TV Premium + Router WiFi 6 (comodato)
2. Define descuento: 15% sobre suma de precios individuales
3. Marca Router WiFi 6 como opcional (el combo funciona sin él, pero con descuento reducido)
4. Define vigencia del bundle
5. Sistema valida reglas de compatibilidad entre ítems
6. Emite evento `commercial.bundle.created`

#### Flujo 4: Lanzar promoción temporal

1. Gerente crea promoción: "50% descuento instalación — campaña abril"
2. Define: aplica a INSTALLATION, 50% descuento, válida del 1 al 30 de abril
3. Define límite: máximo 200 usos
4. CRM y Portal muestran la promoción en cotizaciones nuevas
5. Al alcanzar el límite o fecha fin, promoción se desactiva automáticamente

#### Flujo 5: Configurar reglas tributarias

1. Jefe de Facturación accede a configuración tributaria
2. Define regla: "Internet residencial estrato 1-2 → IVA exento (0%)"
3. Define regla: "Internet residencial estrato 3 → IVA excluido"
4. Define regla: "Internet comercial → IVA pleno 19%"
5. Define regla: "Contratos gobierno → retención 11%"
6. Las reglas se aplican automáticamente en cotizaciones del CRM

#### Flujo 6: Consumir catálogo comercial desde portal sin dependencia de Settings

1. El administrador del tenant entra al módulo Comercial desde su navegación dedicada en portal.
2. El frontend resuelve planes y productos usando `commercialApi` como cliente explícito del bounded context Comercial.
3. `PlanCatalogManager` y `AdditionalProductsManager` conservan comportamiento funcional, pero dejan de depender de `tenantSelfApi` para catálogo.
4. El detalle de expediente consume planes y productos adicionales desde `commercialApi`.
5. `tenantSelfApi` conserva únicamente contratos de self-service del tenant y coverage.

#### Flujo 7: Gestionar productos desde un catálogo maestro unificado

1. El administrador accede a `Productos` dentro del módulo Comercial.
2. La pantalla presenta una sola tabla híbrida con todo el catálogo, sin separar visualmente por subsecciones fijas.
3. El usuario puede buscar por nombre o descripción y filtrar por categoría, estado y modelo comercial.
4. La edición se realiza desde un modal corto con dos bloques: `Información básica` y `Configuración comercial`.
5. La captura se limita al contrato vigente del módulo y no mezcla datos propios del futuro módulo de inventario.

---

## 4. Requerimientos Funcionales

### 4.1 Catálogo Base

| ID        | Requerimiento                                                                                                                    | Prioridad | CA                                                                                                                  |
| --------- | -------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------- |
| RF-COM-01 | CRUD de Planes con velocidad DL/UL, tecnología, regla de instalación (ALWAYS, ON_DEMAND, NEVER), clasificación tributaria        | MVP       | Plan creado con todos los campos, visible en listado y detalle                                                      |
| RF-COM-02 | CRUD de Productos con flag `isLoan` (comodato vs venta), `requiresInventory`, categoría y descripción corta del catálogo maestro | MVP       | Producto con flag de comodato diferencia propiedad del ISP y la descripción ayuda a identificarlo sin abrir detalle |
| RF-COM-03 | CRUD de Servicios Adicionales con `chargeType` (ONE_TIME, ON_DEMAND, RECURRING)                                                  | MVP       | Servicio creado y disponible para selección en cotizaciones                                                         |
| RF-COM-04 | Catálogo unificado: búsqueda y filtrado por tipo (PLAN/PRODUCT/SERVICE), estado, nombre                                          | MVP       | Query única retorna ítems de cualquier tipo con paginación                                                          |
| RF-COM-05 | Soft delete de ítems: desactivar sin eliminar para preservar referencias históricas                                              | MVP       | Ítem desactivado no aparece en listados activos pero sí en históricos                                               |

### 4.2 Motor de Precios

| ID        | Requerimiento                                                                                                | Prioridad | CA                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------ | --------- | ----------------------------------------------------------------------- |
| RF-COM-06 | Historial de precios SCD Tipo 2: INSERT nuevo precio, cierre automático del anterior                         | MVP       | Al cambiar precio, el anterior mantiene `valid_to` y `is_current=false` |
| RF-COM-07 | Pricing por segmento: cada ítem puede tener N precios vigentes, uno por segmento de cliente                  | MVP       | Un plan tiene precios diferentes para RESIDENTIAL vs PYME               |
| RF-COM-08 | Consulta de precio vigente: dado (item_id, segment), retornar precio actual con cuota instalación            | MVP       | Query optimizada con índice en (item_id, segment, is_current)           |
| RF-COM-09 | Historial de tarifas en UI: pestaña en detalle del ítem mostrando todos los cambios con fechas y responsable | MVP       | Lista cronológica con `created_by` para auditoría                       |
| RF-COM-10 | Precio de instalación por segmento: cuota de instalación diferenciada                                        | MVP       | Plan residencial: $150,000 instalación; PYME: $0 (incluida)             |

### 4.3 Bundles / Combos

| ID        | Requerimiento                                                                                       | Prioridad | CA                                                               |
| --------- | --------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------- |
| RF-COM-11 | CRUD de Bundles: nombre, descripción, tipo de descuento (PERCENTAGE, FIXED_AMOUNT), valor, vigencia | MVP       | Bundle creado con descuento calculable sobre suma de ítems       |
| RF-COM-12 | Composición de Bundles: asociar N ítems al bundle, marcar como requerido u opcional                 | MVP       | Bundle con 3 ítems requeridos + 1 opcional                       |
| RF-COM-13 | Precio del bundle: suma de precios individuales vigentes menos descuento del bundle                 | MVP       | El precio se calcula dinámicamente, no se almacena estáticamente |
| RF-COM-14 | Vigencia temporal de bundles: `valid_from`, `valid_to` con desactivación automática                 | MVP       | Bundle expirado no aparece en ofertas activas                    |

### 4.4 Promociones

| ID        | Requerimiento                                                                                           | Prioridad | CA                                                            |
| --------- | ------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------- |
| RF-COM-15 | CRUD de Promociones: nombre, código, tipo descuento (PERCENTAGE, FIXED_AMOUNT, FREE_MONTHS), valor      | MVP       | Promoción creada y disponible para aplicar en cotizaciones    |
| RF-COM-16 | Scope de promoción: aplica a ITEM, BUNDLE, INSTALLATION o ALL; con target_id cuando aplica a específico | MVP       | Promoción vinculada a ítem específico o a toda instalación    |
| RF-COM-17 | Segmento objetivo: filtrar por CustomerSegment (nullable = aplica a todos)                              | MVP       | Promoción solo para RESIDENTIAL no aparece en cotización PYME |
| RF-COM-18 | Límite de usos: `maxUses` (nullable = ilimitado), `currentUses` incrementado por cada aplicación        | MVP       | Al alcanzar límite, la promoción se desactiva automáticamente |
| RF-COM-19 | Vigencia temporal: `valid_from`, `valid_to` con expiración automática                                   | MVP       | Promoción fuera de rango temporal no aparece en ofertas       |

### 4.5 Reglas de Compatibilidad

| ID        | Requerimiento                                                                                 | Prioridad | CA                                                              |
| --------- | --------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------- |
| RF-COM-20 | CRUD de reglas: REQUIRES (prerequisito), EXCLUDES (incompatible), REPLACES (sustitución)      | MVP       | Regla creada entre dos ítems del catálogo                       |
| RF-COM-21 | Validación en cotización: al seleccionar ítems, verificar reglas y alertar incompatibilidades | MVP       | CRM impide cotizar combinación inválida con mensaje descriptivo |
| RF-COM-22 | Sugerencias: si un ítem tiene REQUIRES, el sistema sugiere el prerequisito                    | MVP       | Al seleccionar TV Premium, sistema sugiere Plan ≥300 Mbps       |

### 4.6 Clasificación Tributaria

| ID        | Requerimiento                                                                                                         | Prioridad | CA                                                               |
| --------- | --------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------- |
| RF-COM-23 | CRUD de clasificaciones tributarias: código (IVA_FULL, IVA_EXEMPT, IVA_EXCLUDED), nombre, descripción                 | MVP       | Clasificaciones base configuradas en seed                        |
| RF-COM-24 | Tabla de reglas tributarias: mapeo (clasificación × segmento × estrato × municipio) → tipo impuesto + tasa            | MVP       | Regla "RESIDENTIAL + estrato 1-2 → IVA exento 0%" configurable   |
| RF-COM-25 | Reglas administrables por UI: el Jefe de Facturación puede crear, editar y desactivar reglas sin intervención técnica | MVP       | Cambio de tasa IVA por regulación se refleja en <5 minutos       |
| RF-COM-26 | Flag `retentionApplicable` por ítem: marca ítems sujetos a retención en contratos con entidades públicas              | MVP       | Billing lee el flag para calcular retención en facturas gobierno |
| RF-COM-27 | Historial de cambios en reglas tributarias: auditoría de quién cambió qué regla y cuándo                              | MVP       | Log inmutable de cambios regulatorios                            |

### 4.7 Integración Inter-Módulo

| ID        | Requerimiento                                                                                           | Prioridad | CA                                                           |
| --------- | ------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------ |
| RF-COM-28 | Puerto `CommercialCatalogReadPort`: interfaz tipada para CRM y Billing                                  | MVP       | CRM consume catálogo sin acceso directo a tablas             |
| RF-COM-29 | Evento `commercial.price.updated`: Billing recalcula proyecciones sin afectar facturas emitidas         | MVP       | Billing escucha evento y recalcula próximo ciclo             |
| RF-COM-30 | Evento `commercial.item.deactivated`: CRM alerta cotizaciones pendientes con ítems desactivados         | MVP       | Cotizaciones abiertas muestran banner de alerta              |
| RF-COM-31 | Evento `commercial.promotion.started` / `commercial.promotion.expired`: CRM y Portal actualizan ofertas | MVP       | Promociones activas visibles en tiempo real en cotización    |
| RF-COM-32 | Migración de datos: `plan_catalog_items` y `additional_products` migrados al nuevo modelo unificado     | MVP       | Datos existentes preservados con historial de precio inicial |

### 4.8 Integración Portal Empresarial

| ID        | Requerimiento                                                                                                                                                                     | Prioridad | CA                                                                                      |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------- |
| RF-COM-33 | El portal debe exponer `commercialApi` como entrypoint explícito del catálogo comercial del tenant                                                                                | MVP       | Existe un cliente frontend dedicado para planes y productos comerciales                 |
| RF-COM-34 | `commercialApi` debe implementar `getPlans`, `createPlan`, `updatePlan` y `deletePlan` usando los endpoints vigentes de MOD06                                                     | MVP       | La gestión de planes sigue operativa sin cambios backend                                |
| RF-COM-35 | `commercialApi` debe implementar `getAdditionalProducts`, `createAdditionalProduct`, `updateAdditionalProduct` y `deleteAdditionalProduct` usando los endpoints vigentes de MOD06 | MVP       | La gestión de productos sigue operativa sin cambios backend                             |
| RF-COM-36 | `PlanCatalogManager` debe consumir `commercialApi` sin cambiar comportamiento de negocio ni tenancy                                                                               | MVP       | El flujo actual de planes permanece estable en portal                                   |
| RF-COM-37 | `AdditionalProductsManager` debe consumir `commercialApi` sin cambiar comportamiento de negocio ni tenancy                                                                        | MVP       | El flujo actual de productos permanece estable en portal                                |
| RF-COM-38 | El detalle de expediente debe resolver planes y productos adicionales desde `commercialApi`                                                                                       | MVP       | CRM portal no depende de `tenantSelfApi` para catálogo comercial                        |
| RF-COM-39 | `tenantSelfApi` no debe exponer metodos de catálogo comercial de planes ni productos al cierre de esta consolidación                                                              | MVP       | El ownership frontend del módulo queda sin aliases residuales                           |
| RF-COM-40 | `coverage` debe permanecer en `tenantSelfApi` y no mezclarse con el cierre del módulo Comercial                                                                                   | MVP       | La frontera del refactor frontend se mantiene controlada                                |
| RF-COM-41 | `AdditionalProductsManager` debe exponer una vista unificada con búsqueda por nombre/descripcion y filtros por categoría, estado y modelo comercial                               | MVP       | El usuario encuentra productos sin depender de subsecciones rígidas por categoría       |
| RF-COM-42 | El formulario portal de productos debe agrupar la captura en `Información básica` y `Configuración comercial` usando solo el contrato vigente de MOD06                            | MVP       | Crear y editar productos requiere menos carga cognitiva y no mezcla datos de inventario |

---

## 5. Requerimientos No Funcionales

| ID         | Requerimiento                                                                | Criterio                                                                                                                                |
| ---------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| RNF-COM-01 | Consulta de catálogo activo: <200ms p95 para listado paginado (50 ítems)     | Monitoreo APM                                                                                                                           |
| RNF-COM-02 | Consulta de precio vigente: <50ms p95 para lookup (item_id, segment)         | Índice optimizado                                                                                                                       |
| RNF-COM-03 | Validación de compatibilidad: <100ms p95 para validar N ítems contra reglas  | Cache en memoria                                                                                                                        |
| RNF-COM-04 | Multi-tenant: aislamiento completo por schema PostgreSQL                     | Verificación E2E                                                                                                                        |
| RNF-COM-05 | Audit trail: toda operación CUD registrada con usuario, timestamp, tenant    | AuditInterceptor global                                                                                                                 |
| RNF-COM-06 | Sin PII en catálogo: ningún dato personal de clientes en tablas del catálogo | Review de seguridad                                                                                                                     |
| RNF-COM-07 | Cobertura de tests ≥80% en servicios core                                    | Jest + coverage report                                                                                                                  |
| RNF-COM-08 | Sin cambios de contrato HTTP backend durante el cierre frontend              | Los endpoints REST de MOD06 permanecen intactos                                                                                         |
| RNF-COM-09 | Baja superficie de cambio en portal                                          | El diff frontend se concentra en `api-client.ts` y consumidores directos                                                                |
| RNF-COM-10 | Integración tenant-safe en portal                                            | El tenant sigue resolviéndose con `request(..., tenantSlug)` y sin hardcodes                                                            |
| RNF-COM-11 | Calidad focalizada del portal                                                | `pnpm --filter @iwana/portal typecheck` y validaciones afectadas en verde                                                               |
| RNF-COM-12 | Encontrabilidad del catálogo en portal                                       | La gestión de productos debe resolverse desde una sola tabla con búsqueda y filtros, sin depender de agrupaciones rígidas por categoría |

---

## 6. Modelo de Datos (Borrador)

### 6.1 Entidad base: `catalog_items` (Class Table Inheritance)

| Columna               | Tipo                         | Descripción                              |
| --------------------- | ---------------------------- | ---------------------------------------- |
| id                    | UUID PK                      | Identificador único                      |
| tenant_id             | UUID                         | Aislamiento multi-tenant                 |
| type                  | ENUM(PLAN, PRODUCT, SERVICE) | Discriminante de tipo                    |
| name                  | VARCHAR(200)                 | Nombre comercial                         |
| description           | TEXT                         | Descripción detallada                    |
| tax_classification_id | UUID FK                      | Clasificación tributaria aplicable       |
| retention_applicable  | BOOLEAN                      | Sujeto a retención en contratos gobierno |
| is_active             | BOOLEAN                      | Soft-delete / desactivación              |
| created_at            | TIMESTAMPTZ                  | Fecha creación                           |
| updated_at            | TIMESTAMPTZ                  | Última modificación                      |
| deleted_at            | TIMESTAMPTZ                  | Soft-delete (nullable)                   |

**Índices:** `(tenant_id, type, is_active)`, `(tenant_id, is_active, name)`

### 6.2 Extensión: `plan_details`

| Columna             | Tipo                    | Descripción               |
| ------------------- | ----------------------- | ------------------------- |
| id                  | UUID PK                 |                           |
| item_id             | UUID FK → catalog_items | Relación con ítem base    |
| download_speed_mbps | INTEGER                 | Velocidad de bajada       |
| upload_speed_mbps   | INTEGER                 | Velocidad de subida       |
| technology          | VARCHAR(100)            | FTTH, HFC, WIRELESS, etc. |
| installation_rule   | VARCHAR(30)             | ALWAYS, ON_DEMAND, NEVER  |

### 6.3 Extensión: `product_details`

| Columna            | Tipo                    | Descripción                                                      |
| ------------------ | ----------------------- | ---------------------------------------------------------------- |
| id                 | UUID PK                 |                                                                  |
| item_id            | UUID FK → catalog_items | Relación con ítem base                                           |
| is_loan            | BOOLEAN                 | Comodato (true) vs venta (false)                                 |
| requires_inventory | BOOLEAN                 | Requiere asignación de MAC/Serial de Inventario                  |
| category           | ENUM                    | ENTERTAINMENT, SECURITY, CONNECTIVITY, BUSINESS, NETWORKING, CPE |

### 6.3.1 Captura vigente del catálogo maestro de productos en portal

En la iteración actual, el portal captura y edita únicamente el subconjunto ya soportado por el contrato vigente de MOD06:

- `catalog_items.name`
- `catalog_items.description`
- `catalog_items.is_active`
- `product_details.category`
- `product_details.is_loan`
- `product_details.requires_inventory`

Campos como `brand`, `model` y `sku` se consideran ampliación futura del catálogo maestro y no deben introducirse mediante hardcodes o estados locales sin soporte de dominio y migración versionada.

### 6.4 Extensión: `service_details`

| Columna     | Tipo                                 | Descripción            |
| ----------- | ------------------------------------ | ---------------------- |
| id          | UUID PK                              |                        |
| item_id     | UUID FK → catalog_items              | Relación con ítem base |
| charge_type | ENUM(ONE_TIME, ON_DEMAND, RECURRING) | Tipo de cargo          |

### 6.5 Historial de precios: `catalog_price_history` (SCD Tipo 2)

| Columna          | Tipo                    | Descripción                                               |
| ---------------- | ----------------------- | --------------------------------------------------------- |
| id               | UUID PK                 |                                                           |
| item_id          | UUID FK → catalog_items | Ítem al que pertenece el precio                           |
| customer_segment | ENUM                    | RESIDENTIAL, SOHO, PYME, CORPORATE, GOVERNMENT, WHOLESALE |
| base_price       | NUMERIC(14,2)           | Precio base antes de impuestos                            |
| installation_fee | NUMERIC(14,2)           | Cuota de instalación                                      |
| valid_from       | TIMESTAMPTZ             | Inicio de vigencia (NOW() al crear)                       |
| valid_to         | TIMESTAMPTZ             | Fin de vigencia (nullable = vigente)                      |
| is_current       | BOOLEAN                 | Flag para queries rápidas                                 |
| created_by       | UUID                    | Usuario que realizó el cambio                             |
| created_at       | TIMESTAMPTZ             | Timestamp de creación del registro                        |

**Índices:** `(item_id, customer_segment, is_current)`, `(item_id, valid_from DESC)`

### 6.6 Bundles: `catalog_bundles` + `catalog_bundle_items`

**catalog_bundles:**

| Columna        | Tipo                           | Descripción                |
| -------------- | ------------------------------ | -------------------------- |
| id             | UUID PK                        |                            |
| tenant_id      | UUID                           | Multi-tenant               |
| name           | VARCHAR(200)                   | Nombre del combo           |
| description    | TEXT                           | Descripción                |
| discount_type  | ENUM(PERCENTAGE, FIXED_AMOUNT) | Tipo de descuento          |
| discount_value | NUMERIC(14,2)                  | Valor del descuento        |
| valid_from     | TIMESTAMPTZ                    | Inicio de vigencia         |
| valid_to       | TIMESTAMPTZ                    | Fin de vigencia (nullable) |
| is_active      | BOOLEAN                        | Activo/Inactivo            |
| created_at     | TIMESTAMPTZ                    |                            |
| updated_at     | TIMESTAMPTZ                    |                            |

**catalog_bundle_items:**

| Columna     | Tipo                      | Descripción                         |
| ----------- | ------------------------- | ----------------------------------- |
| id          | UUID PK                   |                                     |
| bundle_id   | UUID FK → catalog_bundles | Bundle padre                        |
| item_id     | UUID FK → catalog_items   | Ítem del catálogo                   |
| is_required | BOOLEAN                   | Requerido (true) u opcional (false) |
| sort_order  | INTEGER                   | Orden de presentación               |

### 6.7 Promociones: `catalog_promotions`

| Columna          | Tipo                                        | Descripción                       |
| ---------------- | ------------------------------------------- | --------------------------------- |
| id               | UUID PK                                     |                                   |
| tenant_id        | UUID                                        | Multi-tenant                      |
| name             | VARCHAR(200)                                | Nombre de la promoción            |
| code             | VARCHAR(50) UNIQUE                          | Código de tracking                |
| description      | TEXT                                        | Descripción                       |
| discount_type    | ENUM(PERCENTAGE, FIXED_AMOUNT, FREE_MONTHS) | Tipo descuento                    |
| discount_value   | NUMERIC(14,2)                               | Valor del descuento               |
| applies_to       | ENUM(ITEM, BUNDLE, INSTALLATION, ALL)       | Scope de aplicación               |
| target_item_id   | UUID FK (nullable)                          | Ítem específico (cuando aplica)   |
| target_bundle_id | UUID FK (nullable)                          | Bundle específico (cuando aplica) |
| target_segments  | VARCHAR[] (nullable)                        | Segmentos objetivo (null = todos) |
| max_uses         | INTEGER (nullable)                          | Límite de usos (null = ilimitado) |
| current_uses     | INTEGER DEFAULT 0                           | Usos consumidos                   |
| valid_from       | TIMESTAMPTZ                                 | Inicio de vigencia                |
| valid_to         | TIMESTAMPTZ                                 | Fin de vigencia                   |
| is_active        | BOOLEAN                                     | Activo/Inactivo                   |
| created_by       | UUID                                        | Creador                           |
| created_at       | TIMESTAMPTZ                                 |                                   |
| updated_at       | TIMESTAMPTZ                                 |                                   |

### 6.8 Reglas de compatibilidad: `catalog_compatibility_rules`

| Columna        | Tipo                               | Descripción         |
| -------------- | ---------------------------------- | ------------------- |
| id             | UUID PK                            |                     |
| tenant_id      | UUID                               | Multi-tenant        |
| rule_type      | ENUM(REQUIRES, EXCLUDES, REPLACES) | Tipo de regla       |
| source_item_id | UUID FK → catalog_items            | Ítem origen         |
| target_item_id | UUID FK → catalog_items            | Ítem destino        |
| description    | VARCHAR(500)                       | Descripción legible |
| is_active      | BOOLEAN                            | Activo/Inactivo     |
| created_at     | TIMESTAMPTZ                        |                     |

### 6.9 Clasificación tributaria: `tax_classifications` + `tax_rules`

**tax_classifications:**

| Columna     | Tipo                          | Descripción                        |
| ----------- | ----------------------------- | ---------------------------------- |
| id          | UUID PK                       |                                    |
| tenant_id   | UUID                          | Multi-tenant                       |
| code        | VARCHAR(50) UNIQUE per tenant | IVA_FULL, IVA_EXEMPT, IVA_EXCLUDED |
| name        | VARCHAR(150)                  | Nombre legible                     |
| description | TEXT                          | Descripción                        |
| is_active   | BOOLEAN                       |                                    |

**tax_rules:**

| Columna               | Tipo                      | Descripción                          |
| --------------------- | ------------------------- | ------------------------------------ |
| id                    | UUID PK                   |                                      |
| tenant_id             | UUID                      | Multi-tenant                         |
| tax_classification_id | UUID FK                   | Clasificación a la que aplica        |
| customer_segment      | VARCHAR (nullable)        | Segmento (null = todos)              |
| estrato_min           | INTEGER (nullable)        | Estrato mínimo (null = sin filtro)   |
| estrato_max           | INTEGER (nullable)        | Estrato máximo (null = sin filtro)   |
| municipality_code     | VARCHAR(10) (nullable)    | Código DANE municipio (null = todos) |
| tax_type              | ENUM(IVA, RETENTION, ICA) | Tipo de impuesto                     |
| rate_percentage       | NUMERIC(5,2)              | Tasa porcentual                      |
| is_active             | BOOLEAN                   | Activo/Inactivo                      |
| valid_from            | TIMESTAMPTZ               | Inicio vigencia                      |
| valid_to              | TIMESTAMPTZ (nullable)    | Fin vigencia (null = indefinida)     |
| created_by            | UUID                      | Responsable del cambio               |
| created_at            | TIMESTAMPTZ               |                                      |
| updated_at            | TIMESTAMPTZ               |                                      |

**Índices:** `(tenant_id, tax_classification_id, is_active)`, `(tenant_id, customer_segment, estrato_min, is_active)`

---

## 7. Contratos de API (Borrador)

### 7.1 Endpoints REST (prefijo: `/api/v1/commercial`)

| Método | Ruta                           | Descripción                                       | RBAC               |
| ------ | ------------------------------ | ------------------------------------------------- | ------------------ |
| GET    | `/catalog`                     | Listado paginado con filtros (type, active, name) | Todos autenticados |
| GET    | `/catalog/:id`                 | Detalle del ítem con extensión de tipo            | Todos autenticados |
| POST   | `/catalog/plans`               | Crear plan                                        | CRUD roles         |
| POST   | `/catalog/products`            | Crear producto                                    | CRUD roles         |
| POST   | `/catalog/services`            | Crear servicio adicional                          | CRUD roles         |
| PATCH  | `/catalog/:id`                 | Actualizar ítem (no precio)                       | CRUD roles         |
| DELETE | `/catalog/:id`                 | Soft-delete del ítem                              | CRUD roles         |
| GET    | `/catalog/:id/prices`          | Historial de precios del ítem                     | Todos autenticados |
| POST   | `/catalog/:id/prices`          | Crear nuevo precio (SCD Tipo 2)                   | CRUD roles         |
| GET    | `/catalog/:id/price?segment=X` | Precio vigente para segmento                      | Todos autenticados |
| GET    | `/bundles`                     | Listado de bundles activos                        | Todos autenticados |
| GET    | `/bundles/:id`                 | Detalle del bundle con ítems                      | Todos autenticados |
| POST   | `/bundles`                     | Crear bundle                                      | CRUD roles         |
| PATCH  | `/bundles/:id`                 | Actualizar bundle                                 | CRUD roles         |
| DELETE | `/bundles/:id`                 | Desactivar bundle                                 | CRUD roles         |
| GET    | `/promotions`                  | Listado de promociones                            | Todos autenticados |
| POST   | `/promotions`                  | Crear promoción                                   | CRUD roles         |
| PATCH  | `/promotions/:id`              | Actualizar promoción                              | CRUD roles         |
| DELETE | `/promotions/:id`              | Desactivar promoción                              | CRUD roles         |
| GET    | `/compatibility-rules`         | Listado de reglas                                 | Todos autenticados |
| POST   | `/compatibility-rules`         | Crear regla                                       | CRUD roles         |
| DELETE | `/compatibility-rules/:id`     | Eliminar regla                                    | CRUD roles         |
| POST   | `/compatibility/validate`      | Validar combinación de ítems                      | Todos autenticados |
| GET    | `/tax-classifications`         | Listado de clasificaciones                        | CRUD roles         |
| POST   | `/tax-classifications`         | Crear clasificación                               | CRUD roles         |
| GET    | `/tax-rules`                   | Listado de reglas tributarias                     | CRUD roles         |
| POST   | `/tax-rules`                   | Crear regla tributaria                            | CRUD roles         |
| PATCH  | `/tax-rules/:id`               | Actualizar regla                                  | CRUD roles         |

**CRUD roles:** TENANT_ADMIN, roles con permiso `commercial:write`
**Todos autenticados:** Cualquier rol con sesión válida dentro del tenant

### 7.2 Contrato interno del portal

El portal empresarial debe consumir el bounded context Comercial mediante un cliente explícito `commercialApi` y no a través de `tenantSelfApi`.

`commercialApi` expone, como mínimo:

- `getPlans(tenantSlug?)`
- `createPlan(dto, tenantSlug?)`
- `updatePlan(planId, dto, tenantSlug?)`
- `deletePlan(planId, tenantSlug?)`
- `getAdditionalProducts(tenantSlug?)`
- `createAdditionalProduct(dto, tenantSlug?)`
- `updateAdditionalProduct(productId, dto, tenantSlug?)`
- `deleteAdditionalProduct(productId, tenantSlug?)`

`tenantSelfApi` conserva únicamente contratos de self-service del tenant y coverage.

---

## 8. Criterios de Aceptación

| #     | Criterio                                                                                                               | Verificación                               |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| CA-01 | CRUD completo de planes, productos y servicios con validación Zod en boundaries                                        | Test unitario + HTTP spec                  |
| CA-02 | Cambio de precio genera nuevo registro SCD, cierra anterior, emite evento                                              | Test unitario + integración                |
| CA-03 | Pricing por segmento: misma consulta retorna precios diferentes según segmento                                         | Test HTTP con múltiples segmentos          |
| CA-04 | Bundle calcula precio dinámico = suma de ítems vigentes - descuento                                                    | Test unitario                              |
| CA-05 | Promoción con límite de usos se desactiva al alcanzar el máximo                                                        | Test unitario + concurrencia               |
| CA-06 | Regla REQUIRES impide cotizar sin prerequisito                                                                         | Test integración CRM→Commercial            |
| CA-07 | Regla EXCLUDES impide cotizar combinación incompatible                                                                 | Test integración                           |
| CA-08 | Clasificación tributaria configurable sin cambios de código                                                            | Test funcional: crear/editar regla por API |
| CA-09 | Migración preserva datos existentes de `plan_catalog_items` y `additional_products`                                    | Test de migración + verificación de datos  |
| CA-10 | Aislamiento multi-tenant: catálogo de tenant A no visible para tenant B                                                | Test de aislamiento                        |
| CA-11 | Audit trail de todas las operaciones CUD                                                                               | Verificación en audit_log                  |
| CA-12 | Cobertura ≥80% en servicios core                                                                                       | Jest --coverage                            |
| CA-13 | Existe `commercialApi` como objeto exportado explícito en el cliente del portal                                        | Revisión de código + typecheck portal      |
| CA-14 | La gestión de planes funciona consumiendo `commercialApi`                                                              | Validación focalizada de portal            |
| CA-15 | La gestión de productos adicionales funciona consumiendo `commercialApi`                                               | Validación focalizada de portal            |
| CA-16 | El detalle de expediente resuelve planes y productos adicionales vía `commercialApi`                                   | Validación funcional de CRM portal         |
| CA-17 | `tenantSelfApi` no expone métodos de planes ni productos comerciales al cierre                                         | Revisión de código + búsqueda fuente       |
| CA-18 | `coverage` permanece en `tenantSelfApi` y no se mezcla con el cierre frontend del módulo                               | Revisión de código + validación focalizada |
| CA-19 | El catálogo de productos del portal se presenta como tabla única con búsqueda y filtros sin subsecciones por categoría | Validación visual + typecheck portal       |
| CA-20 | El modal de producto separa información básica y configuración comercial usando el contrato vigente de MOD06           | Validación funcional de creación/edición   |

---

## 9. Dependencias y Riesgos

### 9.1 Dependencias

| Dependencia                                    | Módulo        | Tipo       | Estado                                |
| ---------------------------------------------- | ------------- | ---------- | ------------------------------------- |
| Auth + RBAC                                    | MOD01         | Upstream   | ✅ Producción                         |
| TenantMiddleware + schema routing              | MOD01         | Upstream   | ✅ Producción                         |
| AuditInterceptor                               | MOD01         | Upstream   | ✅ Producción                         |
| `PlanCatalogReadPort` (migrar implementación)  | MOD05 CRM     | Downstream | ✅ Implementado como stub             |
| CustomerSegment enum                           | @iwana/shared | Compartido | ✅ Existente                          |
| Datos en `plan_catalog_items`                  | TenantModule  | Migración  | ⚠️ Requiere migración                 |
| `apps/portal/src/lib/api-client.ts`            | Portal        | Frontend   | ✅ Base disponible para consolidación |
| Consumidores actuales en Settings y Expediente | Portal        | Frontend   | ✅ Requieren rewiring controlado      |

### 9.2 Riesgos

| Riesgo                                                                     | Probabilidad | Impacto | Mitigación                                                                    |
| -------------------------------------------------------------------------- | ------------ | ------- | ----------------------------------------------------------------------------- |
| Migración de datos rompe CRM existente                                     | Media        | Alto    | Migración aditiva: nuevas tablas + adaptador dual temporario                  |
| Complejidad tributaria colombiana cambia                                   | Alta         | Medio   | Tabla de reglas configurable, sin hardcoding de tasas                         |
| Performance de query catálogo con joins CTI                                | Baja         | Medio   | Índices optimizados, materialización de vista si necesario                    |
| Bundle con ítems desactivados                                              | Media        | Bajo    | Validación en escritura: bundle no puede contener ítems inactivos             |
| Queden aliases residuales de catálogo comercial en `tenantSelfApi`         | Media        | Medio   | Consolidar ownership frontend en `commercialApi` y verificar búsquedas fuente |
| El cierre frontend arrastre `coverage` dentro del mismo refactor           | Media        | Medio   | Mantener `coverage` explícitamente fuera de alcance                           |
| El ajuste del portal derive en una refactorización masiva del cliente HTTP | Baja         | Medio   | Limitar cambios a consumidores directos y contrato interno mínimo             |

---

## 10. Definition of Done

- [ ] CommercialModule creado con CRUD completo de Planes, Productos y Servicios
- [ ] Motor de Precios SCD Tipo 2 operativo con historial inmutable
- [ ] Pricing por segmento de cliente funcional
- [ ] Bundles con descuento dinámico y vigencia temporal
- [ ] Promociones con límite de usos y expiración automática
- [ ] Reglas de compatibilidad (REQUIRES, EXCLUDES, REPLACES) validadas
- [ ] Clasificación tributaria configurable por UI
- [ ] Tabla de reglas tributarias administrable
- [ ] Migración de `plan_catalog_items` y `additional_products` ejecutada sin pérdida de datos
- [ ] Puerto `CommercialCatalogReadPort` reemplaza adaptador actual en CRM
- [ ] Eventos de dominio emitidos (`price.updated`, `item.deactivated`)
- [ ] RBAC: CRUD solo para roles aprobados, lectura para todos los autenticados
- [ ] OpenAPI actualizado con todos los endpoints
- [ ] Tests ≥80% cobertura en servicios core
- [ ] Aislamiento multi-tenant verificado
- [ ] `commercialApi` existe como entrypoint único del catálogo comercial en portal
- [ ] `tenantSelfApi` queda limitado a self-service del tenant y coverage
- [ ] Settings y Expediente consumen `commercialApi` para planes y productos adicionales
- [ ] El cierre frontend del módulo queda validado con typecheck y verificación focalizada
- [ ] Audit trail funcional
- [ ] Sin PII, secretos ni tokens en código, tests ni logs
- [ ] Informe de sprint/fase actualizado en `docs/informes/`
