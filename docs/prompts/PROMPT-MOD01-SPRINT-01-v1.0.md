# PROMPT — Ejecucion de Fase: MOD01 Sprint 1

**Version:** 1.0
**Estado:** Generado — Listo para ejecucion
**Fecha:** 2026-03-12
**Generado por:** Engineering Manager (AI-EM-ARCH)

## Modulo

- Nombre: Auth + Tenant + Audit
- Codigo: MOD01
- Fase: Sprint 1 — Corte inicial DB + Tenant base
- Version: 1.0
- Fecha: 2026-03-12
- Generado por: Engineering Manager (AI-EM-ARCH)
- Nombre de archivo destino: `docs/prompts/PROMPT-MOD01-SPRINT-01-v1.0.md`

## Vinculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`
- Archivo destino: `docs/prompts/PROMPT-MOD01-SPRINT-01-v1.0.md`
- Convencion documental: `{TIPO}-{MODULO}-{FASE}-v{VERSION}.md`
- Politica de ejecucion: `docs/adrs/ADR-022-Politica-Ejecucion-Modular-Por-Fases.md`
- PRD base: `docs/prds/PRD-MOD01-DEFINICION-v1.1.md`
- PRD detallado: `docs/prds/PRD-MOD01-Auth-Tenant-Audit-v1.0.md`
- HLD base: `docs/hlds/HLD-MOD01-ARQUITECTURA-v1.0.md`
- Sprint plan: `docs/sprints/PLAN-MOD01-SPRINT-01-v1.0.md`
- Prompt arquitectonico origen: `docs/prompts/PROMPT-ARCHITECT-MOD01-Auth-Tenant-Audit.md`
- Riesgos obligatorios: `docs/quality/CHECKLIST-RIESGOS-SPRINT-01-v1.0.md`
- Informe previo de fase: `docs/informes/INFORME-MOD01-SCAFFOLD-v1.0.md`

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** dejar materializada la fundacion tecnica real de MOD01 para tenancy y persistencia, sobre el scaffold ya cerrado, sin abrir todavia el frente completo de autenticacion, MFA, auditoria avanzada ni frontend productivo.
- **Lo que si entra:** entities TypeORM, migracion inicial del schema publico, `tenant_template.sql` definitivo para schemas tenant, DataSource con resolucion de schema, `TenantMiddleware`, `TenantModule` con CRUD basico, pruebas unitarias e integracion minimas de tenancy.
- **Lo que no entra:** login, JWT, refresh token rotation, MFA, guards RBAC/ABAC completos, workers BullMQ operativos, AuditInterceptor, Swagger completo, pantalla de login final, checklist de cierre del modulo.

---

## 2. Artefactos de entrada obligatorios

- PRD del modulo: `docs/prds/PRD-MOD01-DEFINICION-v1.1.md`
- PRD detallado del modulo: `docs/prds/PRD-MOD01-Auth-Tenant-Audit-v1.0.md`
- HLD del modulo: `docs/hlds/HLD-MOD01-ARQUITECTURA-v1.0.md`
- ADRs aplicables: ADR-002, ADR-017, ADR-018, ADR-020, ADR-022
- Sprint plan aplicable: `docs/sprints/PLAN-MOD01-SPRINT-01-v1.0.md`
- Prompt arquitectonico origen: `docs/prompts/PROMPT-ARCHITECT-MOD01-Auth-Tenant-Audit.md`
- Riesgos tecnicos obligatorios: `docs/quality/CHECKLIST-RIESGOS-SPRINT-01-v1.0.md`
- Stack tecnologico: `docs/prds/Stack_Tecnologico.md`
- Artefactos faltantes detectados: checklist de salida a produccion de MOD01, informe vivo de Sprint 1 y documentacion puntual futura en `docs/database/` y `docs/security/`

---

## 3. Instrucciones para Sr. Dev Fullstack

### 3.1 Alcance tecnico obligatorio

Implementa exclusivamente el corte inicial de Sprint 1 enfocado en `DB + Tenant base`. El objetivo no es dejar MOD01 completo, sino habilitar el camino seguro para Auth y Audit en la siguiente iteracion.

### 3.2 Backend y base de datos

1. Crear en `packages/database/src/entities/` las entidades definidas por el HLD:
   - `tenant.entity.ts`
   - `platform-user.entity.ts`
   - `platform-audit-log.entity.ts`
   - `user.entity.ts`
   - `refresh-token.entity.ts`
   - `audit-log.entity.ts`
2. Respetar modelo, indices y restricciones del HLD. Si alguna parte del modelo no se usa aun en runtime, igual debe quedar tipada y compilando para evitar deuda estructural aguas abajo.
3. Crear en `packages/database/src/migrations/public/` la migracion inicial reversible para:
   - `public.tenants`
   - `public.platform_users`
   - `public.platform_audit_logs`
4. Convertir `packages/database/src/templates/tenant_template.sql` de placeholder a DDL real para:
   - `users`
   - `refresh_tokens`
   - `audit_logs`
5. Envolver el DDL del template en transaccion explicita. Si el DDL no puede quedar transaccional, detenerse y documentar bloqueo tecnico.
6. Configurar DataSource y resolucion de schema en API usando el contexto del request. La implementacion debe ser compatible con el HLD y no depender de valores hardcodeados.
7. Crear `TenantMiddleware` para resolver tenant desde el contexto autenticado y rechazar tenant invalido o suspendido.
8. Implementar `TenantModule` con CRUD basico de tenants suficiente para:
   - create
   - list
   - findOne
   - update
9. Integrar `TenantModule` en `apps/api/src/app.module.ts` sin abrir todavia los modulos de Auth ni Audit.
10. Si necesitas introducir servicios auxiliares o interfaces en `packages/shared`, mantenlos limitados a tenancy y respuestas base.

### 3.3 Restricciones de implementacion

1. No implementar endpoints de autenticacion en esta fase.
2. No implementar BullMQ workers productivos en esta fase. Si necesitas dejar contratos o stubs, deben ser minimos y sin logica de negocio.
3. No crear frontend funcional mas alla de lo estrictamente necesario para no romper compilacion.
4. No introducir accesos directos entre modulos ni atajos que rompan el modulith.
5. No hardcodear tenant ni schema; toda resolucion debe venir del contexto.
6. Comentar en espanol la logica no trivial de tenancy, DDL y resolucion de schema.

### 3.4 Validaciones y seguridad obligatorias

1. Validar boundaries externos con Zod donde aplique en el modulo tenant.
2. Mantener logs sin PII ni credenciales.
3. No almacenar secretos ni valores reales en archivos versionados.
4. Preparar la estructura para que `SYSTEM_ADMIN` opere sobre schema publico y tenancy sin romper el flujo futuro de Auth.

---

## 4. Restricciones no negociables

- No romper boundaries del modulith.
- No acceder a tablas de otro modulo directamente.
- No usar credenciales, PII ni tokens reales.
- No abrir el frente completo de Auth/MFA/Audit en este corte.
- No omitir pruebas del comportamiento multi-tenant minimo.
- No usar `SET search_path` persistente de conexion con pgBouncer en transaction pooling; la resolucion debe ser segura por request o transaccion.
- No dejar `tenant_template.sql` como placeholder al cerrar la fase.

---

## 5. Entregables tecnicos obligatorios

- Codigo backend de tenancy en `apps/api/src/`
- Entidades y migracion inicial en `packages/database/src/`
- `tenant_template.sql` definitivo y ejecutable
- Tests unitarios de `TenantService`
- Tests minimos de integracion o smoke test para resolucion de tenant y aislamiento basico
- Actualizacion de configuracion compartida solo si es necesaria para compilar o validar el nuevo codigo

---

## 6. Entregables documentales obligatorios

- Actualizar o crear como documento vivo `docs/informes/INFORME-MOD01-SPRINT-01-v1.0.md`
- Dejar evidencia minima de calidad en `docs/quality/` si se materializa prueba de riesgo tecnico
- Si aparece bloqueo tecnico, documentarlo con `docs/quality/TEMPLATE-DECISION-BLOQUEO-TECNICO.md`
- No abrir nuevos informes paralelos para esta misma fase

---

## 7. Criterios de aceptacion

| ID | Criterio | Trazabilidad |
| --- | --- | --- |
| CA-S1-001 | Las seis entidades objetivo compilan en TypeScript strict y reflejan los campos, enums e indices definidos por el HLD. | HLD Seccion 3 |
| CA-S1-002 | La migracion publica crea `public.tenants`, `public.platform_users` y `public.platform_audit_logs` y puede revertirse. | RF-TNT-01, ADR-018 |
| CA-S1-003 | `tenant_template.sql` deja de ser placeholder, crea tablas tenant y puede ejecutarse de forma transaccional. | RF-TNT-02, ADR-017, Riesgo R1 |
| CA-S1-004 | El DataSource acepta schema de tenant sin hardcode y puede usarse por request. | RF-TNT-03 |
| CA-S1-005 | `TenantMiddleware` rechaza tenant inexistente o invalido y bloquea tenant suspendido. | RF-TNT-03, RF-TNT-05, CA-M01-021, CA-M01-022 |
| CA-S1-006 | `TenantService` expone CRUD basico de tenants y sus pruebas unitarias pasan. | RF-TNT-01 |
| CA-S1-007 | Existe evidencia minima de aislamiento: dos tenants no comparten datos por error de schema routing. | RF-TNT-03, CA-M01-020 |
| CA-S1-008 | Ningun archivo nuevo introduce PII, secretos ni logs inseguros. | Reglas de seguridad del repo |

---

## 8. Criterio de stop/go

- **Detenerse inmediatamente si:**
  - no puedes probar que la resolucion de schema es segura con el pool vigente,
  - `tenant_template.sql` no puede ejecutarse de forma transaccional,
  - la implementacion requiere introducir BullMQ productivo o Auth completo para cerrar esta fase,
  - aparece una contradiccion real entre el HLD y el scaffold materializado.
- **Documentar causa en:** `docs/quality/TEMPLATE-DECISION-BLOQUEO-TECNICO.md`
- **Escalar a:** CTO
- **Recomendacion esperada:** bloquear el avance a Auth/MFA hasta resolver la base multi-tenant de forma segura.

---

## 9. Criterio de salida de la fase

- Backend validado: API compila con `TenantModule` integrado
- Base de datos validada: migracion publica ejecuta y revierte; template tenant deja de ser placeholder
- Multi-tenancy validado: existe evidencia de routing por tenant y rechazo de tenant invalido o suspendido
- Tests en verde: unitarios de tenant y al menos un smoke test de aislamiento o middleware
- Documentacion archivada: informe vivo de Sprint 1 actualizado

---

## 10. Handoff tecnico inicial

### Orden de implementacion sugerido

1. `packages/database/src/entities/`
2. `packages/database/src/migrations/public/`
3. `packages/database/src/templates/tenant_template.sql`
4. Configuracion de DataSource y contexto tenant en API
5. `apps/api/src/modules/tenant/`
6. Pruebas unitarias y smoke tests

### Archivos objetivo minimos

- `packages/database/src/entities/tenant.entity.ts`
- `packages/database/src/entities/platform-user.entity.ts`
- `packages/database/src/entities/platform-audit-log.entity.ts`
- `packages/database/src/entities/user.entity.ts`
- `packages/database/src/entities/refresh-token.entity.ts`
- `packages/database/src/entities/audit-log.entity.ts`
- `packages/database/src/migrations/public/001_create_public_schema.ts`
- `packages/database/src/templates/tenant_template.sql`
- `apps/api/src/modules/tenant/tenant.module.ts`
- `apps/api/src/modules/tenant/tenant.service.ts`
- `apps/api/src/modules/tenant/tenant.controller.ts`
- `apps/api/src/modules/tenant/tenant.middleware.ts`
- `apps/api/src/app.module.ts`
- `docs/informes/INFORME-MOD01-SPRINT-01-v1.0.md`

### Entregable esperado al cerrar este corte

El siguiente agente o desarrollador debe poder tomar el repositorio y continuar con Auth basico sabiendo que la persistencia, el schema publico y el routing multi-tenant ya quedaron asentados sin deuda estructural obvia.

---

_Prompt generado por: AI-EM-ARCH (Engineering Manager + Architect) — iWana neXt Platform_
_Fecha: 2026-03-12 | Framework de Gobernanza Multi-IA v2.0_