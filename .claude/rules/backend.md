---
paths:
  [
    "apps/api/**",
    "packages/*/src/**/*.service.ts",
    "packages/*/src/**/*.module.ts",
    "packages/*/src/**/*.controller.ts",
  ]
---

# Backend — NestJS Rules

## Arquitectura

- Modulith: cada modulo con boundaries explicitos y dependencia declarada.
- Prohibido acceso directo a tablas de otro modulo — usa interfaces tipadas o eventos.
- Prohibidos imports circulares entre bounded contexts.
- Cada modulo debe poder extraerse como microservicio sin refactor destructivo.

## Patrones Obligatorios

- TypeScript estricto (`strict: true`).
- Validacion de entrada con Zod en boundaries externos.
- JWT + tenant resolution + RBAC/ABAC en cada endpoint protegido.
- Rate limiting en endpoints publicos.
- Audit trail en operaciones de escritura.
- Operaciones asincronas inter-modulo: eventos + colas (BullMQ) con retry y DLQ.

## Multi-Tenancy

- Resolucion de tenant por schema PostgreSQL desde el inicio.
- Nunca hardcodear tenant — siempre resolver del contexto de la request.
- Migraciones versionadas y reversibles por tenant.

## Base de Datos

- ORM: TypeORM con migraciones versionadas.
- Indices en queries frecuentes — no dejar queries sin indice en modulos core.
- Todo flujo financiero, provisioning o auditoria: idempotente y trazable.

## Testing

- Jest + Supertest para unit e integracion.
- Cobertura >= 80% en modulos core.
- Happy path + edge cases + error paths.

## Comentarios e Informe

- Comentar en espanol servicios, guards, controllers y flujos no triviales.
- Despues de cambios de backend, actualizar el informe vigente en `docs/informes/`.
- Si el trabajo es correctivo, reutilizar el informe existente y no abrir uno nuevo.

## Seguridad

- Logs sin PII ni credenciales.
- Cifrado at-rest e in-transit segun baseline.
- Sin vulnerabilidades criticas conocidas antes de merge.
