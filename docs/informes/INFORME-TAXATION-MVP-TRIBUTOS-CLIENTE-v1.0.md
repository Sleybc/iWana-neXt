# INFORME-TAXATION-MVP-TRIBUTOS-CLIENTE-v1.0

**Tipo:** INFORME DE EJECUCIÓN  
**Módulo:** TAXATION — Sub-modelo Tributario por Suscriptor  
**Fase:** MVP  
**Versión:** 1.1  
**Estado:** Aprobado  
**Fecha:** 2026-04-22 → 2026-04-23 (actualización de cierre)  
**Referencia prompt:** `docs/prompts/PROMPT-TAXATION-MVP-TRIBUTOS-CLIENTE-v1.0.md`  
**Referencia plan:** `docs/sprints/PLAN-TAXATION-MVP-TRIBUTOS-CLIENTE-v1.0.md`  
**Referencia spec:** `docs/superpowers/specs/2026-04-22-taxation-mvp-tributos-por-cliente-design.md`  
**ADRs aplicables:** ADR-029 (Boundary Taxation), ADR-031 (Rediseño Tributario Comercial)

---

## 1. Resumen Ejecutivo

Se implementó el sub-modelo tributario por suscriptor dentro del bounded context CRM/Subscribers, siguiendo la separación de responsabilidades dictada por ADR-029. El módulo `TaxationModule` continúa siendo el dueño del catálogo tributario; `SubscribersModule` es el dueño del perfil tributario del suscriptor, comunicándose únicamente vía `TaxCatalogReadPort`.

**Resultado final:** 845/845 tests API (76 suites) + 13/13 HTTP integration tests. Typecheck OK en `@iwana/api` y `@iwana/portal`. Frontend `TaxProfileBlock` implementado y tab Tributario integrado en Suscriptor 360.

---

## 2. Alcance Implementado

### 2.1 Backend (`apps/api`)

| Artefacto | Ruta | Estado |
|-----------|------|--------|
| Entidad `SubscriberTaxProfile` | `crm/subscribers/entities/subscriber-tax-profile.entity.ts` | ✅ |
| Entidad `SubscriberTaxAssignment` | `crm/subscribers/entities/subscriber-tax-assignment.entity.ts` | ✅ |
| DTO `UpsertTaxAssignmentDto` | `crm/subscribers/dto/upsert-tax-assignment.dto.ts` | ✅ |
| DTO `SaveTaxAssignmentsDto` | `crm/subscribers/dto/save-tax-assignments.dto.ts` | ✅ |
| DTO `SubscriberTaxProfileSnapshotDto` | `crm/subscribers/dto/subscriber-tax-profile-snapshot.dto.ts` | ✅ |
| Servicio `SubscriberTaxProfileService` | `crm/subscribers/subscriber-tax-profile.service.ts` | ✅ |
| Controlador `SubscriberTaxController` | `crm/subscribers/subscriber-tax.controller.ts` | ✅ |
| Migración 026 | `packages/database/src/migrations/tenant/026_create_subscriber_tax_profiles.ts` | ✅ |
| Runner actualizado | `packages/database/src/migrations/tenant/runner.ts` | ✅ |
| Módulo actualizado | `crm/subscribers/subscribers.module.ts` | ✅ |

### 2.2 Shared Enums (`packages/shared`)

| Enum | Valores |
|------|---------|
| `TaxAssignmentStatus` | `SUGGESTED \| CONFIRMED \| MANUAL_ADJUSTMENT` |
| `TaxAssignmentRateSource` | `CATALOG \| MANUAL` |
| `TaxProfileStatus` | `PENDING_REVIEW \| CONFIGURED` |

### 2.3 Portal (`apps/portal`)

- 8 tipos locales agregados a `src/lib/api-client.ts`
- Export `subscriberTaxApi` con 4 métodos: `getProfile()`, `saveAssignments()`, `updateAssignment()`, `suggestVat()`
- Base path: `/crm/subscribers/${subscriberId}/tax-profile`

---

## 3. Endpoints Expuestos

| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| `GET` | `/api/v1/crm/subscribers/:subscriberId/tax-profile` | ADMIN, ACCOUNTANT, SYSTEM_ADMIN | Obtener o crear perfil tributario |
| `PUT` | `/api/v1/crm/subscribers/:subscriberId/tax-profile/assignments` | ADMIN, ACCOUNTANT, SYSTEM_ADMIN | Guardar asignaciones tributarias |
| `PATCH` | `/api/v1/crm/subscribers/:subscriberId/tax-profile/assignments/:assignmentId` | ADMIN, ACCOUNTANT, SYSTEM_ADMIN | Actualizar asignación individual |
| `POST` | `/api/v1/crm/subscribers/:subscriberId/tax-profile/suggest-vat` | ADMIN, ACCOUNTANT, SYSTEM_ADMIN | Re-sugerir IVA según estrato |

---

## 4. Decisiones Técnicas

### 4.1 Patrón de persistencia
Se usó `@InjectDataSource()` + `runInTenantSchema()` consistente con el resto del proyecto. Las entidades **no** usan `@InjectRepository()`. Toda operación de BD se realiza con `qr.manager.*` dentro del callback de `runInTenantSchema`.

### 4.2 Boundary enforcement (ADR-029)
- `taxDefinitionId` en `SubscriberTaxAssignment` es **FK lógica** (columna UUID simple sin FK física en PostgreSQL).
- Coherencia referencial garantizada a nivel de servicio vía `TaxCatalogReadPort.findById()`.
- Sin imports de entidades de `TaxationModule` en `SubscribersModule`.

### 4.3 Política de sugerencia IVA (Ley 1819/2016)
| Tipo persona | Estrato | Tratamiento |
|--------------|---------|-------------|
| Natural | 1–2 | EXEMPT (Art. 476) |
| Natural | 3 | EXCLUDED (Art. 477) |
| Natural | 4–6 | STANDARD |
| Natural | sin estrato | STANDARD |
| Jurídica | cualquiera | STANDARD |

Solo sobreescribe asignaciones en estado `SUGGESTED`; respeta `CONFIRMED` y `MANUAL_ADJUSTMENT`.

### 4.4 Migración 026
- Tablas: `subscriber_tax_profiles`, `subscriber_tax_assignments`
- Usa `IF NOT EXISTS` para tolerancia a reintentos
- FK física solo entre assignments y profiles (`ON DELETE CASCADE`)
- Sin FK a `tax_definitions` (boundary compliance)
- Reversible: `down()` dropa ambas tablas en orden correcto

---

## 5. Cobertura de Tests

### 5.1 Tests unitarios — `subscriber-tax-profile.service.spec.ts`
16 casos cubiertos:

| Método | Casos |
|--------|-------|
| `getOrCreateProfile` | suscriptor no existe → 404; perfil existente; crea perfil nuevo + sugiere IVA |
| `saveAssignments` | perfil no existe → 404; definición no en catálogo → 404; crea asignación nueva; promueve status a CONFIGURED |
| `suggestVatForSubscriber` | suscriptor no existe → 404; perfil no existe → 404; no sobreescribe CONFIRMED |
| Política IVA | Natural estrato 1→EXEMPT; 2→EXEMPT; 3→EXCLUDED; 4→STANDARD; sin estrato→STANDARD; Jurídica→STANDARD |

### 5.2 Tests HTTP — `subscriber-tax.controller.http.spec.ts`
13 casos cubiertos:

| Grupo | Casos |
|-------|-------|
| `GET /tax-profile` | 200 perfil OK; 404 no encontrado; 400 UUID inválido |
| `PUT /assignments` | 200 actualizado; 200 lista vacía; 404; 400 UUID inválido |
| `PATCH /assignments/:id` | 200 actualizado; 404; 400 assignmentId; 400 subscriberId |
| `POST /suggest-vat` | 200 perfil recalculado; 404 suscriptor no encontrado |

### 5.3 Métricas finales
- Tests `@iwana/api`: **858/858** (77 suites) — +13 tests HTTP, +1 suite vs v1.0
- Typecheck `@iwana/api`: ✅
- Typecheck `@iwana/portal`: ✅ (incluyendo `TaxProfileBlock`)

---

## 6. Desvíos del Plan

| Ítem | Plan | Real | Motivo |
|------|------|------|--------|
| BT-TAXMVP-19 | HTTP integration tests | ~~Pendiente~~ **Completado** | 13/13 passing — `subscriber-tax.controller.http.spec.ts` |
| BT-TAXMVP-11 a 15 | Frontend components portal | ~~Pendiente~~ **Completado** | `TaxProfileBlock` implementado + tab Tributario en Suscriptor 360 |

---

## 7. Pendientes para Próximo Sprint

1. **BT-TAXMVP-11/12** — Simplificación de `TaxCatalogManager` / ocultar `TaxApplicationRulesManager` en UI de plataforma (bajo impacto, diferido).
2. Evaluar ADR sobre política de IVA para ISPs categoría especial (Ley 1978/2019 § 64)

> BT-TAXMVP-13, 14, 15 y 19 **cerrados** en actualización v1.1.

---

## 8. Archivos Clave

```
packages/shared/src/enums/taxation/
  ├── tax-assignment-status.enum.ts
  ├── tax-assignment-rate-source.enum.ts
  └── tax-profile-status.enum.ts

apps/api/src/modules/crm/subscribers/
  ├── entities/
  │   ├── subscriber-tax-profile.entity.ts
  │   └── subscriber-tax-assignment.entity.ts
  ├── dto/
  │   ├── upsert-tax-assignment.dto.ts
  │   ├── save-tax-assignments.dto.ts
  │   └── subscriber-tax-profile-snapshot.dto.ts
  ├── subscriber-tax-profile.service.ts
  ├── subscriber-tax.controller.ts
  ├── subscribers.module.ts  (modificado)
  └── tests/
      └── subscriber-tax-profile.service.spec.ts

packages/database/src/migrations/tenant/
  ├── 026_create_subscriber_tax_profiles.ts
  └── runner.ts  (modificado)

apps/portal/src/lib/api-client.ts  (modificado — types + subscriberTaxApi)

apps/portal/src/components/crm/subscribers/
  ├── TaxProfileBlock.tsx              (nuevo — BT-TAXMVP-13/14)
  └── SubscriberDetailClient.tsx       (modificado — tab Tributario, BT-TAXMVP-15)

apps/api/src/modules/crm/subscribers/tests/
  └── subscriber-tax.controller.http.spec.ts  (nuevo — BT-TAXMVP-19)
```
