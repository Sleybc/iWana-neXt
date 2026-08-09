# Cierre de deuda SEC-P1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: usa `executing-plans` (o `subagent-driven-development`) para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para seguimiento. Marca cada casilla solo cuando el comando se haya ejecutado y su salida coincida con lo esperado — no por lectura.

**Goal:** cerrar la deuda abierta tras la auditoría de método y estado del 2026-08-06: el control anti-repudio evadible del audit trail (S-6), el endurecimiento del gate destructivo, las validaciones que el bootstrap limpio no pudo ejercer, y las decisiones de datos que quedaron en manos del CTO.

**Architecture:** todo el trabajo de base de datos entra por migraciones nuevas — nunca editando migraciones ya aplicadas. Las correcciones de seguridad se verifican contra PostgreSQL real (`*.integration.spec.ts`), no solo con dobles, porque los tres defectos que originan este plan eran invisibles a los tests unitarios. Las tareas que destruyen datos o cierran ventanas llevan gate humano explícito y no se ejecutan sin él.

**Tech Stack:** PostgreSQL 18, TypeORM 0.3.31, NestJS 11, Jest + ts-jest, pnpm workspaces, Docker Compose.

**Estado de partida (verificado 2026-08-06):**

- Base de dev recreada en vacío: 22 filas en `public.typeorm_migrations`, 0 schemas de tenant, contract 022/109 diferido.
- `main` contiene la 023 (siete nombres), `revert-data-source.ts` y los specs de orden (`46eeafb2`).
- PR #5 abierto con la consolidación del informe vivo.
- Roles PostgreSQL: `iwana` (superuser), `iwana_app` (aplicación), `iwana_migrator` (dueño de audit, SEC-04).
- `pg_has_role('iwana_app','iwana_migrator','MEMBER')` → `f`. Es la discriminación sobre la que se apoya la Tarea 2.

---

## File Structure

| Archivo | Responsabilidad |
| --- | --- |
| `packages/database/src/migrations/tenant/111_harden_audit_maintenance_guard.ts` | Recrea `reject_audit_mutation()` tenant exigiendo pertenencia a `iwana_migrator` además del GUC |
| `packages/database/src/migrations/public/024_harden_platform_audit_maintenance_guard.ts` | Lo mismo para `platform_audit_logs` |
| `packages/database/src/migrations/tenant/111_harden_audit_maintenance_guard.integration.spec.ts` | Prueba contra PostgreSQL que el rol de aplicación NO evade y el de mantenimiento SÍ |
| `packages/database/src/migrations/shared/deferred-migration.util.ts` | `envValueIsTrue` deja de aplicar a los flags destructivos |
| `packages/database/src/migrations/tenant/migration-parity.util.ts` | Amplía la paridad a tenants no-ACTIVE como aviso |
| `scripts/db-backup.mjs`, `scripts/db-restore.mjs` | Capacidad que ADR-078 (propuesto) §D4 declara inexistente |
| `docs/runbooks/RUNBOOK-SEC-P1-VENTANA-EXPAND-CONTRACT-v1.0.md` | Medición v2, línea de reactivación, procedimiento de ventana 2 |

---

### Task 1: Merge del PR #5

**Files:** ninguno (operación de repositorio).

- [ ] **Step 1: Verificar que el PR sigue verde y sin conflictos**

```bash
gh pr view 5 --json mergeable,mergeStateStatus,statusCheckRollup
```

Esperado: `"mergeable": "MERGEABLE"`. Si aparece `CONFLICTING`, rebasar sobre `main` antes de seguir.

- [ ] **Step 2: Merge**

```bash
gh pr merge 5 --squash --delete-branch
```

- [ ] **Step 3: Sincronizar local**

```bash
git checkout main && git pull --ff-only origin main
```

Esperado: `main` contiene el informe consolidado. Todas las tareas siguientes parten de aquí.

---

### Task 2: S-6 — cerrar la escotilla del audit trail

**Contexto para quien ejecuta:** `audit_logs` está protegida por un trigger que rechaza UPDATE/DELETE, con una escotilla: si el GUC `iwana.audit_maintenance` vale `'on'`, la mutación pasa. La migración 110 la usa legítimamente para redactar PII retroactivamente. El problema es que un GUC personalizado de dos partes **lo puede fijar cualquier rol conectado** con `SET LOCAL`, incluido `iwana_app` — el mismo principal cuyas acciones el trail audita. Confirmado contra PostgreSQL: no es restringible por permisos. La corrección no puede ser "proteger el GUC"; tiene que ser **dejar de confiar solo en él**.

**Files:**
- Create: `packages/database/src/migrations/tenant/111_harden_audit_maintenance_guard.ts`
- Create: `packages/database/src/migrations/tenant/111_harden_audit_maintenance_guard.integration.spec.ts`
- Create: `packages/database/src/migrations/public/024_harden_platform_audit_maintenance_guard.ts`
- Modify: `packages/database/src/migrations/tenant/runner.ts` (registrar en `TENANT_MIGRATIONS`)
- Modify: `packages/database/src/migrations/public/index.ts` (registrar en `PUBLIC_MIGRATIONS`)
- Read first: `packages/database/src/migrations/tenant/075_enforce_audit_immutability.ts`, `packages/database/src/migrations/public/014_enforce_platform_audit_immutability.ts`, `packages/database/src/migrations/public/015_audit_owner_least_privilege.ts`

- [x] **Step 1: Leer las tres migraciones de referencia**

Necesitas el nombre exacto de la función y del trigger tal como los creó la 075/014, y el patrón de la 015 para tolerar que `iwana_migrator` no exista (CI corre con usuario `test`). No inventes nombres: cópialos.

- [x] **Step 2: Escribir el test de integración que falla**

Crear `111_harden_audit_maintenance_guard.integration.spec.ts`. Debe cubrir las dos mitades — que el fix cierra la puerta al rol de aplicación **y** que no rompe el uso legítimo:

```typescript
describe('S-6: escotilla de mantenimiento del audit trail', () => {
  it('el rol de aplicación NO puede evadir el trigger fijando el GUC', async () => {
    // Conectado como iwana_app, dentro de una transacción:
    //   SET LOCAL iwana.audit_maintenance = 'on';
    //   UPDATE <schema>.audit_logs SET action = 'x' WHERE id = <id>;
    // Esperado: la sentencia LANZA (el trigger rechaza).
  });

  it('el rol de mantenimiento SÍ puede, para que la redacción de PII siga siendo posible', async () => {
    // Mismo bloque conectado como iwana_migrator.
    // Esperado: el UPDATE se aplica.
  });

  it('sin el GUC, ningún rol puede mutar', async () => {
    // Sin SET LOCAL, como iwana_migrator.
    // Esperado: LANZA.
  });
});
```

- [x] **Step 3: Ejecutar el test y ver que falla por el motivo correcto**

```bash
pnpm --filter @iwana/db test:integration -- 111_harden_audit_maintenance_guard
```

Esperado: falla el primer caso — hoy `iwana_app` **sí** puede evadir. Si falla por conexión o por falta de fixture, arregla eso antes de seguir: un test que falla por la razón equivocada no prueba nada.

- [x] **Step 4: Escribir la migración tenant 111**

La condición de la escotilla pasa a exigir pertenencia al rol de mantenimiento. `to_regrole` evita que el trigger reviente donde el rol no existe (CI), preservando ahí el comportamiento anterior:

```sql
IF coalesce(current_setting('iwana.audit_maintenance', true), '') = 'on'
   AND (
     to_regrole('iwana_migrator') IS NULL
     OR pg_has_role(current_user, 'iwana_migrator', 'MEMBER')
   ) THEN
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END IF;
```

Requisitos de la migración:
- `CREATE OR REPLACE FUNCTION` sobre la función existente — no crear una nueva ni tocar el trigger, que ya apunta a ella.
- El mensaje de la excepción **no debe seguir explicando cómo evadirla**: hoy documenta el GUC. Sustituir por un texto que indique que la mutación exige rol de mantenimiento, sin dar la receta.
- `down()` restaura la versión anterior de la función (la de la 075) — es reversible de verdad.
- Cabecera con el porqué: qué defecto cierra, por qué el GUC solo no basta, y que la 110 sigue funcionando porque corre bajo el rol de migración.

- [x] **Step 5: Registrar la 111 en el runner**

En `packages/database/src/migrations/tenant/runner.ts`: importar la clase y añadirla **al final** de `TENANT_MIGRATIONS`. El spec `tenant/migration-order.spec.ts` falla si el array y el directorio divergen.

- [x] **Step 6: Replicar en el schema público (024)**

Mismo cambio sobre la función que protege `platform_audit_logs` (creada por la 014). Clase con sufijo timestamp de 13 dígitos **posterior a 1784419211000** — usa `1784419212000`. Registrar en `packages/database/src/migrations/public/index.ts`, al final del array.

- [x] **Step 7: Aplicar y ejecutar el test**

```bash
pnpm --filter @iwana/db build && pnpm db:migrate:all
pnpm --filter @iwana/db test:integration -- 111_harden_audit_maintenance_guard
```

Esperado: los tres casos PASS. El primero ahora rechaza al rol de aplicación.

- [x] **Step 8: Verificar a mano que la 110 sigue siendo posible**

```bash
docker exec iwana_postgres_dev psql -U iwana_migrator -d dbiw -c "BEGIN; SET LOCAL iwana.audit_maintenance = 'on'; SELECT 'la escotilla sigue abierta para el migrador'; ROLLBACK;"
```

Esperado: sin error. Si esto falla, la corrección rompió la capacidad de redacción de PII y hay que rehacerla — no la des por buena.

- [x] **Step 9: Gates y commit**

```bash
pnpm --filter @iwana/db test && pnpm --filter @iwana/db typecheck && pnpm --filter @iwana/db lint && pnpm --filter @iwana/db build
git add packages/database/src/migrations/tenant/111_* packages/database/src/migrations/public/024_* packages/database/src/migrations/tenant/runner.ts packages/database/src/migrations/public/index.ts
git commit -m "fix(security): s-6 escotilla de audit exige rol de mantenimiento"
```

---

### Task 3: Endurecer el gate del contract destructivo

**Contexto:** `IWANA_APPLY_PII_CONTRACT` gobierna una operación irreversible que destruye la única vía de rollback de **toda la flota**. Acepta `true`, `1`, `yes`, `on`, sin distinguir mayúsculas. El precedente del repo para operaciones destructivas (`IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN`, ver `cli/tenant-revert.ts`) exige el literal `"true"` y confirmación interactiva. La tolerancia actual optimiza contra el fallo benigno (quedarse diferido) a costa del maligno (destruir sin intención).

**Files:**
- Modify: `packages/database/src/migrations/shared/deferred-migration.util.ts`
- Modify: `packages/database/src/migrations/shared/deferred-migration.util.spec.ts`
- Modify: `packages/database/src/migrations/public/migration-order.spec.ts` (hay asertos que fijan la tolerancia actual)

- [x] **Step 1: Actualizar los tests primero**

En `deferred-migration.util.spec.ts`, el bloque `envValueIsTrue` fija hoy que `'1'`, `'yes'`, `'on'` y `'TRUE'` abren la puerta. Invertir la expectativa **solo para el flag destructivo**: `isMigrationDeferred` debe seguir difiriendo con cualquier valor que no sea el literal `'true'`.

```typescript
it('solo el literal "true" habilita un contract destructivo', () => {
  const migration = { deferredBy: 'IWANA_APPLY_PII_CONTRACT' };

  expect(isMigrationDeferred(migration, { IWANA_APPLY_PII_CONTRACT: 'true' })).toBe(false);
  expect(isMigrationDeferred(migration, { IWANA_APPLY_PII_CONTRACT: 'TRUE' })).toBe(true);
  expect(isMigrationDeferred(migration, { IWANA_APPLY_PII_CONTRACT: '1' })).toBe(true);
  expect(isMigrationDeferred(migration, { IWANA_APPLY_PII_CONTRACT: 'yes' })).toBe(true);
  expect(isMigrationDeferred(migration, { IWANA_APPLY_PII_CONTRACT: 'on' })).toBe(true);
});
```

- [x] **Step 2: Ejecutar y ver que falla**

```bash
pnpm --filter @iwana/db exec jest src/migrations/shared/deferred-migration.util.spec.ts
```

Esperado: FAIL en los casos `TRUE`/`1`/`yes`/`on`.

- [x] **Step 3: Implementar**

`isMigrationDeferred` deja de usar `envValueIsTrue` y exige `env[envVar] === 'true'`. Conservar `envValueIsTrue` si otros llamantes la usan — comprobar con `grep -rn "envValueIsTrue" packages/ apps/` antes de borrarla.

Documentar en el propio archivo la inversión del razonamiento anterior: para un flag destructivo, un valor mal escrito debe **fallar cerrado** (quedarse diferido), no abierto. El comentario actual defiende lo contrario y hay que sustituirlo, no dejarlo contradiciendo al código.

- [x] **Step 4: Corregir los asertos heredados de `migration-order.spec.ts`**

Ese spec fija hoy que `'1'` y `'TRUE'` incluyen la 022. Alinearlos con la regla nueva.

- [x] **Step 5: Suite y commit**

```bash
pnpm --filter @iwana/db test && pnpm --filter @iwana/db typecheck && pnpm --filter @iwana/db lint
git commit -am "fix(security): el contract destructivo solo se habilita con el literal true"
```

---

### Task 4: Validaciones que el bootstrap limpio no pudo ejercer

**Contexto:** el bootstrap del 2026-08-06 validó el camino público sobre base virgen, pero con 0 tenants dejó **dos ramas sin ejercitar**: las migraciones tenant (la paridad fue trivialmente verdadera) y la rama de la 023 que **sí borra** filas (el registro estaba limpio, así que corrió como no-op).

**Files:**
- Create: `packages/database/src/migrations/public/023_prune_orphan_migration_registry_rows.integration.spec.ts`
- Read first: `packages/database/src/migrations/tenant/075_enforce_audit_immutability.integration.spec.ts` (patrón de integration spec en este paquete)

- [x] **Step 1: Integration spec de la rama de borrado de la 023**

Insertar filas legacy sintéticas en `public.typeorm_migrations` (los siete nombres de la lista cerrada), ejecutar el `up()` de la 023 y verificar que quedan retiradas y que informa cuántas retiró. Después, ejecutar el `up()` una segunda vez y verificar idempotencia (0 retiradas, sin error).

- [x] **Step 2: Ejecutar contra PostgreSQL**

```bash
pnpm --filter @iwana/db test:integration -- 023_prune_orphan
```

Esperado: PASS. Es la primera vez que la rama de borrado se ejerce contra una base real.

- [x] **Step 3: Provisionar tenants y ejercitar el camino tenant**

Levantar al menos dos tenants para que la paridad deje de ser trivial. Vía preferente: el flujo de provisioning normal de la aplicación. Registrar la salida de:

```bash
pnpm --filter @iwana/db migration:tenant:run
```

Esperado: `[MIGRATOR] Paridad de migraciones OK: N tenant(s) ACTIVE con M migraciones idénticas` con `N >= 2`, y el anuncio de la 109 como diferida.

- [x] **Step 4: Verificar el estado ventana 1 en un tenant real**

```bash
docker exec iwana_postgres_dev psql -U iwana_app -d dbiw -t -A -F'|' -c "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = '<schema_tenant>' AND table_name = 'users' AND column_name LIKE 'email%' ORDER BY 1;"
```

Esperado: `email_hash|YES` (respaldo conservado y nullable) y `email_hmac|NO`. Si `email_hash` no existe, la 109 se aplicó y el diferimiento no funcionó — es un bloqueo, escálalo.

- [x] **Step 5: Commit**

```bash
git add packages/database/src/migrations/public/023_*.integration.spec.ts
git commit -m "test(db): ejercitar la rama de borrado de la 023 contra postgres"
```

---

### Task 5: Tenants no-ACTIVE — decisión única

**Contexto:** dos hallazgos independientes apuntan al mismo hueco. (a) La paridad de migraciones solo cubre tenants ACTIVE, así que uno `SUSPENDED` o en provisioning puede rezagarse en el contract sin que nada lo denuncie. (b) La medición de volumen que sostiene el veredicto KEEP también es ACTIVE-only, y un tenant reactivado —que estuvo en uso y es el que más probabilidad tiene de traer volumen real— correría la 108 sobre datos jamás medidos. Se resuelven juntos o se contradicen.

**Files:**
- Create: `scripts/sql/medicion-volumen-108.sql`
- Modify: `packages/database/src/migrations/tenant/migration-parity.util.ts`
- Modify: `docs/runbooks/RUNBOOK-SEC-P1-VENTANA-EXPAND-CONTRACT-v1.0.md`

- [x] **Step 0: Persistir el SQL de medición v2 en el repo**

**Este paso es prerrequisito de los demás y de la Tarea 9.** El SQL v2 corregido —el que elimina el punto ciego de `relpages = 0` verificando la post-condición del `ANALYZE` y cayendo a `COUNT(*)` exacto— existe hoy **solo en un fichero temporal de sesión**: `medicion-108-v3.sql` en el scratchpad. Cuando esa sesión se limpie, la corrección de método D-3 se pierde y queda un runbook que cita un SQL inexistente.

Copiarlo a `scripts/sql/medicion-volumen-108.sql` y enlazarlo desde el runbook por ruta de repo. Verificar antes de commitear que corre de principio a fin:

```bash
docker exec -i iwana_postgres_dev psql -U iwana_migrator -d dbiw < scripts/sql/medicion-volumen-108.sql
```

Esperado: la tabla de resumen con `veredicto`, `peak_filas`, `celdas_sobre_50k` y `celdas_pobladas_con_relpages_0`. Si `celdas_por_count_exacto` sale igual al total de celdas, es que el `ANALYZE` fue denegado por privilegio — el resultado sigue siendo válido, solo más costoso; no lo confundas con un fallo.

- [x] **Step 1: Ampliar la paridad como aviso, no como fallo**

Los no-ACTIVE no se migran por diseño; que estén rezagados es esperado, no un error. Añadir un conteo informativo: cuántos schemas de tenant no-ACTIVE existen y cuántos tienen un conjunto de migraciones distinto del de la flota ACTIVE. Emitir por consola, **sin** cambiar el código de salida.

- [x] **Step 2: Test del aviso**

Verificar que un no-ACTIVE rezagado produce el aviso y **no** hace fallar la corrida.

- [x] **Step 3: Línea en el runbook para la reactivación**

Añadir al paso de reactivación de tenants `MARKED_FOR_DELETION`:

> Antes de reactivar un tenant `MARKED_FOR_DELETION`, ejecutar sobre **su** schema la medición de volumen de la 108 (SQL v2): el veredicto KEEP `transactional = true` se sostiene sobre una medición del universo `ACTIVE`, y un tenant reactivado aporta volumen que esa medición nunca vio. Si su peak en `users`, `subscribers` o `expediente_records` supera ~50 k, el expand/contract de reactivación se planifica con el orquestador antes de correrlo.

- [x] **Step 4: Suite y commit**

---

### Task 6: Declarar el gate auto-propagante

**Contexto:** `resolvePiiContractEnv` (`apps/worker/src/processors/tenant-provisioning.processor.ts`) fija `IWANA_APPLY_PII_CONTRACT` por sí mismo al provisionar un tenant nuevo si algún ACTIVE ya tiene la 109. La justificación es sólida —un tenant nuevo no tiene datos pre-SEC-P1 que respaldar, y sin esto rompe la paridad— pero convierte el control humano en control de **primera aplicación**: a partir de ahí se replica solo. Hoy se documenta como si fuera un gate humano permanente, y no lo es.

**Files:**
- Modify: `apps/worker/src/processors/tenant-provisioning.processor.ts` (comentario)
- Modify: `docs/runbooks/RUNBOOK-SEC-P1-VENTANA-EXPAND-CONTRACT-v1.0.md`

- [x] **Step 1: Comentario en el punto de decisión**

Dejar escrito que el flag es un gate de primera aplicación, no un gate por corrida, y que a partir del primer contract aplicado el provisioning lo propaga sin intervención humana. Nombrar la consecuencia: nadie debe leer la presencia del flag en el runbook como "hace falta autorización cada vez".

- [x] **Step 2: Alinear el runbook**

Corregir cualquier frase que presente el flag como gate humano permanente.

- [x] **Step 3: Commit**

---

### Task 7: Backup y restore — la capacidad que no existe

**Contexto:** ADR-078 (propuesto) §D4 declara que no hay backup ni restore ensayado, y el incidente del 2026-08-06 lo confirmó destruyendo un dato no reproducible. Esta tarea paga esa deuda. **No es opcional**: es la que evita que el incidente se repita.

**Files:**
- Create: `scripts/db-backup.mjs`
- Create: `scripts/db-restore.mjs`
- Modify: `package.json` (scripts `db:backup`, `db:restore`)
- Create: `docs/runbooks/RUNBOOK-BACKUP-RESTORE-v1.0.md`

- [x] **Step 1: Script de backup**

`pg_dump` con formato custom (`-Fc`) de la base completa, incluyendo todos los schemas de tenant. Salida a ruta **fuera del árbol de git**, con timestamp en el nombre. Debe fallar de forma explícita si el destino está dentro del repo — un dump con PII versionado es peor que no tener backup.

- [x] **Step 2: Script de restore**

`pg_restore` sobre una base **nombrada explícitamente en el argumento**, nunca sobre la base por defecto. Exigir confirmación interactiva del nombre de la base destino, siguiendo el patrón de `cli/tenant-revert.ts`.

- [x] **Step 3: Ensayo real de restore — el paso que da valor a los dos anteriores**

Hacer backup, restaurar sobre una base desechable (`dbiw_restore_test`) y verificar que el conteo de schemas de tenant y de `public.typeorm_migrations` coincide con el origen. Un backup sin restore ensayado no es una capacidad, es un fichero.

```bash
pnpm db:backup
pnpm db:restore --target dbiw_restore_test --from <ruta-del-dump>
docker exec iwana_postgres_dev psql -U iwana_app -d dbiw_restore_test -t -A -c "SELECT count(*) FROM public.typeorm_migrations;"
```

Esperado: mismo número que en `dbiw`.

- [x] **Step 4: Runbook con la política de retención**

Dónde viven los dumps, cuánto se conservan, quién los custodia, cómo se purgan. Sin política de purga, el backup se convierte en el problema que resolvía.

- [x] **Step 5: Limpiar la base de prueba y commit**

```bash
docker exec iwana_postgres_dev psql -U iwana -d postgres -c "DROP DATABASE dbiw_restore_test;"
git add scripts/db-backup.mjs scripts/db-restore.mjs package.json docs/runbooks/RUNBOOK-BACKUP-RESTORE-v1.0.md
git commit -m "feat(ops): backup y restore con ensayo verificado"
```

---

### Task 8: Volúmenes Docker huérfanos — GATE DEL CTO

> **No ejecutar sin decisión escrita del CTO.** Contienen posiblemente PII de un titular identificable.

**Recomendación de AI-EM-ARCH:** eliminarlos sin inspeccionarlos. El CTO ya resolvió que ADR-078 (propuesto) se decide sin esa evidencia, así que no queda finalidad que justifique conservarlos; montarlos para «ver qué hay» es en sí mismo un tratamiento de datos personales sin finalidad declarada; y conservarlos sin custodia ni fecha de purga, en una máquina sin TLS, es el peor escenario: no aportan y sí exponen.

- [x] **Step 1: Confirmar que la decisión del CTO consta por escrito**

Sin esto, detente. No es una formalidad: es lo que faltó el 2026-08-06.

- [x] **Step 2: Registrar la decisión en el informe vivo antes de ejecutar**

Constancia previa, no posterior.

- [x] **Step 3: Eliminar**

```bash
docker volume rm b724d6a2ffde3ec55c238b9755f172d1b61357f507e506885e931600b66f55b5 cc2c3bf7799777b20b3f02e6451c3f779fb96c70ee7eb982e53f442efabc69bb
```

- [x] **Step 4: Verificar**

```bash
docker volume ls --filter dangling=true --format "{{.Name}}"
```

Esperado: ninguno de los dos aparece.

---

### Task 9: Ventana 2 — GATE DEL CTO

> **No ejecutar sin decisión del CTO.** Cierra la vía de rollback sin backup.

**Precondición dura:** la Tarea 7 (backup con restore ensayado) debe estar completa. Con ella, aplicar el contract deja de ser irreversible y la decisión cambia de naturaleza.

- [x] **Step 1: Verificar que existe backup fresco y restaurable**

- [x] **Step 2: Ejecutar la medición de volumen v2 sobre la flota real**

Si algún peak supera ~50 k, detenerse y consultar antes de tocar el flag.

- [x] **Step 3: Aplicar el contract**

```bash
IWANA_APPLY_PII_CONTRACT=true pnpm db:migrate:all
```

Esperado: `022` y `109` aplicadas, con sus guardianes de huecos de HMAC en verde.

- [x] **Step 4: Retirar la variable del entorno**

El CLI emite un aviso si detecta que quedó activa sin contracts pendientes. Actuar sobre él.

- [x] **Step 5: Verificar que no quedan digests SHA-256 de búsqueda PII**

Recorrer **todos** los schemas, no solo los ACTIVE: los `MARKED_FOR_DELETION` los retienen y son el residual que cierra S-1 del todo.

- [x] **Step 6: Registrar la ventana 2 en el informe vivo, con sello temporal**

---

### Task 10: Invariante de privilegios sobre el audit trail

**Contexto para quien ejecuta:** al verificar el cierre de S-6 se descubrió que lo que realmente impide al rol de aplicación mutar el audit trail **no es el trigger, es el GRANT**: la migración 015 (SEC-04) nunca le dio `UPDATE`, así que la sentencia muere antes de que el trigger opine. El trigger endurecido de la Tarea 2 es la segunda capa. El problema es que **ese invariante no lo vigila nada**: si un rol nuevo —reporting, analytics, un rol de aplicación futuro— recibe `UPDATE` sobre auditoría, la defensa principal desaparece en silencio y ningún test falla. Esta tarea convierte esa circunstancia afortunada en una propiedad garantizada, y es lo que hace defendible la clasificación de S-6 como Baja: sin ella, la clasificación caduca en cuanto alguien toque los GRANT.

**Baseline medido el 2026-08-08 (dev):**

```
iwana           | UPDATE=t DELETE=t | superuser  -> exento, ver nota
iwana_app       | UPDATE=f DELETE=f |            -> correcto: solo INSERT
iwana_migrator  | UPDATE=t DELETE=t |            -> rol de mantenimiento, correcto
```

**Files:**
- Create: `packages/database/src/migrations/audit-privileges.invariant.integration.spec.ts`
- Read first: `packages/database/src/migrations/tenant/111_harden_audit_maintenance_guard.integration.spec.ts` (patrón de conexión por rol), `packages/database/src/migrations/public/015_audit_owner_least_privilege.ts` (de dónde sale el invariante)

- [ ] **Step 1: Escribir el spec**

Debe recorrer **todos** los schemas de tenant, no una muestra: el invariante es por schema y un solo tenant desalineado basta para romperlo. Consulta base:

```sql
SELECT r.rolname, n.nspname, c.relname,
       has_table_privilege(r.rolname, c.oid, 'UPDATE')   AS upd,
       has_table_privilege(r.rolname, c.oid, 'DELETE')   AS del,
       has_table_privilege(r.rolname, c.oid, 'TRUNCATE') AS trunc
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN pg_roles r
WHERE c.relname IN ('audit_logs', 'platform_audit_logs')
  AND c.relkind = 'r'
  AND r.rolname NOT LIKE 'pg\_%'
  AND NOT r.rolsuper
```

Aserto: el conjunto de `rolname` con `upd OR del OR trunc` debe ser **exactamente** `{'iwana_migrator'}`. Ni más (un rol nuevo con privilegio reabre S-6) ni menos (si el migrador lo pierde, la redacción de PII de la 110 deja de ser posible y la 111 bloquearía el mantenimiento legítimo).

El mensaje de fallo debe nombrar el rol, el schema y la tabla concretos, y explicar qué se rompe: sin eso, quien lo vea dentro de seis meses no sabrá si añadir el rol a una allowlist o revocar el privilegio. La respuesta correcta casi siempre es revocar.

- [ ] **Step 2: Declarar la exención de superusuario en el propio spec**

`NOT r.rolsuper` excluye a los superusers **a propósito**, y hay que escribir por qué: un superuser tiene el privilegio, es miembro implícito de todos los roles —así que `pg_has_role` lo deja pasar el guard de la 111— y además puede desactivar triggers. El audit trail **no es inmutable frente a un superuser y ningún diseño en la base lo hará**. Un test que fingiera lo contrario daría una garantía falsa.

- [ ] **Step 3: Ejecutar contra la base**

```bash
pnpm --filter @iwana/db test:integration -- audit-privileges
```

Esperado: PASS con el baseline actual.

- [ ] **Step 4: Verificar que el test tiene dientes**

Conceder temporalmente el privilegio y comprobar que el spec falla nombrando el rol:

```bash
docker exec iwana_postgres_dev psql -U iwana -d dbiw -c "GRANT UPDATE ON tenant_secp1_a.audit_logs TO iwana_app;"
pnpm --filter @iwana/db test:integration -- audit-privileges   # debe FALLAR
docker exec iwana_postgres_dev psql -U iwana -d dbiw -c "REVOKE UPDATE ON tenant_secp1_a.audit_logs FROM iwana_app;"
pnpm --filter @iwana/db test:integration -- audit-privileges   # debe volver a PASAR
```

**No omitas este paso.** Un test de invariante que nunca se ha visto fallar es indistinguible de uno que no comprueba nada, y en esta fase ya nos ha pasado tres veces confundir una señal adyacente con la evidencia.

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/migrations/audit-privileges.invariant.integration.spec.ts
git commit -m "test(security): invariante de privilegios sobre el audit trail"
```

---

## Orden de ejecución y dependencias

```
Task 1 (merge)
   └─> Task 2 (S-6)  ─┐
   └─> Task 3 (flag)  ├─> independientes entre sí
   └─> Task 4 (tests) ┘
   └─> Task 5, 6 (deuda declarada)
   └─> Task 7 (backup) ──> Task 9 (ventana 2)
Task 8 (volúmenes) — independiente, gate del CTO
```

Tareas 2 y 7 son las de mayor valor: la primera cierra un control de seguridad evadible; la segunda evita que el incidente del 2026-08-06 pueda repetirse.

## Criterio de cierre

- [x] Los cuatro gates (`test`, `typecheck`, `lint`, `build`) en verde tras cada tarea, sin caché de turbo enmascarando la ejecución.
- [x] S-6 verificado contra PostgreSQL real, no solo con dobles.
- [x] Restore ensayado al menos una vez con verificación de conteos.
- [x] Informe vivo actualizado con cada decisión, **con sello temporal** en toda afirmación de estado.
- [x] Ninguna migración ya aplicada editada; todo cambio entra por migración nueva.
