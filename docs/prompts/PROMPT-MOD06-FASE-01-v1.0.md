# PROMPT — Ejecución Fase 01: Backend Core del Módulo Comercial

**Version:** 1.0
**Estado:** Listo para ejecución
**Fecha:** 2026-04-18

## Vínculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`
- Archivo destino: `docs/prompts/PROMPT-MOD06-FASE-01-v1.0.md`
- Convención documental: `{TIPO}-{MODULO}-{FASE}-v{VERSION}.md`

## Módulo

- **Nombre:** Módulo Comercial — Catálogo de Planes, Productos y Servicios
- **Código:** MOD06
- **Fase:** FASE-01 (Backend Core: Entidades, Servicios, Controllers, Migraciones)
- **Versión:** 1.0
- **Fecha:** 2026-04-18
- **Generado por:** Engineering Manager (AI-EM-ARCH, Modo Architect)
- **Nombre de archivo destino:** `PROMPT-MOD06-FASE-01-v1.0.md`

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** Backend operativo del Módulo Comercial con CRUD completo de catálogo, motor de precios SCD Tipo 2, bundles, promociones, reglas de compatibilidad, clasificación tributaria configurable y migración de datos desde TenantModule.

**Lo que SÍ entra:**

1. Entidades TypeORM (11 tablas) con Class Table Inheritance
2. Migración de schema (creación de tablas)
3. Migración de datos (PlanCatalogItem → CatalogItem + PlanDetail + PriceHistory; AdditionalProduct → CatalogItem + ProductDetail)
4. Servicios core: CatalogService, PriceHistoryService, BundleService, PromotionService, CompatibilityService, TaxClassificationService
5. Controllers REST con endpoints documentados en OpenAPI
6. DTOs con validación Zod en boundaries
7. Puerto CommercialCatalogReadPort + adapter
8. Eventos de dominio (EventEmitter2): `commercial.price.updated`, `commercial.item.deactivated`
9. Enums compartidos en @iwana/shared
10. RBAC: roles CRUD y roles lectura
11. Seed de clasificaciones tributarias base colombianas
12. Tests unitarios ≥80% en servicios core

**Lo que NO entra:**

- Frontend (Fase 02)
- Integración real con BillingModule (no existe aún)
- Vigencia programada futura de precios (v1.1)
- Catálogo público sin autenticación (v1.1)
- Eliminación de tablas antiguas de TenantModule (se deprecan, no se eliminan)

---

## 2. Artefactos de entrada obligatorios

| Artefacto | Ubicación | Estado |
|-----------|-----------|--------|
| **PRD del módulo** | `docs/prds/PRD-MOD06-COMERCIAL-DEFINICION-v1.0.md` | ✅ Aprobado |
| **HLD del módulo** | `docs/hlds/HLD-MOD06-ARQUITECTURA-v1.0.md` | ✅ Aprobado |
| **ADR aplicable** | `docs/adrs/ADR-028-Extraccion-Modulo-Comercial.md` | ✅ Aprobado |
| **PRD base actualizado** | `docs/prds/PRD_Sistema_ISP_Colombia_v2_2.md` (ahora v2.3) | ✅ Actualizado |
| **Stack tecnológico** | `docs/prds/Stack_Tecnologico.md` | ✅ Referencia |
| **HLD CRM (puertos)** | `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md` | ✅ Referencia (PlanCatalogReadPort) |
| **Sprint plan** | A definir por EM | ⏳ Pendiente |
| **Artefactos faltantes** | Ninguno crítico detectado | — |

---

## 3. Instrucciones para Sr. Dev Fullstack

### Paso 1: Preparar enums compartidos en @iwana/shared

Crear los siguientes enums en `packages/shared/src/enums/commercial/`:

```
catalog-item-type.enum.ts      → CatalogItemType (PLAN, PRODUCT, SERVICE)
charge-type.enum.ts            → ChargeType (ONE_TIME, ON_DEMAND, RECURRING)
installation-rule.enum.ts      → InstallationRule (ALWAYS, ON_DEMAND, NEVER)
discount-type.enum.ts          → DiscountType (PERCENTAGE, FIXED_AMOUNT, FREE_MONTHS)
promotion-scope.enum.ts        → PromotionScope (ITEM, BUNDLE, INSTALLATION, ALL)
compatibility-rule-type.enum.ts → CompatibilityRuleType (REQUIRES, EXCLUDES, REPLACES)
tax-type.enum.ts               → TaxType (IVA, RETENTION, ICA)
```

Extender `ProductCategory` existente con `NETWORKING` y `CPE`.

Re-exportar desde `packages/shared/src/enums/index.ts`.

### Paso 2: Crear entidades TypeORM

Crear en `apps/api/src/modules/commercial/entities/`:

1. **catalog-item.entity.ts** — Tabla base con discriminante `type`. NO usar `@TableInheritance()` de TypeORM (es buggy con multi-tenant); implementar manualmente con relaciones `@OneToOne()` a tablas de detalle.
2. **plan-detail.entity.ts** — `@OneToOne(() => CatalogItem)` con `download_speed_mbps`, `upload_speed_mbps`, `technology`, `installation_rule`
3. **product-detail.entity.ts** — `@OneToOne(() => CatalogItem)` con `is_loan`, `requires_inventory`, `category`
4. **service-detail.entity.ts** — `@OneToOne(() => CatalogItem)` con `charge_type`
5. **catalog-price-history.entity.ts** — SCD Tipo 2 con `valid_from`, `valid_to`, `is_current`, `customer_segment`
6. **catalog-bundle.entity.ts** — Bundles con descuento y vigencia
7. **catalog-bundle-item.entity.ts** — Composición M:N bundle↔item
8. **catalog-promotion.entity.ts** — Promociones con scope, límite de usos, vigencia
9. **compatibility-rule.entity.ts** — Reglas REQUIRES/EXCLUDES/REPLACES
10. **tax-classification.entity.ts** — Clasificaciones tributarias
11. **tax-rule.entity.ts** — Reglas tributarias configurables

**Regla multi-tenant:** NO poner `schema: 'xxx'` en `@Entity()`. Las entidades del módulo comercial son tenant-scoped; PostgreSQL las resuelve vía `SET LOCAL search_path` (compatible pgBouncer). Todas las tablas deben tener columna `tenant_id` con filtro en queries.

**Regla de naming:** Archivos en kebab-case, clases en PascalCase, tablas en snake_case.

### Paso 3: Crear migraciones

1. **Migración de schema** en `packages/database/src/migrations/tenant/`:
   - Nombre: `{timestamp}_create_commercial_module.ts`
   - Crear las 11 tablas con índices según HLD sección 5
   - `up()` y `down()` completos y reversibles
   - Seed de clasificaciones tributarias base:
     - `IVA_FULL` (code: 'IVA_FULL', name: 'IVA pleno 19%')
     - `IVA_EXEMPT` (code: 'IVA_EXEMPT', name: 'IVA exento 0%')
     - `IVA_EXCLUDED` (code: 'IVA_EXCLUDED', name: 'IVA excluido')
   - Seed de reglas tributarias base colombianas:
     - IVA_FULL + RESIDENTIAL + estrato 4-6 → IVA 19%
     - IVA_EXEMPT + RESIDENTIAL + estrato 1-2 → IVA 0%
     - IVA_EXCLUDED + RESIDENTIAL + estrato 3 → IVA 0% (excluido)
     - IVA_FULL + CORPORATE + * → IVA 19%
     - IVA_FULL + GOVERNMENT + * → IVA 19%

2. **Migración de datos** (separada):
   - Nombre: `{timestamp}_migrate_catalog_data.ts`
   - Migrar `plan_catalog_items` → `catalog_items` (type=PLAN) + `plan_details` + `catalog_price_history`
   - Migrar `additional_products` → `catalog_items` (type=PRODUCT) + `product_details`
   - Para cada plan migrado: crear registro en `catalog_price_history` con `base_price` y `installation_fee` actuales, `valid_from = created_at del plan original`, `is_current = true`
   - Asignar clasificación tributaria `IVA_FULL` por defecto (el admin podrá reclasificar después)

### Paso 4: Crear DTOs con validación Zod

Crear en `apps/api/src/modules/commercial/dto/` siguiendo los schemas definidos en HLD sección 7.

**Importante:**
- Usar Zod 4 (verificar versión en Stack_Tecnologico.md)
- Validación estricta en boundaries de entrada (controllers)
- DTOs de respuesta separados de DTOs de entrada
- `catalog-query.dto.ts` para filtros de búsqueda (type, active, name, pagination)

### Paso 5: Implementar servicios

Orden de implementación (por dependencias):

1. **TaxClassificationService** — No depende de otros servicios del módulo
2. **CatalogService** — CRUD base, depende de TaxClassification
3. **PriceHistoryService** — Motor SCD Tipo 2, depende de CatalogItem
4. **CompatibilityService** — Depende de CatalogItem
5. **BundleService** — Depende de CatalogItem + PriceHistory + Compatibility
6. **PromotionService** — Depende de CatalogItem + Bundle

**PriceHistoryService — lógica crítica:**
- `createPrice(itemId, segment, dto)`: dentro de transacción, cerrar precio anterior (`valid_to = NOW`, `is_current = false`), insertar nuevo (`valid_from = NOW`, `is_current = true`), emitir evento `commercial.price.updated`
- `getCurrentPrice(itemId, segment)`: query con `is_current = true`
- El unique index parcial `(item_id, segment) WHERE is_current = true` previene race conditions

**CompatibilityService — lógica crítica:**
- `validateCombination(itemIds)`: cargar todas las reglas que involucren los items dados, evaluar REQUIRES (source presente sin target = error), EXCLUDES (ambos presentes = error), REPLACES (ambos presentes = sugerencia)

**BundleService — precio dinámico:**
- `calculatePrice(bundleId, segment)`: sumar precios vigentes de ítems requeridos + seleccionados opcionales, aplicar descuento del bundle

### Paso 6: Implementar controllers

Crear en `apps/api/src/modules/commercial/controllers/`:

1. **catalog.controller.ts** — Prefijo `/api/v1/commercial/catalog`
2. **bundle.controller.ts** — Prefijo `/api/v1/commercial/bundles`
3. **promotion.controller.ts** — Prefijo `/api/v1/commercial/promotions`
4. **compatibility.controller.ts** — Prefijo `/api/v1/commercial/compatibility-rules` + POST `/compatibility/validate`
5. **tax.controller.ts** — Prefijo `/api/v1/commercial/tax-classifications` y `/api/v1/commercial/tax-rules`

**RBAC:**
- Endpoints de escritura (POST, PATCH, DELETE): `@Roles(UserRole.TENANT_ADMIN)` — afinamiento a permisos granulares en v1.1
- Endpoints de lectura (GET): cualquier rol autenticado dentro del tenant
- Endpoints de tax-rules: solo roles con permiso de facturación y admin

**OpenAPI:**
- Decoradores `@ApiTags()`, `@ApiOperation()`, `@ApiResponse()` en todos los endpoints
- Actualizar swagger spec generada

### Paso 7: Implementar puerto e integración

1. Crear `commercial-catalog-read.port.ts` con la interfaz definida en HLD sección 8.1
2. Crear `commercial-catalog-read.adapter.ts` que implementa el puerto
3. Registrar el adapter como provider en `CommercialModule` y exportarlo
4. Actualizar `CrmModule` para consumir `CommercialCatalogReadPort` en lugar de `PlanCatalogReadPort` del TenantModule
5. Deprecar (no eliminar) `tenant-crm-read-adapter.service.ts` en TenantModule

### Paso 8: Implementar eventos de dominio

Usar `@nestjs/event-emitter` (EventEmitter2) — mismo patrón que CRM (ADR-027):

```
commercial.price.updated     → { itemId, segment, oldPrice, newPrice, changedBy }
commercial.item.deactivated  → { itemId, name, deactivatedBy }
commercial.bundle.created    → { bundleId, name, itemIds }
commercial.promotion.started → { promotionId, code, validFrom, validTo }
commercial.promotion.expired → { promotionId, code, totalUses }
commercial.tax-rule.changed  → { ruleId, taxType, oldRate, newRate, changedBy }
```

Los listeners internos del módulo que reaccionen a estos eventos (si los hay) deben estar en el mismo módulo. Los listeners de otros módulos (Billing, CRM) se implementarán cuando esos módulos estén listos.

### Paso 9: Registrar módulo

1. Crear `commercial.module.ts` con imports: TypeOrmModule.forFeature([...entities]), EventEmitterModule
2. Registrar en `app.module.ts`
3. Verificar que el módulo se carga correctamente en arranque

### Paso 10: Tests unitarios

Escribir tests para todos los servicios:
- `catalog.service.spec.ts` — CRUD con mocks de repositorio
- `price-history.service.spec.ts` — Creación SCD, cierre de precio anterior, evento emitido
- `bundle.service.spec.ts` — Creación, cálculo de precio dinámico, validación de ítems activos
- `promotion.service.spec.ts` — Creación, incremento de usos, expiración automática
- `compatibility.service.spec.ts` — Validación REQUIRES/EXCLUDES/REPLACES
- `tax-classification.service.spec.ts` — CRUD de reglas, lookup por clasificación/segmento/estrato

**Meta:** ≥80% cobertura en servicios core

---

## 4. Restricciones no negociables

1. **No romper boundaries del modulith:** CommercialModule no importa servicios de CRM, Billing ni otro módulo directamente. Solo expone puertos.
2. **No acceder a tablas de otro módulo:** Las tablas `plan_catalog_items` y `additional_products` de TenantModule se leen solo durante la migración de datos. Después, el módulo opera con sus propias tablas.
3. **No usar credenciales ni datos reales:** Seeds y tests con datos ficticios. Cero PII.
4. **No omitir pruebas ni documentación:** Tests ≥80%, OpenAPI actualizado, informe de fase.
5. **No usar `synchronize: true`:** Solo migraciones versionadas y reversibles.
6. **No hardcodear tasas de impuestos:** Las tasas viven en `tax_rules`, configurables por UI.
7. **No usar `@TableInheritance()` de TypeORM:** Implementar CTI manualmente con `@OneToOne()` — el soporte nativo de TypeORM para herencia es inestable con multi-tenant por schema.
8. **Toda operación de precio dentro de transacción:** El cierre del precio anterior + creación del nuevo deben ser atómicos.

---

## 5. Entregables técnicos obligatorios

1. **Código backend:** Módulo completo en `apps/api/src/modules/commercial/`
2. **Enums compartidos:** En `packages/shared/src/enums/commercial/`
3. **Migraciones:** 2 archivos en `packages/database/src/migrations/tenant/` (schema + datos)
4. **Tests unitarios:** ≥80% cobertura en servicios core
5. **OpenAPI:** Endpoints documentados y generados correctamente con `@nestjs/swagger`

---

## 6. Entregables documentales obligatorios

1. **Informe de fase** en `docs/informes/INFORME-MOD06-FASE-01-v1.0.md`
2. **Evidencia de calidad** en `docs/quality/` (reporte de cobertura, listado de tests)
3. **Actualización de PRD/HLD** si cambió algo aprobado durante implementación
4. **Decisión stop/go documentada** si aparece bloqueo técnico
5. Si la fase corresponde a corrección o ajuste, actualizar el informe vigente relacionado y no crear uno nuevo

---

## 7. Criterios de aceptación

| # | Criterio | Verificación |
|---|----------|-------------|
| CA-01 | CRUD completo de planes, productos y servicios con validación Zod | Test unitario + test HTTP manual/spec |
| CA-02 | Cambio de precio genera nuevo registro SCD, cierra anterior, emite evento `commercial.price.updated` | Test unitario de PriceHistoryService |
| CA-03 | Pricing por segmento: consulta `getCurrentPrice(itemId, segment)` retorna precio correcto por segmento | Test unitario con múltiples segmentos |
| CA-04 | Bundle calcula precio dinámico = suma precios vigentes de ítems - descuento | Test unitario de BundleService.calculatePrice() |
| CA-05 | Promoción con `maxUses` se desactiva automáticamente al alcanzar límite | Test unitario de PromotionService.incrementUse() |
| CA-06 | Regla REQUIRES impide validar combinación sin prerequisito | Test unitario de CompatibilityService.validateCombination() |
| CA-07 | Regla EXCLUDES impide validar combinación incompatible | Test unitario |
| CA-08 | Reglas tributarias configurables: crear/editar regla por API sin cambiar código | Test HTTP de TaxController |
| CA-09 | Migración preserva datos existentes de `plan_catalog_items` y `additional_products` | Test de migración con datos de prueba |
| CA-10 | Aislamiento multi-tenant: catálogo de tenant A inaccesible desde tenant B | Test de aislamiento por schema |
| CA-11 | Audit trail de todas las operaciones CUD via AuditInterceptor | Verificación en tabla audit_log |
| CA-12 | Cobertura ≥80% en servicios core | `npx jest --coverage` |

---

## 8. Criterio de stop/go

**Detenerse inmediatamente si:**
- La migración de datos causa pérdida de registros existentes
- El CRM pierde capacidad de leer catálogo tras la migración
- TypeORM CTI manual presenta incompatibilidades con `SET LOCAL search_path`
- Los índices parciales no funcionan como esperado con el modelo SCD

**Documentar causa en:** `docs/informes/INFORME-MOD06-FASE-01-v1.0.md`

**Escalar a:** Engineering Manager → Staff Engineer → CTO (si >4h bloqueado)

**Recomendación esperada:** Descripción del bloqueo, alternativas evaluadas, opción recomendada, impacto en timeline

---

## 9. Criterio de salida de la fase

- **Backend validado:** CommercialModule registrado, todos los endpoints responden correctamente, RBAC funcional
- **Base de datos validada:** 11 tablas creadas, índices verificados, seed de tax base ejecutado, migración de datos exitosa
- **Tests en verde:** ≥80% cobertura, todos los CAs cubiertos, `pnpm --filter @iwana/api test` pasa
- **Puerto funcional:** CommercialCatalogReadPort expuesto y consumible por CRM
- **Eventos emitidos:** Al menos `commercial.price.updated` verificado con listener de log
- **OpenAPI actualizado:** Todos los endpoints documentados en swagger
- **Documentación archivada:** Informe de fase + evidencia de calidad + decisiones si las hubo
