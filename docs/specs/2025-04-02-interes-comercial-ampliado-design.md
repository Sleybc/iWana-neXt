# Interés Comercial Ampliado - Design Spec

**Fecha:** 2025-04-02  
**Status:** Borrador  
**Área:** CRM - Expedientes

## Contexto

Actualmente el expediente tiene un único campo `interestedPlanId` que referencia un plan del catálogo. El negocio necesita registrar interés en productos adicionales (TvBox, Cámaras, etc.) además del plan principal.

### Campos Actuales en "Interés Comercial"

| Campo                | Propósito                 | Tipo               |
| -------------------- | ------------------------- | ------------------ |
| `interestedPlanId`   | Plan principal deinternet | UUID (foreign key) |
| `acquisitionChannel` | Cómo llegó el lead        | Enum               |
| `sourceDetail`       | Contexto adicional        | Texto libre (255)  |

### Explicación de Campos

**Canal de captación** (`acquisitionChannel`):  
Identifica el origen del lead. Permite medir ROI de canales, asignar créditos comerciales y analizar conversión por fuente. Valores: OFICINA, WHATSAPP, WEB, REFERIDO_CLIENTE, etc.

**Detalle de origen** (`sourceDetail`):  
Texto libre para contexto específico: "Campaña Q1 2025", "Referido por Juan Pérez", "Evento ExpoTecnología".

---

## Requisitos

1. Mantener plan principal obligatorio (opcional para crear, obligatorio para completar)
2. Agregar productos adicionales opcionales (múltiples)
3. Productos organizados por categorías
4. Catálogo editable por administradores del tenant
5. Persistir selección en el expediente

---

## Diseño

### 1. Modelo de Datos

#### Nueva tabla `additional_products`

```sql
CREATE TABLE additional_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(100) NOT NULL,
  category VARCHAR(30) NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_additional_products_tenant_active
  ON additional_products(tenant_id, is_active);
```

#### Enum `AdditionalProductCategory`

```typescript
enum AdditionalProductCategory {
  ENTERTAINMENT = 'ENTERTAINMENT', // TvBox, Decodificador
  SECURITY = 'SECURITY', // Cámaras, DVR, Alarma
  CONNECTIVITY = 'CONNECTIVITY', // Router mesh, Extensor, IP estática
  BUSINESS = 'BUSINESS', // Soporte prioritario, Línea adicional
}
```

#### Modificación a `expediente_records`

```sql
ALTER TABLE expediente_records
ADD COLUMN additional_product_ids JSONB DEFAULT '[]'::jsonb;
```

### 2. Productos Iniciales (Seed)

| Categoría     | Nombre                     |
| ------------- | -------------------------- |
| ENTERTAINMENT | TvBox                      |
| ENTERTAINMENT | Decodificador adicional    |
| SECURITY      | Cámaras de seguridad       |
| SECURITY      | DVR / NVR                  |
| SECURITY      | Alarma residencial         |
| CONNECTIVITY  | Router WiFi mesh           |
| CONNECTIVITY  | Extensor de cobertura      |
| CONNECTIVITY  | IP estática                |
| BUSINESS      | Soporte prioritario        |
| BUSINESS      | Línea telefónica adicional |

### 3. API Endpoints

#### CRUD de Productos Adicionales

```
GET    /api/v1/admin/additional-products      # Listar productos del tenant
POST   /api/v1/admin/additional-products      # Crear producto
PATCH  /api/v1/admin/additional-products/:id  # Actualizar producto
DELETE /api/v1/admin/additional-products/:id  # Soft delete
```

#### DTOs

```typescript
// Create
{
  name: string;        // max 100 chars
  category: AdditionalProductCategory;
  sortOrder?: number;
  isActive?: boolean;
}

// Update
{
  name?: string;
  category?: AdditionalProductCategory;
  sortOrder?: number;
  isActive?: boolean;
}
```

### 4. UI en Portal

#### Sección "Interés Comercial"

```
┌─────────────────────────────────────────────────────┐
│ INTERÉS COMERCIAL                                   │
│ Plan deseado y origen de la oportunidad.            │
├─────────────────────────────────────────────────────┤
│ Plan de interés *                                   │
│ [Dropdown: Planes activos del tenant]              │
│                                                     │
│ Productos adicionales                               │
│                                                     │
│ 📺 Entretenimiento                                  │
│ ☐ TvBox                                             │
│ ☐ Decodificador adicional                           │
│                                                     │
│ 🔒 Seguridad                                        │
│ ☐ Cámaras de seguridad                              │
│ ☐ DVR / NVR                                         │
│ ☐ Alarma residencial                                │
│                                                     │
│ 📡 Conectividad                                     │
│ ☐ Router WiFi mesh                                  │
│ ☐ Extensor de cobertura                             │
│ ☐ IP estática                                       │
│                                                     │
│ 💼 Negocios                                         │
│ ☐ Soporte prioritario                               │
│ ☐ Línea telefónica adicional                        │
│                                                     │
│ Canal de captación *                                │
│ [Dropdown: OFICINA, WHATSAPP, ...]                 │
│                                                     │
│ Detalle de origen (opcional)                        │
│ [Texto: Contexto de campaña o referencia]          │
└─────────────────────────────────────────────────────┘
```

#### Panel de Administración

Nueva sección en `/dashboard/admin/productos-adicionales`:

- Lista de productos con filtros por categoría
- CRUD completo (crear, editar, activar/desactivar, eliminar)
- Ordenamiento manual por categoría

### 5. Flujo de Datos

1. Admin crea/activa productos en catálogo
2. Portal carga productos activos al montar expediente
3. Usuario selecciona plan + productos adicionales
4. API guarda `interestedPlanId` + `additionalProductIds`
5. Listados y reportes incluyen productos adicionales

---

## Consideraciones

### Multi-tenant

- Productos son por tenant (aislamiento por schema)
- Seed inicial creatodos por migration

### Backward Compatibility

- `additionalProductIds` es opcional (null/array vacío)
- Expedientes existentes no se afectan

### Performance

- Productos adicionales son pocos (~10-20 por tenant)
- Carga en una query al montar página
- Sin paginación necesaria

---

## Fuera de Alcance

- Cantidad de cada producto (checkbox, no quantity)
- Precios de productos adicionales
- Inventario de productos
- Validación de stock

---

## Checklist de Implementación

1. [ ] Crear migración `additional_products` table
2. [ ] Crear enum `AdditionalProductCategory` en shared
3. [ ] Crear entity `AdditionalProduct` en API
4. [ ] Agregar columna `additionalProductIds` a `expediente_records`
5. [ ] Crear DTOs para CRUD de productos
6. [ ] Crear `AdditionalProductsModule` con controller/service
7. [ ] Seed inicial de productos por defecto
8. [ ] Actualizar UI de expedientes con checkboxes
9. [ ] Agregar sección admin para gestión de productos
10. [ ] Actualizar tipos en `api-client.ts` del portal

---

## Aprobación

¿Este diseño cumple con los requisitos?
