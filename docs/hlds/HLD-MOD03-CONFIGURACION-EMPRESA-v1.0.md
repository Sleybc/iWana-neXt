# HLD - MOD03 Configuracion Empresarial

**Version:** 1.0  
**Estado:** En revision  
**Fecha:** 2026-03-17  
**Modo activo:** Architect  
**Autor:** AI-EM-ARCH  
**PRD de referencia:** docs/prds/PRD-MOD03-CONFIGURACION-EMPRESA-v1.0.md  
**Artefactos relacionados:** docs/prds/PRD-MOD02-DASHBOARD-EMPRESA-v1.0.md, docs/hlds/HLD-MOD02-DASHBOARD-EMPRESA-v1.0.md  
**Plan relacionado:** docs/plans/PLAN-MOD03-CONFIGURACION-EMPRESA-BACKLOG-v1.0.md  
**Prompt relacionado:** docs/prompts/PROMPT-MOD03-CONFIGURACION-EMPRESA-FASE-01-v1.0.md  
**Informe relacionado:** docs/informes/INFORME-MOD03-DEFINICION-v1.0.md  
**ADRs aplicables:** ADR-016, ADR-018, ADR-019, ADR-022, ADR-023

---

## 1. Contexto de negocio

MOD03 aterriza la capacidad de Configuracion Empresarial para una empresa ya creada y autenticada en apps/portal.

La necesidad no es crear un nuevo modulo de plataforma, sino cerrar la brecha entre:

- dashboard empresarial ya operativo en MOD02,
- contratos self-service del tenant disponibles para lectura,
- actualizacion minima de settings ya existente en backend,
- y una pantalla de configuracion que hoy sigue como placeholder.

El resultado esperado es una vista y un flujo de configuracion utiles para la operacion diaria del tenant, con escritura controlada, auditoria y ownership claro por campo.

---

## 2. Bounded contexts afectados

| Bounded context | Impacto | Regla |
| --- | --- | --- |
| TenantModule | Principal | Ownership del modulo. Expone contratos self-service y aplica reglas de escritura |
| AuditModule | Secundario | Registra cambios de configuracion con oldValue/newValue |
| AuthModule | Secundario | Aporta autenticacion, rol y tenant resuelto para enforcement |
| apps/portal | Principal | Implementa UI, validaciones de formulario y consumo de contratos self-service |
| apps/web | Referencia externa | Permanece fuera del flujo operativo del tenant |

### Boundary explicito

- No se crea bounded context nuevo.
- No se permite acceso desde apps/portal a endpoints globales `tenants/:id` como camino principal.
- No se permite editar desde portal campos cuyo ownership sea platform-managed.

---

## 3. Componentes principales

### Backend

- `TenantController`: superficie HTTP self-service del tenant autenticado.
- `TenantService`: orquestacion de lectura/escritura de perfil empresarial y settings operativos.
- DTOs self-service de perfil y settings: separan contratos del tenant respecto a contratos de plataforma.
- `AuditService` o servicio de query/auditoria ya exportado: persistencia de evidencias de cambio.

### Frontend

- Ruta protegida `apps/portal/src/app/dashboard/settings/page.tsx`.
- Formularios por seccion para Perfil Empresarial, Configuracion Operativa y Seguridad.
- Cliente tipado en `apps/portal/src/lib/api-client.ts` para lectura y escritura self-service.
- Componentes reutilizables de feedback: loading, error, success, dirty state.

### Flujo tecnico de alto nivel

```mermaid
flowchart LR
    A[Usuario tenant autenticado] --> B[/dashboard/settings]
    B --> C[AuthProvider]
    C --> D[api-client portal]
    D --> E[GET /tenants/me]
    D --> F[GET /tenants/me/settings]
    D --> G[PATCH /tenants/me/profile]
    D --> H[PATCH /tenants/me/settings]
    E --> I[TenantController]
    F --> I
    G --> I
    H --> I
    I --> J[TenantService]
    J --> K[(public.tenants)]
    J --> L[(settings JSONB)]
    J --> M[AuditService]
    M --> N[(audit_logs)]
```

---

## 4. Contratos definitivos propuestos

### 4.1 Lectura

| Metodo | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/api/v1/tenants/me` | Perfil empresarial base del tenant autenticado |
| `GET` | `/api/v1/tenants/me/settings` | Configuracion operativa normalizada del tenant |
| `GET` | `/api/v1/tenants/me/summary` | Alertas y resumen consumibles por dashboard y settings |

### 4.2 Escritura

| Metodo | Ruta | Uso |
| --- | --- | --- |
| `PATCH` | `/api/v1/tenants/me/profile` | Actualizar campos empresariales tenant-managed |
| `PATCH` | `/api/v1/tenants/me/settings` | Actualizar configuracion operativa tenant-managed |

### 4.3 Regla de diseño contractual

- `profile` y `settings` se separan para no mezclar datos de `public.tenants` con JSONB operativo en el mismo payload.
- `PATCH /tenants/me/settings` mantiene merge parcial y normalizacion de defaults.
- `PATCH /tenants/me/profile` debe exponer solo campos self-service aprobados.
- Los contratos de escritura deben rechazar silencios peligrosos: si se intenta escribir un campo platform-managed, el backend responde error de validacion o forbidden segun el caso.

---

## 5. Matriz de ownership por campo

### 5.1 Perfil empresarial

| Campo | Fuente | Ownership | Exposicion UI |
| --- | --- | --- | --- |
| `name` | `public.tenants` | tenant-managed condicionado | Editable si no rompe naming administrativo global |
| `slug` | `public.tenants` | platform-managed | Solo lectura |
| `status` | `public.tenants` | platform-managed | Solo lectura |
| `contactEmail` | `public.tenants` | tenant-managed | Editable |
| `legalName` | `public.tenants` | tenant-managed | Editable |
| `nit` | `public.tenants` | tenant-managed | Editable con validacion de dominio |
| `city` | `public.tenants` | tenant-managed | Editable |
| `department` | `public.tenants` | tenant-managed | Editable |
| `countryCode` | `public.tenants` | tenant-managed | Editable |
| `phone` | `public.tenants` | tenant-managed | Editable |
| `website` | `public.tenants` | tenant-managed | Editable |
| `createdAt` | `public.tenants` | platform-managed | Solo lectura |

### 5.2 Configuracion operativa

| Campo | Fuente | Ownership | Exposicion UI |
| --- | --- | --- | --- |
| `timezone` | `settings JSONB` | tenant-managed | Editable |
| `currency` | `settings JSONB` | tenant-managed | Editable |
| `language` | `settings JSONB` | tenant-managed | Editable |
| `country` | `settings JSONB` | tenant-managed | Editable |
| `features.mfa_required_all` | `settings JSONB` | tenant-managed | Editable |
| `features.billing` | `settings JSONB` | platform-managed hasta confirmacion | Solo lectura |
| `maxSubscribers` | contrato tecnico actual | platform-managed hasta confirmacion | Oculto o solo lectura |

### 5.3 Decision arquitectonica asociada

No se habilita en MVP escritura desde portal para `features.billing` ni `maxSubscribers`. Ambos quedan fuera de escritura hasta validacion explicita de negocio/plataforma. Esta decision evita mezclar configuracion operativa con licenciamiento o limites comerciales.

---

## 6. Componentes y responsabilidades por capa

### Backend

#### `TenantController`

- Mantiene rutas `me` ya existentes.
- Agrega `PATCH /me/profile`.
- Mantiene `PATCH /me/settings` con filtrado de claves editables.

#### `TenantService`

- Expone `getTenantSelf()` y `getTenantSelfSettings()`.
- Agrega `updateTenantSelfProfile()`.
- Refuerza `updateSettings()` para rechazar claves platform-managed.
- Registra auditoria para perfil y settings como operaciones distintas.

#### DTOs sugeridos

- `TenantSelfProfileResponseDto`
- `UpdateTenantSelfProfileDto`
- `UpdateTenantSettingsDto` refinado con enforcement de ownership

### Frontend

#### Ruta protegida de settings

- Consume lectura paralela de perfil y settings.
- Renderiza secciones independientes para evitar mezclar validaciones.
- Hace submit independiente por bloque para reducir riesgo de colisiones funcionales.

#### `api-client`

- `tenantSelfApi.getProfile()` o reutilizacion explícita de `getMe()`.
- `tenantSelfApi.updateProfile()`.
- `tenantSelfApi.getSettings()`.
- `tenantSelfApi.updateSettings()`.

#### Formularios

- Perfil Empresarial: datos legales y de contacto.
- Configuracion Operativa: timezone, currency, language, country.
- Seguridad: `mfa_required_all` editable y flags platform-managed en solo lectura.

---

## 7. Consideraciones de seguridad, despliegue y observabilidad

### Seguridad

- JWT + TenantMiddleware obligatorios en toda lectura/escritura.
- Solo `ADMIN` puede escribir.
- Validacion estricta de payloads y formato de campos legales/operativos.
- Sin PII real, secretos o tokens en logs, fixtures o docs.

### Multi-tenancy

- Toda operacion se resuelve por tenant autenticado.
- No se acepta `tenantId` del cliente para resolver escrituras.
- No se exponen `schemaName` ni controles internos como inputs editables.

### Observabilidad

- Auditar cambios con actor, entidad, oldValue y newValue.
- Mantener errores de guardado trazables por request sin fuga de payload sensible.

### Despliegue

- No requiere cambio de stack ni infraestructura.
- No requiere migracion nueva si se limita a contratos y campos existentes.
- Si al implementar perfil empresarial faltan columnas o constraints, esa desviacion debe documentarse y escalarse antes de ejecutar cambios estructurales.

---

## 8. Riesgos tecnicos

| Riesgo | Severidad | Mitigacion |
| --- | --- | --- |
| Mezclar campos platform-managed en formularios del tenant | Alta | Aplicar matriz de ownership en DTO, servicio y UI |
| Escritura de perfil y settings en un solo payload ambiguo | Media | Separar endpoints y formularios por agregado |
| Validacion insuficiente de NIT y datos legales | Media | Implementar reglas de validacion antes de abrir escritura |
| Divergencia entre dashboard y settings sobre alertas/fuentes | Baja | Reutilizar `me/summary` como fuente comun cuando aplique |

### Requiere ADR

No, siempre que se mantenga esta arquitectura dentro de TenantModule y no cambie el ownership aprobado de campos sensibles. Si se propone volver editable desde portal un campo platform-managed, se debe revaluar y escalar.
