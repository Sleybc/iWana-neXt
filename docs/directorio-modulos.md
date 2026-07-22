# Directorio de Módulos — iWana neXt

> Mapeo de módulos del backend a su nombre visible en el frontend.
> Actualizado: 2026-07-22

---

## Consola Platform (Web) — `apps/web`

### Barra lateral

| Nombre en UI | Ruta | Módulo Backend | Descripción |
|---|---|---|---|
| Centro de control | `/dashboard` | — (agregado dashboard) | Panel principal de métricas |
| Empresas | `/tenants` | `tenant` | Gestión de inquilinos multi-tenant |
| Usuarios internos | `/users` | `platform-users` | Usuarios de la plataforma |
| Auditoría | `/audit-logs` | `audit` | Visor de logs de auditoría |
| Plataforma | `/settings` | `configuration`, `platform-branding` | Configuración global y marca |

### Menú de usuario

| Nombre en UI | Ruta | Módulo Backend |
|---|---|---|
| Editar perfil | `/profile` | `auth` |
| Configuración | `/settings` | `configuration` |

### Auth

| Nombre en UI | Ruta | Módulo Backend |
|---|---|---|
| Iniciar sesión | `/auth/login` | `auth` |
| Verificar MFA | `/auth/mfa` | `auth` |
| Recuperar contraseña | `/auth/forgot-password` | `auth` |
| Cambiar contraseña | `/auth/change-password` | `auth` |

---

## Consola Portal (Tenant) — `apps/portal`

### Barra lateral — Menú principal

| Nombre en UI | Ruta | Módulo Backend | Descripción |
|---|---|---|---|
| Inicio | `/dashboard` | — (agregado dashboard) | Panel de inicio del tenant |
| Comercial | `/dashboard/commercial` | `commercial`, `taxation` | Gestión comercial y tributaria |
| CRM | `/dashboard/crm/expedientes` | `crm` (12 submódulos) | Clientes, oportunidades, contratos |
| Suscriptores | `/dashboard/crm/subscribers` | `crm/subscribers` | Gestión de suscriptores |
| Programación | `/dashboard/scheduling` | `wfm` | Workforce management — agenda y visitas |
| Mesa de ayuda | `/dashboard/assurance` | `assurance` | PQRS y mesa de ayuda |
| Operaciones | `/dashboard/operations` | `tasks` | Tareas y operaciones de campo |
| Inventario | `/dashboard/inventory` | `inventory` | Gestión de inventario y categorías |

### Barra lateral — Administración

| Nombre en UI | Ruta | Módulo Backend | Descripción |
|---|---|---|---|
| Configuración | `/dashboard/settings` | `configuration`, `organization` | Ajustes del tenant |
| Usuarios | `/dashboard/users` | `users` | Usuarios del tenant |
| Reportes | _(futuro)_ | — | Reportes (no implementado) |

### Configuración — Subsecciones

| Nombre en UI | Ruta | Módulo Backend |
|---|---|---|
| Identidad visual | `/dashboard/settings/branding` | `platform-branding` |
| Control de acceso | `/dashboard/settings/access` | `access-control` |
| Calendario | `/dashboard/settings/calendar` | `configuration` |
| Operaciones de campo | `/dashboard/settings/field-operations` | `wfm` |
| Organización | `/dashboard/settings/organization` | `organization` |
| Seguridad | `/dashboard/settings/security` | `access-control` |

### Menú de usuario

| Nombre en UI | Ruta | Módulo Backend |
|---|---|---|
| Mi perfil | `/dashboard/profile` | `auth` |
| Configuración | `/dashboard/settings` | `configuration` |

### Auth

| Nombre en UI | Ruta | Módulo Backend |
|---|---|---|
| Iniciar sesión | `/auth/login` | `auth` |
| Verificar MFA | `/auth/mfa` | `auth` |
| Recuperar contraseña | `/auth/forgot-password` | `auth` |
| Cambiar contraseña | `/auth/change-password` | `auth` |
| Restablecer contraseña | `/auth/reset-password` | `auth` |
| Verificar correo | `/auth/verify-email` | `auth` |

---

## Módulos Backend sin UI directa

| Módulo Backend | Propósito |
|---|---|
| `health` | Health checks de la API |
| `mailer` | Envío de correos transaccionales |
| `media` | Gestión de archivos e imágenes |
| `parties` | Partes y terceros (personas/empresas) |
| `redis` | Conexión Redis / BullMQ |
| `search` + `search-queue` | Búsqueda global y cola de indexación |

---

## CRM — Submódulos

| Submódulo | Ruta en Portal | Descripción |
|---|---|---|
| `attributions` | — (backend) | Atribuciones comerciales |
| `contacts` | — (backend) | Contactos de clientes |
| `contracts` | — (backend) | Contratos comerciales |
| `expedientes` | `/dashboard/crm/expedientes` | Expedientes de clientes |
| `habeas-data` | — (backend) | Autorizaciones de datos |
| `opportunities` | — (backend) | Oportunidades de venta |
| `potentials` | — (backend) | Clientes potenciales |
| `prospects` | — (backend) | Prospectos comerciales |
| `quotes` | — (backend) | Cotizaciones |
| `responsibilities` | — (backend) | Responsabilidades asignadas |
| `reviews` | — (backend) | Revisiones / calificaciones |
| `subscribers` | `/dashboard/crm/subscribers` | Suscriptores del servicio |

---

## Resumen

| Consola | Módulos en UI | Rutas totales |
|---|---|---|
| Platform (Web) | 5 módulos + auth | ~12 rutas |
| Portal (Tenant) | 8 módulos + admin + auth | ~31 rutas |
| Backend sin UI | 6 módulos | — |
| CRM submódulos | 12 (2 con UI propia) | — |
| **Total módulos backend** | **22 dominios** | **34 archivos `.module.ts`** |
