---
description: "Use when working on apps/api NestJS controllers, services, guards, DTOs, tenancy, auth, audit, or self-service contracts. Covers API-specific rules and repository gotchas."
applyTo: "apps/api/**"
---

# API Instructions

Referencia maestra: `AGENTS.md`.

- Todo endpoint protegido debe respetar JWT, resolucion de tenant y RBAC/ABAC segun el flujo del modulo.
- En controllers con rutas self-service y rutas parametrizadas, declarar primero endpoints como `/me` y despues `/:id` para evitar colisiones de routing.
- Si el flujo usa tokens con `scope='mfa-setup'`, tratarlos como alcance limitado: no deben habilitar acceso general ni poblar sesion completa fuera de las rutas MFA aprobadas.
- Cuando se resuelva tenant desde JWT, validar consistencia entre `tenantId` y `schemaName` del token frente al tenant real antes de establecer contexto.
- El fallback `X-Tenant-Slug` debe restringirse a flujos publicos aprobados de auth o recovery; no extenderlo por conveniencia a rutas protegidas.
- Mantener auditoria en operaciones sensibles y preservar idempotencia en provisioning, auth y escrituras criticas.
- Si expones contratos para portal tenant-aware, preferir endpoints self-service del tenant autenticado sobre endpoints globales de plataforma.
- Si un endpoint es solo para plataforma, dejarlo claramente separado de self-service tenant-aware aunque comparta controller.