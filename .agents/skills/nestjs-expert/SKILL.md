---
name: nestjs-expert
description: NestJS guidance for iWana neXt focused on modulith boundaries, TypeORM, PostgreSQL multi-tenant por schema, OpenAPI, seguridad y pruebas con Jest/Supertest.
---

# NestJS Expert

## Proposito

Este skill gobierna el trabajo backend de iWana neXt en NestJS bajo un enfoque modulith, TypeORM, PostgreSQL multi-tenant por schema, OpenAPI y controles de seguridad alineados al repo.

## Usar este skill cuando

- se creen o modifiquen modulos, servicios, controladores o providers en NestJS
- se definan boundaries backend entre modulos
- se implementen endpoints, validacion, autenticacion o auditoria
- se escriban pruebas unitarias o de integracion del backend

## No usar este skill cuando

- la tarea sea exclusivamente frontend
- la decision principal sea del monorepo o de infraestructura y no del backend NestJS
- la solucion dependa de Mongoose, Prisma o patrones fuera del baseline del repo

## Decisiones base del backend

1. NestJS con TypeScript estricto.
2. Modulith con boundaries explicitos entre modulos.
3. PostgreSQL multi-tenant por schema.
4. TypeORM como ORM y migraciones versionadas.
5. OpenAPI actualizada cuando cambien contratos HTTP.
6. Seguridad zero-trust en datos, validacion y logs.

## Reglas de arquitectura

- no acceder directamente a tablas de otro modulo
- no introducir imports circulares entre bounded contexts
- preferir interfaces tipadas y eventos de dominio para integracion interna
- aislar logica de aplicacion, dominio e infraestructura cuando la complejidad lo requiera
- toda operacion sensible de escritura debe considerar idempotencia y trazabilidad

## HTTP y validacion

- validar payloads de entrada en boundaries externos
- usar DTOs y contratos claros
- documentar endpoints con OpenAPI
- devolver errores consistentes y sin filtrar informacion sensible
- aplicar autenticacion y autorizacion por guardas y politicas explicitas

## Datos y persistencia

- TypeORM es la via principal de persistencia
- modelar entidades y repositorios de forma coherente con el modulo
- la resolucion tenant-aware debe respetar schema por request autenticada
- toda migracion debe ser reversible y revisable
- no introducir MongoDB, Mongoose o atajos fuera del baseline aprobado

## Testing backend

- unit tests con Jest para servicios y logica aislada
- integration tests con Jest + Supertest para controladores y contratos HTTP
- mocks solo donde realmente se aisan dependencias externas
- verificar en orden: typecheck, unit, integration, e2e cuando aplique

## Checklist de implementacion

- [ ] modulo y provider en el boundary correcto
- [ ] sin dependencia circular
- [ ] payload validado
- [ ] autorizacion explicita si aplica
- [ ] logs sin PII ni secretos
- [ ] OpenAPI actualizada si el endpoint cambio
- [ ] pruebas agregadas o ajustadas

## Patrones recomendados

### Modulo por feature

```ts
@Module({
  imports: [TypeOrmModule.forFeature([CustomerEntity])],
  controllers: [CustomersController],
  providers: [CustomersService, CustomersRepository],
  exports: [CustomersService],
})
export class CustomersModule {}
```

### Integration test con Supertest

```ts
import request from "supertest";

describe("GET /customers", () => {
  it("returns 401 for unauthenticated requests", async () => {
    const response = await request(app.getHttpServer()).get("/customers");

    expect(response.status).toBe(401);
  });
});
```

## Anti-patrones

- usar Mongoose o Prisma como camino por defecto en este repo
- modelar el backend como microservices por reflejo cuando el repo es modulith
- mezclar autenticacion, dominio y persistencia en el mismo servicio sin corte claro
- saltarse validacion en controllers o entrypoints
- acoplar modulos por imports directos de internals ajenos

## Integracion con otras skills

- `auth-implementation-patterns` para autenticacion y autorizacion
- `backend-security-coder` para implementacion segura
- `postgresql` para decisiones de schema y rendimiento
- `openapi-spec-generation` para contrato HTTP
- `testing-patterns` para estrategia de pruebas
