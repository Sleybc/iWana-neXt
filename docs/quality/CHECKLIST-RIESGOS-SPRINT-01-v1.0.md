# Checklist de Riesgos — Sprint 1

## iWana neXt Platform

**Fecha:** 2026-03-08  
**Sprint:** 1 (Auth + Tenant + Audit)  
**Tipo:** Registro de riesgos técnicos identificados

---

## Riesgos Identificados

| #   | Riesgo                                       | Severidad | Ubicación                       | Mitigación requerida                                                                                                                                                                                     |
| --- | -------------------------------------------- | --------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **DDL transaccional en tenant_template.sql** | CRÍTICA   | `packages/database/migrations/` | El script debe ejecutarse en transacción BEGIN/ROLLBACK explícita. Worker debe actualizar `status=PROVISIONING_FAILED` si falla.                                                                         |
| R2  | **pgBouncer + SET search_path**              | ALTA      | `apps/api/src/middleware/`      | En modo transaction pooling, SET search*path NO persiste entre transacciones. TenantMiddleware debe usar `SET LOCAL search_path = 'tenant*<slug>'` en cada transacción, no confiar en conexión del pool. |
| R3  | **AsyncLocalStorage y BullMQ workers**       | ALTA      | `apps/worker/src/`              | Los workers BullMQ corren en contextos async separados. TenantContext via AsyncLocalStorage NO se propaga automáticamente. Workers deben setear su propio context al inicio de cada job.                 |

---

## Detalle de Riesgos

### R1: DDL Transaccional

**Problema:** Si `tenant_template.sql` falla a mitad de ejecución, el schema puede quedar en estado corrupto.

**Solución requerida:**

- Envolver todo el DDL en `BEGIN` ... `ROLLBACK` / `COMMIT`
- El `TenantProvisioningService` debe capturar errores y actualizar status a `PROVISIONING_FAILED`
- Agregar logging de cada paso del DDL para trazabilidad

**Referencia:** ADR-017, tarea D1 del Sprint 1

---

### R2: pgBouncer + search_path

**Problema:** En transaction pooling mode, `SET search_path` no persiste entre transacciones.

**Solución requerida:**

- `TenantMiddleware` debe ejecutar `SET LOCAL search_path = 'tenant_<slug>'` al inicio de cada request/transacción
- NO confiar en que la conexión del pool mantenga el valor entre transacciones
- Verificar con tests de aislamiento multi-tenant

**Referencia:** ADR-002, tarea F6 del Sprint 1

---

### R3: AsyncLocalStorage en BullMQ

**Problema:** Los jobs de BullMQ se ejecutan en procesos/threads separados. AsyncLocalStorage no se propaga automáticamente.

**Solución requerida:**

- Al inicio de cada job, obtener el `tenantId` de los datos del job (no del contexto de request)
- Setear `AsyncLocalStorage` manualmente dentro del handler del job
- Alternativa: pasar `tenantId` explícitamente a todos los servicios llamados desde workers

**Referencia:** Tarea F14, F23 del Sprint 1

---

## Estado de Revisión

| Riesgo | Revisado por | Fecha | Status       |
| ------ | ------------ | ----- | ------------ |
| R1     | -            | -     | ⬜ Pendiente |
| R2     | -            | -     | ⬜ Pendiente |
| R3     | -            | -     | ⬜ Pendiente |

---

_Documento generado por: AI-EM-ARCH (Engineering Manager + Architect)_
