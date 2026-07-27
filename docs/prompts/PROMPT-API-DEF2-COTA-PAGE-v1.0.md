# PROMPT — DEF-2: cota de `page` en endpoints de listado (hotfix independiente)

**Versión:** 1.0
**Estado:** Aprobado
**Generado por:** AI-EM-ARCH
**Archivo destino:** `docs/prompts/PROMPT-API-DEF2-COTA-PAGE-v1.0.md`
**Origen:** ADR-065 §DEF-2 — hotfix independiente del programa de olas

**Emisor:** AI-EM-ARCH
**Destinatario:** AI-SR-FULL · **revisión obligatoria:** AI-SEC-ENG
**Fecha:** 2026-07-24
**Precondición:** ninguna. **Este parche es deliberadamente independiente del programa de ADR-065**: remedia un defecto vigente hoy y no debe esperar 9-16 semanas a la ola de paginación.
**Skills:** `backend-security-coder`, `nestjs-expert`, `security-auditor`, `testing-patterns`

## Problema

Los endpoints de listado con paginación por offset calculan `.skip((page - 1) * limit)` **sin acotar `page`**. Verificado:

| Servicio | Evidencia |
| --- | --- |
| `tasks/services/tasks.service.ts:257` | `qb.skip((page - 1) * limit).take(limit)` |
| `inventory/services/write-off.service.ts:293` | `.skip((validated.page - 1) * validated.limit)` |
| `wfm/services/visit-requests.service.ts:177` | ídem — su DTO tiene `@Min(1)` pero **ningún tope** (`list-visit-requests-query.dto.ts:89-93`) |
| `crm/subscribers/subscribers.service.ts:296` | `query.skip((page - 1) * limit).take(limit)` |

Y el caso peor: **`assurance/dto/index.ts:359-361` declara `page` con `@Allow()`** — sin `@IsInt`, sin `@Min`, sin `@Max`. No hay validación alguna; un `page` no numérico o negativo atraviesa el `ValidationPipe`.

`OFFSET N` no salta: PostgreSQL produce y descarta las N primeras filas del plan ordenado, con coste O(N). Un `page` arbitrariamente grande fuerza a materializar y descartar el conjunto entero.

**Severidad: media-alta.** No es un DoS anónimo — todas son rutas autenticadas bajo JWT y `TenantMiddleware`, así que exige una cuenta válida. Lo que eleva el riesgo es que **el pool de pgBouncer es compartido entre tenants**: la degradación no se queda en el tenant del atacante. Con el throttler a 100 req/min y ~8 conexiones útiles, bastan pocas peticiones concurrentes para saturarlo.

## Alcance

1. **Cota uniforme `page * limit <= 10_000`** en todo endpoint de listado que compute offset. Fuera de rango → `400` con mensaje en español, sin filtrar detalles internos.
2. **Validación completa de `page`** donde falte: `@Type(() => Number)`, `@IsInt()`, `@Min(1)`. Sustituir el `@Allow()` de assurance por la cadena real.
3. **`limit` con tope** donde no lo tenga: default 20, máximo 100, alineado a `COMMERCIAL_LIST_DEFAULT_LIMIT` / `COMMERCIAL_LIST_MAX_LIMIT`.
4. **Un solo helper compartido** de validación y clamp, no una copia por módulo. Ubicarlo donde luego lo absorba `apps/api/src/common/pagination/` de la Ola 1 — este parche debe **converger** con ADR-065, no crear una tercera vía.
5. **Barrido completo:** los cuatro servicios citados son los verificados, no la lista cerrada. Recorre todos los endpoints de listado con `skip(`, `offset` o `page` y aplica la cota a todos.

## Restricciones

- **Sin cambio de contrato de respuesta.** Este parche no toca envelopes, no introduce `ListMeta` y no adelanta trabajo de la Ola 1: solo valida entrada. Un `page` válido devuelve exactamente lo que devuelve hoy.
- **Sin cambio de comportamiento para el frontend actual.** Ninguna pantalla pide hoy `page` por encima de la cota; si alguna lo hiciera, es hallazgo y se reporta, no se sube el tope.
- Mensajes de error en español, sin exponer nombres de tabla, columna ni el valor del tope como pista de sondeo.
- El clamp se valida **antes** de tocar la base de datos.

## Entregables

1. Helper compartido + cota aplicada en todos los endpoints de listado con offset.
2. Validación completa de `page` y `limit` en los DTOs que la tenían incompleta o ausente.
3. Tests: `page` en el límite, `page` justo por encima → 400, `page` no numérica, `page` negativa, `page` cero.
4. OpenAPI: `@ApiQuery` de `page` con `minimum: 1` y la restricción documentada.
5. Nota para AI-SEC-ENG con el antes/después y el alcance del barrido.

## Stop/go

- `pnpm --filter @iwana/api test` verde.
- `pnpm typecheck` y `pnpm lint` verdes.
- `rg "skip\(" apps/api/src/modules` — ningún resultado sin clamp previo.
- Ningún DTO de listado con `page` sin `@IsInt` + `@Min(1)`.
- Revisión de AI-SEC-ENG con veredicto explícito.

**Escalación a AI-EM-ARCH si:** alguna pantalla del portal o de web depende hoy de un `page` por encima de la cota, o si algún endpoint de listado no puede acotarse sin cambiar su contrato.
