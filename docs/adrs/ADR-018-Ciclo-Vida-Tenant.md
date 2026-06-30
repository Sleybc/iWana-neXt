# ADR-018 — Ciclo de Vida del Tenant

> **Estado:** Aprobado
> **Fecha:** 2026-03-07
> **Tipo:** Backend / Dominio
> **Autores:** AI-ARCH (Architect Software), AI-EM (Engineering Manager)
> **Revisado y aprobado por:** CTO — 2026-03-15

---

## Contexto

iWana neXt es una plataforma multi-tenant para ISPs colombianos. Cada tenant representa una empresa operadora con su propio schema PostgreSQL, usuarios, contratos y datos de facturación.

La plataforma necesita controlar con precisión el acceso de los tenants en diferentes estados operativos:
- **Durante provisioning**: el schema aún no existe; las peticiones de usuarios no deben llegar al worker ni al schema.
- **En operación normal**: el tenant está activo y sus usuarios pueden operar.
- **Cuando está suspendido**: por impago, incumplimiento contractual u orden administrativa; los usuarios no deben poder acceder aunque tengan JWT válidos.
- **Al finalizar el contrato**: el tenant se desactiva definitivamente; sus datos se conservan por requerimientos legales (Ley 1581 Colombia, registros DIAN) pero el acceso se bloquea.
- **En caso de fallo de provisioning**: el DDL no se completó; el tenant no tiene schema operativo.

Sin una máquina de estados explícita, el código de cada módulo tendría que interpretar el estado del tenant de manera inconsistente, lo que abre brechas de seguridad y errores de acceso.

---

## Decisión

Definir un **ciclo de vida formal** para el tenant con cinco estados, modelados como enum `TenantStatus` en `packages/database/src/entities/tenant.entity.ts`:

```
PROVISIONING → ACTIVE
PROVISIONING → PROVISIONING_FAILED
ACTIVE → SUSPENDED
SUSPENDED → ACTIVE
ACTIVE → INACTIVE
SUSPENDED → INACTIVE
```

### Estados

| Estado | Descripción | Quién lo establece |
|--------|-------------|-------------------|
| `PROVISIONING` | Tenant creado en `public.tenants`; schema PostgreSQL aún no existe | Sistema (al crear tenant) |
| `ACTIVE` | Schema aprovisionado, seed completado, tenant operativo | Worker (al completar DDL + seed) |
| `PROVISIONING_FAILED` | El worker agotó los reintentos sin completar el DDL | Worker (al agotar reintentos BullMQ) |
| `SUSPENDED` | Acceso bloqueado temporalmente; schema y datos preservados | `SYSTEM_ADMIN` |
| `INACTIVE` | Contrato finalizado; acceso bloqueado permanentemente; datos retenidos por obligación legal | `SYSTEM_ADMIN` |

### Transiciones válidas

| Origen | Destino | Condición | Actor |
|--------|---------|-----------|-------|
| `PROVISIONING` | `ACTIVE` | DDL y seed completados sin error | Worker BullMQ |
| `PROVISIONING` | `PROVISIONING_FAILED` | Job agotó reintentos (máximo 3) | Worker BullMQ |
| `PROVISIONING_FAILED` | `PROVISIONING` | SYSTEM_ADMIN solicita reintento via `PATCH /api/v1/tenants/:id/retry-provisioning` | SYSTEM_ADMIN |
| `ACTIVE` | `SUSPENDED` | Orden administrativa o de negocio | SYSTEM_ADMIN |
| `SUSPENDED` | `ACTIVE` | Levantamiento de suspensión | SYSTEM_ADMIN |
| `ACTIVE` | `INACTIVE` | Cancelación de contrato | SYSTEM_ADMIN |
| `SUSPENDED` | `INACTIVE` | Cancelación de contrato de tenant suspendido | SYSTEM_ADMIN |

Las transiciones no listadas son **inválidas** y deben ser rechazadas con `BadRequestException` por `TenantService`.

---

## Consecuencias

### Control de acceso en middleware

`TenantMiddleware` evalúa el estado del tenant en cada request autenticado. El comportamiento por estado es:

| Estado del tenant | Comportamiento en TenantMiddleware |
|------------------|------------------------------------|
| `ACTIVE` | Permite el request; inicializa `TenantContext` |
| `PROVISIONING` | Responde `403 Forbidden` — schema no disponible |
| `PROVISIONING_FAILED` | Responde `403 Forbidden` — schema no disponible |
| `SUSPENDED` | Responde `403 Forbidden` — acceso suspendido |
| `INACTIVE` | Responde `403 Forbidden` — contrato finalizado |

El bloqueo se aplica **antes de llegar al controller**, garantizando que ningún módulo de negocio pueda operar sobre un tenant no activo, independientemente de la implementación interna de cada módulo.

### Cache Redis

`TenantService` cachea el tenant por `id` y `slug` en Redis con TTL de 5 minutos. Las operaciones de `suspend` y `activate` invalidan la cache inmediatamente para que el bloqueo o la reactivación tengan efecto desde el siguiente request, sin esperar a que expire el TTL.

### Positivas
- Un único punto de control para el acceso por tenant (middleware), sin lógica duplicada en controllers.
- Las transiciones de estado son explícitas, auditables y verificables con tests unitarios.
- La suspensión es reversible: los datos y el schema se preservan intactos.
- Los estados `INACTIVE` y `PROVISIONING_FAILED` son terminales unidireccionales (salvo reintento de provisioning), lo que simplifica el modelo mental del operador.

### Restricciones
- Ningún proceso interno puede alterar el estado del tenant fuera de `TenantService` — toda mutación de estado debe pasar por el servicio para garantizar la invalidación de cache y el registro de audit.
- Los clientes del API que usen JWT de un tenant suspendido recibirán `403`, no `401`, para diferenciar claramente un problema de autorización de negocio de un problema de credenciales expiradas.

---

## Implementación

| Componente | Ubicación |
|-----------|-----------|
| Enum `TenantStatus` | `packages/database/src/entities/tenant.entity.ts` |
| Validación de transiciones | `apps/api/src/modules/tenant/tenant.service.ts` |
| Bloqueo de acceso por estado | `apps/api/src/modules/tenant/tenant.middleware.ts` |
| Endpoints de lifecycle | `apps/api/src/modules/tenant/tenant.controller.ts` (`suspend`, `activate`, `retry-provisioning`) |
| Cache invalidation | `apps/api/src/modules/tenant/tenant.service.ts` (métodos `suspend`, `activate`) |

---

## Referencias

- [ADR-017 Provisioning Schema BullMQ](./ADR-017-Provisioning-Schema-BullMQ.md)
- [ADR-019 JWT RS256 + Refresh Token Rotation](./ADR-019-JWT-RS256-Refresh-Rotation.md)
- [PRD-MOD01-Auth-Tenant-Audit-v1.0](../prds/PRD-MOD01-Auth-Tenant-Audit-v1.0.md) §4 RF-TNT-01, RF-TNT-02
- [INFORME-MOD01-SPRINT-01-v1.0](../informes/INFORME-MOD01-SPRINT-01-v1.0.md) §2.13, D4, D11
