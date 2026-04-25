# ADR-017 — Provisioning de Schema PostgreSQL vía BullMQ Worker

> **Estado:** Aprobado
> **Fecha:** 2026-03-07
> **Tipo:** Backend / Arquitectura asíncrona
> **Autores:** AI-ARCH (Architect Software), AI-EM (Engineering Manager)
> **Revisado y aprobado por:** CTO — 2026-03-15

---

## Contexto

Al crear un nuevo tenant en iWana neXt, se debe generar un schema PostgreSQL exclusivo con todas sus tablas (`users`, `refresh_tokens`, `audit_logs`). Esta operación DDL puede tardar varios segundos y puede fallar por problemas de conectividad, recursos o errores en el template SQL.

Ejecutar esta operación de forma síncrona dentro de un request HTTP introduce riesgos reales:
- Timeout del cliente HTTP antes de que el DDL termine.
- El API queda bloqueado durante la duración del DDL.
- Un error a mitad del DDL deja el tenant en estado indeterminado sin capacidad de reintento automático.

La arquitectura del monorepo ya separa `@iwana/api` (produce jobs) de `@iwana/worker` (consume jobs) sobre BullMQ + Redis, lo que ofrece un mecanismo natural de desacoplamiento para operaciones pesadas o inestables.

---

## Decisión

Usar **BullMQ** para encolar el job de provisioning en `@iwana/api` y consumirlo en `@iwana/worker`.

El flujo completo es:

1. `POST /api/v1/tenants` → `TenantService` crea el registro en `public.tenants` con `status: PROVISIONING`.
2. `TenantService` encola el job `tenant-provisioning` en BullMQ con el `tenantId` y `schemaName`.
3. El API responde **HTTP 201** inmediatamente con el tenant en estado `PROVISIONING`.
4. `TenantProvisioningProcessor` en `@iwana/worker` consume el job, ejecuta el DDL desde `tenant_template.sql` dentro de una transacción, y llama a `TenantSeedService` para crear el ADMIN inicial.
5. Al completar sin error, el processor actualiza el estado del tenant a `ACTIVE`.
6. Si hay error, el job entra en el flujo de reintentos de BullMQ (hasta 3 intentos con backoff exponencial). Agotados los reintentos, el estado del tenant se actualiza a `PROVISIONING_FAILED`.

---

## Alternativas Consideradas

### 1. Síncrono en el API
Ejecutar el DDL directamente en `TenantService` durante el request HTTP.

- **Descartada.** Bloquea el request por varios segundos. Riesgo real de timeout en clientes HTTP, load balancers y proxies inversos. No hay mecanismo de reintento automático si falla a mitad del DDL.

### 2. Migrations TypeORM por tenant en tiempo de ejecución
Usar `DataSource.runMigrations()` con un `DataSource` dinámico por tenant.

- **Descartada.** TypeORM no soporta nativamente la creación dinámica de schemas en runtime con el mismo patrón de migraciones. Requeriría instanciar un `DataSource` por tenant en cada provisioning, lo que introduce complejidad de lifecycle de conexiones y es difícil de testear. El template SQL es más explícito y controlable.

### 3. BullMQ (elegida)
Encolar el job desde el API y consumirlo en el worker.

- **Aceptada.** Asincrónico con respuesta HTTP inmediata. Reintentos automáticos con backoff exponencial configurable. Estado del tenant observable desde el plano de control. Aislamiento completo del DDL en el worker. Patrón consistente con la arquitectura del monorepo.

---

## Consecuencias

### Positivas
- El API no bloquea en operaciones DDL largas.
- El worker puede reintentar el provisioning en caso de fallo transitorio (hasta 3 veces con backoff exponencial).
- El estado del tenant es observable (`PROVISIONING` / `ACTIVE` / `PROVISIONING_FAILED`) desde cualquier client de plataforma.
- El aislamiento del DDL en el worker previene que errores de provisioning afecten la disponibilidad del API.
- La separación de responsabilidades refuerza el boundary entre plano de control (`@iwana/api`) y plano de ejecución (`@iwana/worker`).

### Restricciones introducidas
- Redis debe estar operativo para que BullMQ funcione. Una caída de Redis impide encolar nuevos jobs de provisioning (aunque los tenants existentes siguen operando).
- Existe una ventana de latencia desde la creación del tenant hasta que esté activo (segundos a minutos según carga del worker).
- El cliente debe sondear el estado del tenant o implementar un webhook para conocer el momento exacto de activación.

---

## Implementación

| Componente | Ubicación |
|-----------|-----------|
| Constante de la cola | `packages/shared/src/constants/queue-names.ts` → `TENANT_PROVISIONING_QUEUE = 'tenant-provisioning'` |
| Productor (API) | `apps/api/src/modules/tenant/tenant.service.ts` |
| Consumidor (worker) | `apps/worker/src/processors/tenant-provisioning.processor.ts` |
| Seed del tenant | `apps/worker/src/services/tenant-seed.service.ts` |
| Template DDL | `packages/database/src/templates/tenant_template.sql` |
| Módulo del worker | `apps/worker/src/worker.module.ts` |

El processor marca errores de datos (tenant inexistente, `schemaName` inválido) como `UnrecoverableError` de BullMQ para evitar reintentos innecesarios cuando el problema es estructural, no transitorio.

---

## Referencias

- [PRD-MOD01-Auth-Tenant-Audit-v1.0](../prds/PRD-MOD01-Auth-Tenant-Audit-v1.0.md) §4 RF-TNT-03
- [ADR-018 Ciclo de Vida del Tenant](./ADR-018-Ciclo-Vida-Tenant.md)
- [INFORME-MOD01-SPRINT-01-v1.0](../informes/INFORME-MOD01-SPRINT-01-v1.0.md) §2.8, §2.17
- [RUNBOOK-TENANT-PROVISIONING-v1.0](../runbooks/RUNBOOK-TENANT-PROVISIONING-v1.0.md)
