# Spec: Catálogo de Planes — MOD03 Comercial

> **Fecha:** 2026-03-21
> **Módulo:** MOD03 — Configuración Empresarial
> **Sección:** Comercial > Planes
> **Estado:** Aprobado para implementación

---

## 1. Objetivo

Implementar la gestión completa del catálogo de planes de internet del tenant en la sección **Comercial > Planes** del portal de configuración. El catálogo es la fuente de verdad que CRM consume para cotizaciones y contratos.

---

## 2. Contexto y estado actual

### Qué existe (no se toca)

- Tabla `plan_catalog_items` en el schema de cada tenant (migración 013)
- Endpoints `GET`, `POST`, `PATCH /api/v1/tenants/me/plans` con RBAC y audit log
- Puerto de dominio CRM → Planes (`PlanCatalogReadPort`) + adapter para cotizaciones
- `PlanCatalogCard.tsx` existente: carga y lista planes (3 columnas), creación parcial (solo nombre, resto hardcodeado)
- `api-client.ts`: métodos `getPlans`, `createPlan`, `updatePlan` definidos

### Qué debe cambiar

1. Campo `technology`: migrar de enum `plan_technology_enum` a `varchar(100)` — texto libre por tenant
2. Campo `installationRule`: agregar nuevo `varchar` con valores controlados (`NONE`, `ALWAYS`, `FIBER_DROP_THRESHOLD`)
3. Campo `fiberInstallationThresholdMeters`: agregar a `TenantSelfSettings` (backend + DB)
4. Frontend `PlanCatalogCard.tsx`: reemplazar por `PlanCatalogManager.tsx` completamente funcional

---

## 3. Modelo de datos

### 3.1 Entidad `PlanCatalogItem` — cambios

| Campo                   | Antes                                 | Después                                                                              |
| ----------------------- | ------------------------------------- | ------------------------------------------------------------------------------------ |
| `technology`            | `enum('GPON','WIFI5','WIFI6','FTTH')` | `varchar(100)` — texto libre                                                         |
| `installationRule`      | (no existe)                           | `varchar(30)` — valores: `NONE`, `ALWAYS`, `FIBER_DROP_THRESHOLD`. Default: `ALWAYS` |
| `validFrom` / `validTo` | `timestamptz nullable`                | Sin cambios — se conserva en DB, sin UI en este sprint                               |

**Restricciones de negocio:**

- `technology`: mínimo 2 caracteres, máximo 100. No normalizado — cada tenant usa sus propias denominaciones.
- `installationRule = NONE`: el plan no cobra instalación. `installationFee` debe ser 0 o null.
- `installationRule = ALWAYS`: siempre cobra. Aplica principalmente a Radio Enlace y similares.
- `installationRule = FIBER_DROP_THRESHOLD`: cobra solo si el cable drop supera el umbral configurado en el tenant. El sistema no calcula automáticamente — es referencia para el agente.

### 3.2 `TenantSelfSettings` — campo nuevo

```typescript
fiberInstallationThresholdMeters: number; // default: 50, min: 1, max: 10000
```

Persiste en la tabla de ajustes del tenant (el implementador debe confirmar el nombre exacto buscando la entidad en `apps/api/src/modules/tenant/`). Se configura en la sección **Operación** del portal (tab Operación > nuevo campo en `OperationalSettingsForm`).

### 3.3 Migraciones requeridas

| #   | Nombre                                   | Contenido                                                                                                                                            |
| --- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 014 | `014_plan_catalog_technology_to_varchar` | Eliminar columna `technology` enum → agregar `technology varchar(100)`. Script DOWN recrea el enum y convierte valores conocidos.                    |
| 015 | `015_plan_catalog_installation_rule`     | Agregar columna `installation_rule varchar(30) NOT NULL DEFAULT 'ALWAYS'`. Script DOWN elimina la columna.                                           |
| 016 | `016_tenant_settings_fiber_threshold`    | Agregar columna `fiber_installation_threshold_meters integer NOT NULL DEFAULT 50` en la tabla de ajustes del tenant. Script DOWN elimina la columna. |

> **Nota:** Las migraciones aplican a todos los tenants ACTIVE en `public.tenants` via `runInTenantSchema()`.

---

## 4. Cambios al backend (API)

### 4.1 DTOs

**`CreatePlanCatalogItemDto`** — cambios:

- `technology`: de `@IsEnum(PlanTechnologyDto)` a `@IsString() @MinLength(2) @MaxLength(100) @Trim()`
- `installationRule`: nuevo campo `@IsIn(['NONE', 'ALWAYS', 'FIBER_DROP_THRESHOLD']) @IsOptional()` — default `ALWAYS`
- `installationFee`: `@IsOptional()` en el DTO. En el service, si `installationRule === 'NONE'` se fuerza a `0` independientemente del valor recibido. Esto permite que el frontend omita el campo cuando no aplica cobro, sin causar error de validación.

**`UpdatePlanCatalogItemDto`** — mismos cambios, todos opcionales (Partial).

**`PlanCatalogItemDto`** (respuesta) — agregar `installationRule: string`.

### 4.2 Servicio `tenant.service.ts`

- `createPlanCatalogItem`: si `installationRule === 'NONE'`, forzar `installationFee = 0`.
- `updatePlanCatalogItem`: misma lógica.
- `toPlanCatalogDto()`: incluir `installationRule` en la proyección.

### 4.3 Eliminar

- Enum TypeScript `PlanTechnologyDto` (ya no se usa)
- Type `PlanTechnology` del api-client (pasa a `string`)

### 4.4 Nuevo endpoint — `TenantSelfSettings` umbral de fibra

`PATCH /api/v1/tenants/me/settings` ya existe. Se agrega el campo `fiberInstallationThresholdMeters` al DTO de actualización de settings. Validación: `@IsInt() @Min(1) @Max(10000) @IsOptional()`.

---

## 5. Cambios al api-client del portal

```typescript
// Antes
export type PlanTechnology = 'GPON' | 'WIFI5' | 'WIFI6' | 'FTTH';

// Después
// PlanTechnology eliminado. El campo technology es string.

export interface PlanCatalogItem {
  // ...campos existentes...
  technology: string; // texto libre
  installationRule: 'NONE' | 'ALWAYS' | 'FIBER_DROP_THRESHOLD'; // nuevo
}

export interface CreatePlanCatalogItemDto {
  name: string;
  technology: string;
  downloadSpeedMbps: number;
  uploadSpeedMbps: number;
  basePrice: number;
  installationRule: 'NONE' | 'ALWAYS' | 'FIBER_DROP_THRESHOLD';
  installationFee: number; // 0 si installationRule === 'NONE'
  // validFrom / validTo: omitidos del DTO de creación (sin UI)
}

// TenantSelfSettings — agregar campo:
export interface TenantSelfSettings {
  // ...campos existentes...
  fiberInstallationThresholdMeters: number;
}
```

---

## 6. Frontend — Componente `PlanCatalogManager`

**Archivo:** `apps/portal/src/components/settings/PlanCatalogManager.tsx`

Reemplaza a `PlanCatalogCard.tsx`. El archivo antiguo se elimina. `CommercialTabLayout.tsx` importa `PlanCatalogManager` en lugar de `PlanCatalogCard`.

### 6.1 Estructura del componente

```
PlanCatalogManager
├── Header: "Catálogo de planes" + badge(n activos) + botón "Nuevo plan"
├── PlanTable: tabla de planes
│   └── PlanRow: fila por plan (toggle activo, botón editar)
└── PlanFormModal: modal Dialog de crear/editar (estado: open/closed + plan a editar)
```

### 6.2 Estado del componente

```typescript
const [plans, setPlans] = useState<PlanCatalogItem[]>([]);
const [isLoading, setIsLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
const [modalState, setModalState] = useState<
  | { open: false }
  | { open: true; mode: 'create' }
  | { open: true; mode: 'edit'; plan: PlanCatalogItem }
>({ open: false });
```

### 6.3 Tabla de planes — columnas

| Columna         | Contenido                                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Plan**        | `name` en negrita + Badge `technology` (variante neutral)                                                                                 |
| **Velocidad**   | Si `downloadSpeedMbps === uploadSpeedMbps`: `"100 Mbps ↕"` (simétrico). Si no: `"100 ↓ / 20 ↑ Mbps"`                                      |
| **Precio base** | `$129.900/mes` — `Intl.NumberFormat('es-CO', {style:'currency', currency:'COP', maximumFractionDigits:0})`                                |
| **Instalación** | Si `NONE`: `"—"` (guion). Si `ALWAYS`: `"$90.000"`. Si `FIBER_DROP_THRESHOLD`: `"$90.000 si > Xm"` (X = threshold del tenant)             |
| **Estado**      | `Switch` activo/inactivo — solo si `canEdit`. Deshabilitado si es el último plan activo (tooltip: "Debe existir al menos un plan activo") |
| **Acciones**    | Botón icono `Pencil` ("Editar") — solo si `canEdit`                                                                                       |

**Filas inactivas:** `opacity-50` en toda la fila. Los planes inactivos se muestran al final de la lista (orden: activos primero, luego inactivos, dentro de cada grupo por `createdAt DESC`).

### 6.4 Modal — `PlanFormModal`

**Título:** "Nuevo plan" (modo create) / "Editar plan" (modo edit, muestra nombre del plan).

**Campos del formulario:**

```
1. Nombre del plan *
   Input texto, placeholder "Ej: Hogar 100 Megas"
   Validación: 2–140 caracteres

2. Tecnología *
   Input texto con datalist de sugerencias: ["Radio Enlace", "Fibra Óptica", "Satelital", "GPON", "FTTH", "WIFI6"]
   Validación: 2–100 caracteres

3. Tipo de velocidad
   Toggle: [Simétrica] [Asimétrica]
   - Simétrica: 1 input "Velocidad (Mbps)"
   - Asimétrica: 2 inputs "Bajada (Mbps)" y "Subida (Mbps)"
   Validación: entero positivo, máximo 100.000

4. Precio base mensual *
   Input numérico con prefijo "COP $"
   Validación: ≥ 0

5. Cobro de instalación
   Toggle: "Aplica cobro de instalación"
   - Si OFF → installationRule = NONE, installationFee = 0
   - Si ON → mostrar campos 6 y 7

6. Valor de instalación *  (visible si toggle ON)
   Input numérico con prefijo "COP $"
   Validación: ≥ 0

7. Regla de cobro  (visible si toggle ON)
   Select:
   - "Siempre" → installationRule = ALWAYS
   - "Solo si cable drop > Xm (fibra)" → installationRule = FIBER_DROP_THRESHOLD
     (X se lee de settings.fiberInstallationThresholdMeters, se muestra en el label, no es editable aquí)
```

**Botones:**

- "Cancelar" — cierra modal sin guardar
- "Guardar plan" / "Actualizar plan" — llama create o update, actualiza lista, cierra modal

**Manejo de errores:** toast de error si la API falla. El modal permanece abierto.

### 6.5 Toggle activo/inactivo (inline en tabla)

- Llama `updatePlan(plan.id, { isActive: !plan.isActive })` en `onChange`.
- Optimistic update: actualiza el estado local inmediatamente, revierte si la API falla.
- El último plan activo (`plans.filter(p => p.isActive).length === 1`) muestra el switch deshabilitado con tooltip.

### 6.6 Props del componente

```typescript
interface PlanCatalogManagerProps {
  canEdit: boolean;
  fiberThresholdMeters: number; // leído de TenantSelfSettings en SettingsClient
}
```

El `fiberThresholdMeters` llega desde `SettingsClient` — que ya carga `TenantSelfSettings` — para evitar una segunda llamada a la API desde `PlanCatalogManager`.

> **Nota de implementación:** Este es un cambio de props en **dos niveles**:
> `SettingsClient` → `CommercialTabLayout` → `PlanCatalogManager`.
> Ambos componentes deben actualizarse.

---

## 7. Integración en `SettingsClient` y `CommercialTabLayout`

### `SettingsClient.tsx`

- Ya carga `settings: TenantSelfSettings`. Pasar `settings.fiberInstallationThresholdMeters` como prop a `CommercialTabLayout` o directamente a `PlanCatalogManager` según el árbol de componentes.

### `CommercialTabLayout.tsx`

- Agregar prop `fiberThresholdMeters: number`
- Pasarlo a `<PlanCatalogManager canEdit={canEdit} fiberThresholdMeters={fiberThresholdMeters} />`
- El componente `CommercialCoverageCard` no cambia en este sprint

### `OperationalSettingsForm.tsx`

- Agregar campo "Umbral de metros cable drop (fibra)" al formulario existente
- Input numérico, min 1, max 10000, con label y helper text: "A partir de este metraje se cobra instalación en planes de fibra óptica"
- Llama al endpoint existente `PATCH /tenants/me/settings`

---

## 8. Tecnologías sugeridas (datalist)

El input de tecnología usa un `<datalist>` HTML nativo con estas sugerencias predeterminadas. No son las únicas opciones — el usuario puede escribir cualquier texto:

```
Radio Enlace
Fibra Óptica
Satelital
GPON
FTTH
WIFI 5 GHz
WIFI 6 GHz
Microondas
```

---

## 9. Reglas de validación frontend

| Campo              | Regla                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `name`             | Requerido, 2–140 chars (coincide con `@MaxLength(140)` del backend)                        |
| `technology`       | Requerido, 2–100 chars                                                                     |
| Velocidad          | Entero, 1–100.000 Mbps                                                                     |
| `basePrice`        | Número ≥ 0, máximo 2 decimales en el schema Zod (aunque la tabla lo muestre sin decimales) |
| `installationFee`  | Número ≥ 0, máximo 2 decimales, si `installationRule !== NONE`                             |
| `installationRule` | Requerido si cobro activo. Debe ser uno de `ALWAYS`, `FIBER_DROP_THRESHOLD`                |

Validación con **Zod** en el frontend (patrón establecido en el proyecto).

---

## 10. Accesibilidad

- El `Dialog` modal tiene `role="dialog"` + `aria-modal="true"` + `aria-labelledby` apuntando al título del modal
- El toggle de velocidad simétrica/asimétrica usa `role="radiogroup"` con dos `<button role="radio">` o un `<select>`
- Los switches de estado activo/inactivo en la tabla usan `role="switch"` + `aria-checked` + `aria-label="Activar/desactivar [nombre plan]"`
- El switch deshabilitado (último activo) tiene `aria-disabled="true"` + `title` con el mensaje de ayuda

---

## 11. Criterios de aceptación

- [ ] Un ADMIN puede crear un plan con todos los campos (nombre, tecnología libre, velocidades simétricas o asimétricas, precio base, regla de instalación)
- [ ] Al crear con regla `FIBER_DROP_THRESHOLD`, el sistema muestra el umbral configurado del tenant en el label del select
- [ ] Un NOC o SUPPORT puede ver la tabla pero no ve los controles de edición ni el toggle de estado
- [ ] La tabla muestra las columnas: Plan, Velocidad, Precio base, Instalación, Estado (si canEdit), Acciones (si canEdit)
- [ ] Los planes inactivos aparecen atenuados al final de la lista
- [ ] El toggle del último plan activo está deshabilitado con tooltip
- [ ] El campo Tecnología acepta texto libre (no solo las opciones del datalist)
- [ ] El umbral de metros fibra es configurable desde el tab Operación
- [ ] `pnpm --filter portal tsc --noEmit` pasa sin errores
- [ ] `pnpm --filter api tsc --noEmit` pasa sin errores
- [ ] Las migraciones 014, 015, 016 tienen script UP y DOWN funcionales

---

## 12. Fuera de alcance (este sprint)

- Fechas de vigencia (`validFrom` / `validTo`) — los campos existen en DB pero sin UI
- Duplicar planes ("Clonar plan")
- Ordenar la tabla manualmente (drag & drop)
- Exportar catálogo a CSV/Excel
- Endpoint DELETE para planes (solo desactivar via `isActive = false`)
- Historial de cambios por plan (audit log ya se guarda, sin UI de consulta)
