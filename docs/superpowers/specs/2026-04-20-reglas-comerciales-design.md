# Diseño: Módulo Reglas Comerciales (MOD06 — CommercialModule)

**Fecha:** 2026-04-20
**Última actualización:** 2026-04-21 (addendum: dependencia hacia Taxation y nuevo naming tributario)
**Módulo:** MOD06 — CommercialModule
**Pestaña:** Reglas comerciales
**Estado:** Aprobado para implementación (con revisiones pendientes tras ADR-029, ADR-031)
**Autor:** AI-EM-ARCH (sesión de diseño colaborativo con CTO)
**Referencias:** ADR-028, ADR-029, ADR-031, HLD-MOD06-ARQUITECTURA-v1.0.md, HLD-MOD06-TAXATION-DEPENDENCY-v1.1-addendum.md, HLD-MOD07-TAXATION-v1.0.md, 2026-04-21-taxation-bounded-context-design.md, PRD_Sistema_ISP_Colombia_v2_3.md

---

## Addendum 2026-04-21 — Rediseño tributario y ownership del catálogo

Esta spec se mantiene vigente, con los siguientes cambios derivados de la sesión de diseño del 2026-04-21:

1. **Ownership del catálogo de impuestos** se mueve de `CommercialModule` a `TaxationModule` (MOD07). Ver `ADR-029`.
2. **Naming de la pestaña tributaria** evoluciona de `Clasificaciones tributarias + Reglas de asignación` a `Impuestos + Reglas de aplicación + Simulador`. Ver `ADR-031`.
3. **Resultado de una regla** deja de ser una `TaxClassification` opaca y pasa a ser una lista de aplicaciones (`TaxApplicationSnapshot[]`) con `taxDefinitionId`, `treatment`, `effectiveRate`, `ruleId`, `priorityMatched`.
4. **Condiciones v1 de una regla**: segmento, tipo de persona, estrato, municipio, base mínima, producto. Las reglas siguen siendo propiedad de Commercial.
5. **Frontend** reemplaza el monolítico `TaxRulesManager.tsx` por `TaxCatalogManager`, `TaxApplicationRulesManager` y `TaxSimulatorPanel`, manteniendo `CommercialTabLayout` como punto de integración.
6. **Territoriales** se gestionan manualmente por tenant como `TaxDefinition` en MOD07; Commercial solo los consume.
7. **Deuda técnica** que cierra el rediseño: columnas duplicadas `estrato_min`/`estrato_max` y `stratum_from`/`stratum_to` en `tax_rule.entity.ts`.

Las referencias a `tax_classifications` y `tax_rules` en las secciones siguientes aplican al modelo legacy. Durante la migración coexistirán con la nueva estructura (`tax_application_rules` + `tax_rule_applications`). La sección de Compatibilidad (Reemplaza) no se ve afectada por este addendum.

---

## Resumen ejecutivo

La pestaña "Reglas comerciales" del módulo comercial se divide en dos subsecciones independientes:

1. **Compatibilidad** — reglas de sustitución entre ítems del catálogo (tipo `REPLACES`)
2. **Tributarias** — clasificaciones fiscales por tipo de cliente y estrato

Ambas son independientes de Billing. CommercialModule es dueño de la *clasificación* y la *lógica de aplicación*; Billing (módulo futuro) consumirá estas reglas como datos de lectura para calcular montos.

---

## Decisiones de scope

| Regla | Decisión |
|---|---|
| Requiere (A requiere B) | Fuera de scope — aplica implícitamente en la estructura de bundles |
| Excluye (A y B no coexisten) | Fuera de scope — la restricción real es por dirección + estrato (dominio CRM/Cobertura) |
| Reemplaza | En scope — caso de negocio central de Compatibilidad |
| Tasas numéricas (% IVA, % ReteICA) | Fuera de scope — responsabilidad de Billing futuro |
| Flags de impuestos aplicables | En scope — CommercialModule define qué aplica, Billing calcula cuánto |

---

## Sección 1: Compatibilidad (Reemplaza)

### Propósito

Cuando un ítem del catálogo queda obsoleto, el tenant configura su sucesor recomendado. Los clientes activos con el ítem antiguo no se tocan (opción B del diseño). El impacto es informativo: al cotizar el ítem obsoleto, el agente recibe un aviso con el sucesor sugerido.

### Modelo de datos

Tabla: `catalog_compatibility_rules` (schema del tenant)

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid PK | Identificador |
| `source_item_id` | uuid FK → catalog_items | Ítem obsoleto / origen |
| `target_item_id` | uuid FK → catalog_items | Ítem sucesor recomendado |
| `rule_type` | enum(`REPLACES`) | Extensible a futuro sin migración destructiva |
| `effective_from` | date | Desde cuándo aplica la sugerencia al cotizar |
| `note` | text nullable | Mensaje visible al agente (ej: "Migrado por cambio de velocidades") |
| `is_active` | boolean default true | Permite desactivar sin eliminar |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Constraints:**
- `UNIQUE (source_item_id) WHERE is_active = true` — un ítem solo puede tener un sucesor activo
- `CHECK (source_item_id <> target_item_id)` — un ítem no puede reemplazarse a sí mismo

### Puerto de lectura (boundary hacia CRM)

```typescript
// apps/api/src/modules/commercial/ports/commercial-compatibility-read.port.ts
interface ReplacementRule {
  targetItemId: string;
  targetItemName: string;
  effectiveFrom: Date;
  note: string | null;
}

interface CommercialCompatibilityReadPort {
  getReplacementFor(sourceItemId: string): Promise<ReplacementRule | null>;
}
```

### Backend — capas

- **Entidad:** `CatalogCompatibilityRule` (TypeORM, schema tenant)
- **Servicio:** `CompatibilityRulesService` — CRUD + validación de ciclos (A→B, B→A no permitido)
- **Controlador:** `CompatibilityRulesController` — endpoints REST bajo `/api/v1/commercial/compatibility-rules`
- **Guard:** `@Roles(UserRole.ADMIN, UserRole.SALES)` — TENANT_ADMIN (`ADMIN`) puede crear/editar/desactivar; `SALES` solo lectura en esta iteración

### Endpoints REST

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/commercial/compatibility-rules` | Listar reglas paginadas |
| `POST` | `/commercial/compatibility-rules` | Crear regla |
| `PATCH` | `/commercial/compatibility-rules/:id` | Actualizar nota / effective_from / is_active |
| `DELETE` | `/commercial/compatibility-rules/:id` | Desactivar (soft delete) |

### UI — portal

**Lista principal:**
- Tabla: `Origen → Sucesor | Desde | Nota | Estado (badge) | Acciones`
- Botón "Nueva regla" (solo TENANT_ADMIN / COMMERCIAL_MANAGER)
- Badge de estado: activa (lima) / inactiva (neutral)

**Modal crear/editar:**
- Combobox de búsqueda (selección única) para Origen — muestra nombre + tipo del ítem
- Combobox de búsqueda (selección única) para Sucesor — mismo componente
- `DatePicker` para "Vigente desde"
- `Input` textarea para Nota (opcional)

**Impacto en CRM — flujo de cotización:**
- Al seleccionar un ítem con regla `REPLACES` activa → banner amarillo no bloqueante:
  > *"Este plan tiene un sucesor: [Nombre sucesor]. ¿Deseas usar el sucesor en su lugar?"*
- Dos botones: "Usar sucesor" / "Continuar con el original"
- El agente decide — no se fuerza el cambio

---

## Sección 2: Tributarias

### Propósito

Definir qué carga fiscal aplica a cada tipo de cliente según su segmento y estrato socioeconómico. CommercialModule es dueño de la clasificación (qué impuestos aplican y cuándo). Billing futuro lee estas reglas para calcular los montos. Las tasas numéricas (%) no viven aquí.

### Marco regulatorio colombiano aplicado

| Clasificación | Segmento / Estrato | IVA | Retefuente | ReteICA | Estampillas |
|---|---|---|---|---|---|
| **Exento** | Residencial estratos 1–2 | No (0%, deducible) | No | No | No |
| **Excluido** | Residencial estrato 3 | No (fuera del sistema) | No | No | No |
| **Gravado estándar** | Residencial 4–6, Comercial, PYME, Corporativo, Mayorista | Sí 19% | Sí | No | No |
| **Gravado gobierno** | Gobierno | Sí 19% | Sí | Sí | Sí |

> Las tasas exactas (19%, porcentaje de ReteICA por municipio, valor de estampillas) son responsabilidad de Billing. CommercialModule solo declara qué impuestos aplican mediante flags booleanos.

### Modelo de datos

**Tabla: `tax_classifications`** (schema del tenant)

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid PK | |
| `name` | varchar(100) | Nombre visible: "Exento", "Excluido", etc. |
| `description` | text nullable | Explicación del régimen |
| `applies_iva` | boolean | ¿El ítem está sujeto a IVA? |
| `applies_retefuente` | boolean | ¿Aplica retención en la fuente? |
| `applies_rete_ica` | boolean | ¿Aplica ReteICA? |
| `applies_estampillas` | boolean | ¿Aplica estampillas? |
| `is_active` | boolean default true | Soft delete |
| `is_system` | boolean default false | Las 4 clasificaciones base del seed no se pueden eliminar |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Tabla: `tax_rules`** (schema del tenant)

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid PK | |
| `tax_classification_id` | uuid FK → tax_classifications | Clasificación que aplica |
| `customer_segment` | enum nullable | `RESIDENTIAL`, `PYME`, `CORPORATE`, `GOVERNMENT`, `WHOLESALE`, `COMMERCIAL` |
| `stratum_from` | smallint nullable | Estrato mínimo (inclusive). Null = no aplica estrato |
| `stratum_to` | smallint nullable | Estrato máximo (inclusive). Null = no aplica estrato |
| `priority` | smallint default 0 | Mayor número = mayor precedencia al resolver solapamientos |
| `is_active` | boolean default true | |
| `created_at` | timestamptz | |

**Lógica de resolución:**

```
dado (segment, stratum):
  1. filtrar tax_rules WHERE is_active = true
     AND customer_segment = :segment (o IS NULL)
     AND (:stratum BETWEEN stratum_from AND stratum_to) (o ambos IS NULL)
  2. ordenar por priority DESC
  3. tomar el primer resultado → su tax_classification_id
  4. si no hay resultado → error de configuración (clasificación por defecto configurable)
```

### Seed inicial

Al provisionar un tenant nuevo, insertar las 4 clasificaciones base con `is_system = true` y sus reglas correspondientes. El tenant puede crear clasificaciones adicionales y reglas nuevas, pero no eliminar las del sistema (solo desactivar).

### Puerto de lectura (boundary hacia Billing)

```typescript
// apps/api/src/modules/commercial/ports/tax-rule-read.port.ts
interface TaxClassification {
  id: string;
  name: string;
  appliesIva: boolean;
  appliesRetefuente: boolean;
  appliesReteIca: boolean;
  appliesEstampillas: boolean;
}

interface TaxRuleReadPort {
  resolve(segment: CustomerSegment, stratum?: number): Promise<TaxClassification>;
}
```

### Backend — capas

- **Entidades:** `TaxClassification`, `TaxRule` (TypeORM, schema tenant)
- **Servicios:**
  - `TaxClassificationsService` — CRUD de clasificaciones (protege `is_system`)
  - `TaxRulesService` — CRUD de reglas + lógica de resolución
- **Controlador:** `TaxRulesController` — endpoints bajo `/api/v1/commercial/tax`

### Endpoints REST

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/commercial/tax/classifications` | Listar clasificaciones |
| `POST` | `/commercial/tax/classifications` | Crear clasificación |
| `PATCH` | `/commercial/tax/classifications/:id` | Editar nombre, descripción, flags |
| `DELETE` | `/commercial/tax/classifications/:id` | Desactivar (error si `is_system = true`) |
| `GET` | `/commercial/tax/rules` | Listar reglas |
| `POST` | `/commercial/tax/rules` | Crear regla |
| `PATCH` | `/commercial/tax/rules/:id` | Editar regla |
| `DELETE` | `/commercial/tax/rules/:id` | Desactivar regla |
| `POST` | `/commercial/tax/resolve` | Resolver clasificación dado segment + stratum (útil para preview en UI) |

### UI — portal

**Clasificaciones — tabla principal:**
- Columnas: `Nombre | IVA | Retefuente | ReteICA | Estampillas | Sistema | Estado | Acciones`
- Los flags se muestran como íconos check/x (no texto)
- Clasificaciones `is_system = true` → badge "Sistema", botón eliminar deshabilitado
- Botón "Nueva clasificación" abre modal con campos: nombre, descripción, 4 checkboxes de flags

**Reglas — subpanel por clasificación:**
- Cada clasificación tiene un acordeón expandible con sus reglas activas
- Cada regla muestra: `Segmento | Estrato desde–hasta | Prioridad`
- Botón "Agregar condición" por clasificación
- Modal crear condición: Select de segmento + inputs de rango de estrato (opcionales) + prioridad

**Preview de resolución:**
- Panel lateral o sección inferior: "Simular clasificación"
- Inputs: tipo de cliente + estrato → botón "Resolver" → muestra qué clasificación aplica

---

## Consideraciones transversales

### Auditoría
Todos los cambios (crear, editar, desactivar) pasan por el `AuditInterceptor` global de MOD01. Sin implementación adicional.

### Autorización
- Lectura: cualquier rol autenticado del tenant
- Escritura / desactivación: `UserRole.ADMIN` (TENANT_ADMIN) únicamente (opción A acordada)

### Migraciones
- Dos migraciones reversibles en `packages/database/src/migrations/tenant/`:
  - `CreateCatalogCompatibilityRulesTable`
  - `CreateTaxClassificationsAndRulesTable`
- Seed de clasificaciones base incluido en la migración de tributarias (datos iniciales)

### Tests
- Unitarios: `CompatibilityRulesService`, `TaxRulesService` (incluyendo lógica de resolución con casos borde: sin match, múltiples reglas solapadas)
- Integración HTTP: endpoints CRUD + casos de validación (ciclo A→B→A, eliminar `is_system`)
- Cobertura objetivo: ≥ 80% en ambos servicios

---

## Fuera de scope (esta iteración)

- Tasas numéricas de impuestos (% IVA, % ReteICA por municipio) → Billing
- Reglas de tipo `REQUIRES` y `EXCLUDES` → definidas como no necesarias en esta fase
- Historial de cambios de clasificación tributaria con efectividad temporal → Billing o sprint posterior
- Notificaciones automáticas a clientes activos ante cambio de sucesor → futuro

---

## Orden de implementación sugerido

1. Migraciones (ambas tablas)
2. Seed de clasificaciones tributarias base
3. Backend Compatibilidad (entidad → servicio → controlador → tests)
4. Backend Tributarias (entidades → servicios → controlador → tests)
5. UI portal — Compatibilidad (lista + modal)
6. UI portal — Tributarias (clasificaciones + reglas + preview)
7. Integración CRM — banner de sustitución en flujo de cotización
