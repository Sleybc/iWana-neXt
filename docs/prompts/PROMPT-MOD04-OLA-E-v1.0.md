# PROMPT DE EJECUCIÓN — MOD04 Ola E: cobertura del flujo asíncrono de bulkCreate

**Versión:** 1.0
**Fase:** Ola E — remediación del gate incumplido en el cierre de módulo
**Emitido por:** AI-EM-ARCH · 2026-07-22
**Agente destinatario:** AI-SR-QA
**Informe origen:** [INFORME-MOD04-CIERRE-MODULO-v1.0](../informes/INFORME-MOD04-CIERRE-MODULO-v1.0.md) §5
**Prioridad:** bloquea la declaración formal de cierre de MOD04

---

## Objetivo

Subir la cobertura del módulo de usuarios por encima del gate de `AGENTS.md` (**≥80 % en módulos core**) cubriendo el flujo asíncrono de `bulkCreate`, hoy prácticamente sin tests.

**Esto no es "subir un número".** El código sin cubrir entrega credenciales temporales de hasta 100 usuarios y es el más nuevo del módulo. El objetivo real es saber si funciona; la métrica es la consecuencia.

## Estado medido (2026-07-22, suite completa de 2050 tests)

| Archivo | % Stmts | % Branch |
| --- | --- | --- |
| `user.dto.ts` | 100 | 100 |
| `users.controller.ts` | 92.3 | 81.25 |
| **`users.service.ts`** | **67.24** | **55.64** |
| **Módulo** | **66.2** | **56.1** |

El hueco no está repartido: son **230 líneas seguidas, `users.service.ts:575-806`**, correspondientes a cuatro métodos:

- `bulkCreate` (:569) — encola el lote
- `getBulkJobStatus` (:657) — consulta de estado
- `claimBulkJobResult` (:690) — **entrega de credenciales, reclamo único**
- `executeBulkCreateJob` (:735) — ejecución en el worker

Superficie HTTP asociada en `users-bulk.controller.ts`: `POST /users/bulk` (202 + jobId), `GET /users/bulk/jobs/:jobId`, `POST /users/bulk/jobs/:jobId/result`.

## Qué debe quedar probado

Ordenado por riesgo, no por facilidad:

1. **Unicidad del reclamo de credenciales.** `claimBulkJobResult` entrega contraseñas temporales en claro. Debe existir prueba de que un segundo reclamo **no** las devuelve, y de qué recibe el cliente en ese caso. Hoy no hay ninguna.
2. **Contexto de tenant en el job.** `AsyncLocalStorage` **no propaga** a BullMQ — el contexto viaja explícito en el payload. Debe probarse que el job escribe en el schema del tenant correcto, y qué ocurre si el payload llega sin contexto o con uno inválido. Es la garantía de aislamiento multi-tenant en un camino que no pasa por `TenantMiddleware`.
3. **Fallo parcial del lote.** Cada `create()` va en su propia transacción, así que un fallo no revierte los anteriores. Debe probarse que el resumen refleja con exactitud qué filas entraron y cuáles no, y con qué causa.
4. **Autorización y allowlist de roles** en la ruta bulk: el esquema Zod valida por un camino distinto al DTO de class-validator. Un rol de plataforma en el lote debe rechazarse.
5. **Estados del job**: pendiente, en curso, completado, fallido, y `jobId` inexistente.

## Restricciones

- `AGENTS.md` manda. Multi-tenancy por schema, TypeScript estricto sin `any`, sin promesas flotantes.
- Convenciones de test del repo: `src/**/*.spec.ts`, Jest + ts-jest, nombrado `[subject].[method].spec.ts`.
- **No toques la superficie de la Ola A** (`roles.guard.ts`, `jwt.strategy.ts`, `auth.constants.ts`, `platform-roles.ts`, `user-role.enum.ts`). Sus 134 tests de regresión deben seguir pasando.
- Sin PII, secretos ni credenciales reales en los tests. Las contraseñas temporales de fixture son sintéticas.
- No commitees ni hagas push.

## Regla dura

**Si un test revela un defecto, repórtalo y escala — no ajustes el test para que pase.**

Es el riesgo real de este encargo: escribir tests contra código sin cubrir suele destapar comportamiento incorrecto, y la salida fácil es documentar el bug como si fuera el diseño. Un test que consagra un defecto es peor que la ausencia de test, porque además lo legitima.

Aplica en particular al punto 1: si resulta que el reclamo **no** es único, eso es un hallazgo de seguridad, no un test que escribir de otra forma. Para y escala a AI-EM-ARCH.

## Entregables

1. Cobertura del módulo **≥80 % sentencias y ≥80 % ramas**, verificable con:
   `npx jest --coverage --collectCoverageFrom='modules/users/**/!(*.spec).ts'` desde `apps/api`.
2. Los cinco puntos de riesgo cubiertos, con un test que nombre explícitamente el invariante que fija.
3. Informe final: qué cubriste, **qué defectos encontraste** (es el entregable de más valor), salida real de cobertura y de tests sin maquillar, y qué queda sin cubrir y por qué.

## Stop / Go

- `pnpm --filter @iwana/api test` en verde (baseline: 2050 pasan, 0 fallan).
- Los 134 tests de la Ola A intactos.
- `pnpm lint` y `pnpm typecheck` en verde (8/8).
- Cobertura del módulo ≥80 %/80 %.

**Para y escala si:** un test revela un defecto de comportamiento; alcanzar el 80 % exige modificar código productivo; o el flujo resulta no ser probable sin refactor (eso sería un hallazgo de diseño, no una tarea de tests).
