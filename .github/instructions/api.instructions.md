---
description: "Use when working on apps/api NestJS controllers, services, guards, DTOs, tenancy, auth, audit, or self-service contracts. Covers API-specific rules and repository gotchas."
applyTo: "apps/api/**"
---

# API Instructions

- `apps/api` implementa un modulith NestJS con boundaries estrictos por modulo; no abrir accesos cruzados a tablas de otro modulo.
- Todo endpoint protegido debe respetar JWT, resolucion de tenant y RBAC/ABAC segun el flujo del modulo.
- Para tenancy por schema, nunca asumir persistencia de `search_path`; con pgBouncer usar `SET LOCAL` por transaccion o helpers aprobados.
- No hardcodear `tenantId`, `schemaName` ni slugs; resolverlos desde el contexto de request o del token aprobado.
- En controllers con rutas self-service y rutas parametrizadas, declarar primero endpoints como `/me` y despues `/:id` para evitar colisiones de routing.
- Si el flujo usa tokens con `scope='mfa-setup'`, tratarlos como alcance limitado: no deben habilitar acceso general ni poblar sesion completa fuera de las rutas MFA aprobadas.
- Cuando se resuelva tenant desde JWT, validar consistencia entre `tenantId` y `schemaName` del token frente al tenant real antes de establecer contexto.
- El fallback `X-Tenant-Slug` debe restringirse a flujos publicos aprobados de auth o recovery; no extenderlo por conveniencia a rutas protegidas.
- Usar `@Roles(UserRole.*)` y no strings literales para evitar 403 silenciosos.
- Mantener auditoria en operaciones sensibles y preservar idempotencia en provisioning, auth y escrituras criticas.
- Si expones contratos para portal tenant-aware, preferir endpoints self-service del tenant autenticado sobre endpoints globales de plataforma.
- Si un endpoint es solo para plataforma, dejarlo claramente separado de self-service tenant-aware aunque comparta controller.
- Validar boundaries externos con Zod o DTOs aprobados y no relajar validaciones por conveniencia.
- Logs sin PII, credenciales, tokens ni payloads sensibles.
- Tras cambios en `apps/api`, actualizar el informe vivo relacionado en `docs/informes/`.