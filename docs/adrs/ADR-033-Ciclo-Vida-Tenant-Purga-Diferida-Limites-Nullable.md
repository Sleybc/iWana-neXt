# ADR-033 — Ciclo de vida tenant con purga diferida y límites nullable

**Estado:** Aprobado  
**Fecha:** 2026-04-30  
**Tipo:** Backend / Datos / Operación  
**Modo activo:** Architect  
**Módulo:** MOD01 — Tenants / Plataforma

---

## Contexto

El cierre correctivo de MOD01 dejó tres decisiones residuales en el flujo de creación y administración de empresas:

1. La semántica `maxSubscribers = 0` mezclaba “sin límite” con “bloqueado”.
2. `DELETE /tenants/:id` ya no debía ejecutar `DROP SCHEMA`, pero faltaba una política de purga física diferida.
3. El flujo crítico necesitaba un E2E Playwright real, ejecutable contra infraestructura local completa.

Las restricciones vigentes se mantienen: PostgreSQL multi-tenant por schema, NestJS + TypeORM con migraciones versionadas, BullMQ para procesos asincrónicos, auditoría append-only y cero secretos/PII en código o pruebas.

---

## Decisión

Se adopta el cierre en tres fases:

| Fase | Decisión | Implementación |
|---|---|---|
| Fase 1 — Límites nullable | `maxSubscribers: null` significa sin límite; `0` significa bloquear nuevos suscriptores; `> 0` significa límite explícito. | Migración pública reversible, DTO/API `number | null`, UI con campo vacío para sin límite. |
| Fase 2 — Purga diferida | `INACTIVE` conserva su sentido de contrato finalizado. Se introduce `MARKED_FOR_DELETION` para eliminación solicitada y retenida. | `DELETE` marca `MARKED_FOR_DELETION` + `deletedAt`; worker BullMQ purga schemas vencida la retención. |
| Fase 3 — E2E real | El happy path de creación de empresa debe existir sin mocks para validación local/CI con infraestructura completa. | Playwright usa credenciales E2E por variables de entorno y omite ejecución si no están configuradas. |

La retención operativa por defecto para purga física es **30 días**, configurable con `TENANT_PURGE_RETENTION_DAYS`. La purga se ejecuta por batch con `TENANT_PURGE_BATCH_SIZE` y usa advisory lock por schema.

---

## Consecuencias

### Positivas

- `INACTIVE` deja de representar eliminación, reduciendo ambigüedad en soporte y auditoría.
- `MARKED_FOR_DELETION` permite ventana de restauración antes del borrado físico.
- La purga es idempotente y segura: valida `schemaName`, usa lock y registra eventos en `platform_audit_logs`.
- La UI ya no obliga a usar `0` para “sin límite”.
- El E2E real queda listo para ejecutarse cuando `pnpm dev` levante API, worker, PostgreSQL, Redis y web.

### Costos y tradeoffs

- Cambia la semántica de datos existentes: la migración transforma `max_subscribers = 0` en `NULL`.
- La restauración de un tenant marcado se hace reactivando antes de la ventana de purga; después de la purga no hay recuperación desde la app.
- El E2E real depende de variables `E2E_PLATFORM_EMAIL` y `E2E_PLATFORM_PASSWORD` y de infraestructura local saludable.

### Riesgos aceptados

- El borrado físico elimina el schema y el registro `public.tenants`; la auditoría append-only conserva el evento operativo.
- La política de 30 días es baseline de plataforma y puede ajustarse por entorno sin cambiar código.

---

## Referencias

- [ADR-018-Ciclo-Vida-Tenant.md](ADR-018-Ciclo-Vida-Tenant.md)
- [ADR-017-Provisioning-Schema-BullMQ.md](ADR-017-Provisioning-Schema-BullMQ.md)
- [Stack_Tecnologico.md](../prds/Stack_Tecnologico.md)
- [INFORME-MOD01-AUDIT-CREACION-EMPRESAS-v1.0.md](../informes/INFORME-MOD01-AUDIT-CREACION-EMPRESAS-v1.0.md)