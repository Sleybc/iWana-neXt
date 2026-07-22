# PROMPT DE EJECUCIÓN — MOD04 Ola C: datos y escala

**Versión:** 1.0
**Fase:** Ola C (posterior a B1 y B2)
**Emitido por:** AI-EM-ARCH · 2026-07-22
**Agentes destinatarios:** AI-DATA-ENG (líder) + AI-SR-FULL, consulta a AI-PLAT-OPS y AI-PROD-UX
**Informe origen:** [INFORME-MOD04-AUDITORIA-INTEGRAL-v1.0](../informes/INFORME-MOD04-AUDITORIA-INTEGRAL-v1.0.md)

---

## ✅ BLOQUEO LEVANTADO — GO 2026-07-22

Decisiones en [INFORME-MOD04-OLA-C-ESCALACION-CTO-v1.0](../informes/INFORME-MOD04-OLA-C-ESCALACION-CTO-v1.0.md) §5:

| # | Decisión | Opción |
| --- | --- | --- |
| D-1 | Drift entidad↔DDL | **A** — migración `083` idempotente; no editar `000` |
| D-2 | `pg_trgm` | **A** — condicionado a GO PLAT-OPS; si niega → **B** |
| D-3 | `bulkCreate` | **A** — BullMQ asíncrono + canal UX PROD-UX |
| D-4 | Auditoría email | **A** — hashes; veredicto SEC-ENG obligatorio |

Stop conditions del prompt original siguen vigentes.

---

## Objetivo

Cerrar la deuda de modelo de datos y de escala del módulo de usuarios. A diferencia de B1 y B2, aquí **sí hay cambio de comportamiento** y **sí hay migraciones**: cada bloque exige su propia validación contra datos reales.

## Entradas obligatorias

1. `AGENTS.md`.
2. El informe origen, sección 3.
3. Las decisiones D-1 a D-4 resueltas.
4. `.agents/skills/INDEX.md` → `database-migration`, `postgresql`, `nestjs-expert`, `bullmq-specialist` (si D-3 es afirmativa).

---

## H-03 · Drift entidad ↔ DDL · ALTO

`000_initial_tenant_schema.ts:60-98` crea `users` con `email VARCHAR(512)`, **sin `UNIQUE(email)`** y sin `idx_users_first_name`/`idx_users_last_name`. La entidad declara lo contrario (`user.entity.ts:33`, `:43`).

**Causa:** las migraciones `003`, `004` y `005` son huérfanas — exportan `runMigration()` con `main()` propio, no están en `TENANT_MIGRATIONS` (`runner.ts:80`) y ningún script las invoca. Las columnas de `003`/`004` fueron reabsorbidas en `000`; **el DDL estructural de `005` no**.

**Atenuante confirmado:** `uq_users_email_hash` sí existe en `000`, así que no hay agujero de integridad de datos. El daño es de contrato: TypeORM cree tener una restricción y dos índices que la base no tiene.

**Recomendación de AI-EM-ARCH (sujeta a D-1):** migración nueva `083`, idempotente, que aplique el DDL de `005` (constraint `uq_users_email`, estrechamiento de tipos, índices de nombre), registrada en `TENANT_MIGRATIONS`. Después, borrar `003/004/005` como archivos muertos.

**No editéis `000`.** Ya corrió en schemas existentes; editar una migración aplicada produce entornos irreproducibles.

**Validación exigida:** un tenant provisionado desde cero y un tenant preexistente deben converger al mismo DDL. Demostradlo, no lo afirméis.

## H-05 · La búsqueda no sobrevive a la escala objetivo · ALTO

`users.service.ts:120-143`: con `search`, carga la tabla completa del tenant, mapea cada fila a DTO con intento de descifrado, y filtra en Node con Levenshtein. Sin `take`, sin índice.

Tres problemas encadenados:

1. O(n) en memoria y CPU por cada pulsación del administrador.
2. El cursor se aplica **antes** del filtro: la paginación es incorrecta, no solo lenta.
3. `total` cambia de semántica entre ramas (filtrado con `search`, absoluto sin él). El cliente no puede interpretarlo.

Escala objetivo declarada: cientos de miles de usuarios. Este diseño no llega.

**Recomendación (sujeta a D-2):** mover la búsqueda a PostgreSQL con `pg_trgm` e índice GIN sobre `first_name`, `last_name`, `email`, `job_title`. Da fuzzy matching nativo y elimina el Levenshtein en TypeScript.

**Coordinación obligatoria:** FE-01 de la Ola B1 corrige la mitad de cliente de este mismo problema. Verificad que la semántica de `total` y `nextCursor` que fijéis aquí es la que el frontend ya espera tras B1.

**Validación exigida:** medición antes/después con un tenant sembrado con ≥50.000 usuarios. Sin esa medición el bloque no se da por cerrado.

## H-06 · `bulkCreate` bloqueante · ALTO

`users.service.ts:325-381`: hasta 100 items, cada uno en su transacción con bcrypt cost 12 (~250 ms). Peor caso ≈ 25-30 s de request síncrono. Sin `Idempotency-Key`, cuando todo el resto del módulo la exige. Devuelve 100 contraseñas temporales en claro en un único body. `createdAt` se fabrica con `new Date().toISOString()` en vez de leerse del registro persistido.

**Alcance según D-3:**

- **Si asíncrono:** job BullMQ. Recordad que `AsyncLocalStorage` **no propaga** al worker — el contexto de tenant se pasa explícitamente. El resultado necesita un canal de entrega que AI-PROD-UX debe haber definido.
- **Si síncrono:** reducir el límite de lote a lo que quepa en un timeout razonable, y justificar el número con medición.

**En ambos casos:** añadir `Idempotency-Key`, leer `createdAt` del registro, y revisar con AI-SEC-ENG la entrega de 100 credenciales en claro.

## H-12 · "Administrador principal" es una regla implícita · MEDIO

`users.service.ts:923` define al admin principal como el `ADMIN` más antiguo por `createdAt`. No está en el PRD, no tiene índice, y es frágil: si se elimina ese usuario, el principal cambia **en silencio** y con él el email de contacto del tenant que se sincroniza en `public.tenants`.

**Alcance:** hacer la regla explícita. Si debe ser un atributo del tenant en vez de una consulta derivada, eso es un cambio de modelo — **proponedlo, no lo decidáis**.

## H-14 · Retirar la ruta legacy de descifrado · MEDIO

`users.service.ts:878`: `decodeLegacyValue` tiene un TODO abierto sin fecha de retiro. La migración `005` ya descifró todo. Mantenerla obliga a `UsersService` a cargar `MFA_ENCRYPTION_KEY` que de otro modo no necesitaría.

**Precondición:** demostrar con una consulta sobre todos los schemas de tenant que no queda ningún valor con formato `iv:tag:ciphertext` en `email`, `first_name`, `last_name` ni `document_number`. **Sin esa evidencia no se retira nada** — un falso negativo aquí rompe el login.

## H-15 · Auditoría de cambio de email · MEDIO

`users.service.ts:507`, `:581` registran `{loginEmailChanged: true}` — un booleano sin valor anterior ni nuevo, forensemente inútil.

**Sujeto a D-4.** Recomendación: hash del email anterior y del nuevo, o los últimos 4 caracteres del dominio. **Nunca PII en claro en el asiento**, ni siquiera parcial, sin veredicto explícito de AI-SEC-ENG.

## FE-12 · Precarga en servidor · MEDIO

`portal/src/app/dashboard/users/page.tsx:10` renderiza `<UsersClient />` sin props, aunque `initialUsers`/`initialMeta` existen en la interfaz. Server Component que no precarga nada.

**Depende de H-05:** precargar hoy sería precargar una consulta ineficiente. Abordadlo **después** de que la búsqueda esté resuelta. Si la Ola B2 ya eliminó las props por considerarlas muertas, reevaluad si merecen volver.

---

## Restricciones transversales

- `AGENTS.md` manda. Multi-tenancy por schema, `SET LOCAL search_path` por transacción (pgBouncer no persiste `search_path`).
- **Migraciones escritas a mano**, numeradas, bajo `packages/database/src/migrations/tenant/`, registradas en `TENANT_MIGRATIONS`, y **reversibles**. No existe `migration:generate`.
- El paquete `@iwana/db` debe estar **construido** antes de correr migraciones: se ejecutan contra `dist/`.
- Ninguna migración se da por buena sin probarse contra un tenant nuevo **y** uno preexistente.
- Sin PII, secretos ni tokens en código, tests, docs ni logs.
- No toquéis la superficie de la Ola A ni la migración `005` (congelada).
- No commitear ni hacer push salvo petición explícita.

## Entregables

1. Los hallazgos resueltos según las decisiones D-1 a D-4.
2. Migraciones reversibles, probadas en ambas direcciones.
3. **Medición de rendimiento antes/después de H-05** con ≥50.000 usuarios sembrados. Es el entregable que justifica la ola.
4. **Evidencia de la consulta de H-14** sobre todos los schemas.
5. OpenAPI actualizado.
6. Informe final con: cambios y ubicaciones, resultados de migración en ambos escenarios de tenant, medición de rendimiento, salida real de tests sin maquillar, y riesgos residuales.

## Stop / Go

**Gates obligatorios:**

- Migraciones reversibles verificadas `up` y `down`.
- Convergencia de DDL demostrada entre tenant nuevo y preexistente.
- Medición de H-05 aportada.
- `pnpm --filter @iwana/api test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` en verde.
- Los 134 tests de regresión de la Ola A siguen pasando.

**Parad y escalad a AI-EM-ARCH si:**

- Falta cualquiera de las decisiones D-1 a D-4.
- H-14 encuentra valores cifrados residuales.
- H-12 exige cambio de modelo de datos.
- `pg_trgm` no está disponible en el PostgreSQL objetivo (consultad a AI-PLAT-OPS antes de asumirlo).
