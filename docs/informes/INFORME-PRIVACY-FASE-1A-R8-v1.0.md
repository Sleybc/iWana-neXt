# INFORME — Privacy Fase 1a · R8: origen único de la clave HMAC

**Versión:** 1.0
**Fecha:** 2026-10-15
**Emisor:** `sr-backend` (bloque R8, prompt v1.3 §5 «Corrida 38652716190 (tras R6 + R7) y R8»)
**Base:** plan v1.6; informes R6 v1.0 y R7 v1.0; `AGENTS.md` → Gates Before Merge; skills `nestjs-expert`, `backend-security-coder`, `test-driven-development` (leídas como documentación antes de escribir).
**Ruta:** verificada libre antes de escribir (el fichero no existía en `docs/informes/`).

## 1. Propiedad y alcance

Propiedad exclusiva, sin excepciones:

- `apps/api/src/modules/crm/subscribers/subscribers.service.ts` (solo el origen de la clave HMAC)
- `apps/api/src/modules/crm/expedientes/expediente.service.ts` (solo el origen de la clave HMAC)
- `apps/api/src/modules/crm/subscribers/tests/subscribers.service.spec.ts`
- `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`

No se tocó ningún contrato (firmas, DTOs y respuestas intactas; `git diff` de producción: solo argumentos añadidos a 6 llamadas, más campo + resolución en un constructor). Ninguna aserción eliminada en los specs: solo se añadió clave explícita a 3 expectativas y 4 tests nuevos (2 por servicio).

Fuera de alcance, intactos: `auth.service.ts`, `platform-bootstrap.service.ts`, `platform-users.service.ts` (deuda P3 del turno Auth/Plataforma, según encargo) y `.github/workflows/ci.yml` (no se añade `PII_HASH_KEY` al paso de integración: el CI debe seguir detectando recaídas al respaldo de `process.env`).

## 2. Causa (diagnóstico del emisor, confirmado en el código)

`SubscribersService` resolvía `piiHashKey` desde `ConfigService` (`subscribers.service.ts:178`) y la usaba para email/teléfono, pero sus 3 llamadas a `hashDocumentNumber` (`:288, :700, :844`) iban sin clave y caían a `process.env` vía `resolvePiiHashKey()` (`hash-document.util.ts:9`). Lo mismo en `ExpedienteService` (`:704, :830, :2388`), que ni siquiera resolvía la clave. En local `.env` la aporta (el `globalSetup` de integración la carga con `process.loadEnvFile`, que no sobrescribe); el paso de integración de CI no la exporta → `PII_HASH_KEY es requerida` en 13/13 tests de B5. Defecto latente de producción, no de tests ni de base de datos.

## 3. Cambios

### 3.1 Producción — una sola fuente (`ConfigService`)

- `subscribers.service.ts`: las 3 llamadas pasan `this.piiHashKey` (campo ya existente, resuelto en el constructor). Sin resolución perezosa.
- `expediente.service.ts`: nuevo campo `private readonly piiHashKey: Buffer`, resuelto en el constructor con `resolvePiiHashKey(this.configService)` — idéntico patrón que `SubscribersService`, sin modo perezoso. Las 3 llamadas pasan `this.piiHashKey`.

### 3.2 Specs — clave sintética inyectada, expectativas herméticas

Ningún spec que construye estos servicios se rompió: `subscribers.service.spec.ts` ya inyectaba `PII_HASH_KEY` sintética, y el mock de `ConfigService` de `expediente.service.spec.ts` devuelve hex válido para cualquier clave. Además, 3 expectativas de `expediente.service.spec.ts` que comparaban HMAC calculado por el servicio (D-4 `:1845`, backfill `:1924`, `updateSection` `:2840`) ahora usan la clave inyectada explícita en vez del respaldo de entorno, para que el spec sea hermético al entorno.

### 3.3 Tests nuevos (2 por servicio, bloque «R8»)

1. **Origen único con `PII_HASH_KEY` ausente de `process.env`**: borra la variable dentro del test y verifica que el servicio calcula el HMAC con la clave inyectada (`search` en suscriptores, `findAll` filtrado por documento en expedientes; esperado = `hmacPii(valor, claveInyectada)`). Antes del fix, este test falla (el fallback lanza `PII_HASH_KEY es requerida`).
2. **Estabilidad del valor**: con la clave de entorno igual a la de configuración, `hashDocumentNumber(v, clave)` ≡ `hashDocumentNumber(v)` — el HMAC no cambia de valor.

## 4. Evidencia local (conteos reales, sin caché)

| Comprobación | Comando | Resultado |
| --- | --- | --- |
| Unit specs tocados | `jest subscribers.service.spec.ts expediente.service.spec.ts` | **137/137 pass** (2 suites) |
| B5 normal (slug `iwana`) | `E2E_TENANT_SLUG=iwana jest --config jest.integration.config.js b5-identity-conversion` | **16/16 pass** |
| B5 con `PII_HASH_KEY` neutralizada en el entorno del proceso Jest (ver §5) | `PII_HASH_KEY=''` + mismo comando | **16/16 pass** |
| API completa sin caché | `pnpm exec turbo run test --filter=@iwana/api --force` | exit 0; **372 suites pass / 4 skip; 4967 tests pass / 15 skip; 0 cached** (4963 + 4 nuevos R8) |
| Lint + typecheck sin caché | `pnpm exec turbo run lint typecheck --filter=@iwana/api --force` | exit 0; 8/8 tareas, 0 cached; 0 errores; 7 warnings (preexistentes, idénticos a R6/R7) |
| Lint de los 4 ficheros tocados | `eslint <los 4 ficheros>` | sin salida: **0 warnings en lo tocado** |

## 5. Nota sobre la prueba «sin entorno» (mecanismo honesto)

Borrar la variable solo en el shell no basta en local: el `globalSetup` de integración carga `.env` con `process.loadEnvFile`, que rellena las ausentes (así pasó el bug desapercibido en local). Se lanzó Jest con `PII_HASH_KEY=''` (cadena vacía): `loadEnvFile` no sobrescribe claves ya presentes, y `resolvePiiHashKey()` lanza ante valor vacío — de modo que cualquier `hashDocumentNumber` sin clave explícita habría fallado. El 16/16 en esas condiciones prueba que la ruta B5 ya no lee `process.env`. En CI (sin `.env`) la condición es aún más estricta y el resultado debe ser el mismo.

## 6. Cierre R8

- Verde en local en los tres niveles exigidos (unitarias tocadas 137/137, B5 16/16 ×2 condiciones, API `--force` 372/4967, lint+typecheck 8/8).
- Sin commitear (el push es del CTO, según encargo). Archivos del bloque: los 4 listados en §1; este informe. R6 y R7 intactos.
- Pendiente fuera de R8: push del CTO y CI de `main` en verde, citando en la misma corrida los PASS de `b5-identity-conversion.postgres.integration.spec.ts`, `contracts.service.postgres.integration.spec.ts` y `027_media_usage_privacy_evidence.integration.spec.ts` antes de declarar G6.5. Deuda P3 registrada: unificar `auth.service.ts`, `platform-bootstrap.service.ts` y `platform-users.service.ts` en el turno de Auth/Plataforma.
