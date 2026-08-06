# INFORME — SEC-P1: hashes con clave y cierre de fuga PII al audit trail

**Código:** SEC-P1  
**Versión:** 1.0  
**Fecha:** 2026-08-05  
**Agente:** AI-SR-FULL  
**Orquestador:** AI-EM-ARCH  
**Prompt:** [PROMPT-SEC-P1-HASH-HMAC-Y-PII-AUDITORIA-v1.0.md](../prompts/PROMPT-SEC-P1-HASH-HMAC-Y-PII-AUDITORIA-v1.0.md)  
**ADRs:** ADR-078 (propuesto) ([enlace](../adrs/ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md)) D3/P1 · [ADR-058](../adrs/ADR-058-Rotacion-Clave-Cifrado-PII-MFA.md)

---

## Estado de hallazgos

| ID | Hallazgo | Estado |
| --- | --- | --- |
| **S-1** | Hashes SHA-256 sin clave (documento/email/teléfono enumerables) | **Cerrado** — HMAC-SHA-256 con `PII_HASH_KEY` + expand/contract `*_hmac` |
| **S-2** | PII en `audit_logs` (ruta que evade interceptor + hueco lat/long) | **Cerrado** — sanitización en `AuditService.log()` + denylist ampliada + migración 110 |

---

## Cierre hallazgos AI-SEC-ENG (GO_WITH_CONCERNS → G5)

| ID | Severidad | Estado | Evidencia |
| --- | --- | --- | --- |
| **H-1** | Alta | **Cerrado** | `scripts/dev-reset-platform-admin.mjs` y `dev-verify-platform-login.mjs`: HMAC + `PII_HASH_KEY`, SQL/`prefix` sobre `email_hmac` |
| **H-2** | Media | **Cerrado** | `PlatformAuditService.log()` aplica `sanitizeAuditPayload`; test H-2 en `platform-audit.service.spec.ts` |
| **H-3** | Media | **Cerrado** | Emails vía `hashEmail` (toLowerCase+trim) en subscribers; worker `hashEmail` normaliza; update refresca `emailHash`/`phoneHash` |
| **H-4** | Deseable | **Cerrado** | Unit SQL 075 + **integration Postgres** `075_enforce_audit_immutability.integration.spec.ts` (4/4 PASS) |
| **H-5** | Deseable | **Cerrado** | Asserts description/title/sector/municipality + lat/long numéricos (sanitize + AuditService) |
| **H-6** | Deseable | **Cerrado** | `sourceDetail` / `source_detail` en denylist API + SQL shared (trivial) |
| **H-7** | Deseable | **Cerrado** | Comentarios SHA-256 obsoletos actualizados a HMAC en users/subscribers |

---

## E0 flip (evidencia)

1. **E0 (AI-SR-QA):** `hash-document.enumerability.spec.ts` **PASÓ** demostrando recuperación de cédula sintética por enumeración SHA-256.
2. **Tras E1:** la misma enumeración contra digest HMAC **ya no** recupera vía SHA-256 crudo.
3. **Regresión permanente:** el spec quedó **invertido** a assert negativo (`recoveredViaRawSha256 === undefined`) + comprobación de que con `PII_HASH_KEY` la búsqueda legítima sigue siendo determinista.

Cadena documentada en el propio describe del spec: *“E0 pasó → falló tras HMAC → invertido a assert negativo”*.

---

## Entregables por etapa

| # | Resultado |
| --- | --- |
| **E1** | `PII_HASH_KEY` (Joi fail-fast, entropía nula rechazada) + HMAC en `hash-document.util`, `hash-email.util`, `subscribers.service`, backfill util; Joi en `app.config.ts` |
| **E2** | Migración tenant **108** — columnas `*_hmac`, índices, backfill por lotes |
| **E3** | Migración tenant **109** — DROP columnas SHA-256; entidades mapean a `*_hmac`. Pública **021** para `platform_users` |
| **E4** | `sanitizeAuditPayload` en `AuditService.log()` **y** `PlatformAuditService.log()` (H-2) |
| **E5** | Denylist: lat/long, description, title, sector, municipality, **sourceDetail** (H-6) |
| **E6** | Migración tenant **110** — redacción retroactiva con `SET LOCAL iwana.audit_maintenance = 'on'`; `down` irreversible |

---

## Migraciones

| # | Path | Notas |
| --- | --- | --- |
| 108 | `packages/database/src/migrations/tenant/108_add_pii_hmac_columns.ts` | Expand + backfill |
| 109 | `packages/database/src/migrations/tenant/109_drop_pii_sha256_hash_columns.ts` | Contract; `down` exige `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN` (registrada en `revert.ts`) |
| 110 | `packages/database/src/migrations/tenant/110_redact_audit_pii_coords_and_free_text.ts` | Redacción; down no restaura |
| 021 | `packages/database/src/migrations/public/021_platform_users_email_hmac.ts` | Paridad platform (email cifrado → HMAC) |
| 022 | `packages/database/src/migrations/public/022_drop_platform_users_email_hash.ts` | Contract platform; escindida de la 021; guardián de huecos HMAC |

Tras 109/021 **y el contract (ventana 2)** en dev: **no quedan columnas `*_hash` SHA-256** de búsqueda PII (el único `*_hash` restante es `users.password_hash`, hash de contraseña legítimo, fuera del alcance SEC-P1); el runtime usa `*_hmac`.

---

## Nota de rotación D-D

Rotar `PII_HASH_KEY` **exige backfill completo** de todas las columnas `*_hmac`. No hay versión de clave en este corte. Documentado en `docs/runbooks/RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md` §6bis. Independiente de `MFA_ENCRYPTION_KEY` (D-A).

---

## Criterio 6 — redacción (conteos, nunca valores)

Tras aplicar 110 en cada schema tenant, verificar solo conteos. **Criterio permanente (concerns C1/C3 y F-3):** cubre `new_value` **y** `old_value`, y exige tipo escalar `string`/`number` para no sobrecontar coordenadas JSON `null` (sin dato, que no son PII y el predicado original `payload->>'latitude' IS DISTINCT FROM '[REDACTADO]'` contaba por `NULL IS DISTINCT FROM <texto> = true`).

```sql
-- Debe ser 0: claves sensibles con valor escalar (string/number) aún distinto de [REDACTADO],
-- tanto en new_value como en old_value. `old_value` NULL no cuenta (payload ? clave → NULL).
WITH candidatas AS (
  SELECT 'new_value' AS col, new_value AS payload FROM audit_logs
  UNION ALL
  SELECT 'old_value' AS col, old_value   AS payload FROM audit_logs
)
SELECT COUNT(*) AS pending
FROM candidatas
WHERE (payload ? 'latitude'  AND jsonb_typeof(payload->'latitude')  IN ('string','number') AND payload->>'latitude'  IS DISTINCT FROM '[REDACTADO]')
   OR (payload ? 'longitude' AND jsonb_typeof(payload->'longitude') IN ('string','number') AND payload->>'longitude' IS DISTINCT FROM '[REDACTADO]')
   OR (payload ? 'fullName'  AND jsonb_typeof(payload->'fullName')  IN ('string','number') AND payload->>'fullName'  IS DISTINCT FROM '[REDACTADO]');
```

**Refinamiento 2026-08-06 (cierre G6):** en la DB viva el SQL literal daba 12 "pendientes" (4+8) que resultaron ser claves `latitude` con valor JSON `null` (sin dato). El SQL refinado (escalares) da **0 reales** en los 10 tenants ACTIVE. Ver «Evidencia ventana 1 — migraciones + SQL criterio 6 (cierre G6)». El gate ampliado a `old_value` (F-3) se activó el 2026-08-06; los conteos de cierre se hicieron sobre `new_value` (medición de la 110, que redacta ambas columnas con la misma política).

(No volcar `new_value` / `old_value` en logs ni informes.)

---

## Ops

1. Generar y fijar `PII_HASH_KEY` (`openssl rand -hex 32`) en secret store / `.env` local no versionado.
2. `pnpm db:migrate:all` (public 021 + tenant 108→110).
3. Reiniciar API/worker — sin `PII_HASH_KEY` el bootstrap Joi falla con mensaje explícito.
4. Ejecutar SQL de criterio 6 (conteos, nunca valores) sobre cada schema tenant — evidencia ops para §5.6.

### Preflight `pnpm dev` (desbloqueo migraciones SEC-P1)

**Fecha verificación E3:** 2026-08-05 · **Agente:** AI-SR-QA

- `scripts/dev.mjs` exige `PII_HASH_KEY` vía `requiredMigrationEnvVars` **antes** del paso «Ejecutando migraciones» (`assertMigrationEnvFromDisk`). Sin la clave, aborta con mensaje accionable (`openssl rand -hex 32`, runbook §6bis) — no con el error crudo de interpolación/backfill a mitad de transacción.
- **Gotcha carga env / early-return:** el CLI TypeORM (`ensureDatabaseEnvLoaded` en `@iwana/db` data-source) carga `.env.development.local` → `.env.development` → `.env` y **se detiene al completar `DB_HOST` + `DB_USER` + `DB_PASSWORD`**. Si `.env.development` ya trae esas `DB_*`, una `PII_HASH_KEY` solo en `.env` **no llega** al proceso. Preferir `.env.development.local` (o `.env.development`). El preflight de `pnpm dev` fusiona esos tres archivos (first-wins) e **inyecta** la clave en `process.env` para el hijo `pnpm db:migrate:all`.
- Evidencia QA (sin secretos): `node --test scripts/dev.test.mjs` → 24/24 PASS; smoke `assertMigrationEnv(Map vacío)` lanza con `PII_HASH_KEY` + gotcha `.env.development.local`; `pnpm db:migrate:all` exit 0 (idempotente, sin pendientes).

---

## Consolidación AI-EM-ARCH (G5)

**Modo:** Architect + Orchestrator + EM  
**Fecha:** 2026-08-05  

| Agente | Rol | Resultado |
| --- | --- | --- |
| [AI-SR-QA](fdc92bee-c7d9-4fcc-814e-8a4a8911b086) | E0 red | DONE |
| [AI-SR-FULL](69b5775d-9e87-47a4-b7f2-68b6a95480ea) | E1–E6 + H-1..H-7 | DONE |
| [AI-SR-QA](d1e07b9f-717e-42d6-9e22-362b7a8d6749) | E7 + re-verificación | GO_WITH_CONCERNS → mitigado |
| [AI-SEC-ENG](bd0bcfd9-a27d-49e5-a755-90b6872715b4) → [re-review](43e011ff-e64d-4b4d-b77d-11818fad7e2e) | Auditor hallazgo | S-1/S-2 **CERRADOS**; GO_WITH_CONCERNS (residuales no bloqueantes) |

| Gate | Estado | Nota |
| --- | --- | --- |
| **G5** | **GO** | S-1/S-2 cerrados; H-1..H-7 cerrados; contrato de clave y sanitización en sinks productivos |
| **G6** | **GO** (cerrado 2026-08-06) | Punto 2 lock **cerrado** (medición 2026-08-06, KEEP) + **ventana 1 migraciones + SQL criterio 6 ejecutados en DB viva**. Concerns **corregidos** el 2026-08-06: criterio 6 refinado (JSON null) y ampliado a `old_value`; chequeo de paridad post-run en CLI (`assertTenantMigrationParity`); gobernanza de ventana 2 en aviso de diferidas |
| **G6.5 / G7** | Fuera de alcance | ADR-069 / dominio productivo |

**Impacto (tenant / seguridad / escala / regulación):** alto positivo en seguridad (Ley 1581 / Habeas Data — mitigación de enumeración offline y fuga a audit trail). Multi-tenant intacto. Escala: expand/contract correcto para N tenants. Regulación: no inventada; mitigantes técnicos del expediente ADR-078 (propuesto).

**Deuda residual D1–D4 + H-4 Postgres:** **Cerrada** (véase «Cierre deuda residual»).

**Convive en working tree:** bootstrap P0 (Vía B) + informe bootstrap — sin commit en esta sesión.

**Pendiente humano (plan congelado 2026-08-06 — secuencia S1 + A1/A2 + B1):**

1. **Commit/merge** del código SEC-P1.
2. Ejecutar [`RUNBOOK-SEC-P1-VENTANA-EXPAND-CONTRACT-v1.0.md`](../runbooks/RUNBOOK-SEC-P1-VENTANA-EXPAND-CONTRACT-v1.0.md) vía [`PROMPT-OPERATIVO-SEC-P1-CIERRE-VENTANAS-v1.0.md`](../prompts/PROMPT-OPERATIVO-SEC-P1-CIERRE-VENTANAS-v1.0.md):
   - fijar `PII_HASH_KEY` por entorno (A1/A2 — **clave distinta** staging ≠ prod);
   - ventana 1 staging → smoke → criterio 6 + paridad;
   - ventana 1 prod (go CTO) → soak **B1** (3–7 d) con **fecha hard** de ventana 2;
   - ventana 2 (`IWANA_APPLY_PII_CONTRACT=true`) con backup del día → cierre residual S-1.

Ventana 1 + evidencia §5.6 en **dev local** completadas el 2026-08-06 (cierre G6). **Ventana 2 (contract 022/109) ejecutada y verificada en dev local el 2026-08-06** (ver «Evidencia ventana 2 — contract aplicado en dev»): la iniciativa queda **cerrada en dev**. Staging/prod siguen el runbook.

---

## Cierre deuda residual

**Fecha:** 2026-08-05  
**Agente:** AI-SR-FULL  
**Alcance:** anti-drift HMAC email + limpieza post-109 de `email_hash` en runtime/scripts/comentarios.

| ID | Acción | Evidencia |
| --- | --- | --- |
| **D1** | Utilidad única HMAC email | Fuente TS: `packages/database/src/migrations/shared/pii-hmac.util.ts` exportada desde `@iwana/db` (`hmacEmail`, `loadPiiHashKeyFromEnv`, …). Wrapper ESM: `scripts/lib/pii-hmac.mjs`. `dev-reset-platform-admin.mjs` / `dev-verify-platform-login.mjs` importan el wrapper (**cero** `createHmac` local). Worker `TenantSeedService` usa `@iwana/db` (sin método privado). API `hash-email.util.ts` intacta; comentario de alineación. |
| **D2** | Quitar fallback `email_hash` | `users.service.ts` `mapUserRow`: solo `email_hmac` / `emailHash`. Comentario soft-delete → `email_hmac`. Spec de filas crudas → `email_hmac`. |
| **D3** | Scripts/probes mod04 | `mod04-h05-search-bench.{sql,mjs}`, `mod04-ola-c-083-reversibility.sql`, `mod04-ola-c-convergence-probe.sql`: columna/constraint `email_hmac` / `uq_users_email_hmac`; placeholders 64-hex sintéticos (`lpad(to_hex(i),64,'0')` / `padStart(64,'0')`). Grep `scripts/`: sin `email_hash` operativo (solo mención histórica en header de `dev-reset`). |
| **D4** | Comentario auth | `auth.service.ts` login: «HMAC-SHA-256 del email en minusculas + trim». |
| **H-4+** | Trigger en Postgres vivo | [AI-SR-QA](4450ceb4-8213-483e-b485-3a381df5e564): `075_enforce_audit_immutability.integration.spec.ts` — UPDATE/DELETE sin escotilla → `42501`; con `SET LOCAL iwana.audit_maintenance = 'on'` → UPDATE de redacción permitido. **4/4 PASS** contra PostgreSQL (`IWANA_DB_INTEGRATION_AVAILABLE`). |

### Consolidación AI-EM-ARCH — cierre deuda

**Modo:** EM + Orchestrator · **Fecha:** 2026-08-05  
**Agentes:** [AI-SR-FULL](ab9a0945-698e-4db9-a12a-ca3ac4dad625) (D1–D4) · [AI-SR-QA](4450ceb4-8213-483e-b485-3a381df5e564) (H-4+)

| Ítem | Estado |
| --- | --- |
| Drift HMAC scripts/worker | **Cerrado** — `@iwana/db` + `scripts/lib/pii-hmac.mjs` |
| Fallback `email_hash` | **Cerrado** |
| Probes mod04 `email_hash` | **Cerrado** |
| Comentarios SHA-256 | **Cerrado** |
| Trigger inmutabilidad runtime | **Cerrado** (integration Postgres) |

**Veredicto deuda:** no queda deuda SEC-P1 declarada abierta en este corte. Ops (§5.6 migraciones + conteos) sigue pendiente humano.

**Fuera de alcance (sin tocar):** bootstrap WIP (`ExecutionOrderSchedulingModule`, `app.bootstrap.spec.ts`); sin commit; sin PII real.

---

## Auditoría de la migración de backfill y su reversibilidad

**Fecha:** 2026-08-06 · **Alcance:** `108`, `109`, pública `021`, `shared/backfill-pii-hmac.util.ts` — lo único de SEC-P1 que había quedado sin verificar y que toca datos.

### Hallazgos corregidos

| ID | Severidad | Hallazgo | Corrección |
| --- | --- | --- | --- |
| **A-1** | Bloqueante | La clase `PlatformUsersEmailHmac0210000000000` producía `parseInt(nombre.substr(-13))` = `210000000000`, muy por debajo del rango real de las públicas (`1741766400000`–`1784419208000`). TypeORM ordena ascendente por ese número: sobre una base ya migrada no se nota (es la única pendiente), pero en **bootstrap limpio** se ejecutaba antes de `001_create_public_schema` y abortaba la corrida entera. Además `getLatestExecutedMigration` usa el mismo número, así que `migration:revert` nunca la elegía: revertía la 020. | Renombrada a `PlatformUsersEmailHmac1784419209000` (mismo patrón que la 020, que ya había sufrido este defecto). El `up` borra el registro del nombre anterior y se volvió idempotente (`ADD CONSTRAINT` condicionado y anclado por `conrelid`). |
| **A-2** | Bloqueante | `backfillSubscriberHmacColumns` era la única de las cuatro funciones sin el guardián `processed > 0 && updated === 0`, y la `109` validaba huecos de HMAC solo en `expediente_records` y `users` — **no en `subscribers`**. Con ciphertext escrito bajo una clave AES ya no configurada, las filas se saltaban con un `warn` por fila, la `108` terminaba «OK» y la `109` borraba sus `*_hash`: búsqueda y deduplicación por documento/email/teléfono rotas sin forma de recalcularlas. | Guardián de paridad añadido en el backfill; guardián nuevo en `109.up` que cuenta los tres campos de `subscribers` por separado y bloquea el DROP. `BackfillHmacResult` gana `failed`, que hace visible el fallo parcial de campo dentro de una fila que por lo demás se actualizó (antes contaba como `updated` y no aparecía en ningún resumen). |
| **A-3** | Alto | `021.down` no exigía flag destructivo, a diferencia de `109.down`. Ambos repueblan `*_hash` con digests **HMAC**, no con los SHA-256 originales: la columna queda poblada y con UNIQUE, pero un binario pre-SEC-P1 no encuentra a ningún usuario y el login se rompe en silencio. | `021.down` exige `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true` (mismo flag que usa la pública 020) y rechaza antes de emitir DDL. La limitación quedó escrita en la cabecera de ambas migraciones. |
| **A-4** | Medio | Detectado durante la ejecución real de la ventana 1 (2026-08-06): el `up` renombrado de la 021 ejecutaba `ALTER TABLE platform_users ALTER COLUMN email_hash DROP NOT NULL` incondicionado. En una base donde `email_hash` ya no existe (DB que pasó por el contract 022-equivalente en una corrida previa, o drift post-contract), el `up` abortaba y la corrida entera de ventana 1 quedaba bloqueada. | `email_hash DROP NOT NULL` condicionado a la existencia de la columna (`DO $$ IF EXISTS (SELECT 1 FROM information_schema.columns …)`). Nuevo caso de regresión en `021_platform_users_email_hmac.spec.ts` («up libera el NOT NULL de email_hash solo si la columna existe»). |

### Cobertura añadida

Ninguna de estas migraciones tenía spec (la equivalente anterior, `088`, sí). Añadidos, 22 casos en total:

| Archivo | Cubre |
| --- | --- |
| `shared/backfill-pii-hmac.util.spec.ts` | Paridad de normalización con el runtime, guardián de clave equivocada, `failed` en fallo parcial, clave previa tras rotación, cero PII en avisos, avance del cursor keyset e idempotencia |
| `tenant/109_drop_pii_sha256_hash_columns.spec.ts` | Los tres guardianes previos al DROP y el flag destructivo del `down` |
| `public/021_platform_users_email_hmac.spec.ts` | Timestamp, idempotencia del `up`, limpieza del registro legacy y flag destructivo del `down` |
| `public/migration-order.spec.ts` | **Regresión permanente de A-1**: replica el `parseInt(...substr(-13))` de TypeORM y exige que el orden resuelto coincida con el orden de archivo |

Verificación: `pnpm --filter @iwana/db test` → 21 suites / 109 tests PASS; `typecheck` y `lint` limpios.

### Verificado como correcto (sin cambios)

- **Paridad de normalización backfill↔runtime**, campo por campo: email con `toLowerCase().trim()` en ambos lados; documento y teléfono sin normalizar en ambos. En subscribers el ciphertext se genera del mismo valor crudo que alimenta el hash, así que descifrar y rehashear reproduce el digest del runtime. Sin drift.
- Cero PII en logs: los avisos emiten solo UUIDs.
- Paginación keyset (`id > $1`) correcta, sin bucle infinito cuando una fila se salta.
- `UPDATE ... AND col IS NULL`: idempotentes ante reejecución.
- `108.down` es genuinamente reversible mientras la `109` no haya corrido.

### Riesgos operativos abiertos (decisión humana, no defectos de código)

1. ~~**El expand/contract no ofrece ventana de compatibilidad.**~~ **Resuelto 2026-08-06** — ver «Contract diferido» más abajo. La parada sigue siendo necesaria (el binario cambia de columna de lectura), pero el rollback ya no exige backup.
2. ~~**Lock prolongado en `users`.**~~ **Cerrado 2026-08-06 (medición §5.6 / Punto 2)** — ver «Evidencia Punto 2 — lock 108» más abajo. `transactional = true` se **mantiene**; sin cambio de código de migración. Umbral documentado en cabecera de `108_*`.
3. ~~**`users.email` vacío aborta el tenant.**~~ **Cerrado 2026-08-06 (ventana 1):** `SELECT count(*) FROM users WHERE email IS NULL OR octet_length(email) = 0` → **0 filas** en los 10 tenants ACTIVE. El backfill no encontró filas pendientes (`processed=0`) y la 108 ya estaba aplicada sin huecos.
4. **Bases donde la `021` ya corrió con el nombre anterior**: el `up` renombrado se re-ejecuta sin efecto (todo idempotente) y retira la fila legacy del registro. **Verificado en vivo 2026-08-06** (ventana 1): el legacy `PlatformUsersEmailHmac0210000000000` salió del registro y quedó `PlatformUsersEmailHmac1784419209000`. Con base post-contract (sin `email_hash`) aplica el fix A-4.

**Veredicto:** los tres bloqueantes de código quedan cerrados con cobertura. Punto 1 (ventana) y Punto 2 (lock) **cerrados** el 2026-08-06. Queda abierto el preflight operativo #3 (emails vacíos) y la ejecución humana de ventana 1 (`pnpm db:migrate:all` + leer resumen `[MIGRATOR]`).

---

## Contract diferido — dos ventanas (decisión del CTO, 2026-08-06)

De las dos opciones planteadas se eligió **B: aplicar el expand ahora y diferir el contract**, para que volver al binario pre-SEC-P1 no dependa de restaurar backup. La parada de servicio sigue siendo necesaria en la ventana 1; lo que se compra es reversibilidad.

### Mecanismo

`IWANA_APPLY_PII_CONTRACT` gobierna las dos migraciones de contract:

| Migración | Rol | Se aplica |
| --- | --- | --- |
| tenant `108` | expand: columnas `*_hmac` + backfill; libera el `NOT NULL` de `users.email_hash` | ventana 1 |
| pública `021` | expand: `platform_users.email_hmac`; libera el `NOT NULL` de `email_hash` | ventana 1 |
| tenant `109` | contract: DROP de `subscribers/expediente/users.*_hash` | ventana 2 |
| pública `022` | contract: DROP de `platform_users.email_hash` (**nueva**, escindida de la 021) | ventana 2 |

Ambos contracts declaran `deferredBy = 'IWANA_APPLY_PII_CONTRACT'`. Se **saltan sin registrarse**, así que la corrida siguiente vuelve a considerarlas; `cli/tenant-migrate.ts` las anuncia una vez al final de `db:migrate:all` **solo si aún no constan en el registro** (`filterDeferredMigrations` — tras la ventana 2 no hay anuncio espurio).

El `DROP NOT NULL` de ambos expands es lo que hace operable el estado intermedio: el runtime ya no escribe `*_hash`, y sin liberarlo el primer alta de usuario fallaría. Los `down` de `108` y `021` lo restituyen y exigen `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN` **solo** si encuentran altas ocurridas en ese intervalo — filas que no tienen SHA-256 y para las que no puede recalcularse.

### Cambio de infraestructura asociado

`data-source.ts` pasa de `migrations: ['dist/migrations/public/*.js']` a la lista explícita `PUBLIC_MIGRATIONS`: el CLI de TypeORM aplica todo lo pendiente y no tiene forma de saltarse una, así que el filtro tiene que ocurrir antes de que la vea. El glob quedaba además a merced del sufijo de cada clase, que es justo lo que causó A-1. `migration-order.spec.ts` verifica que ningún archivo del directorio quede fuera de la lista — el riesgo que introduce el cambio.

### Procedimiento

**Ventana 1** (parada de servicio):

1. Detener API, web, portal y worker.
2. `pnpm db:migrate:all` — aplica `021` y `108`; anuncia `022` y `109` como diferidas.
3. **Leer el resumen `[MIGRATOR]` antes de dar la corrida por buena.** `runTenantMigrations` itera schemas ACTIVE en serie y **no es atómico entre tenants**: si uno falla, los demás siguen y el error se lanza al final. No rearrancar API/portal/worker con flota parcial (algunos con `108`, otros sin).
4. Arrancar **solo si** todos los ACTIVE reportan OK; verificar login de plataforma y de tenant, y búsqueda por documento/email/teléfono.

Si algo falla: no arrancar con tenants mixtos; remediar el schema fallido o alinear rollback/reintento. Revertir el binario si hace falta. Los digests SHA-256 siguen intactos, salvo las altas posteriores al paso 2.

**Ventana 2** (tras el periodo de confianza que fije el CTO):

4. `IWANA_APPLY_PII_CONTRACT=true pnpm db:migrate:all` — aplica `022` y `109`, ambas con sus guardianes de huecos de HMAC.

A partir del paso 4 no quedan hashes SHA-256 enumerables y el rollback vuelve a exigir backup. **Mientras la ventana 2 no ocurra, S-1 sigue parcialmente abierto**: los digests SHA-256 antiguos siguen en la base. Es el precio consciente de la reversibilidad, y por eso el diferimiento no debe volverse permanente.

### Evidencia Punto 2 — lock 108 (§5.6 / G6)

**Fecha:** 2026-08-06 · **Entorno:** docker `iwana_postgres_dev` / DB `dbiw` · **Método:** `pg_class.reltuples` + `relpages` (sin `COUNT(*)`, sin PII) · **Protocolo:** AI-EM-ARCH orquesta · [AI-DATA-ENG](246f9f56-1395-48df-9842-ec19b6648af3) medición · [AI-SR-FULL](2ad39600-386d-4740-9786-5bd3e993abee) factibilidad · [AI-SEC-ENG](a1008003-91f6-495b-8971-b83b148bb6f2) `[SEC-REVIEW]`

| Métrica | Valor |
| --- | --- |
| Tenants ACTIVE / totales | 10 / (perfil ADR-078 ~55 schemas; este entorno no tiene 55 ACTIVE) |
| Tablas medidas | `users`, `subscribers`, `expediente_records` |
| Peak `reltuples` (OK) | **4** (`users` en un tenant e2e) |
| Peak `relpages` | **1** |
| Celdas ≥ 50k | **0** |
| Celdas ≥ 100k | **0** |
| `reltuples = -1` con `relpages > 0` | **0** (nunca-analizadas con heap) |
| `reltuples = -1` con `relpages = 0` | 18 (heap vacío; no cuentan como volumen) |

**Umbral aplicado:** KEEP si peak ≪ 50k; SWITCH si peak > ~100k.

| Agente | Dictamen |
| --- | --- |
| AI-DATA-ENG | **KEEP** `transactional = true`; SWITCH no es flip de flag (ADR-066: sin DML + CONCURRENTLY en la misma migración) |
| AI-SR-FULL | **KEEP** sin cambio de código; JSDoc de umbral (estilo 088); runner secuencial / no atómico entre tenants |
| AI-SEC-ENG | **GO_WITH_CONCERNS** — KEEP aceptable con parada de ventana 1; concern = no rearrancar con flota mixta (`[MIGRATOR]`) |

**Decisión EM-ARCH:** **KEEP** — sin cambio de `transactional` ni índices CONCURRENTLY. Cabecera de `108_*` actualizada con umbral + medición. Riesgo operativo #2 **cerrado** en este perfil de datos.

**Pendiente G6 restante (ops humano):** ~~aplicar migraciones en ventana 1 + SQL criterio 6~~ — **completado 2026-08-06** (ver «Evidencia ventana 1 — migraciones + SQL criterio 6 (cierre G6)»). Re-medir peak si el entorno productivo deja de ser “mínimo ADR-078”.

### Evidencia ventana 1 — migraciones + SQL criterio 6 (cierre G6)

**Fecha:** 2026-08-06 · **Entorno:** docker `iwana_postgres_dev` / DB `dbiw` · **Protocolo:** AI-EM-ARCH ejecuta la operación; [AI-SR-QA](097f4775-b9cf-479e-b868-9263e8fa62ab) y [AI-SEC-ENG](c2082052-9813-4e2a-814a-c802194c7d03) re-verifican en paralelo.

#### 1. Corrida de migraciones (ventana 1)

`pnpm db:migrate:all` (build + `migration:run` + `migration:tenant:run` + `apply-least-privilege`) → **exit 0**.

- **Pública:** aplicó `PlatformUsersEmailHmac1784419209000` (renombrado de la 021). Up idempotente: `ADD COLUMN IF NOT EXISTS email_hmac`, backfill `processed=0 updated=0 skipped=0`, `SET NOT NULL`, UNIQUE condicionado por `conrelid`, índice, `DROP NOT NULL` de `email_hash` condicionado (fix A-4) y **borrado del registro legacy** `PlatformUsersEmailHmac0210000000000`. Transacción pública commit → sin estado mixto.
- **Tenant:** `[MIGRATOR] Starting migrations for 10 tenant(s)` → los 10 `Done` en ~20–27 ms → `[MIGRATOR] All tenants migrated successfully`. Los 10 ACTIVE ya tenían registradas 108/109/110 (106 migraciones cada uno), así que no hubo pendientes ni flota mixta.
- **Diferidas (anunciadas por el CLI, no aplicadas):** `DropPlatformUsersEmailHash1784419210000` (022) y `DropPiiSha256HashColumns1090000000000` (109) — requieren `IWANA_APPLY_PII_CONTRACT=true` (ventana 2).
- `apply-least-privilege: OK` (SEC-04).

#### 2. SQL criterio 6 — redacción audit (conteos, nunca valores)

| schema (10 ACTIVE) | SQL literal (informe) | **Refinado (escalar sin redactar)** | `latitude` JSON null | `latitude` ya `[REDACTADO]` |
| --- | --- | --- | --- | --- |
| tenant_e2e_r1_r41_ms9by0ep_29bf40 | 0 | **0** | 0 | 0 |
| tenant_e2e_r1_r41_ms9byzj6_aa2314 | 0 | **0** | 0 | 0 |
| tenant_e2e_r1_r41_ms9dzdr4_674359 | 0 | **0** | 0 | 0 |
| tenant_e2e_r1_r41_ms9e3cik_6b5e4b | 4 | **0** | 4 | 0 |
| tenant_e2e_tenant_b_ms9by0ep_29bf40 | 0 | **0** | 0 | 0 |
| tenant_e2e_tenant_b_ms9byzj6_aa2314 | 0 | **0** | 0 | 0 |
| tenant_e2e_tenant_b_ms9dzdr4_674359 | 0 | **0** | 0 | 0 |
| tenant_e2e_tenant_b_ms9e3cik_6b5e4b | 0 | **0** | 0 | 0 |
| tenant_isp_demo | 0 | **0** | 0 | 0 |
| tenant_iwana | 8 | **0** | 8 | 3 |

**Interpretación:** los 12 “pendientes” del SQL literal son claves `latitude` con valor **JSON `null`** (sin dato) en `new_value` de `audit_logs`; el predicado original las contaba porque `NULL IS DISTINCT FROM '[REDACTADO]'` es true. No hay PII: el redactor idempotente devuelve identidad sobre ellas y el refinado (escalares string/number ≠ `[REDACTADO]`) da **0 en los 10 tenants**. El SQL del criterio quedó refinado en este informe (§5.6). Nota: `fullName`/`fullname` también en 0 (incluido `tenant_iwana`, donde la 110 ya dejó 3 latitudes `[REDACTADO]`).

#### 3. Verificación de backfill y preflight

- `platform_users`: 2 filas, `email_hmac` NULL = **0**, NOT NULL + UNIQUE vigentes.
- Tenants: `users_hmac_null`=0 · `subs_email_hmac_null`=0 · `subs_doc_hmac_null`=0 · `subs_phone_hmac_null`=0 · `exp_doc_hmac_null`=0 (los 10).
- Emails vacíos en `users` (riesgo #3): **0** en los 10 ACTIVE.
- Tests/typecheck: `pnpm --filter @iwana/db test` → **24 suites / 131 tests PASS** · `typecheck` OK · lint OK · 021 spec con 9 casos (incluye el nuevo de A-4).

#### 4. Veredictos y decisión

| Agente | Veredicto | Notas |
| --- | --- | --- |
| AI-SR-QA | **GO_WITH_CONCERNS** | Reproduce toda la evidencia (spec 021 9/9, suite 24/131, estado DB: pública sin legacy, 10 tenants con 108/109/110, backfill 0 nulos, criterio 6 refinado = 0). C1: SQL literal sobrecuenta nulls (accionado: refinado en informe). C2: runner no atómico entre tenants — añadir chequeo de paridad post-run. C3: filas futuras con lat/long null seguirán contando en el literal — usar el refinado como criterio permanente. |
| AI-SEC-ENG | **GO_WITH_CONCERNS** | (a) fix A-4 no debilita controles (email_hmac sigue NOT NULL+UNIQUE; el condicional es DDL puro sobre el respaldo); (b) JSON null no es fuga — correcto; (c) contracts diferidos preservan reversibilidad sin backup, con guardianes fail-safe; (d) sin PII en logs. F-1: refinar criterio 6 (accionado). F-2: gobernanza de ventana 2 para que el diferimiento no se vuelva permanente. F-3: extender el gate a `old_value`. |

**Decisión EM-ARCH:** **G6 GO** — ventana 1 aplicada y criterio 6 verificado con 0 pendientes reales. **Concerns accionados el 2026-08-06:**

- **C1 / C3 / F-1:** SQL del criterio 6 refinado en este informe (escalares `string`/`number`; JSON `null` no cuenta) — criterio permanente.
- **F-3:** criterio 6 ampliado a `old_value` (CTE `UNION ALL` sobre `new_value` + `old_value`).
- **C2:** chequeo de paridad post-run implementado — `assertTenantMigrationParity` (`packages/database/src/migrations/tenant/migration-parity.util.ts` + spec) comparando el conjunto de migraciones de todos los tenants ACTIVE; integrado en el CLI `cli/tenant-migrate.ts` **después** de `runTenantMigrations`, sin tocar el runner. Falla la corrida (exit ≠ 0) si la flota quedó mixta. **Validado en vivo:** `migration:tenant:run` → `[MIGRATOR] Paridad de migraciones OK: 10 tenant(s) ACTIVE con 106 migraciones idénticas`.
- **F-2:** gobernanza de ventana 2 en el aviso de diferidas (`describeDeferredMigration`): el diferimiento no debe volverse permanente y la ventana 2 debe planificarse en el periodo de confianza del responsable del proyecto.

**Ningún tenant quedó en estado mixto; los contracts 022/109 siguen diferidos.**

### Evidencia ventana 2 — contract aplicado en dev (cierre SEC-P1 en dev)

**Fecha:** 2026-08-06 · **Entorno:** docker `iwana_postgres_dev` / DB `dbiw` · **Protocolo:** AI-EM-ARCH ejecuta la operación; [AI-SR-QA](f5f72dc1-c726-416a-8410-e7f271dd0873) (GO) y [AI-SEC-ENG](ec1a3ce9-8cd9-4a0d-991f-6f6710927a9d) (GO_WITH_CONCERNS) re-verifican en paralelo.

#### 1. Corrida de migraciones (ventana 2)

`IWANA_APPLY_PII_CONTRACT=true pnpm db:migrate:all` → **exit 0**.

- **Pública:** aplicó `DropPlatformUsersEmailHash1784419210000` (022) en una transacción: `DROP INDEX IF EXISTS idx_platform_users_email_hash`, `DROP CONSTRAINT IF EXISTS uq_platform_users_email_hash`, `DROP COLUMN IF EXISTS email_hash` (guardián de huecos HMAC previo: `email_hmac NULL = 0`), registrada como última migración pública.
- **Tenant:** los 10 ACTIVE ya tenían la 109 registrada (contract tenant aplicado en corrida previa) → sin pendientes; `[MIGRATOR] Paridad de migraciones OK: 10 tenant(s) ACTIVE con 106 migraciones idénticas`.
- **Sin anuncios de diferidas:** el CLI ya no las lista (fix post-contract: `filterDeferredMigrations` descarta las que constan en el registro).
- `apply-least-privilege: OK` (SEC-04).

#### 2. Verificación estructural post-contract (existencia de columnas, nunca valores)

| Check | Resultado |
| --- | --- |
| `public.platform_users.email_hash` existe | **f** (ausente); `email_hmac` NULL = **0** |
| Columnas PII `*_hash` de búsqueda (`document_number_hash`/`email_hash`/`phone_hash` en users\|subscribers\|expediente_records) por tenant ACTIVE | **0** en los 10 |
| Columnas `*_hmac` por tenant ACTIVE | **5** en cada uno (users.email_hmac; subscribers.document_number_hmac/email_hmac/phone_hmac; expediente_records.document_number_hmac) |
| Único `*_hash` restante | `users.password_hash` (hash de contraseña, legítimo) |
| Registro público | `PlatformUsersEmailHmac1784419209000` (021) → `DropPlatformUsersEmailHash1784419210000` (022) |

#### 3. Veredictos y hallazgos de la re-verificación

| Agente | Veredicto | Hallazgos no bloqueantes |
| --- | --- | --- |
| AI-SR-QA | **GO** | 0 `*_hash` de búsqueda PII; criterio 6 = 0/10; paridad 106/106; 022/109 registradas; specs PASS. (a) informe sin evidencia ventana 2 → **accionado aquí**; (b) anuncio espurio de diferidas tras el contract → **accionado** (`filterDeferredMigrations` + test); (c) 2 filas legacy (018/020) en el registro público → documentado, no se borran sin consulta |
| AI-SEC-ENG | **GO_WITH_CONCERNS** | F-1 (medio): 44 schemas `MARKED_FOR_DELETION` retienen digests SHA-256 — fuera del scope ACTIVE; fijar timeline de DROP y dejar explícito que la verificación estructural cubre solo ACTIVE. F-2 (bajo): paridad por baseline (comparar también código↔DB). F-3 (bajo): gobernanza de ventana 2 prod (env `IWANA_APPLY_PII_CONTRACT` solo en la corrida; sin conexiones long-lived con locks). G-SEC post-merge: re-verificar en staging y cerrar S-1 formalmente tras ventana 2 prod |

**Decisión EM-ARCH:** **ventana 2 aplicada y verificada en dev; la iniciativa SEC-P1 queda cerrada en dev local** (S-1 y S-2 sin digests SHA-256 de búsqueda PII en los 10 tenants ACTIVE ni en `platform_users`). Los hallazgos F-1/F-2/F-3 y la limpieza del registro legacy (018/020) quedaron registrados para el responsable del proyecto y se **corrigieron tras la aprobación CTO de A1/A2** (ver «Corrección de hallazgos»).

### Corrección de hallazgos (post-aprobación CTO A1/A2 — 2026-08-06)

**Contexto:** el CTO aprobó **A1/A2** (claves por entorno, staging ≠ prod). EM-ARCH accionó los hallazgos de la re-verificación con las skills `database-migration` y `docs-architect`, verificando cada fix en vivo.

| Hallazgo | Corrección | Verificación |
| --- | --- | --- |
| **F-2** (bajo): paridad intra-flota no detecta el fallo uniforme | `migration-parity.util.ts`: nuevo `computeExpectedTenantMigrationNames` (esperado = migraciones del código; la diferida cuenta solo si ya consta aplicada en el baseline) y `computeMigrationParityReport(snapshots, expectedNames)` compara cada tenant contra el código, incluido el baseline. `assertTenantMigrationParity` calcula el esperado por defecto (catálogo `TENANT_MIGRATIONS`, sobreescribible en tests). | Spec con **7 casos nuevos** (fallo uniforme, extra no conocidas por código, diferida pendiente excluida / aplicada incluida). En vivo: `migration:tenant:run` → `Paridad de migraciones OK: 10 tenant(s) ACTIVE con 106 migraciones idénticas (alineadas con 106 del código)` |
| **F-3** (bajo): env residual `IWANA_APPLY_PII_CONTRACT` | Guard en `cli/tenant-migrate.ts`: si la variable está activa pero no quedan contracts pendientes → aviso de retirarla. Runbook §4.2 paso 8 (retiro de env tras ventana 2), paso 9 (registrar ventana + sin locks long-lived) y §5 anti-patrón #8. | En vivo: con env residual el CLI advierte; sin env no hay aviso ni anuncios espurios |
| **F-1** (medio): 44 schemas `MARKED_FOR_DELETION` retienen digests SHA-256 | Runbook §0 (nota de alcance ACTIVE-only + reactivación requiere expand/contract previo), §4.2 paso 8 (verificación cubre solo ACTIVE) y §5 anti-patrón #9. Timeline de DROP de esos schemas → **pendiente humano** con recomendación en §5.6 (ver más abajo) | Documental; verificación estructural ya declarada ACTIVE-only |
| **QA (c)** (bajo): 2 filas legacy (018/020) en `public.typeorm_migrations` | **No se borran sin consulta** (podrían afectar `migration:revert`): quedan registradas como pendiente humano, con recomendación de limpieza en ventana dedicada | — |

### Segunda ronda de correcciones (re-verificación QA/AppSec/PLAT-OPS — 2026-08-06)

La re-verificación multiagente de la primera ronda dejó QA=GO, AppSec=GO_WITH_CONCERNS y PLAT-OPS=REQUIERE_CAMBIOS. Se accionaron todos los hallazgos:

| Hallazgo | Corrección | Verificación |
| --- | --- | --- |
| **Env truthy (SEC bajo):** `isMigrationDeferred` ignoraba `TRUE`/`1` (env mal escrito dejaba el contract diferido en silencio) | `envValueIsTrue` en `deferred-migration.util.ts` acepta `true`/`1`/`yes`/`on` (trim + minúsculas); usado por `isMigrationDeferred`, `shouldWarnContractEnvResidual` y el aviso F-3 del CLI | Spec `migration-order.spec.ts` actualizado (antes exigía el valor exacto `true`) + casos nuevos de `envValueIsTrue`. En vivo: `IWANA_APPLY_PII_CONTRACT=TRUE` → aviso F-3 emitido |
| **Test del ramo F-3 (QA/SEC bajo):** la decisión del aviso vivía en función interna no exportada | Extracción a puras `shouldWarnContractEnvResidual` + `describeContractEnvResidualWarning` + spec propio (5 casos) | Spec PASS |
| **N-1 (SEC medio):** un tenant nuevo provisionado tras la ventana 2 nacía en 105 (contract sin aplicar) → S-1 reabierto para esa flota y paridad bloqueada | `tenant-provisioning.processor.ts`: `resolvePiiContractEnv()` fuerza `IWANA_APPLY_PII_CONTRACT=true` durante el provisioning **si la flota ACTIVE ya aplicó la 109** (y no lo fuerza en entornos pre-contract). `applyTenantMigrationsInOrder(dataSource, env)` acepta el override | 4 casos nuevos en `tenant-provisioning.processor.migration.spec.ts`; suite worker 103 PASS |
| **Cableado prod (PLAT-OPS):** `PII_HASH_KEY` no llegaba a `api-prod`/`worker-prod`/`migrator-prod` (Joi `.required()` fallaría en prod) | `docker-compose.prod.yml`: `PII_HASH_KEY` cableada en los tres servicios + `IWANA_APPLY_PII_CONTRACT` declarada en `migrator-prod` (opcional, inyección por env-file/`-e`); `.env.production.example` documenta el contract | Diff compose/env example |
| **Runbook (QA + PLAT-OPS):** numeración rota en §4.2, sin stop criterion de contracts diferidas, matiz F-3 timing | §4.2 reenumerado 1–10 (retirar env = 7, verificación estructural = 8, informe = 9, ventana de mantenimiento = 10); §0 y §5 con refs corregidas; **stop criterion**: si `022`/`109` siguen anunciadas como `DIFERIDA` tras la corrida con env activo, la ventana no se completó; matiz: el aviso F-3 al final de la propia corrida de ventana 2 es esperado, residual = corridas posteriores; vía contenedor `migrator-prod` documentada en §2.2/§4.2 | Re-verificación PLAT-OPS: **LISTO** |

### Re-verificación multiagente — segunda ronda (2026-08-06)

| Agente | Veredicto | Notas |
| --- | --- | --- |
| [AI-SR-QA](3befa1f5-b3a0-4632-b541-958e587a914c) | **GO** | db 25/156 · worker 15/103 · en vivo paridad 106/106 + aviso F-3 con `TRUE` · sin hallazgos bloqueantes |
| [AI-SEC-ENG](61798207-cd87-401d-8b72-779a6a0f070a) | **GO_WITH_CONCERNS** | Env truthy / F-3 / N-1 / compose aceptables. Concerns: **R2-1** (fail-open ante error de consulta) y **R2-2** (`LIMIT 1` representativo). Pendientes humanos F-1 + QA-c |
| [AI-PLAT-OPS](85a119e2-e6ae-4f97-8fea-86ef6865f13b) | **LISTO** | Compose + runbook §0/§2.2/§4.2/§5 + CLI coherentes; secuencia staging→prod ejecutable |

**Accionados tras AppSec (mismo día):**
- **R2-1:** `resolvePiiContractEnv` ahora es fail-closed — la excepción de consulta sube a `process()` / BullMQ reintenta; ya no asume pre-contract.
- **R2-2:** se pregunta si **alguna** ACTIVE tiene la 109 (itera la flota, no `LIMIT 1`). Spec: +2 casos (flota mixta + fail-closed). Worker provisioning: **18** PASS.

**Pendiente humano (sin cambio de código):**
- **Timeline de DROP de schemas `MARKED_FOR_DELETION` (F-1 / R2-4):** Ley 1581 — fijar timeline o justificación de retención.
- **Limpieza del registro legacy `public.typeorm_migrations` (018/020) (QA-c / R2-5):** ventana dedicada PLAT-OPS/CTO; verificar `migration:revert`.

**Decisión EM-ARCH:** correcciones de hallazgos **cerradas en código** (F-2, F-3, env truthy, N-1, R2-1, R2-2, cableado prod, runbook). SEC-P1 permanece **cerrado en dev**; staging/prod siguen el runbook (S1 + A1/A2 aprobado por CTO + B1). Los únicos pendientes son humanos (F-1 timeline, legacy 018/020).

### Plan de cierre ops congelado (S1 + A1/A2 + B1) — 2026-08-06

**Decisión:** el responsable del proyecto adoptó la recomendación EM-ARCH. Artefactos:

| Artefacto | Ruta |
| --- | --- |
| Runbook PLAT-OPS | [`docs/runbooks/RUNBOOK-SEC-P1-VENTANA-EXPAND-CONTRACT-v1.0.md`](../runbooks/RUNBOOK-SEC-P1-VENTANA-EXPAND-CONTRACT-v1.0.md) (**v1.1** — casillas por entorno; dev marcado; staging/prod abiertos) |
| Prompt operativo | [`docs/prompts/PROMPT-OPERATIVO-SEC-P1-CIERRE-VENTANAS-v1.0.md`](../prompts/PROMPT-OPERATIVO-SEC-P1-CIERRE-VENTANAS-v1.0.md) |

| Fijación | Valor |
| --- | --- |
| Secuencia | **S1** staging → prod |
| Claves | **A1/A2** secret store; **nunca** reutilizar staging→prod |
| Soak | **B1** 3–7 días; CTO fija **fecha hard** de ventana 2 al dar el go |
| Stop | Fallo `[MIGRATOR]` o paridad rota → no rearrancar con flota mixta |
| Ventana 2 | Backup restaurable **el mismo día**; rollback = restore |

**Pendiente CTO (aprobar al ejecutar):** go secretos prod · fecha hard B1 · go ventana 2 prod.  
**No adoptado:** B3 (inmediato), A3 (clave temporal), B4 (oleadas) — requieren excepción/ADR.

### Siguiente tramo ops (EM-ARCH — 2026-08-06)

**Decisión:** no más código en SEC-P1; ejecutar **G6.5 → staging ventana 1** con el prompt dedicado:

| Artefacto | Ruta |
| --- | --- |
| Prompt G6.5 + staging | [`docs/prompts/PROMPT-OPERATIVO-SEC-P1-G65-STAGING-v1.0.md`](../prompts/PROMPT-OPERATIVO-SEC-P1-G65-STAGING-v1.0.md) |
| Runbook (procedimiento) | [`docs/runbooks/RUNBOOK-SEC-P1-VENTANA-EXPAND-CONTRACT-v1.0.md`](../runbooks/RUNBOOK-SEC-P1-VENTANA-EXPAND-CONTRACT-v1.0.md) §0–§2 |
| Tras staging verde | [`PROMPT-OPERATIVO-SEC-P1-CIERRE-VENTANAS-v1.0.md`](../prompts/PROMPT-OPERATIVO-SEC-P1-CIERRE-VENTANAS-v1.0.md) (prod + B1 + ventana 2) |

Fases del prompt: `g65` → `staging-clave` → `staging-ventana-1` → `staging-criterio-6` → `consolidar-informe`.  
**Fuera de ese prompt:** ventana 2, prod, DROP `MARKED_FOR_DELETION`, limpieza 018/020.

### Intento de ejecución — `PROMPT-OPERATIVO-SEC-P1-CIERRE-VENTANAS` (2026-08-06)

**Resultado:** **NO_GO** avance staging→prod. No se ejecutó ventana 1/2 fuera de local. El criterio de éxito del prompt (staging + prod cerrados) **no** se cumple en esta sesión.

| Agente | Ámbito | Veredicto |
| --- | --- | --- |
| [AI-PLAT-OPS](4d4b4391-b604-4fdd-b7c7-098c5543f557) | Ejecución completa del prompt | **NO_GO** |
| [AI-SR-QA](c3734057-c23b-4eab-8d12-2e75cd032846) | Dev local post-ventana-2 (evidencia fresca) | **GO** — 25/156 PASS; paridad 10×106; criterio 6 = 0; `email_hash` ausente; 0 `*_hash` búsqueda PII ACTIVE |
| [AI-SEC-ENG](57f9542b-f0d1-482e-acbe-b916fcb72559) | (a) cierre local / (b) avance staging→prod | **GO_WITH_CONCERNS** / **NO_GO** |

**Bloqueos (preflight):**
- Solo stack `*_dev` arriba; **sin** staging/prod operativos.
- **Sin** `.env.staging` / `.env.production`.
- Código SEC-P1 **sin merge** (working tree de `main` @ `e9fe48fd` con cambios locales + ruido WFM/portal).
- `gh` sin auth → **G6.5** (ADR-069) no obtenible desde esta máquina.

**Alcance S-1 por entorno (obligatorio no colapsar):**

| Entorno | Residual S-1 |
| --- | --- |
| **dev local** (ACTIVE) | **Cerrado** (ventana 2 + evidencia QA 2026-08-06) |
| **staging** | Abierto / no ejecutado |
| **producción** | Abierto / no ejecutado |

**A1/A2:** aprobado CTO. **Pendiente CTO al ejecutar:** go secretos prod · fecha hard B1 · go ventana 1/2 prod.

**Siguiente tramo autorizado:** [`PROMPT-OPERATIVO-SEC-P1-G65-STAGING-v1.0.md`](../prompts/PROMPT-OPERATIVO-SEC-P1-G65-STAGING-v1.0.md) — **no** saltar a prod/ventana 2. Prerrequisitos: ~~separar/commit SEC-P1~~ → CI Linux (G6.5) → merge → provisionar staging + secret store.

**Rama lista (2026-08-06):** mergeado a `main` (`1452d631` + docs `12607573`). Tip posterior incluye también MOD09 (`db182702`). Crear PR ya no aplica.

### Intento G6.5 / staging (2026-08-06 — post-merge main)

**Resultado:** **NO_GO** fases `g65` y staging del prompt [`PROMPT-OPERATIVO-SEC-P1-G65-STAGING-v1.0.md`](../prompts/PROMPT-OPERATIVO-SEC-P1-G65-STAGING-v1.0.md).

| Check | Resultado |
| --- | --- |
| Código en `main` / `origin/main` | **OK** — tip `db182702` (SEC-P1 mergeado; runbook casilla merge `[x]`) |
| G6.5 CI Linux (ADR-069) | **Bloqueado** — `gh` sin auth; API Actions del repo privado no legible desde esta máquina |
| Gates locales post-merge | `@iwana/db` 25/156 PASS + typecheck; `@iwana/worker` 15/105 PASS + typecheck (**no sustituyen** G6.5) |
| Staging (clave / ventana 1) | **Bloqueado** — sin `.env.staging`, sin stack staging; solo `*_dev` |
| Casillas runbook staging/prod | Siguen `[ ]` (correcto; no colapsar) |

**Desbloqueo humano (orden):** `gh auth login` (o token `actions:read`) → archivar run CI del SHA en informe → provisionar staging + `PII_HASH_KEY` distinta → `staging-clave` → `staging-ventana-1` → criterio 6 → consolidar.

**PLAT-OPS:** [AI-PLAT-OPS](2268bcfa-ae4e-4db2-aa60-ad2204605d0b) — nada del prompt G65 ejecutable ahora.

**F-1:** 44 `MARKED_FOR_DELETION` con digests SHA-256 — pendiente humano (no cuentan como migrados).

### Verificación

`pnpm --filter @iwana/db test` → 25 suites / **156** tests PASS (139 base + `filterDeferredMigrations` + 7 de paridad por código F-2 + 5 de `envValueIsTrue`/aviso F-3 + actualización del gate de `migration-order`) · `typecheck`, `lint` y `build` limpios · gate comprobado sobre el `dist/` compilado (21 de 22 públicas sin el flag, 22 con él, y ahora `1`/`TRUE` también habilitan) · `pnpm --filter @iwana/worker test` → 15 suites / **105** PASS (N-1 + R2-1 fail-closed + R2-2 flota mixta) con typecheck/lint limpios · `pnpm --filter @iwana/api exec jest src/modules/tenant/` → 183 PASS (runner y revert incluidos) · `migration:tenant:run` con paridad por código en vivo → OK (10 ACTIVE, 106 migraciones idénticas, **alineadas con 106 del código**); con `IWANA_APPLY_PII_CONTRACT=TRUE` el aviso F-3 se emite y se limpió el env residual.
