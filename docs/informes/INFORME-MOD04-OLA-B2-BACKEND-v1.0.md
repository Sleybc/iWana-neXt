# INFORME — MOD04 Ola B2 Backend (consolidación DRY)

**Versión:** 1.0  
**Fecha:** 2026-07-22  
**Agente:** AI-SR-FULL  
**Prompt:** [PROMPT-MOD04-OLA-B2-v1.0](../prompts/PROMPT-MOD04-OLA-B2-v1.0.md)  
**Precondición:** Ola B1 cerrada G5 en working tree (sin merge remoto)  
**Status:** **DONE_WITH_CONCERNS**

---

## Resumen

Consolidación backend de H-09, H-10, H-11, H-13, H-17 y H-18 sin reabrir hallazgos B1. Cambio de comportamiento HTTP/negocio **cero**, salvo la validación de `phone` alineada a la columna (`@MaxLength(20)` / Zod `.max(20)`), declarada abajo. Specs existentes sin modificar (solo tests nuevos de consolidación).

---

## Hallazgos

### H-09 · Helpers criptográficos

| Antes | Después |
| --- | --- |
| `looksLikeEncryptedValue` privado ×3 (`users.service`, `platform-users.service`, `expediente.service`) | Import de `looksLikeEncryptedAesGcm` (`aes-gcm.util.ts:19`) |
| `hashEmail` privado ×4 (`users`, `auth`, `platform-users`, `platform-bootstrap`) | `hashEmail` en `apps/api/src/common/crypto/hash-email.util.ts` |

**No tocado:** migración tenant `005` (congelada).

**Divergencia al unificar:** las copias privadas usaban `expectedLength &&` (truthiness); el util canónico usa `expectedLength !== undefined`. Con `expectedLength` 24/32 el resultado coincide hoy. Se adopta el canónico. Latente: `expectedLength === 0` hubiera diferido; no aplica a los call sites actuales.

**Conservado duplicado:** `apps/worker/.../tenant-seed.service.ts` `hashEmail` — fuera del alcance listado y el worker no importa `apps/api`.

### H-10 · Un solo contrato de perfil

- Canónico: `CreateUserDto` en `user.dto.ts`.
- `UpdateProfileDto` = `PartialType(PickType(CreateUserDto, PROFILE_FIELDS))`.
- `UpdateUserDto` = `IntersectionType(UpdateUserStatusDto, PartialType(PickType(CreateUserDto, UPDATE_SHARED)))`.
- Límites compartidos: `user-field-constraints.ts` → class-validator **y** Zod bulk.

**Endpoints más estrictos (declarado):**

| Superficie | Cambio |
| --- | --- |
| `POST /users`, `PATCH /users/:id`, `PATCH /users/me` | `phone` gana `@MaxLength(20)` (columna `varchar(20)`). E.164 ya limitaba a ≤16 chars efectivos; el MaxLength cierra hueco vs columna. |
| `POST /users/bulk` (Zod) | `phone` gana `.max(20)` alineado al mismo contrato. |

Zod **no** migrado a class-validator (decisión EM-ARCH).

### H-11 · Contrato HTTP — documentado, no cambiado

**Auditoría de consumidores:**

| Endpoint | Cuerpo HTTP | Cliente |
| --- | --- | --- |
| `GET /users` | `{ data: { data, meta } }` | Portal/web: `request()` desenvuelve un nivel → `{ data, meta }`. Estándar de facto. |
| `POST /users/bulk` | `{ summary, succeeded, failed }` **sin** envelope | Portal tipa `BulkCreateUsersApiResponse` pero `request()` hace `.data` → `undefined` en runtime si no hay envelope. |

**Decisión:** no cambiar shapes en esta ola (riesgo de romper FE o OpenAPI). Documentado en:

- `users.controller.ts` (JSDoc `findAll`)
- `users-bulk.controller.ts` (JSDoc `bulkCreate`)

**Concern (escalación suave a EM-ARCH / FE-PLATFORM):** alinear `bulkCreate` al envelope `{ data: T }` **o** que portal use `returnFullResponse: true` / unwrap tolerante (patrón web). Coordinar en el mismo cambio FE+BE; no hecho aquí.

### H-13 · Promesas flotantes

`void this.auditService.log` / `void this.searchQueueService.*` en `users.service.ts` → `fireAndForget(task, context)` que registra `logger.warn` si la Promise rechaza. Contrato de no interrumpir la petición **conservado**. `Promise.resolve(task)` tolera mocks que no retornan Promise (specs existentes intactos).

Nota: `AuditService.log` ya swallows internamente; el valor añadido es visible en fallos de **search-queue** y en cualquier rechazo futuro fuera del try/catch del audit.

### H-17 · OpenAPI `search`

`users.controller.ts` `@ApiQuery search`: deja de decir "ILIKE"; describe búsqueda en memoria (normalización, substring/prefijo/Levenshtein).

### H-18 · Comentario entidad

`packages/database/src/entities/user.entity.ts` — eliminada la afirmación "NUNCA se retorna"; alineado a `UserResponseDto.documentNumber`.

---

## Métrica de reducción

| Regla | Copias antes | Copias después | ≈ líneas netas |
| --- | --- | --- | --- |
| `looksLikeEncrypted*` | 1 util + 3 privadas (+ migr. 005 intacta) | 1 util (+ migr. 005) | −~50 (3×~17) |
| `hashEmail` (API) | 4 privadas | 1 util (~8 LOC) | −~12–20 |
| Campos perfil DTO | 3 clases repetidas | 1 canónica + Pick/Partial/Intersection | −~80 campos duplicados; +~25 constraints |
| Fire-and-forget audit/search | N× `void` silencioso | 1 helper + N llamadas con log | ~+12 helper |

---

## Tests (salida real)

```
PASS users.dto.spec.ts
PASS hash-email.util.spec.ts
PASS users.service.create.resurrection.spec.ts
PASS users.service.spec.ts
PASS users.controller.http.spec.ts
PASS platform-users.service.spec.ts
PASS platform-users.controller.spec.ts
PASS auth.service.spec.ts

users + platform-users: 6 suites, 142 passed
(+ auth.service.spec + hash-email en corrida previa: 185 passed en el lote users/auth)

tsc --noEmit -p apps/api: OK
```

Specs existentes **no** modificados salvo **añadir** bloque `UpdateUserDto / UpdateProfileDto (H-10 consolidacion)` en `users.dto.spec.ts` y nuevo `hash-email.util.spec.ts`.

---

## Riesgos residuales

1. **H-11 bulk vs portal unwrap** — import CSV puede fallar en runtime (`response.summary` sobre `undefined`). Requiere sync FE.
2. Worker `hashEmail` sigue duplicado.
3. Migración `005` sigue con copia local (intencional).

---

## Status

**DONE_WITH_CONCERNS** — concern único material: contrato `POST /users/bulk` vs cliente portal (H-11). Resto de hallazgos B2 backend cerrados.
