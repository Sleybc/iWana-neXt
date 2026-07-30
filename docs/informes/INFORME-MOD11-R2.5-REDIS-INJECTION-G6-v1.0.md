# Informe de remediación — R2.5 inyección Redis

**Versión:** 1.0
**Estado:** Implementado
**Fecha:** 2026-07-30
**Fase:** Corrección de regresión R2.5
**Responsable:** AI-SR-FULL

## Causa raíz

`TenantAwareThrottlerGuard` pasó a depender de `REDIS_CLIENT`, pero varios
harnesses Nest de Tasks/Swagger no declaraban ese provider. Nest intentaba
construir el guard durante el bootstrap del test y fallaba antes de ejecutar la
suite.

## Corrección

- La inyección del cliente es `@Optional()` únicamente para permitir harnesses
  de prueba o arranque sin provider.
- `TasksModule` mantiene `RedisModule` como dependencia explícita; en
  producción, la ausencia del cliente provoca fallo de bootstrap y Redis sigue
  siendo obligatorio.
- Si un runtime no productivo llega a ejecutar el guard sin cliente, el guard
  falla cerrado con `503 RATE_LIMIT_STORE_UNAVAILABLE`; nunca usa memoria ni
  produce `TypeError`.
- Los harnesses de `tasks.controller.http.spec.ts` y `tasks.swagger.spec.ts`
  declaran un provider de prueba con la operación `eval` necesaria. No se
  modifica la implementación Redis productiva ni se desactiva el guard.
- Se añadió prueba unitaria directa del camino sin cliente.

## Evidencia

```text
pnpm.cmd --filter @iwana/api exec jest src/modules/tasks --runInBand
17 suites, 344 tests aprobados

pnpm.cmd --filter @iwana/api exec jest --passWithNoTests --runInBand
223 suites aprobadas, 4 omitidas
2707 tests aprobados, 15 omitidos

pnpm.cmd --filter @iwana/api typecheck
pnpm.cmd --filter @iwana/api lint
```

## Contrato y seguridad

- Redis compartido y rate limiting: sin cambio de contrato.
- Política productiva: Redis obligatorio y fail-closed.
- Mutaciones sin cliente: `503`, sin bypass y sin store en memoria.
- Sin secretos, credenciales, migraciones ni dependencias nuevas.
