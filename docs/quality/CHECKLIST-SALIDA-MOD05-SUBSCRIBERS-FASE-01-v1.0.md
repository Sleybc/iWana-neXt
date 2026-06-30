# CHECKLIST DE SALIDA — MOD05 CRM: Subscriber + Pipeline Consolidado — Fase 01

**Versión:** 1.0  
**Fecha:** 2026-04-16  
**Módulo:** MOD05-CRM-SUBSCRIBERS  
**Fase:** 01 — Backend

---

## 1. Código

- [x] Entity Subscriber completa con dos dimensiones (personType + customerSegment)
- [x] VatTreatmentService con 28 tests unitarios
- [x] SubscriberStatusTransitionService con 31 tests unitarios
- [x] SubscribersService CRUD + cifrado PII + búsqueda con 28 tests
- [x] SubscribersController con 8 endpoints REST + Swagger (16 tests)
- [x] DTOs con validación Zod discriminada por personType
- [x] SubscriberCreationService con descifrado PII del expediente (24 tests)
- [x] Evento SubscriberCreated emitido vía EventEmitter2
- [x] AuditService inyectado en SubscribersService (CREATE, UPDATE, DELETE)
- [x] AuditService inyectado en SubscriberCreationService (creación automática)
- [x] SubscribersModule registrado en CrmModule
- [x] No hay imports circulares entre bounded contexts
- [x] No hay acceso directo a tablas de otros módulos

## 2. Base de datos

- [x] Migración 012 (tabla subscribers) — reversible
- [x] Migración 013 (consolidación pipeline) — documentada como no reversible automática
- [x] Migración 014 (columnas hash para búsqueda determinista) — reversible
- [x] Migraciones registradas en runner.ts
- [x] Índices compuestos creados
- [x] Constraint CHECK para campos obligatorios según personType
- [x] Unique index para user_id (parcial)
- [x] Índices parciales para hash columns (WHERE IS NOT NULL)

## 3. Seguridad

- [x] PII cifrado con AES-256-GCM (mismo formato que ExpedienteService)
- [x] Sin PII en texto plano en logs
- [x] Sin PII en audit trail (solo campos no sensibles)
- [x] RBAC en todos los endpoints (@Roles con UserRole.\*)
- [x] Zod validation en boundaries externos
- [x] Multi-tenant: todas las operaciones usan runInTenantSchema
- [x] No hay synchronize: true en producción

## 4. Tests

- [x] 127 tests unitarios pasando (100%)
- [x] Cobertura ≥ 80% en módulos core del subscriber
- [x] Typecheck limpio (tsc --noEmit)
- [x] No hay tests con datos reales ni credenciales

## 5. Documentación

- [x] PRD del módulo (PRD-MOD05-CRM-SUBSCRIBERS-v1.0.md)
- [x] Prompt de ejecución (PROMPT-MOD05-SUBSCRIBERS-FASE-01-v1.0.md)
- [x] ADR-025 (modelo de dos dimensiones)
- [x] ADR-026 (consolidación pipeline 8 estados)
- [x] Informe de fase (INFORME-MOD05-SUBSCRIBERS-FASE-01-v1.0.md)
- [x] Este checklist de salida

## 6. Pipeline CRM

- [x] ExpedienteStatus consolidado a 8 estados
- [x] StatusTransitionService actualizado
- [x] Frontend protegido con LEGACY_STATUS_MAP + getStatusMeta()
- [x] Tests de expedientes actualizados para 8 estados
- [x] Migración de estados legacy documentada

## 7. Criterios de aceptación

- [x] CA-SUB-01 a CA-SUB-18: 18/18 cumplidos

---

**Resultado:** ✅ FASE 01 COMPLETADA — Lista para revisión y merge.
