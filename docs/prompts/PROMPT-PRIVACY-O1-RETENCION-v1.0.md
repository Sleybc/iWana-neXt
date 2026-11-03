# PROMPT — `privacy` · O-1: reloj de retención del suscriptor

**Versión:** 1.0
**Estado:** Listo para lanzar. G0 del CTO el 2026-11-02
**Fecha:** 2026-11-02
**Emitido por:** AI-EM-ARCH
**Plantilla base:** [`TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md)
**Spec (contrato congelado):** [`docs/specs/2026-11-02-privacy-o1-reloj-retencion-spec.md`](../specs/2026-11-02-privacy-o1-reloj-retencion-spec.md) v1.0
**Plan:** [`docs/plans/2026-11-02-privacy-o1-retencion-orquestacion.md`](../plans/2026-11-02-privacy-o1-retencion-orquestacion.md) · **Launcher:** [`PROMPT-PRIVACY-O1-RETENCION-LAUNCH-v1.0.md`](PROMPT-PRIVACY-O1-RETENCION-LAUNCH-v1.0.md)

## Reglas comunes

- Leer antes: `AGENTS.md`, `.github/copilot-instructions.md`, la spec O-1 completa, HLD Privacy v1.2 §6.6 y §6.7, la spec DT-3 v1.2 (D-RER-3 y D-RER-6) y las skills de tu fila del plan. Claude Code lee el `SKILL.md`; no lo invoca como herramienta.
- Se trabaja en `main`, sin ramas. **No commitear ni hacer stash.** Solo las rutas de tu bloque.
- Si el código contradice la spec, parar con `[BLOQUEO]` y `archivo:línea`.
- Cero PII. Las pruebas usan datos sintéticos y nunca `tenant_iwana`.
- **Evidencia:** suite completa sin caché **más** la lista explícita de integraciones PG con `IWANA_DB_INTEGRATION_AVAILABLE=true`. Una suite omitida cuenta como fallo. Esta regla sale de DT-3: «suite completa en verde» había ocultado 11 integraciones rotas.
- No ajustar pruebas existentes para que pasen. Si alguna cambia, la revisa `test-change-reviewer`.

---

## B1 · `sr-backend` · Escritores, entidad y puerto (D-O1-1 y D-O1-2)

**Rutas:** `crm/contracts/**` (entidad y `_transition`), `crm/subscribers/subscriber-lifecycle.service.ts`, `crm/privacy-adapters/crm-contract-standing-read.adapter.ts`, `crm/privacy-adapters/crm-contract-impersonation.adapter.ts` y sus pruebas. **No tocar** `packages/database/**`, que es de B2.

1. Inventariar **todo** escritor de `contracts.status` en `apps/` y entregar la lista con `archivo:línea`.
2. Cada escritor que lleve un contrato a `TERMINATED` o `ARCHIVED` fija `terminated_at = COALESCE(terminated_at, <hora de la transición>)` en la misma sentencia. En `_transition`, con `UPDATE` explícito o sobre la entidad releída bajo bloqueo (DT-3 D-RER-3), nunca sobre una entidad leída antes.
3. Adaptador `standing`: la consulta de D-O1-2, con `deleted_at IS NULL` y `max(terminated_at)` sobre `TERMINATED` y `ARCHIVED`. La firma del puerto no cambia.
4. `Contract.terminatedAt` en la entidad, sin exponerla en DTO ni en OpenAPI.
5. Pruebas unitarias por rama nueva. `contracts.service.ts` tiene 0,05 puntos de margen de ramas.

**Entrega:** inventario, diff, conteo real y cobertura por servicio frente a su línea base.

## B2 · `sr-backend` (2.ª instancia) · Migración, trigger y backfill (D-O1-1 y D-O1-3)

**Rutas:** `packages/database/src/migrations/tenant/**` (migración nueva y `runner.ts`). Leer la skill `iwana-tenant-migration`.

1. Número: el siguiente libre en `runner.ts`.
2. `ALTER TABLE contracts ADD COLUMN terminated_at timestamptz NULL`, más el trigger de D-O1-1 (inmutable una vez fijado; obligatorio al entrar en `TERMINATED` o `ARCHIVED`). Debe convivir con los triggers de la 169 sin alterarlos.
3. Backfill de D-O1-3, en el orden de candidatos de la spec, excluyendo los contratos de suscriptores con `anonymized_at` no nulo. Emite el conteo por candidato (sin PII).
4. `down`: elimina el trigger y la columna.
5. `*.integration.spec.ts`: CA-O1-05 y CA-O1-07, con `up → down → up`.

**Entrega:** número de migración, diff y conteo PG.

## B1-R · `sr-backend` · Cobertura de `contracts.service.ts` (añadido el 2026-11-02, tras la Ola 1)

B1 dejó las ramas de `contracts.service.ts` en **81,51 %**, por debajo de su línea base posterior a DT-3, **82,87 %** (C4d). Rutas: las de §B1, solo pruebas, salvo que una rama nueva resulte inalcanzable; en ese caso, `[BLOQUEO]`.

1. Pruebas para cada rama que añadió B1 en `contracts.service.ts` (`:198`, `:337`, `:1637`, `:1704`) hasta quedar en ≥ 82,87 %. Lifecycle (81,81 %) tampoco puede bajar su línea base.
2. Medir con la misma corrida que C4d (6 suites, `collectCoverageFrom` de los servicios tocados) y entregar la tabla por servicio.

## B2-R · `sr-backend` (2.ª instancia) · Timestamp único de la migración 170

`ContractRetentionClock1700000000000` repite el sufijo de `InitialTenantSchema1700000000000` (000). Es el único duplicado de la cadena tenant. El runner decide por nombre (`runner.ts:457-498`), pero `typeorm_migrations` quedaría con dos filas con el mismo `timestamp`, y las herramientas que ordenan por timestamp las confundirían.

1. Renombrar la clase y su `name` a un sufijo de 13 dígitos que nadie use (por ejemplo `1700000000170`), en `170_contract_retention_clock.ts`, `runner.ts` y `revert.ts` si la lista.
2. Prueba invariante en `packages/database`: los sufijos de toda la lista de `runner.ts` son únicos y tienen 13 dígitos.
3. Repetir `up → down → up` de la 170 y la suite completa de `@iwana/db`.

**Antes de aplicar la 170 en cualquier tenant de desarrollo** (B4). Si ya se aplicó en alguno con el nombre viejo, `[BLOQUEO]` y reportar en cuáles.

## B1-F · `sr-backend` · Tipo del parámetro en el ciclo de vida (añadido el 2026-11-02, tras la Ola 1-R)

**Defecto de producción de B1**, que reprodujo B1-R contra Postgres: en `subscriber-lifecycle.service.ts:615-617`, `$1` se usa como `status = $1` (enum) y como `$1 IN ('TERMINATED', 'ARCHIVED')` (texto). PostgreSQL responde `inconsistent types deduced for parameter $1`, así que todo cambio de estado de contratos por el ciclo de vida falla. Las unitarias con mocks no lo ven.

**Autorizado por AI-EM-ARCH.** Rutas: solo `subscriber-lifecycle.service.ts` y sus pruebas.

1. Usar `$1::contract_status_enum` en los dos sitios. El `search_path` del tenant resuelve el tipo.
2. Revisar con `rg` si hay más SQL de B1 que reutilice un parámetro con dos tipos (`_transition`, impersonation, `standing`) y corregirlo igual.
3. La prueba que lo demuestra es la integración PG de ciclo de vida, que B3 pasa a la cadena migrada. Además, una prueba PG mínima en esta ola: `TERMINATE` de un contrato por el ciclo de vida, contra el esquema migrado, fija `terminated_at` y no lanza error.

**Entrega:** diff, la prueba PG y la suite unitaria de `@iwana/api` sin caché.

## B2-R2 · Cierre del gate de integración de `@iwana/db`

Las decisiones de B2-R se aceptan:
- sufijo `1700000000170`;
- 10 excepciones explícitas a los 13 dígitos, porque son migraciones ya aplicadas y renombrarlas las haría reaplicar. Toda migración nueva lleva 13 dígitos.

**Falta la suite de integración de `@iwana/db`.** Se corre como en CI: base nueva `iwana_it_*` con migraciones públicas y tenant (el procedimiento de §H2 del informe de consolidación), **no** sobre `dbiw`. En `dbiw`, siete suites se niegan a correr y una invariante falla por `tenant_e2e_mod13_f1_41398e`, un tenant de desarrollo a medio aprovisionar y ajeno a O-1.

**Entrega:** conteo con 0 omitidas no declaradas.

## B3 · `sr-qa` · Criterios de aceptación (tras B1-F, B2-R2 y B4 paso 1)

**Añadido el 2026-11-02, dependencia de entorno:** `contracts.service.postgres.integration.spec.ts` (y otras dos suites) clonan `contracts` de `tenant_iwana` con `LIKE … INCLUDING ALL`. Mientras la 170 no esté aplicada en ese tenant, fallan 22 casos. B4 paso 1 aplica la cadena en desarrollo **antes** de B3. Que esas suites dependan del estado de `tenant_iwana` es una deuda de hermeticidad (P2), que queda registrada en el plan y no se corrige en O-1.

**Añadido el 2026-11-02:** `subscriber-lifecycle.service.postgres.integration.spec.ts` da 6 FAIL porque su DDL hecho a mano no tiene `terminated_at`. Es la **tercera vez** que ese fixture se rompe por una columna (DT-3 B3-H y B3-H2), así que se cierra la deuda P3-5: el fixture pasa a crear el esquema con la cadena de migraciones (`applyTenantMigrationsInOrder`, como en `contract-plan-change`, `g1-conversion-failure` y `responsibilities`). Es de categoría (a): no cambia ninguna aserción. Si alguna aserción tiene que cambiar, `[BLOQUEO]`. La revisa `test-change-reviewer`.

Eres verificador **y autor de pruebas**: escribes pruebas y fixtures, nunca código de producto.

1. CA-O1-01 a 04, 06 y 08 en una suite PG nueva `apps/api/src/modules/privacy/requests/retention-clock.postgres.integration.spec.ts`. Usa el adaptador real y `resolve` real, sin dobles de puertos entre módulos, con el esquema creado por la cadena de migraciones.
2. CA-O1-09: correr sin ajustes las suites PG de DT-3 y las del clúster que lista la spec.

**Entrega:** tabla CA → `archivo:línea` → PASS/FAIL, con conteo real y 0 omitidas.

## B4 · `plat-ops` · Verificación en datos de desarrollo (D-O1-5, tras B2-R)

Solo lectura sobre la base de desarrollo. No se borra ni se modifica ningún dato, y no se usan tenants de producción.

1. Aplicar la cadena de migraciones a los tenants de desarrollo con el comando del repo, y reportar cuáles quedaron migrados.
2. `anonymize-titular --verify-only` por tenant: conteos de titulares anonimizados con residuales.
3. Conteo por tenant de titulares cuyo resultado de retención cambia con O-1, en las dos direcciones, comparando la lógica anterior con la nueva. Solo conteos.

**Entrega:** tabla por tenant (CA-O1-10). Cualquier residual mayor que 0 en `--verify-only` va como hallazgo con su id, sin PII.

**Añadido el 2026-11-02 (paso 1 hecho: 7 de 7 tenants ACTIVE en la 170):**
- El runner no mostró el conteo por candidato del backfill: solo `tenant_e2e_privacy_1b_a114bf06` tenía contratos terminales, 16. Paso 4: reconstruirlo en solo lectura, clasificando cada `terminated_at` según el candidato que coincide (`crm_lifecycle_changes.changed_at`, `status_changed_at` o `updated_at`). Solo conteos.
- Los tenants que no están `ACTIVE` quedan sin migrar a propósito. No se tocan.

## B2-R3 · `sr-backend` · Conteo del backfill visible en el runner

D-O1-3 pide que la migración deje el conteo por candidato en la salida del runner, y en la ejecución real no apareció. Hay que hacer que la 170 lo emita por el canal que el runner muestra (el mismo logger o `console` que usan otras migraciones con salida), sin PII. Antes de G7, porque en producción no habrá forma de reconstruirlo. Rutas: `170_contract_retention_clock.ts` y su prueba, que comprueba la salida.

## B5 · Verificación (tras B3 y B4)

| Agente | Encargo |
| --- | --- |
| `sec-eng` | D-O1-1 a D-O1-4: ningún camino deja un contrato terminal sin `terminated_at` y nada lo reescribe. Revisión de la convivencia con la 169 |
| `test-change-reviewer` | Toda prueba existente modificada |
| `boundary-reviewer` | `privacy` sigue leyendo CRM solo por el puerto |
| `gate-verifier` | Gates de AGENTS.md sobre `@iwana/api` y `@iwana/db`, cobertura por servicio frente a su línea base y la lista de integraciones PG con 0 omitidas |

**Añadido el 2026-11-03, antes de lanzar B5:**
- **`sec-eng`, punto adicional:** el trigger de la 169 consulta `subscribers` sin calificar el esquema (`169_prevent_anonymized_crm_mutations.ts:26`), igual que el de la 170 si lo hace. Depende del `search_path` de la sesión que escribe; B3 tuvo que pasar sus `UPDATE` por `runInTenantSchema`. Dictaminar si basta con la regla actual (toda escritura del tenant usa `SET LOCAL search_path`) o si las funciones del trigger deben fijar su propio `search_path` o resolver la tabla desde `TG_TABLE_SCHEMA`. Si propone un cambio, va como hallazgo con severidad; no se implementa en B5.
- **`test-change-reviewer`:** vuelve a revisar las pruebas que B3 modificó después de su primera revisión (prueba PG de `TERMINATE`, pruebas B1-R y el fixture de ciclo de vida migrado a la cadena).
- **Desvío aceptado de B1-F:** en lugar de `$1::contract_status_enum`, el ciclo de vida pasa `$6::boolean`, calculado en JS. Es la solución que recoge la memoria del proyecto sobre parámetros con dos tipos, y AI-EM-ARCH la da por buena.
- **`gate-verifier`:** la integración de `@iwana/db` se corre en `iwana_it_b2r3_20261102`. La base `iwana_it_ci_r2_20261102` la borró el usuario el 2026-11-02.

## B2-R4 · `sr-backend` · `terminated_at` obligatorio también en INSERT (P2 de B5, 2026-11-03)

**Hallazgo de `sec-eng`:** el trigger de la 170 es solo `BEFORE UPDATE` (`170_contract_retention_clock.ts:51`), así que un `INSERT` directo de un contrato `TERMINATED` o `ARCHIVED` sin `terminated_at` pasa. Hoy ninguna ruta pública lo hace: las creaciones van a `DRAFT` y el ciclo de vida termina con `UPDATE`. Pero D-O1-1 dice «lo exige al entrar», y entrar también puede ser un `INSERT` (importaciones, CLI o escritores futuros).

**Decisión de AI-EM-ARCH:**
- **Migración 171, aditiva.** No se edita la 170: ya está aplicada en 7 tenants de desarrollo y el runner decide por nombre, así que esos tenants se quedarían con la versión vieja sin avisar.
- **Rechazar, no autocompletar.** Un `INSERT` en estado terminal sin `terminated_at` falla con `23514`. Autocompletar con `now()` inventaría una fecha de terminación para datos importados.

**Rutas:** `packages/database/src/migrations/tenant/**` (171 y `runner.ts`).

1. Migración 171, con sufijo único de 13 dígitos (la prueba invariante lo exige): `CREATE OR REPLACE` de `contract_preserve_retention_clock()`, que maneja `TG_OP = 'INSERT'` (estado terminal y `terminated_at IS NULL` → `23514`), y un trigger nuevo `BEFORE INSERT` sobre `contracts`. Se conserva la lógica de `UPDATE`. El `down` deja la función y el trigger exactamente como los dejó la 170.
2. Prueba de integración: un `INSERT` terminal sin fecha falla; con fecha pasa; un `INSERT` en `DRAFT` pasa; el `UPDATE` sigue como en la 170. `up → down → up`.
3. Aplicar la 171 en los 7 tenants `ACTIVE` de desarrollo (comando del repo) y contar, en solo lectura, los contratos terminales con `terminated_at` nulo que no son de un titular anonimizado. Deben ser 0. Si no lo son: `[BLOQUEO]` con los ids.

## B3-R · `sr-qa` · Fixtures que insertan contratos terminales (tras B2-R4)

1. `b5-identity-conversion.postgres.integration.spec.ts:214` (`persistContract`): cuando el estado sea `TERMINATED` o `ARCHIVED`, el fixture pone `terminatedAt`. Es categoría (b), por D-O1-1, y la aserción de `:1198` no cambia.
2. Buscar con `rg` cualquier otro fixture que inserte contratos terminales sin fecha y aplicarle el mismo ajuste (b). Si alguno exige cambiar una aserción: `[BLOQUEO]`.
3. Repetir la corrida completa de integraciones PG de API y DB con `IWANA_DB_INTEGRATION_AVAILABLE=true`, en la base aislada `iwana_it_o1_b5_20261103` (migrada hasta la 171).

Después, `test-change-reviewer` revisa los fixtures ajustados y `gate-verifier` repite el gate de B5.

**`search_path` de la 169:** `sec-eng` concluye que basta la regla actual (toda escritura del tenant pasa por `runInTenantSchema`, que fija `SET LOCAL search_path`, `data-source.ts:197-213`), y AI-EM-ARCH la acepta. No hay cambio.

Cierre: informe `docs/informes/INFORME-PRIVACY-O1-RETENCION-CIERRE-v1.0.md` (verificar que la ruta esté libre) y HLD Privacy en su versión siguiente (§6.6 y §10).
