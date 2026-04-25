# ADR-016 — Cierre Formal MOD01 en Producción

> **Estado:** Aprobado  
> **Fecha:** 2025-07-14  
> **Tipo:** Governance / Cierre de módulo  
> **Autores:** AI-EM-ARCH  
> **Revisado y aprobado por:** CTO — 2026-03-12

---

## Contexto

El proyecto iWana neXt define en **ADR-022** (Política de Ejecución Modular por Fases) que ningún módulo N+1 puede iniciarse hasta que el módulo N esté formalmente cerrado en producción. El cierre formal requiere evidencia documentada de: tests pasando, cobertura ≥ 80% en módulos core, seguridad evaluada, migraciones reversibles y OpenAPI actualizada.

MOD01 — **Autenticación, Tenant, Auditoría y Usuarios** — completó su Sprint 1 completo. Este ADR documenta la verificación de todos los gates de cierre y declara MOD01 listo para producción.

---

## Decisión

**MOD01 se declara cerrado y apto para producción.** MOD02 (CRM/Subscribers/Contracts) queda desbloqueado para iniciar planificación.

---

## Evidencia de Cierre

### 1. Tests

| Métrica | Valor | Gate |
|---------|-------|------|
| Tests totales | 121 | ✅ |
| Tests pasando | 121/121 | ✅ |
| Tests fallando | 0 | ✅ |
| Tipado TypeScript | 0 errores | ✅ |

**Casos de aceptación validados:** CA-S1-001 … CA-S1-031 (todos PASS)

Cobertura por módulo:
- `AuthModule` (login, MFA, refresh, logout, RBAC): ≥ 80% líneas
- `TenantModule` (CRUD, provisioning): ≥ 80%
- `UsersModule` (CRUD, roles, paginación, soft delete): ≥ 80%
- `AuditModule` (interceptor, CUD, audit trail): ≥ 80%

### 2. Seguridad

| Control | Estado |
|---------|--------|
| Helmet (`app.use(helmet())`) — headers HTTP seguridad | ✅ Activo (Sprint 1 cierre) |
| Rate limiting global ThrottlerModule 100 req/min | ✅ Activo desde Sprint 1 semana 2 |
| Validación Joi fail-fast en arranque (non-test) | ✅ Activo (Sprint 1 cierre) |
| JWT RS256 con pares de claves asimétricas | ✅ |
| Contraseñas bcrypt rounds ≥ 12 | ✅ |
| Emails cifrados AES-256-GCM 256 bits | ✅ |
| Secretos MFA cifrados AES-256-GCM | ✅ |
| Refresh token rotation + JTI blacklist Redis | ✅ |
| OWASP ASVS L2 evaluado — 0 hallazgos críticos | ✅ Ver `docs/security/OWASP-ASVS-MOD01-v1.0.md` |
| Sin PII en logs | ✅ |
| Migraciones reversibles con BEGIN/COMMIT + DDL template | ✅ |

### 3. API y Documentación

| Artefacto | Estado |
|-----------|--------|
| OpenAPI decorators en AuthController | ✅ |
| OpenAPI decorators en TenantController | ✅ |
| OpenAPI decorators en UsersController | ✅ |
| OpenAPI decorators en AuditLogsController | ✅ |
| `UserDto` (DTO de respuesta sin campos sensibles) | ✅ |
| Swagger UI desabilitado en `NODE_ENV=production` | ✅ |

### 4. Arquitectura y Boundaries

| Regla | Estado |
|-------|--------|
| Sin acceso directo entre bounded contexts | ✅ |
| Sin imports circulares | ✅ |
| Multi-tenant por schema PostgreSQL desde request-0 | ✅ |
| TenantMiddleware aplicado a todas las rutas protegidas | ✅ |
| Sin `synchronize: true` — solo migraciones | ✅ |

### 5. Informe de Cierre

Informe ejecutivo: [`docs/informes/INFORME-MOD01-SPRINT-01-v1.0.md`](../informes/INFORME-MOD01-SPRINT-01-v1.0.md)

---

## Consecuencias

### Positivas
- MOD02 (CRM/Subscribers/Contracts) queda formalmente desbloqueado.
- Base de seguridad establecida: Helmet, Joi, OWASP evaluado, bcrypt, AES-256-GCM, JWT RS256.
- Patrón de implementación por módulo validado y replicable.
- 121 tests proporcionan red de seguridad para refactors futuros.

### Restricciones heredadas
- Variables de entorno críticas definidas (ver Joi schema en `AppModule`) deben estar presentes en todos los ambientes de ejecución (staging, producción).
- Swagger UI queda **deshabilitado en producción** — accesible solo en staging/dev con `NODE_ENV != production`.
- Recuperación de contraseña (V2.5 ASVS) queda pendiente Sprint 2.

### Deuda técnica documentada
- `cookie-parser` cargado via `require()` — migrar a import estático en Sprint 2 (OBS-02 del checklist OWASP).
- Re-autenticación para operaciones destructivas pendiente (OBS-04).

---

## Referencias

- [ADR-022 Política de Ejecución Modular por Fases](./ADR-022-Politica-Ejecucion-Modular-Por-Fases.md)
- [ADR-021 Perfil Unificado EM-Architect](./ADR-021-Perfil-Unificado-EM-Architect.md)
- [HLD-MOD01-ARQUITECTURA-v1.0](../hlds/HLD-MOD01-ARQUITECTURA-v1.0.md)
- [PRD-MOD01-DEFINICION-v1.1](../prds/PRD-MOD01-DEFINICION-v1.1.md)
- [OWASP-ASVS-MOD01-v1.0](../security/OWASP-ASVS-MOD01-v1.0.md)
- [INFORME-MOD01-SCAFFOLD-v1.0](../informes/INFORME-MOD01-SCAFFOLD-v1.0.md)
