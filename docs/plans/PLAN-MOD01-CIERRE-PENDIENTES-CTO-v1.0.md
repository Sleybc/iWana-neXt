# PLAN-MOD01-CIERRE-PENDIENTES-CTO

**Versión:** 1.0  
**Estado:** Ejecutado  
**Fecha:** 2026-04-30  
**Modo activo:** Mixto  
**Módulo:** MOD01 — Tenants / Plataforma

## 1. Objetivo

Cerrar los tres pendientes de Architect/CTO registrados tras el sprint correctivo del sistema de creación de empresas: semántica de límites, purga física diferida y E2E Playwright real.

## 2. Fases

| Fase | Alcance | Entregables |
|---|---|---|
| Fase 1 — `maxSubscribers` nullable | Separar “sin límite” de “bloqueado”. | Migración 007, entidad/DTOs/API `number | null`, formularios web con blanco = sin límite. |
| Fase 2 — Purga física diferida | Separar `INACTIVE` de eliminación operativa. | `MARKED_FOR_DELETION`, worker `tenant-schema-purge`, scheduler diario, auditoría de purga. |
| Fase 3 — E2E real | Validar flujo con infraestructura completa. | `web-tenant-create-happy-path.spec.ts` sin mocks, gobernado por variables E2E. |

## 3. Criterios de salida

- `DELETE /tenants/:id` no borra schema inmediatamente.
- Tenants marcados para eliminación quedan bloqueados por middleware tenant-aware.
- El worker purga solo tenants vencidos, con `schemaName` válido y advisory lock.
- `maxSubscribers = null` es el contrato público de “sin límite”.
- Existe E2E real para login plataforma, creación, provisioning y acceso inicial.

## 4. Referencias

- [ADR-033-Ciclo-Vida-Tenant-Purga-Diferida-Limites-Nullable.md](../adrs/ADR-033-Ciclo-Vida-Tenant-Purga-Diferida-Limites-Nullable.md)
- [INFORME-MOD01-AUDIT-CREACION-EMPRESAS-v1.0.md](../informes/INFORME-MOD01-AUDIT-CREACION-EMPRESAS-v1.0.md)